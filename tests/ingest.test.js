import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { MemoryControlStore } from '../server/control-store.js';
import { hashApiKey, validateRecords, LIMITS } from '../server/ingest.js';
import { verifyAll } from './helpers.js';

const origin = 'http://localhost:3000', password = 'correct-horse-123';

async function boot(t) {
  const store = new MemoryStore(), control = new MemoryControlStore();
  const server = createApp({ store, control, secret: 'e'.repeat(64), origins: [origin] }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const app = (path, cookie, body) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  // The machine API deliberately sends no Origin and no cookie.
  const push = (path, key, { body, type = 'application/json', method = body === undefined ? 'GET' : 'POST' } = {}) => fetch(base + path, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body === undefined ? {} : { 'Content-Type': type }) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const company = async (country, email) => { const r = await app('/auth/register', null, { email, password, companyName: `Firma ${country}`, country }); verifyAll(store); return r.headers.get('set-cookie').split(';')[0]; };
  const createKey = async (cookie, label = 'Personio export') => { const r = await app('/integrations/keys', cookie, { label }); assert.equal(r.status, 201, await r.clone().text()); return r.json(); };
  return { store, control, app, push, company, createKey };
}
const person = (id, gender, category, base) => ({ internal_id: id, gender, job_title: 'Staff', worker_category: category, base_annual: base, bonuses_annual: 0, paid_hours_annual: 2000, hours_per_week: 40 });
const team = () => [...Array.from({ length: 6 }, (_, i) => person(`M${i}`, 'M', 'Team', 50000)), ...Array.from({ length: 6 }, (_, i) => person(`F${i}`, 'F', 'Team', 47000))];

test('API keys: shown once, stored only as a hash, limited in number, revocable', async t => {
  const { store, app, push, company, createKey } = await boot(t);
  const cookie = await company('DE', 'hr@de.example');
  assert.equal((await app('/integrations/keys', cookie, { label: '' })).status, 400);
  assert.equal((await app('/integrations/keys', cookie, { label: 'x'.repeat(81) })).status, 400);
  const { key, record } = await createKey(cookie);
  assert.match(key, /^eqt_[A-Za-z0-9_-]{43}$/);
  assert.equal(record.prefix, key.slice(4, 12));
  assert.ok(!JSON.stringify([...store.apiKeys.values()]).includes(key), 'the secret is never stored');
  assert.equal([...store.apiKeys.values()][0].key_hash, hashApiKey(key));
  const listed = (await (await app('/integrations/keys', cookie)).json()).keys;
  assert.equal(listed.length, 1); assert.equal(listed[0].key_hash, undefined); assert.equal(JSON.stringify(listed).includes(key), false);

  assert.equal((await push('/ingest/v1/ping', key)).status, 200);
  assert.ok([...store.apiKeys.values()][0].last_used_at, 'last use is recorded');
  for (let i = 1; i < LIMITS.keys; i++) await createKey(cookie, `Key ${i}`);
  assert.equal((await app('/integrations/keys', cookie, { label: 'one too many' })).status, 400);
  assert.equal((await app(`/integrations/keys/${record.id}/revoke`, cookie, {})).status, 200);
  assert.equal((await push('/ingest/v1/ping', key)).status, 401, 'revoked keys stop working at once');
  assert.equal((await app('/integrations/keys', cookie, { label: 'room again' })).status, 201, 'revoking frees a slot');
  assert.equal((await app('/integrations/keys/00000000-0000-4000-8000-000000000000/revoke', cookie, {})).status, 404);
});

test('authentication: missing, malformed, unknown and cross-company keys', async t => {
  const { push, company, createKey, app } = await boot(t);
  const a = await company('DE', 'a@example.test'), b = await company('SI', 'b@example.test');
  const keyA = (await createKey(a)).key;
  assert.equal((await push('/ingest/v1/ping', null)).status, 401);
  assert.equal((await push('/ingest/v1/ping', 'not-a-key')).status, 401);
  assert.equal((await push('/ingest/v1/ping', `eqt_${'A'.repeat(43)}`)).status, 401);
  assert.equal((await fetch(`${(await push('/ingest/v1/ping', keyA)).url}`, { headers: { Authorization: `Basic ${keyA}` } })).status, 401);
  const ping = await (await push('/ingest/v1/ping', keyA)).json();
  assert.deepEqual([ping.company.country, ping.key], ['DE', 'Personio export']);
  assert.equal((await push('/ingest/v1/employees', null, { body: { year: 2026, records: team() } })).status, 401);
  await push('/ingest/v1/employees', keyA, { body: { year: 2026, records: team() } });
  assert.equal((await (await app('/integrations/batches', b)).json()).batches.length, 0, 'another company sees nothing');
  assert.equal((await (await app('/integrations/batches', a)).json()).batches.length, 1);
});

test('push validation: year, shape, nested values, sizes and queue', async t => {
  const { push, company, createKey, store } = await boot(t);
  const cookie = await company('DE', 'hr@de.example'), key = (await createKey(cookie)).key;
  const send = body => push('/ingest/v1/employees', key, { body });
  assert.equal((await send({ records: team() })).status, 400, 'year required');
  assert.equal((await send({ year: 1999, records: team() })).status, 400);
  assert.equal((await send({ year: '2026', records: team() })).status, 400, 'year must be a number');
  assert.equal((await send({ year: 2026, source: 'x'.repeat(81), records: team() })).status, 400);
  for (const [body, code] of [[{ year: 2026 }, 'INGEST_RECORDS_REQUIRED'], [{ year: 2026, records: [] }, 'INGEST_RECORDS_REQUIRED'], [{ year: 2026, records: [1, 2] }, 'INGEST_RECORD_INVALID'], [{ year: 2026, records: [{ a: 1, b: { c: 1 } }] }, 'INGEST_NESTED_VALUE'], [{ year: 2026, records: [{ a: 1, b: [1] }] }, 'INGEST_NESTED_VALUE'], [{ year: 2026, records: [{ only: 1 }] }, 'INGEST_COLUMN_INVALID'], [{ year: 2026, records: [JSON.parse('{"__proto__":1,"b":2}')] }, 'INGEST_COLUMN_INVALID']]) {
    const response = await send(body);
    assert.equal(response.status, 422, code);
    assert.equal((await response.json()).error, code);
  }
  assert.throws(() => validateRecords(Array.from({ length: LIMITS.records + 1 }, () => ({ a: 1, b: 2 }))), /INVALID_ROW_COUNT/);
  assert.equal((await push('/ingest/v1/employees', key, { body: '{broken', type: 'application/json' })).status, 400);
  assert.equal((await send({ year: 2026, source: 'Zapier', records: team() })).status, 202);

  // Queue: twenty pending deliveries at most; deliveries older than the retention period expire.
  const companyId = [...store.companies.keys()][0];
  for (let i = 1; i < LIMITS.pending; i++) await store.createIngestBatch(companyId, { source: 'fill', reporting_year: 2026, record_count: 1, payload: '[]' });
  assert.equal((await send({ year: 2026, records: team() })).status, 429);
  const oldest = [...store.ingestBatches.values()][0];
  oldest.created_at = new Date(Date.now() - (LIMITS.retentionDays + 1) * 86400000).toISOString();
  assert.equal((await send({ year: 2026, records: team() })).status, 202, 'an expired delivery made room');
  assert.equal(oldest.status, 'discarded'); assert.equal(oldest.payload, '', 'expired payload is wiped');
});

test('CSV push, then review and confirm: the delivery becomes the data snapshot', async t => {
  const { push, company, createKey, app, store } = await boot(t);
  const cookie = await company('DE', 'hr@de.example'), key = (await createKey(cookie)).key;
  const csv = ['internal_id;gender;job_title;worker_category;base_annual;bonuses_annual;paid_hours_annual;hours_per_week', ...team().map(p => Object.values(p).join(';'))].join('\r\n');
  assert.equal((await push('/ingest/v1/employees?source=DATEV', key, { body: csv, type: 'text/csv' })).status, 400, 'year missing');
  const accepted = await push('/ingest/v1/employees?year=2026&source=DATEV', key, { body: csv, type: 'text/csv' });
  assert.equal(accepted.status, 202);
  const { batchId, count } = await accepted.json();
  assert.equal(count, 12);
  assert.equal((await push('/ingest/v1/employees?year=2026', key, { body: ' ', type: 'text/csv' })).status, 422);

  const batches = (await (await app('/integrations/batches', cookie)).json()).batches;
  assert.deepEqual([batches[0].source, batches[0].record_count, batches[0].reporting_year, batches[0].payload], ['DATEV', 12, 2026, undefined]);

  // Nothing is imported by the push itself.
  assert.equal((await app('/analysis?year=2026', cookie).then(r => r.json())).snapshot, null);
  const preview = await (await app('/import/preview', cookie, { batchId, year: 2026 })).json();
  assert.equal(preview.count, 12); assert.equal(preview.mapping.base_annual, 'base_annual');
  assert.equal((await app('/import', cookie, { batchId, year: 2025, mapping: preview.mapping, decimalSeparator: '.', contextConfirmed: true })).status, 422, 'year must match the delivery');
  assert.equal((await app('/import', cookie, { batchId, year: 2026, mapping: preview.mapping, decimalSeparator: '.' })).status, 422, 'confirmation is required like for a file');
  const imported = await app('/import', cookie, { batchId, year: 2026, mapping: preview.mapping, decimalSeparator: '.', contextConfirmed: true });
  assert.equal(imported.status, 201, await imported.clone().text());
  assert.equal((await app('/analysis?year=2026', cookie).then(r => r.json())).analysis.count, 12);
  assert.equal((await (await app('/integrations/batches', cookie)).json()).batches.length, 0, 'imported deliveries leave the queue');
  assert.equal(store.ingestBatches.get(batchId).payload, '', 'the delivered data is not kept after the import');
  assert.equal((await app('/import', cookie, { batchId, year: 2026, mapping: preview.mapping, decimalSeparator: '.', contextConfirmed: true })).status, 422, 'a delivery can be imported once');
  assert.ok(JSON.stringify(store.auditEvents).includes('ingest_batch_received') && !JSON.stringify(store.auditEvents).includes('M0'), 'audit has counts, never the data');
});

test('JSON push with records in the importer\'s own column names, other tenants cannot use a delivery, discard works', async t => {
  const { push, company, createKey, app } = await boot(t);
  const a = await company('AT', 'a@example.test'), b = await company('SI', 'b@example.test'), key = (await createKey(a)).key;
  const { batchId } = await (await push('/ingest/v1/employees', key, { body: { year: 2026, source: 'Zapier', records: team() } })).json();
  assert.equal((await app('/import/preview', b, { batchId, year: 2026 })).status, 422, 'another company cannot read the delivery');
  assert.equal((await app(`/integrations/batches/${batchId}/discard`, b, {})).status, 404);
  assert.equal((await app('/import/preview', a, { batchId: 'nope', year: 2026 })).status, 422);
  assert.equal((await app('/import/preview', a, { batchId, year: 2026 })).status, 200);
  assert.equal((await app(`/integrations/batches/${batchId}/discard`, a, {})).status, 200);
  assert.equal((await app('/import/preview', a, { batchId, year: 2026 })).status, 422, 'discarded');
  assert.equal((await app(`/integrations/batches/${batchId}/discard`, a, {})).status, 404, 'only once');
});

test('a suspended company cannot deliver, and unverified accounts cannot create keys', async t => {
  const { push, company, createKey, control, store, app } = await boot(t);
  const cookie = await company('DE', 'hr@de.example'), key = (await createKey(cookie)).key;
  const id = [...store.companies.keys()][0];
  await control.mutate(s => { s.suspended[id] = { reason: 'test', at: 'now', by: 'owner' }; });
  assert.equal((await push('/ingest/v1/ping', key)).status, 403);
  const fresh = await app('/auth/register', null, { email: 'new@example.test', password, companyName: 'Neu', country: 'SI' });
  assert.equal((await app('/integrations/keys', fresh.headers.get('set-cookie').split(';')[0], { label: 'x' })).status, 403);
});
