import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { MemoryControlStore } from '../server/control-store.js';
import { addOwner, resetOwner, totp, mfaSecret } from '../server/owner-auth.js';
import { verifyPassword } from '../server/auth.js';
import { randomUUID } from 'node:crypto';

const password = 'a-strong-owner-password!', origin = 'https://equitensa.de';
async function production(t, options = {}) {
  const store = new MemoryStore(), control = new MemoryControlStore();
  await addOwner(control, 'owner@example.com', password);
  const server = createApp({ store, control, secure: true, secret: 'b'.repeat(64), origins: [origin], ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;
  const call = (path, { cookie, body } = {}) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { store, control, call };
}
const signIn = async (call, extra = {}) => { const r = await call('/auth/login', { body: { email: 'owner@example.com', password, ...extra } }); return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] }; };

test('production owner panel demands 2FA enrolment by default', async t => {
  const { call } = await production(t);
  const { cookie } = await signIn(call);
  assert.equal((await call('/overview', { cookie })).status, 403);
  assert.equal((await (await call('/me', { cookie })).json()).mfaRequired, true);
});

test('with ADMIN_REQUIRE_MFA off the owner signs in with email and password only', async t => {
  const { call } = await production(t, { requireOwnerMfa: false });
  const { status, cookie } = await signIn(call);
  assert.equal(status, 200);
  assert.equal((await call('/overview', { cookie })).status, 200);
  assert.equal((await (await call('/me', { cookie })).json()).mfaRequired, false);
});

test('an owner who did enrol 2FA is still challenged even when 2FA is optional', async t => {
  const { call, control } = await production(t, { requireOwnerMfa: false });
  const secret = mfaSecret();
  await control.mutate(s => { s.owners[0].mfaSecret = secret; s.owners[0].backupHashes = []; });
  assert.equal((await signIn(call)).status, 401);
  assert.equal((await signIn(call, { code: totp(secret) })).status, 200);
});

test('CLI recovery resets the password, clears 2FA and signs the owner out everywhere', async t => {
  const { call, control } = await production(t, { requireOwnerMfa: false });
  const secret = mfaSecret();
  await control.mutate(s => { s.owners[0].mfaSecret = secret; s.owners[0].backupHashes = ['x']; s.owners[0].lastMfaStep = 5; });
  const { cookie } = await signIn(call, { code: totp(secret) });
  assert.equal((await call('/overview', { cookie })).status, 200);

  await assert.rejects(resetOwner(control, 'nobody@example.com', 'another-strong-password'), /OWNER_NOT_FOUND/);
  await assert.rejects(resetOwner(control, 'owner@example.com', 'short'), /INVALID_OWNER/);
  await resetOwner(control, ' OWNER@example.com ', 'another-strong-password');

  const state = await control.read(), owner = state.owners[0];
  assert.equal(owner.mfaSecret, undefined);assert.equal(owner.backupHashes, undefined);
  assert.ok(await verifyPassword('another-strong-password', owner.password_hash));
  assert.equal(state.audit.at(-1).action, 'owner_reset_by_cli');
  assert.equal((await call('/overview', { cookie })).status, 401, 'old session revoked');
  assert.equal((await signIn(call)).status, 401, 'old password no longer works');
  assert.equal((await call('/auth/login', { body: { email: 'owner@example.com', password: 'another-strong-password' } })).status, 200, 'no code needed any more');
});

test('company list shows how many users have not verified their email', async t => {
  const { call, store } = await production(t, { requireOwnerMfa: false });
  const company = { id: randomUUID(), name: 'Acme', country: 'SI' };
  await store.createAccount(company, { id: randomUUID(), company_id: company.id, email: 'a@example.com', password_hash: 'x', email_verified_at: new Date() });
  const second = randomUUID();
  store.users.set(second, { id: second, company_id: company.id, email: 'b@example.com', password_hash: 'x', email_verified_at: null });
  const { cookie } = await signIn(call);
  const { companies } = await (await call('/companies', { cookie })).json();
  assert.deepEqual(companies.map(c => [c.name, c.users, c.verified_users]), [['Acme', 2, 1]]);
});
