import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PostgresStore } from '../server/store.js';

test('PostgreSQL account security: tokens, single-use MFA steps and backup codes, session revocation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'equitensa-account-test-'));
  const db = new PGlite(directory);
  t.after(async () => { await db.close(); const target = resolve(directory); if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('equitensa-account-test-')) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(target, { recursive: true, force: true }); });
  const store = new PostgresStore('postgresql://unused');
  await store.pool.end();
  const query = async (sql, params) => { const result = await db.query(sql, params); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; };
  store.pool = { query, connect: async () => ({ query, release() {} }) };
  for (const name of ['001_initial', '002_self_service', '003_platform_control', '004_google_auth', '005_import_batches', '006_payroll_ledger', '007_account_security', '008_worker_rights']) await db.exec(await readFile(new URL(`../db/${name}.sql`, import.meta.url), 'utf8'));
  const company = { id: randomUUID(), name: 'Acme', country: 'SI' }, user = { id: randomUUID(), company_id: company.id, email: 'a@example.test', password_hash: 'x' };
  await store.createAccount(company, user);
  assert.equal((await store.session('missing')), null);
  assert.equal((await store.findUserById(user.id)).email_verified_at, null);

  // Tokens: single use, purpose-bound, newer token replaces the older one, expired token rejected.
  const future = new Date(Date.now() + 3600_000);
  await store.saveUserToken('a'.repeat(64), user.id, 'verify_email', future);
  await store.saveUserToken('b'.repeat(64), user.id, 'verify_email', future);
  assert.equal(await store.consumeUserToken('a'.repeat(64), 'verify_email'), null);
  assert.equal(await store.consumeUserToken('b'.repeat(64), 'reset_password'), null);
  assert.equal(await store.consumeUserToken('b'.repeat(64), 'verify_email'), user.id);
  assert.equal(await store.consumeUserToken('b'.repeat(64), 'verify_email'), null);
  await store.saveUserToken('c'.repeat(64), user.id, 'reset_password', new Date(Date.now() - 1000));
  assert.equal(await store.consumeUserToken('c'.repeat(64), 'reset_password'), null);

  await store.updateUser(user.id, { email_verified_at: new Date(), mfa_secret_enc: 'sealed', mfa_backup_hashes: ['h1', 'h2'] });
  await assert.rejects(store.updateUser(user.id, { company_id: randomUUID() }), /INVALID_USER_FIELD/);
  const session = { token: 'd'.repeat(64) };
  await store.createSession(session.token, user.id, future);
  await store.createSession('e'.repeat(64), user.id, future);
  const loaded = await store.session(session.token);
  assert.equal(loaded.user.mfa_enabled, true);
  assert.ok(loaded.user.email_verified_at);

  // A TOTP step can only move forward; a backup code works exactly once.
  assert.equal(await store.advanceMfaStep(user.id, 100), true);
  assert.equal(await store.advanceMfaStep(user.id, 100), false);
  assert.equal(await store.advanceMfaStep(user.id, 99), false);
  assert.equal(await store.consumeBackupCode(user.id, 'h1'), true);
  assert.equal(await store.consumeBackupCode(user.id, 'h1'), false);
  assert.deepEqual((await store.findUserById(user.id)).mfa_backup_hashes, ['h2']);

  await store.deleteUserSessions(user.id, session.token);
  assert.ok(await store.session(session.token));
  assert.equal(await store.session('e'.repeat(64)), null);
  await store.deleteUserSessions(user.id);
  assert.equal(await store.session(session.token), null);
});
