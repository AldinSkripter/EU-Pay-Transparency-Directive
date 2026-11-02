import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PostgresStore } from '../server/store.js';

test('PostgreSQL worker rights: requests, deadlines as dates, answering, per-company isolation, yearly notice', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'equitensa-rights-test-'));
  const db = new PGlite(directory);
  t.after(async () => { await db.close(); const target = resolve(directory); if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('equitensa-rights-test-')) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(target, { recursive: true, force: true }); });
  const store = new PostgresStore('postgresql://unused');
  await store.pool.end();
  const query = async (sql, params) => { const result = await db.query(sql, params); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; };
  store.pool = { query, connect: async () => ({ query, release() {} }) };
  for (const name of ['001_initial', '002_self_service', '003_platform_control', '004_google_auth', '005_import_batches', '006_payroll_ledger', '007_account_security', '008_worker_rights']) await db.exec(await readFile(new URL(`../db/${name}.sql`, import.meta.url), 'utf8'));
  const a = { id: randomUUID(), name: 'A', country: 'DE' }, b = { id: randomUUID(), name: 'B', country: 'SI' };
  for (const [company, mail] of [[a, 'a@example.test'], [b, 'b@example.test']]) await store.createAccount(company, { id: randomUUID(), company_id: company.id, email: mail, password_hash: 'x' });

  const first = await store.createInfoRequest(a.id, { received_on: '2026-10-31', due_on: '2026-12-31', channel: 'worker', requester_label: 'Anna', note: '' });
  const second = await store.createInfoRequest(a.id, { received_on: '2026-09-01', due_on: '2026-11-01', channel: 'representative', requester_label: 'Works council', note: 'by mail' });
  assert.equal(first.received_on, '2026-10-31', 'dates come back as plain YYYY-MM-DD, not shifted by a time zone');
  assert.equal(first.status, 'open');
  assert.deepEqual((await store.listInfoRequests(a.id)).map(r => r.requester_label), ['Works council', 'Anna'], 'earliest deadline first');
  assert.deepEqual(await store.listInfoRequests(b.id), []);
  assert.equal(await store.getInfoRequest(b.id, first.id), null, 'another company cannot read it');
  assert.equal(await store.answerInfoRequest(b.id, first.id, { answeredOn: '2026-11-02', summary: 'x' }), null, 'nor close it');
  const answered = await store.answerInfoRequest(a.id, second.id, { answeredOn: '2026-10-20', summary: 'Letter sent' });
  assert.deepEqual([answered.status, answered.answered_on, answered.answer_summary], ['answered', '2026-10-20', 'Letter sent']);
  await assert.rejects(store.createInfoRequest(a.id, { received_on: '2026-10-31', due_on: '2026-12-31', channel: 'boss', requester_label: 'x', note: '' }));

  assert.equal(await store.rightsNotice(a.id, 2026), null);
  await store.saveRightsNotice(a.id, 2026, { sent_on: '2026-01-15', contact: 'hr@a.example' });
  await store.saveRightsNotice(a.id, 2026, { sent_on: '2026-02-01', contact: 'hr2@a.example' });
  assert.deepEqual(await store.rightsNotice(a.id, 2026), { notice_year: 2026, sent_on: '2026-02-01', contact: 'hr2@a.example' }, 'saving again replaces the record of that year');
  assert.equal(await store.rightsNotice(b.id, 2026), null);
  assert.equal(await store.rightsNotice(a.id, 2027), null);
  assert.equal(await store.companyCountry(a.id), 'DE');
});
