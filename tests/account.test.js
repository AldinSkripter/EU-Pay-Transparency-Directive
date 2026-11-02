import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { MemoryMailer } from '../server/mailer.js';
import { totp } from '../server/owner-auth.js';

const origin = 'https://equitensa.de', password = 'correct-horse-123';
async function fixture(t) {
  const store = new MemoryStore(), mailer = new MemoryMailer(), accountKey = randomBytes(32);
  const server = createApp({ store, mailer, accountKey, demo: false, secret: 'a'.repeat(64), origins: [origin] }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, { body, cookie } = {}) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const link = kind => mailer.outbox.findLast(m => m.text.includes(`?${kind}=`))?.text.match(new RegExp(`[?]${kind}=([a-f0-9]{64})`))?.[1];
  return { store, mailer, request, link };
}
const cookieOf = response => response.headers.get('set-cookie').split(';')[0];
const register = (request, extra = {}) => request('/auth/register', { body: { email: 'a@example.com', password, companyName: 'Acme', country: 'SI', ...extra } });

test('registration needs an explicit country; the domain never picks the jurisdiction', async t => {
  const { request, store } = await fixture(t);
  assert.equal((await register(request, { country: undefined })).status, 400);
  assert.equal((await register(request, { country: 'FR' })).status, 400);
  assert.equal((await register(request, { country: 'SI' })).status, 201);
  assert.equal([...store.companies.values()][0].country, 'SI');
});

test('unverified accounts are confined until the emailed link is used, in the company language', async t => {
  const { request, link, mailer } = await fixture(t);
  const cookie = cookieOf(await register(request));
  assert.match(mailer.outbox[0].subject, /potrdite/);
  assert.equal((await request('/me', { cookie }).then(r => r.json())).user.emailVerified, false);
  for (const path of ['/analysis', '/reports/json', '/billing']) assert.equal((await request(path, { cookie })).status, 403, path);
  assert.equal((await request('/auth/verify-email', { body: { token: '0'.repeat(64) } })).status, 400);
  const token = link('verify');
  assert.equal((await request('/auth/verify-email', { body: { token } })).status, 200);
  assert.equal((await request('/auth/verify-email', { body: { token } })).status, 400, 'single use');
  assert.equal((await request('/analysis', { cookie })).status, 200);
  assert.equal((await request('/me', { cookie }).then(r => r.json())).user.emailVerified, true);
});

test('Austrian company gets a German email and resend replaces the old link', async t => {
  const { request, link, mailer } = await fixture(t);
  const cookie = cookieOf(await register(request, { country: 'AT' }));
  assert.match(mailer.outbox[0].subject, /bestätigen/);
  const first = link('verify');
  await request('/auth/resend-verification', { body: {}, cookie });
  const second = link('verify');
  assert.notEqual(first, second);
  assert.equal((await request('/auth/verify-email', { body: { token: first } })).status, 400);
  assert.equal((await request('/auth/verify-email', { body: { token: second } })).status, 200);
});

test('password reset never reveals accounts, revokes sessions and keeps MFA in force', async t => {
  const { request, link, mailer } = await fixture(t);
  const cookie = cookieOf(await register(request));
  const before = mailer.outbox.length;
  assert.equal((await request('/auth/forgot-password', { body: { email: 'nobody@example.com' } })).status, 200);
  assert.equal(mailer.outbox.length, before, 'no mail for unknown address');
  assert.equal((await request('/auth/forgot-password', { body: { email: 'A@example.com' } })).status, 200);
  const token = link('reset');
  assert.equal((await request('/auth/reset-password', { body: { token, password: 'short' } })).status, 400);
  assert.equal((await request('/auth/reset-password', { body: { token, password: 'a-brand-new-password' } })).status, 200);
  assert.equal((await request('/auth/reset-password', { body: { token, password: 'another-new-password' } })).status, 400, 'single use');
  assert.equal((await request('/me', { cookie })).status, 401, 'old session revoked');
  assert.equal((await request('/auth/login', { body: { email: 'a@example.com', password } })).status, 401);
  assert.equal((await request('/auth/login', { body: { email: 'a@example.com', password: 'a-brand-new-password' } })).status, 200);
});

test('MFA: enrolment, login challenge, TOTP replay, backup codes and disabling', async t => {
  const { request, store, link } = await fixture(t);
  const cookie = cookieOf(await register(request));
  await request('/auth/verify-email', { body: { token: link('verify') } });
  assert.equal((await request('/auth/mfa/setup', { body: { password: 'wrong-password-1' }, cookie })).status, 401);
  const setup = await (await request('/auth/mfa/setup', { body: { password }, cookie })).json();
  assert.match(setup.otpauth, /^otpauth:\/\/totp\/Equitensa:a%40example\.com[?]secret=[A-Z2-7]{32}/);
  assert.ok(![...store.users.values()][0].mfa_pending_enc.includes(setup.secret), 'secret sealed at rest');
  assert.equal((await request('/auth/mfa/enable', { body: { code: '000000' }, cookie })).status, 401);
  const now = Date.now(), enabled = await (await request('/auth/mfa/enable', { body: { code: totp(setup.secret, now) }, cookie })).json();
  assert.equal(enabled.backupCodes.length, 10);
  assert.match(enabled.backupCodes[0], /^[a-f0-9]{5}-[a-f0-9]{5}$/);
  const user = [...store.users.values()][0];
  assert.ok(!JSON.stringify(user).includes(enabled.backupCodes[0].replace('-', '')), 'backup codes stored hashed');

  const login = body => request('/auth/login', { body: { email: 'a@example.com', password, ...body } });
  const challenge = await login({});
  assert.equal(challenge.status, 401); assert.equal((await challenge.json()).error, 'MFA_REQUIRED');
  assert.equal(challenge.headers.get('set-cookie'), null);
  assert.equal((await login({ code: '123456' })).status, 401);
  // The enrolment code is the latest used step, so it cannot be replayed to sign in.
  assert.equal((await login({ code: totp(setup.secret, now) })).status, 401);
  assert.equal((await login({ code: totp(setup.secret, now + 30000) })).status, 200);
  assert.equal((await login({ code: totp(setup.secret, now + 30000) })).status, 401, 'same step reused');
  assert.equal((await login({ code: enabled.backupCodes[0] })).status, 200);
  assert.equal((await login({ code: enabled.backupCodes[0] })).status, 401, 'backup code single use');

  const fresh = cookieOf(await login({ code: enabled.backupCodes[1] }));
  assert.equal((await request('/auth/mfa/disable', { body: { password, code: '000000' }, cookie: fresh })).status, 401);
  assert.equal((await request('/auth/mfa/disable', { body: { password, code: enabled.backupCodes[2] }, cookie: fresh })).status, 200);
  assert.equal((await login({})).status, 200);
});

test('repeated wrong MFA codes lock the account even from new sessions', async t => {
  const { request, link } = await fixture(t);
  const cookie = cookieOf(await register(request));
  await request('/auth/verify-email', { body: { token: link('verify') } });
  const setup = await (await request('/auth/mfa/setup', { body: { password }, cookie })).json();
  await request('/auth/mfa/enable', { body: { code: totp(setup.secret) }, cookie });
  const attempt = code => request('/auth/login', { body: { email: 'a@example.com', password, code } });
  let last;
  for (let i = 0; i < 11; i++) last = await attempt(String(100000 + i));
  assert.equal(last.status, 429);
  assert.equal((await attempt(totp(setup.secret, Date.now() + 30000))).status, 429, 'even a correct code is refused while locked');
});

test('changing the password needs the current one and signs out other devices only', async t => {
  const { request, link } = await fixture(t);
  const first = cookieOf(await register(request));
  await request('/auth/verify-email', { body: { token: link('verify') } });
  const second = cookieOf(await request('/auth/login', { body: { email: 'a@example.com', password } }));
  assert.equal((await request('/auth/password', { body: { password: 'nope-nope-nope', newPassword: 'a-brand-new-password' }, cookie: first })).status, 401);
  assert.equal((await request('/auth/password', { body: { password, newPassword: 'a-brand-new-password' }, cookie: first })).status, 200);
  assert.equal((await request('/me', { cookie: first })).status, 200);
  assert.equal((await request('/me', { cookie: second })).status, 401);
});
