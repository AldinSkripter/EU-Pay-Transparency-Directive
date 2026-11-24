import {payImportLimits} from '../shared/pay-import-limits.js';
import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

// Push integration. Any system that can send an HTTPS request (an HRIS export job, Zapier, Make, n8n, a script run
// by the accountant) delivers pay data with a company API key. The delivery is only stored as 'pending'; a person
// reviews and confirms it in the app, using the same mapping, validation and approval as a file upload.
export const API_KEY_PATTERN = /^eqt_[A-Za-z0-9_-]{43}$/;
export const newApiKey = () => `eqt_${randomBytes(32).toString('base64url')}`;
export const hashApiKey = key => createHash('sha256').update(key).digest('hex');
export const LIMITS = { bytes: payImportLimits.fileBytes, records: 10000, pending: 20, keys: 5, retentionDays: 30 };
const UNSAFE = ['__proto__', 'constructor', 'prototype'];
const printable = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

// Records must be flat objects of scalar values; nested structures are rejected instead of guessed at.
export function validateRecords(records) {
  if (!Array.isArray(records) || !records.length) throw new Error('INGEST_RECORDS_REQUIRED');
  if (records.length > LIMITS.records) throw new Error('INVALID_ROW_COUNT');
  const columns = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('INGEST_RECORD_INVALID');
    for (const [key, value] of Object.entries(record)) {
      if (UNSAFE.includes(key) || !printable(key, 255)) throw new Error('INGEST_COLUMN_INVALID');
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new Error('INGEST_NESTED_VALUE');
      columns.add(key);
    }
  }
  if (columns.size < 2 || columns.size > 200) throw new Error('INGEST_COLUMN_INVALID');
}
const validYear = value => Number.isInteger(value) && value >= 2000 && value <= 2100;

export function ingestPushRoutes(app, { store, control }) {
  const byIp = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
  const byKey = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: req => req.get('authorization') ? hashApiKey(req.get('authorization')) : ipKeyGenerator(req.ip) });
  const reject = (res, status, error) => res.status(status).json({ error });
  const authenticate = async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const key = (req.get('authorization') || '').match(/^Bearer (\S+)$/)?.[1];
    if (!key || !API_KEY_PATTERN.test(key)) return reject(res, 401, 'INVALID_API_KEY');
    const record = await store.findApiKey(hashApiKey(key));
    if (!record) return reject(res, 401, 'INVALID_API_KEY');
    if ((await control.read()).suspended[record.company_id]) return reject(res, 403, 'COMPANY_SUSPENDED');
    req.apiKey = record; req.company = await store.company(record.company_id);
    next();
  };
  app.get('/api/ingest/v1/ping', byIp, authenticate, byKey, (req, res) => res.json({ ok: true, company: { name: req.company.name, country: req.company.country }, key: req.apiKey.label }));
  app.post('/api/ingest/v1/employees', byIp, authenticate, byKey, express.json({ limit: payImportLimits.jsonBytes, type: ['application/json', 'application/*+json'] }), express.text({ type: 'text/csv', limit: '5mb' }), async (req, res) => {
    const csv = typeof req.body === 'string', year = csv ? Number(req.query.year) : req.body?.year;
    const source = csv ? req.query.source : req.body?.source;
    if (!validYear(year)) return reject(res, 400, 'INVALID_YEAR');
    if (source !== undefined && !printable(source, 80)) return reject(res, 400, 'INVALID_SOURCE');
    let payload, count;
    try {
      if (csv) {
        if (!req.body.trim()) throw new Error('INGEST_RECORDS_REQUIRED');
        payload = req.body; count = Math.max(0, req.body.split(/\r\n|\n|\r/).filter(line => line.trim()).length - 1);
        if (count < 1 || count > LIMITS.records) throw new Error(count < 1 ? 'INGEST_RECORDS_REQUIRED' : 'INVALID_ROW_COUNT');
      } else {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new Error('INGEST_RECORDS_REQUIRED');
        validateRecords(req.body.records);
        payload = JSON.stringify(req.body.records); count = req.body.records.length;
      }
    } catch (error) { return reject(res, 422, /^[A-Z_]+$/.test(error.message) ? error.message : 'INGEST_RECORD_INVALID'); }
    if (Buffer.byteLength(payload) > LIMITS.bytes) return reject(res, 413, 'PAYLOAD_TOO_LARGE');
    await store.expireIngestBatches(new Date(Date.now() - LIMITS.retentionDays * 86400000).toISOString());
    if (await store.countPendingBatches(req.company.id) >= LIMITS.pending) return reject(res, 429, 'INGEST_QUEUE_FULL');
    const batch = await store.createIngestBatch(req.company.id, { key_id: req.apiKey.id, source: source || req.apiKey.label, reporting_year: year, record_count: count, payload });
    await store.audit(req.company.id, 'ingest_batch_received', { batch_id: batch.id, key_id: req.apiKey.id, records: count, year });
    res.status(202).json({ batchId: batch.id, count, year, status: 'pending', next: 'Open Equitensa, Data & Integrations, review the delivery and confirm the import.' });
  });
}

export function integrationKeyRoutes(app, { store }) {
  const wrap = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { if (/^[A-Z_]+$/.test(error.message)) res.status(error.message.endsWith('_NOT_FOUND') ? 404 : 400).json({ error: error.message }); else next(error); } };
  app.get('/api/integrations/keys', wrap(async (req, res) => res.json({ keys: await store.listApiKeys(req.session.company.id), limit: LIMITS.keys })));
  app.post('/api/integrations/keys', wrap(async (req, res) => {
    const company = req.session.company, label = req.body.label;
    if (!printable(label, 80)) throw new Error('INVALID_LABEL');
    if ((await store.listApiKeys(company.id)).filter(k => !k.revoked_at).length >= LIMITS.keys) throw new Error('API_KEY_LIMIT');
    const key = newApiKey(), id = randomUUID();
    const created = await store.createApiKey(company.id, { id, label: label.trim(), prefix: key.slice(4, 12), key_hash: hashApiKey(key), created_by: req.session.user.id });
    await store.audit(company.id, 'api_key_created', { key_id: id, user_id: req.session.user.id });
    // The secret is shown once and only its hash is stored.
    res.status(201).json({ key, record: created });
  }));
  app.post('/api/integrations/keys/:id/revoke', wrap(async (req, res) => {
    if (!await store.revokeApiKey(req.session.company.id, req.params.id)) throw new Error('API_KEY_NOT_FOUND');
    await store.audit(req.session.company.id, 'api_key_revoked', { key_id: req.params.id, user_id: req.session.user.id });
    res.json({ ok: true });
  }));
  app.get('/api/integrations/batches', wrap(async (req, res) => {
    await store.expireIngestBatches(new Date(Date.now() - LIMITS.retentionDays * 86400000).toISOString());
    res.json({ batches: await store.listIngestBatches(req.session.company.id), retentionDays: LIMITS.retentionDays });
  }));
  app.post('/api/integrations/batches/:id/discard', wrap(async (req, res) => {
    if (!await store.closeIngestBatch(req.session.company.id, req.params.id, 'discarded')) throw new Error('BATCH_NOT_FOUND');
    await store.audit(req.session.company.id, 'ingest_batch_discarded', { batch_id: req.params.id, user_id: req.session.user.id });
    res.json({ ok: true });
  }));
}

// A pending delivery stands in for an uploaded file in the import preview and the import itself.
export async function resolveBatch(req, store) {
  if (req.body.batchId === undefined) return null;
  const batch = typeof req.body.batchId === 'string' ? await store.ingestBatch(req.session.company.id, req.body.batchId) : null;
  if (!batch || batch.status !== 'pending') throw new Error('BATCH_NOT_FOUND');
  delete req.body.csv;
  req.body.file = { name: 'api-delivery', base64: Buffer.from(batch.payload).toString('base64') };
  return batch;
}
