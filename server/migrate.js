import { readFile } from 'node:fs/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/002_self_service.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/003_platform_control.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/004_google_auth.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/005_import_batches.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/006_payroll_ledger.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/007_account_security.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/008_worker_rights.sql', import.meta.url), 'utf8'));
  console.log('Database migration complete.');
} finally { await pool.end(); }
