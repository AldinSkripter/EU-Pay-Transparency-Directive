import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { germanSupplement, austrianSupplement, nationalDocument } from '../server/national-reports.js';
import { normalizeEmployee } from '../server/pay.js';
import { renderText } from '../server/document-render.js';
import { MemoryStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { verifyAll } from './helpers.js';

const secret = 'test-secret-national-report';
const de = { confirmed: true, cycle: 'three', firstReport: false, previousYear: 2023, equalityMeasures: 'Mentoring', equalityEffects: 'Mehr Frauen in Führung', equalPayMeasures: 'Entgeltprüfung', counts: { men: { fullTime: 230.5, partTime: 20 }, women: { fullTime: 210, partTime: 60 } }, previousCounts: { men: { fullTime: 200, partTime: 15 }, women: { fullTime: 180, partTime: 55 } } };
const atCsv = (count = 12) => ['internal_id;pay_group;group_year;time_dependent_annual;time_independent_annual;fte_fraction;year_fraction', ...Array.from({ length: count }, (_, i) => `${i};KV IT;3;16850;200;0.5;1`)].join('\n');
const snapshot = (company = 'test-company', count = 12) => ({ id: 'snapshot1', reporting_year: 2026, rows: Array.from({ length: count }, (_, i) => normalizeEmployee({ internal_id: String(i), job_title: 'Engineer', worker_category: 'Engineering', gender: i < 6 ? 'M' : 'F', base_annual: 14400, bonuses_annual: 2650, paid_hours_annual: 1040, hours_per_week: 20 }, company, secret)) });
const atInput = csv => ({ confirmed: true, anonymityReviewed: true, csv });

test('German report includes period, measures, annual average headcounts and previous-report changes', () => {
  const supplement = germanSupplement(de, 2026), company = { name: 'Firma', country: 'DE' }, snap = snapshot();
  assert.equal(supplement.periodStart, 2024);
  assert.equal(germanSupplement({ ...de, cycle: 'five' }, 2026).periodStart, 2022);
  const doc = nationalDocument(company, snap, { ...supplement, snapshotId: snap.id });
  assert.equal(doc.language, 'de');
  assert.deepEqual(doc.sections.find(s => s.id === 'counts').table.rows[0], ['Männer', '250.5', '230.5', '20']);
  assert.deepEqual(doc.sections.find(s => s.id === 'changes').table.rows[0], ['Männer', '35.5', '30.5', '5']);
  assert.match(renderText(doc), /Unternehmensregister/);
  for (const patch of [{ confirmed: false }, { equalityEffects: '' }, { counts: {} }, { cycle: 'unknown' }, { previousYear: 2023.5 }]) assert.throws(() => germanSupplement({ ...de, ...patch }, 2026), /NATIONAL_DATA_INCOMPLETE/);
  assert.throws(() => nationalDocument(company, { ...snap, id: 'new' }, { ...supplement, snapshotId: snap.id }), /NATIONAL_DATA_INCOMPLETE/);
});

test('Austrian calculation reproduces the government example: 16850 / 0.5 + 200 = 33900', () => {
  const result = austrianSupplement(atInput(atCsv()), snapshot(), 'test-company', secret);
  assert.equal(result.groups[0].menMean, 33900);
  assert.equal(result.groups[0].womenMean, 33900);
  assert.equal(result.groups[0].men, 6);
  assert.equal(result.groupYears[0].groupYear, '3');
  assert.ok(!JSON.stringify(result).includes('internal_id'));
  const partialCsv = atCsv().replaceAll(';16850;200;0.5;1', ';16850;200;0.5;0.5');
  assert.equal(austrianSupplement(atInput(partialCsv), snapshot(), 'test-company', secret).groups[0].menMean, 67600);
});

test('Austrian input rejects missing, duplicated, foreign IDs, inconsistent pay and invalid fractions', () => {
  const csv = atCsv(), snap = snapshot();
  for (const invalid of [csv.replace('0;KV', '999;KV'), csv.replace('1;KV', '0;KV'), csv.replace(';16850;', ';16849;'), csv.replace(';0.5;1', ';0;1'), csv.replace(';0.5;1', ';2;1'), csv.split('\n').slice(0, -1).join('\n')]) assert.throws(() => austrianSupplement(atInput(invalid), snap, 'test-company', secret), /NATIONAL_DATA_INCOMPLETE/);
  assert.throws(() => austrianSupplement({ ...atInput(csv), anonymityReviewed: false }, snap, 'test-company', secret), /NATIONAL_DATA_INCOMPLETE/);
  assert.throws(() => austrianSupplement(atInput(csv), snap, 'other-company', secret), /NATIONAL_DATA_INCOMPLETE/);
});

test('Austrian small groups and their parent means are protected; Slovenia cannot impersonate a verified national template', () => {
  const result = austrianSupplement(atInput(atCsv().replace('11;KV IT;3;', '11;KV IT;4;')), snapshot(), 'test-company', secret);
  assert.equal(result.groups[0].menMean, null);
  assert.equal(result.groupYears.find(g => g.groupYear === '4').womenMean, null);
  assert.throws(() => nationalDocument({ country: 'SI' }, snapshot(), {}), /NATIONAL_TEMPLATE_UNVERIFIED/);
});

test('national report API enforces authentication, company jurisdiction, snapshot binding and source minimization', async t => {
  const store = new MemoryStore(), app = createApp({ store, secret, demo: true, origins: ['http://localhost:3000'] });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, cookie, body) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'http://localhost:3000', ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const register = async country => {
    const response = await request('/auth/register', null, { email: `${country}@national.example`, password: 'correct-horse-123', companyName: `Firma ${country}`, country });
    verifyAll(store); return response.headers.get('set-cookie').split(';')[0];
  };
  assert.equal((await request('/national-report')).status, 401);
  const cookies = {};
  for (const country of ['DE', 'AT', 'SI']) {
    cookies[country] = await register(country);
    assert.equal((await request('/national-report/document', cookies[country], { format: 'txt', year: 2026 })).status, 400);
    const csv = ['internal_id,gender,job_title,worker_category,base_annual,bonuses_annual,paid_hours_annual,hours_per_week', ...Array.from({ length: 12 }, (_, i) => `${i},${i < 6 ? 'M' : 'F'},Engineer,Engineering,14400,2650,1040,20`)].join('\n');
    assert.equal((await request('/import', cookies[country], { csv, year: 2026 })).status, 201);
  }
  assert.equal((await request('/national-report', cookies.DE, { ...de, year: 2026 })).status, 200);
  const saved = await request('/national-report', cookies.AT, { ...atInput(atCsv()), year: 2026 });
  assert.equal(saved.status, 200);
  assert.ok(!JSON.stringify(await saved.json()).includes('internal_id'));
  assert.equal((await request('/national-report', cookies.SI, { ...de, country: 'DE', year: 2026 })).status, 400);
  for (const country of ['DE', 'AT']) {
    const response = await request('/national-report/document', cookies[country], { format: 'html', year: 2026 });
    assert.equal(response.status, 200);
    const html = await response.text(); assert.match(html, /lang="de"/);
    assert.ok(html.includes(country === 'DE' ? 'Mentoring' : '33.900'));
    const pdf = await request('/national-report/document', cookies[country], { format: 'pdf', year: 2026 });
    assert.equal(pdf.status, 200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  }
  assert.equal((await (await request('/national-report?year=2026', cookies.SI)).json()).document, null);
  // Replace the snapshot to ensure old supplemental approval cannot be reused.
  const replacement = 'internal_id,gender,job_title,worker_category,base_annual,bonuses_annual,paid_hours_annual,hours_per_week\n0,M,Engineer,Engineering,20000,0,1040,20';
  assert.equal((await request('/import', cookies.DE, { csv: replacement, year: 2026 })).status, 201);
  assert.equal((await request('/national-report/document', cookies.DE, { format: 'txt', year: 2026 })).status, 400);
});
