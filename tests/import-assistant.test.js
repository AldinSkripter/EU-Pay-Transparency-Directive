import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import Anthropic from '@anthropic-ai/sdk';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { MemoryControlStore } from '../server/control-store.js';
import { createAssistant, buildAssistantContext, validateSuggestions } from '../server/ai-assistant.js';
import { verifyAll } from './helpers.js';

const origin = 'http://localhost:3000', password = 'correct-horse-123';
const columns = ['internal_id', 'gender', 'job_title', 'worker_category', 'base_annual', 'bonuses_annual', 'paid_hours_annual', 'hours_per_week'];
const line = (id, gender, category, base, bonus = '1000') => [id, gender, 'Staff', category, base, bonus, '2000', '40'].join(';');
const csv = lines => [columns.join(';'), ...lines].join('\r\n');
const people = () => [...Array.from({ length: 6 }, (_, i) => line(`M${i}`, 'M', 'Team', `${50000 + i}`)), ...Array.from({ length: 6 }, (_, i) => line(`F${i}`, 'F', 'Team', `${49000 + i}`))];

async function boot(t, assistant) {
  const store = new MemoryStore(), control = new MemoryControlStore();
  const server = createApp({ store, control, secret: 'e'.repeat(64), origins: [origin], ...(assistant ? { assistant } : {}) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, cookie, body) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const r = await post('/auth/register', null, { email: 'hr@example.test', password, companyName: 'Firma', country: 'DE' });
  verifyAll(store);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { store, post: (path, body) => post(path, cookie, body), json: async (path, body) => { const response = await post(path, cookie, body); return { status: response.status, body: await response.json() }; } };
}
const body = (lines, extra = {}) => ({ csv: csv(lines), year: 2026, mapping: Object.fromEntries(columns.map(c => [c, c])), decimalSeparator: '.', ...extra });

test('the preview carries the findings, and the quality endpoint re-checks with the chosen corrections', async t => {
  const { json } = await boot(t);
  const messy = [...people(), line('X1', 'Frau', 'team ', '55.000,00 €'), line('X2', 'M', 'Team', '52 000')];
  const preview = await json('/import/preview', { csv: csv(messy), year: 2026 });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.assistant.available, false);
  const codes = preview.body.quality.findings.map(f => f.code);
  assert.ok(codes.includes('NUMBER_FORMAT') && codes.includes('GENDER_UNKNOWN'));
  assert.equal(preview.body.quality.summary.ready, false);

  const same = await json('/import/quality', body(messy));
  assert.deepEqual(same.body.findings.map(f => f.code), codes, 'same file and settings give the same findings');
  const fixed = await json('/import/quality', body(messy, { decimalSeparator: ',', fixes: { normalizeNumbers: true, genderMap: { Frau: 'F' } } }));
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.summary.errors, 0, JSON.stringify(fixed.body.findings.filter(f => f.severity === 'error')));
  assert.equal(fixed.body.applied.genders, 1);
  assert.equal((await json('/import/quality', body(messy, { fixes: { rm: 1 } }))).body.error, 'INVALID_FIXES');
  assert.equal((await json('/import/quality', { ...body(messy), mapping: undefined })).status, 200, 'a missing mapping falls back to the suggested one');
  assert.equal((await json('/import/quality', { year: 2026 })).status, 422);
});

test('importing with corrections: nothing changes without them, with them the data is imported and audited as counts', async t => {
  const { json, store } = await boot(t);
  const messy = [...people(), line('X1', 'Frau', 'team ', '55 000'), line('X2', 'M', 'Team', '52000'), line('X2', 'M', 'Team', '52000'), line('Summe', 'M', 'Team', '999999')];
  const refused = await json('/import', body(messy, { contextConfirmed: true }));
  assert.equal(refused.status, 422);
  assert.equal(refused.body.error, 'IMPORT_VALIDATION_FAILED');
  assert.equal(refused.body.errors[0].row, 14, 'the first failing row is reported with its row number in the file');

  const corrections = { normalizeNumbers: true, genderMap: { Frau: 'F' }, categoryMap: { team: 'Team' }, excludeRows: [16, 17] };
  assert.equal((await json('/import', body(messy, { fixes: { ...corrections, excludeRows: [99] } }))).body.error, 'INVALID_FIXES');
  const imported = await json('/import', body(messy, { fixes: corrections }));
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  assert.equal(imported.body.snapshot.count, 14, '12 + X1 + X2, without the duplicate and the total line');
  const audit = JSON.stringify(store.auditEvents.filter(e => e.action === 'import_corrections_applied'));
  assert.match(audit, /"excluded":2/);
  assert.match(audit, /"numbers":1/);
  assert.doesNotMatch(audit, /55 000|Frau|X1|Summe/, 'the audit trail never contains the corrected values or ids');
  const analysis = (await json('/analysis?year=2026', undefined));
  assert.ok(analysis);
});

test('error rows stay file rows after other rows were excluded', async t => {
  const { json } = await boot(t);
  const rows = people();
  rows.splice(1, 0, line('Summe', 'M', 'Team', '1'));
  rows.push(line('BAD', 'unknown', 'Team', '50000'));
  const result = await json('/import', body(rows, { fixes: { excludeRows: [3] } }));
  assert.equal(result.status, 422);
  assert.deepEqual(result.body.errors.map(e => e.row), [15]);
});

test('AI assistant is unavailable without a key and needs explicit consent when configured', async t => {
  const off = await boot(t);
  assert.equal((await off.json('/import/assist', body(people(), { consent: true }))).body.error, 'AI_NOT_CONFIGURED');
  assert.equal(createAssistant({ apiKey: '' }).available, false);
  assert.equal(createAssistant({ apiKey: 'sk-test', enabled: false }).available, false);

  const calls = [];
  const client = { messages: { create: async request => { calls.push(request); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ mapping: [], categories: [] }) }] }; } } };
  const on = await boot(t, createAssistant({ client }));
  assert.equal((await on.json('/import/preview', { csv: csv(people()), year: 2026 })).body.assistant.available, true);
  assert.equal((await on.json('/import/assist', body(people()))).body.error, 'AI_CONSENT_REQUIRED');
  assert.equal(calls.length, 0, 'nothing is sent before the user consents');
});

test('what the assistant receives: statistics and category labels, never ids, individual pay or personal columns', async t => {
  const calls = [];
  const client = { messages: { create: async request => { calls.push(request); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ mapping: [{ field: 'job_category_kv', column: 'Stufe', reason: 'Tarifstufe' }, { field: 'internal_id', column: 'Nachname', reason: 'x' }, { field: 'bogus', column: 'Stufe', reason: 'x' }], categories: [{ to: 'Sachbearbeitung', from: ['Sachbearbeiter', 'Nicht vorhanden'], reason: 'gleiche Tätigkeit' }, { to: 'Engineer L2', from: ['Engineer L3'], reason: 'ähnlich' }, { to: 'Erfunden', from: ['Sachbearbeiter'], reason: '' }] }) }] }; } } };
  const { json, store } = await boot(t, createAssistant({ client }));
  const lines = [...Array.from({ length: 6 }, (_, i) => `M${i};m;Staff;Sachbearbeitung;${50000 + i};0;2000;40;Meier${i};S${i}`), ...Array.from({ length: 6 }, (_, i) => `F${i};f;Staff;Sachbearbeiter;${49000 + i};0;2000;40;Huber${i};S${i}`), 'F9;f;Staff;Engineer L2;61234;0;2000;40;Roth;S9', 'F8;f;Staff;Engineer L3;70123;0;2000;40;Rot;S8', 'F7;f;Staff;Entwickler;70321;0;2000;40;Kar;S7'];
  const request = { csv: ['internal_id;gender;job_title;worker_category;base_annual;bonuses_annual;paid_hours_annual;hours_per_week;Nachname;Stufe', ...lines].join('\r\n'), year: 2026, consent: true, language: 'sl', mapping: Object.fromEntries(columns.map(c => [c, c])) };
  const result = await json('/import/assist', request);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(calls.length, 1);
  const call = calls[0], sent = call.messages[0].content;
  assert.equal(call.model, 'claude-opus-5-5');
  assert.equal(call.output_config.format.type, 'json_schema');
  assert.equal(call.thinking, undefined, 'Opus 5.5 thinks by default; depth is controlled through effort');
  assert.equal(call.output_config.effort, 'medium');
  assert.match(call.system, /Slovenian/);
  for (const secret of ['M0', 'F9', 'Meier', 'Huber', 'Roth', '50003', '49002', '61234', '70123', '70321']) assert.equal(sent.includes(secret), false, `${secret} must not be sent`);
  assert.ok(sent.includes('Sachbearbeitung') && sent.includes('Engineer L2'), 'category labels are sent');
  assert.match(JSON.stringify(JSON.parse(sent).columns.find(c => c.name === 'Nachname')), /^\{"name":"Nachname","mappedTo":null,"filled":1,"kind":"text"\}$/, 'a personal column contributes only its name');
  assert.equal(JSON.parse(sent).columns.find(c => c.name === 'internal_id').distinct, undefined);

  // The answer is checked against the file before it reaches the user.
  assert.deepEqual(result.body.mapping.map(m => [m.field, m.column, m.source]), [['job_category_kv', 'Stufe', 'ai']], 'a personal column, an unknown field and an already mapped field are dropped');
  assert.deepEqual(result.body.categories.map(g => [g.to, g.from]), [['Sachbearbeitung', ['Sachbearbeiter']]], 'labels that are not in the file, reuse of a label and a different level are dropped');
  assert.equal(result.body.categories[0].counts.Sachbearbeiter, 6);
  assert.deepEqual(result.body.sent, { columns: 10, categories: 5, jobTitles: 1 });
  const audit = JSON.stringify(store.auditEvents.filter(e => e.action === 'ai_assist_used'));
  assert.match(audit, /"model":"claude-opus-5-5"/);
  assert.doesNotMatch(audit, /Sachbearbeit|Meier/, 'the audit trail has counts only');
});

test('assistant failures reach the user as plain codes and never break the deterministic checks', async t => {
  const fail = (error, response) => ({ messages: { create: async () => { if (error) throw error; return response; } } });
  const typed = (cls, status) => Object.assign(Object.create(cls.prototype), { status, message: 'secret detail' });
  const cases = [
    [fail(typed(Anthropic.RateLimitError, 429)), 429, 'AI_BUSY'],
    [fail(typed(Anthropic.AuthenticationError, 401)), 503, 'AI_NOT_CONFIGURED'],
    [fail(typed(Anthropic.APIConnectionError, undefined)), 502, 'AI_UNREACHABLE'],
    [fail(new Error('boom')), 502, 'AI_FAILED'],
    [fail(null, { stop_reason: 'refusal', content: [] }), 422, 'AI_REFUSED'],
    [fail(null, { stop_reason: 'max_tokens', content: [] }), 502, 'AI_TRUNCATED'],
    [fail(null, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }), 502, 'AI_FAILED'],
  ];
  for (const [client, status, code] of cases) {
    const { json } = await boot(t, createAssistant({ client }));
    const result = await json('/import/assist', body(people(), { consent: true }));
    assert.deepEqual([result.status, result.body.error], [status, code]);
    assert.equal((await json('/import/quality', body(people()))).status, 200);
  }
});

test('suggestion validation on its own: repeated columns and repeated labels are used once', () => {
  const rows = [{ a: '1', b: 'Dev', c: 'x' }, { a: '2', b: 'Developer', c: 'y' }, { a: '3', b: 'Entwickler', c: 'y' }];
  const context = buildAssistantContext({ headers: ['a', 'b', 'c'], rows, mapping: { worker_category: 'b' } });
  const unmapped = validateSuggestions({ mapping: [{ field: 'gender', column: 'c', reason: 'r' }, { field: 'hours_per_week', column: 'c', reason: 'r' }, { field: 'gender', column: 'a', reason: 'r' }] }, context);
  assert.deepEqual(unmapped.mapping.map(m => [m.field, m.column]), [['gender', 'c']], 'one column per field and one field per column');
  assert.deepEqual(validateSuggestions(null, context), { mapping: [], categories: [] });
  assert.deepEqual(validateSuggestions({ mapping: 'x', categories: 5 }, context), { mapping: [], categories: [] });
});
