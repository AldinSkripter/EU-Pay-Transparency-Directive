import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { suggestRanges, validateCriteria, criteriaDocument, vacancyDocument } from '../server/pay-criteria.js';
import { renderText } from '../server/document-render.js';
import { verifyAll } from './helpers.js';

const origin = 'http://localhost:3000', password = 'correct-horse-123';

test('suggested range comes from basic pay per category and flags a gender difference of the median', () => {
  const row = (gender, category, base) => ({ gender, worker_category: category, base_annual: base });
  const rows = [...[40000, 42000, 44000, 46000, 48000, 50000, 52000, 54000, 56000, 100000].map(b => row('M', 'Team', b)), row('F', 'Team', 30000), row('F', 'Team', 32000), row('M', 'Solo', 70000)];
  const team = suggestRanges(rows).Team;
  assert.deepEqual([team.count, team.min, team.max], [12, 30000, 100000]);
  assert.ok(team.p10 >= team.min && team.p90 <= team.max && team.p10 < team.median && team.median < team.p90);
  assert.ok(team.medianGapPercent > 30, 'women are paid clearly less in this sample');
  assert.equal(suggestRanges(rows).Solo.medianGapPercent, null, 'no comparison without both sexes');
  assert.deepEqual(Object.keys(suggestRanges(rows)), ['Solo', 'Team']);
  assert.deepEqual(suggestRanges([]), {});
});

test('range input is validated: numbers, order, sizes and prototype names', () => {
  const ok = validateCriteria({ ranges: { Engineer: { min: 50000.4, max: '65000', agreement: 'KV Metall' } }, progression: 'Every two years' });
  assert.deepEqual(ok, { ranges: { Engineer: { min: 50000, max: 65000, agreement: 'KV Metall' } }, progression: 'Every two years' });
  assert.equal(validateCriteria({ ranges: { A: { min: 1, max: 2 } } }).ranges.A.agreement, '');
  for (const bad of [null, [], {}, { ranges: [] }, { ranges: { A: { min: 0, max: 5 } } }, { ranges: { A: { min: 10, max: 5 } } }, { ranges: { A: { min: 'x', max: 5 } } }, { ranges: { A: { min: 1, max: 1e8 } } }, { ranges: { A: { min: 1, max: 2, agreement: 'x'.repeat(256) } } }, { ranges: { '': { min: 1, max: 2 } } }, { ranges: { A: { min: 1, max: 2 } }, progression: 'x'.repeat(3001) }, { ranges: { 'bad\u0000': { min: 1, max: 2 } } }, { ranges: JSON.parse('{"__proto__":{"min":1,"max":2}}') }, { ranges: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`c${i}`, { min: 1, max: 2 }])) }]) {
    assert.throws(() => validateCriteria(bad), /INVALID_CRITERIA/, JSON.stringify(bad)?.slice(0, 60));
  }
});

test('documents: Art. 6 criteria for workers and Art. 5 vacancy wording, in the company language', () => {
  const criteria = { ranges: { Engineer: { min: 50000, max: 65000, agreement: 'KV Metall' }, Support: { min: 32000, max: 40000, agreement: '' } }, progression: 'Alle zwei Jahre nach Leistungsgespräch' };
  const classification = { Engineer: { skills: 'Degree', effort: 'High', responsibility: 'Team lead', conditions: 'Office' } };
  const nbsp = text => text.replaceAll(String.fromCharCode(160), ' ');
  const german = nbsp(renderText(criteriaDocument({ name: 'Muster GmbH', country: 'AT' }, criteria, classification)));
  assert.ok(german.startsWith('Kriterien für Entgelt, Entgeltniveaus und Entgeltentwicklung'));
  assert.ok(german.includes('Fähigkeiten: Degree') && german.includes('50.000 € – 65.000 €') && german.includes('KV Metall') && german.includes('Alle zwei Jahre'));
  assert.ok(german.includes('Support') && !german.includes('Anzuwendender Kollektivvertrag: \n'));
  const slovenian = nbsp(renderText(vacancyDocument({ name: 'Podjetje', country: 'SI' }, criteria, ['Engineer'])));
  assert.ok(slovenian.startsWith('Podatek o plači za oglase za delovna mesta'));
  assert.ok(slovenian.includes('Izhodiščna plača: 50.000 € – 65.000 € bruto na leto. Velja kolektivna pogodba: KV Metall.'));
  assert.ok(!slovenian.includes('Support'), 'only the chosen category');
  assert.ok(slovenian.includes('člen 5(2)') && slovenian.includes('dosedanji plači'));
  const all = nbsp(renderText(vacancyDocument({ name: 'Muster GmbH', country: 'DE' }, criteria)));
  assert.ok(all.includes('Engineer') && all.includes('Support') && all.includes('Art. 5 Abs. 2'));
  assert.ok(!all.includes('Kollektivvertrag: .'), 'no empty agreement sentence');
});

async function boot(t) {
  const store = new MemoryStore(), server = createApp({ store, secret: 'd'.repeat(64), origins: [origin] }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, cookie, body) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const company = async (country, email) => { const r = await request('/auth/register', null, { email, password, companyName: `F ${country}`, country }); verifyAll(store); return r.headers.get('set-cookie').split(';')[0]; };
  return { request, company, store };
}

test('API: save ranges, get suggestions from the data, generate documents, tenant isolation', async t => {
  const { request, company, store } = await boot(t);
  const cookie = await company('DE', 'hr@de.example'), other = await company('SI', 'hr@si.example');
  const csv = ['internal_id,gender,job_title,worker_category,base_annual,paid_hours_annual,hours_per_week', ...Array.from({ length: 6 }, (_, i) => `M${i},M,Eng,Engineer,${50000 + i * 1000},2000,40`), ...Array.from({ length: 6 }, (_, i) => `F${i},F,Eng,Engineer,${48000 + i * 1000},2000,40`)].join('\n');
  const preview = await (await request('/import/preview', cookie, { csv, year: 2026 })).json();
  assert.equal((await request('/import', cookie, { csv, year: 2026, mapping: preview.mapping, decimalSeparator: '.', contextConfirmed: true })).status, 201);

  const before = await (await request('/pay-criteria?year=2026', cookie)).json();
  assert.deepEqual(before.document, { ranges: {}, progression: '' });
  assert.deepEqual([before.suggestions.Engineer.count, before.suggestions.Engineer.min, before.suggestions.Engineer.max], [12, 48000, 55000]);
  assert.equal((await request('/pay-criteria/document', cookie, { kind: 'criteria', year: 2026 })).status, 404, 'nothing to publish before ranges exist');
  assert.equal((await request('/pay-criteria', cookie, { ranges: { Engineer: { min: 60000, max: 50000 } } })).status, 400);

  const saved = await request('/pay-criteria', cookie, { ranges: { Engineer: { min: 50000, max: 62000, agreement: 'KV IT' } }, progression: 'Jährliches Gespräch' });
  assert.equal(saved.status, 200);
  assert.equal((await (await request('/pay-criteria', cookie)).json()).document.ranges.Engineer.max, 62000);
  assert.deepEqual((await (await request('/pay-criteria', other)).json()).document, { ranges: {}, progression: '' }, 'per company');

  const vacancy = (await (await request('/pay-criteria/document', cookie, { kind: 'vacancy', year: 2026, categories: ['Engineer'] })).text()).replaceAll(String.fromCharCode(160), ' ');
  assert.ok(vacancy.includes('Einstiegsentgelt: 50.000 € – 62.000 € brutto pro Jahr. Es gilt der Kollektivvertrag: KV IT.'));
  const pdf = Buffer.from(await (await request('/pay-criteria/document', cookie, { kind: 'criteria', year: 2026, format: 'pdf' })).arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await request('/pay-criteria/document', cookie, { kind: 'letter', year: 2026 })).status, 400);
  assert.equal((await request('/pay-criteria/document', cookie, { kind: 'vacancy', year: 2026, format: 'docx' })).status, 400);
  assert.ok(JSON.stringify(store.auditEvents).includes('pay_criteria_saved'));
});
