import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import iconv from 'iconv-lite';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { verifyAll } from './helpers.js';

// End to end: register a company per country, import data in the format that country's systems export, document
// the review, approve, then export every document for every recipient and check content, language and rules.
const origin = 'http://localhost:3000', password = 'correct-horse-123';
const setups = {
  DE: { language: 'de', title: 'Bericht über das geschlechtsspezifische Entgeltgefälle', assessment: 'Gemeinsame Entgeltbewertung', protectedWord: 'geschützt', headers: ['Personalnummer', 'Geschlecht', 'Tätigkeit', 'Vergleichsgruppe', 'Jahresgrundvergütung', 'Jährliche variable Vergütung', 'Bezahlte Jahresstunden', 'Wochenstunden', 'Land', 'Währung', 'Berichtsjahr'], sex: { M: 'männlich', F: 'weiblich' } },
  AT: { language: 'de', title: 'Bericht über das geschlechtsspezifische Entgeltgefälle', assessment: 'Gemeinsame Entgeltbewertung', protectedWord: 'geschützt', headers: ['Personalnummer', 'Geschlecht', 'Tätigkeit', 'Vergleichsgruppe', 'Jahresgrundvergütung', 'Jährliche variable Vergütung', 'Bezahlte Jahresstunden', 'Wochenstunden', 'Land', 'Währung', 'Berichtsjahr'], sex: { M: 'männlich', F: 'weiblich' } },
  SI: { language: 'sl', title: 'Poročilo o razliki v plačah med spoloma', assessment: 'Skupna ocena plač', protectedWord: 'zaščiteno', headers: ['Šifra zaposlenega', 'Spol', 'Delovno mesto', 'Enakovredna kategorija', 'Letno osnovno plačilo', 'Letno variabilno plačilo', 'Letne plačane ure', 'Tedenske ure', 'Država', 'Valuta', 'Leto poročanja'], sex: { M: 'moški', F: 'ženska' } },
};

// 10 + 10 Engineering (women 10 % lower base, half without bonus), 6 + 6 Support (equal), 3 + 2 Small (women 30 % lower).
function people(sex, year, factor = 1) {
  const rows = []; let id = 0;
  const add = (count, gender, category, base, bonus) => { for (let i = 0; i < count; i++) rows.push([String(++id).padStart(4, '0'), sex[gender], 'Staff', category, Math.round(base * factor), Math.round(bonus * factor), 2080, 40]); };
  add(10, 'M', 'Engineering', 60000, 6000); add(5, 'F', 'Engineering', 54000, 6000); add(5, 'F', 'Engineering', 54000, 0);
  add(6, 'M', 'Support', 40000, 0); add(6, 'F', 'Support', 40000, 0);
  add(3, 'M', 'Small', 50000, 0); add(2, 'F', 'Small', 35000, 0);
  return rows;
}
const table = (country, year, factor) => [setups[country].headers, ...people(setups[country].sex, year, factor).map(row => [...row, country, 'EUR', year])];
const asCsv = rows => rows.map(row => row.join(';')).join('\r\n');

async function boot(t) {
  const store = new MemoryStore();
  const server = createApp({ store, secret: 'a'.repeat(64), origins: [origin] }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, cookie, body) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { store, request };
}

async function prepareCompany({ store, request }, country) {
  const setup = setups[country];
  const registered = await request('/auth/register', null, { email: `hr-${country}@example.test`, password, companyName: `Muster ${country}`, country });
  assert.equal(registered.status, 201);
  verifyAll(store);
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  const importYear = async (year, input) => {
    const preview = await (await request('/import/preview', cookie, { ...input, year })).json();
    assert.equal(preview.context.reportingCountry, country);
    assert.deepEqual(preview.contextErrors, [], `${country} ${year}`);
    const response = await request('/import', cookie, { ...input, year, mapping: preview.mapping, decimalSeparator: '.', contextConfirmed: true });
    assert.equal(response.status, 201, await response.clone().text());
    return preview;
  };
  // 2025 as plain CSV text (feeds the four-year history), 2026 in the country's own file format.
  await importYear(2025, { csv: asCsv(table(country, 2025, 0.97)) });
  const rows = table(country, 2026);
  if (country === 'DE') {
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Lohnliste');
    const preview = await importYear(2026, { file: { name: 'export.dat', base64: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }).toString('base64') } });
    assert.equal(preview.format, 'xlsx');
  } else if (country === 'SI') {
    const preview = await importYear(2026, { file: { name: 'pantheon.txt', base64: iconv.encode(asCsv(rows), 'windows-1250').toString('base64') }, encoding: 'windows-1250' });
    assert.equal(preview.format, 'delimited');
    assert.equal(preview.encoding, 'windows-1250');
  } else {
    await importYear(2026, { csv: asCsv(rows) });
  }
  const analysis = await (await request('/analysis?year=2026', cookie)).json();
  const classification = Object.fromEntries(['Engineering', 'Small', 'Support'].map(c => [c, { skills: `${c} skills`, effort: `${c} effort`, responsibility: `${c} responsibility`, conditions: `${c} conditions` }]));
  const workflow = {
    snapshotId: analysis.snapshot.id, reportingDate: '2020-01-31',
    profile: { legalName: `Muster ${country} GmbH`, headcount: 200, payrollComplete: true }, classification,
    reviews: { Engineering: { explanation: 'Seniority mix is being reviewed', action: 'Salary adjustment', owner: 'HR lead', due: '2027-03-01', justified: false }, Small: { explanation: 'Different job levels, documented with the works council', justified: true } },
    approval: { manager: 'Dr. Managing Director', representatives: 'Works council consulted on 2027-01-10', confirmed: true, consulted: true },
    assessment: { previousMeasures: 'First assessment, no earlier measures to evaluate', leaveReturn: { Engineering: 'Two returners received the general increase' } },
  };
  const saved = await request('/workflow', cookie, { year: 2026, workflow });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).readiness.ready, true, `${country}: review documented, approval complete`);
  return { cookie, snapshotId: analysis.snapshot.id };
}

const get = async (ctx, cookie, format, audience, extra = '') => {
  const response = await ctx.request(`/reports/${format}?year=2026&audience=${audience}${extra}`, cookie);
  assert.equal(response.status, 200, `${format} ${audience}${extra}: ${await response.clone().text().catch(() => '')}`.slice(0, 300));
  return response;
};
const json = async (...args) => (await get(...args)).json();
const text = async (...args) => (await get(...args)).text();

for (const country of ['DE', 'AT', 'SI']) {
  test(`${country}: import, approval and every report document for every recipient`, async t => {
    const ctx = await boot(t), setup = setups[country];
    const { cookie } = await prepareCompany(ctx, country);

    // --- JSON per recipient: content rules of Art. 9, 10 and 12(3)
    const internal = await json(ctx, cookie, 'json', 'internal'), authority = await json(ctx, cookie, 'json', 'authority'), workers = await json(ctx, cookie, 'json', 'workers'), publicReport = await json(ctx, cookie, 'json', 'public');
    for (const report of [internal, authority, workers, publicReport]) {
      assert.equal(report.company.country, country);
      assert.equal(report.language, setup.language, 'language follows the company country');
      assert.equal(report.officialSubmission, false);
      assert.equal(report.reportingYear, 2026);
      assert.deepEqual([report.workforce.total, report.workforce.men, report.workforce.women, report.workforce.other], [37, 19, 18, 0]);
    }
    assert.deepEqual(internal.article9.map(i => i.letter).join(''), 'abcdefg');
    assert.equal(authority.article9.map(i => i.letter).join(''), 'abcdefg');
    assert.equal(workers.article9.map(i => i.letter).join(''), 'abcdefg');
    assert.equal(publicReport.article9.map(i => i.letter).join(''), 'abcdef', 'the public summary stops at f');
    assert.equal(publicReport.groups, undefined);
    assert.equal(publicReport.history, undefined);
    assert.ok(internal.confirmation.confirmed && internal.confirmation.consulted);
    assert.equal(internal.confirmation.manager, 'Dr. Managing Director');
    assert.equal(authority.confirmation.manager, 'Dr. Managing Director');
    assert.equal(workers.confirmation.manager, undefined, 'names stay out of the worker package');
    assert.equal(publicReport.confirmation.manager, undefined);
    assert.equal(workers.confirmation.representatives, undefined);

    // Art. 12(3): the small category is visible for the monitoring body and internally, protected for workers.
    const small = report => report.groups.find(g => g.category === 'Small');
    assert.equal(small(internal).suppressed, false); assert.ok(small(internal).mean_gap > 29);
    assert.equal(small(authority).suppressed, false); assert.ok(small(authority).mean_gap > 29, 'monitoring body gets unrestricted values');
    assert.equal(small(workers).suppressed, true); assert.equal(small(workers).mean_gap, null);
    for (const key of ['review_required', 'review_gap_hourly', 'review_gap_annual']) { assert.equal(small(workers)[key], undefined, key); assert.equal(small(authority)[key], undefined, key); }
    assert.equal(workers.summary.review_gap_hourly, undefined);
    assert.equal(workers.article9.find(i => i.letter === 'g').values.find(g => g.category === 'Small').mean_gap_hourly, null);

    // Art. 10: the 5 % alarm fires for Engineering (10 %+) and for the protected Small group, not for Support.
    assert.deepEqual(internal.article10.categories.map(c => [c.category, c.atOrAboveThreshold]), [['Engineering', true], ['Small', true], ['Support', false]]);
    assert.equal(internal.article10.thresholdPercent, 5);
    assert.equal(authority.article10, undefined); assert.equal(workers.article10, undefined);

    // Art. 9(9): the previous year is part of every package except the public one.
    for (const report of [internal, authority, workers]) { assert.deepEqual(report.history.map(h => h.year), [2025]); assert.equal(report.history[0].indicators.length, report.article9.length); }

    // Indicator (a) is the real mean gap: men 60 000 + 6 000 bonus vs women 54 000 + 3 000 bonus, Engineering only drives it.
    const a = internal.article9.find(i => i.letter === 'a').values;
    assert.ok(a.hourly > 5 && a.hourly < 20, `(a) hourly ${a.hourly}`);
    assert.equal(internal.article9.find(i => i.letter === 'e').values.male_percent, Number((10 / 19 * 100).toFixed(4)));

    // --- Text: fully localized, with the legal letters, no English leftovers
    for (const audience of ['internal', 'authority', 'workers', 'public']) {
      const doc = await text(ctx, cookie, 'txt', audience);
      assert.ok(doc.startsWith(setup.title), `${audience} starts with the localized title`);
      for (const letter of ['a', 'b', 'c', 'd', 'e', 'f']) assert.ok(doc.includes(`(${letter}) `), `(${letter}) in ${audience}`);
      assert.equal(doc.includes('(g) '), audience !== 'public', `(g) only outside the public summary (${audience})`);
      for (const english of ['Audience:', 'Rules:', 'Method:', 'Snapshot:']) assert.ok(!doc.includes(english), `${english} left in ${audience}`);
      assert.ok(doc.includes('2023/970'));
    }
    const internalText = await text(ctx, cookie, 'txt', 'internal');
    assert.ok(internalText.includes(setup.assessment), 'Art. 10 section in the internal package');
    assert.ok(internalText.includes('Engineering'));
    const workerText = await text(ctx, cookie, 'txt', 'workers');
    assert.ok(workerText.includes(setup.protectedWord), 'workers see the protection marker');
    assert.ok(!workerText.includes('Dr. Managing Director'));

    // --- Spreadsheet, CSV, XML, PDF
    const sheets = async audience => XLSX.read(Buffer.from(await (await get(ctx, cookie, 'xlsx', audience)).arrayBuffer()), { type: 'buffer' }).SheetNames;
    assert.deepEqual((await sheets('internal')).filter(n => ['Article 9', 'Confirmation', 'Article 10', 'Previous years', 'Categories', 'Quartiles'].includes(n)).sort(), ['Article 10', 'Article 9', 'Categories', 'Confirmation', 'Previous years', 'Quartiles']);
    const publicSheets = await sheets('public');
    assert.ok(!publicSheets.includes('Categories') && !publicSheets.includes('Article 10') && !publicSheets.includes('Previous years'));
    assert.ok((await text(ctx, cookie, 'csv', 'internal')).includes('art10_category'));
    assert.ok(!(await text(ctx, cookie, 'csv', 'workers')).includes('art10_category'));
    const xml = await text(ctx, cookie, 'xml', 'internal');
    assert.match(xml, /<Article9 reference="Directive \(EU\) 2023\/970, Art\. 9\(1\)">/);
    for (const letter of 'abcdefg') assert.ok(xml.includes(`<Indicator letter="${letter}"`), letter);
    assert.match(xml, new RegExp(`language="${setup.language}"`));
    assert.match(xml, /<Article10 thresholdPercent="5">/);
    assert.ok(!(await text(ctx, cookie, 'xml', 'public')).includes('letter="g"'));
    for (const audience of ['internal', 'authority', 'workers', 'public']) {
      const pdf = Buffer.from(await (await get(ctx, cookie, 'pdf', audience)).arrayBuffer());
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.ok(pdf.length > 3000, `${audience} pdf has content`);
    }

    // --- Joint pay assessment (Art. 10): every format, three recipients, never public
    const assessment = await json(ctx, cookie, 'json', 'internal', '&type=assessment');
    assert.equal(assessment.language, setup.language); assert.equal(assessment.thresholdPercent, 5);
    assert.deepEqual(assessment.categoriesAtOrAboveThreshold, ['Engineering', 'Small']);
    const engineering = assessment.categories.find(c => c.category === 'Engineering');
    assert.equal(engineering.proportion.men, 10); assert.equal(engineering.proportion.women, 10);
    assert.equal(engineering.measures.action, 'Salary adjustment');
    assert.equal(engineering.leaveReturn, 'Two returners received the general increase');
    assert.equal(assessment.previousMeasures, 'First assessment, no earlier measures to evaluate');
    assert.ok(assessment.categories.find(c => c.category === 'Small').averagePay.men.annual > 0, 'internal sees the protected category');
    const workerAssessment = await json(ctx, cookie, 'json', 'workers', '&type=assessment');
    assert.equal(workerAssessment.categories.find(c => c.category === 'Small').averagePay.men.annual, null, 'protected for workers');
    assert.equal(workerAssessment.categories.find(c => c.category === 'Small').protected, true);
    assert.equal((await json(ctx, cookie, 'json', 'authority', '&type=assessment')).categories.find(c => c.category === 'Small').averagePay.men.annual > 0, true);
    assert.equal((await ctx.request('/reports/json?year=2026&audience=public&type=assessment', cookie)).status, 400);
    const assessmentText = await text(ctx, cookie, 'txt', 'internal', '&type=assessment');
    assert.ok(assessmentText.startsWith(setup.assessment));
    for (const letter of 'abcdefg') assert.ok(assessmentText.includes(`${letter}) `), `assessment section ${letter}`);
    assert.ok(assessmentText.includes('Salary adjustment'));
    for (const format of ['csv', 'xml', 'xlsx', 'pdf']) assert.equal((await ctx.request(`/reports/${format}?year=2026&audience=authority&type=assessment`, cookie)).status, 200, format);

    // --- Gates
    assert.equal((await ctx.request('/reports/json?year=2026&audience=internal&prepared=true', cookie)).status, 402, 'prepared package needs a subscription');
    assert.equal((await ctx.request('/reports/json?year=2026&audience=nobody', cookie)).status, 400);
    assert.equal((await ctx.request('/reports/json?year=2031&audience=internal', cookie)).status, 404);
  });
}

test('prepared package after the subscription: status wording follows the country', async t => {
  const ctx = await boot(t);
  const { cookie } = await prepareCompany(ctx, 'SI');
  const company = [...ctx.store.companies.values()][0];
  await ctx.store.createOrder({ id: randomUUID(), company_id: company.id, plan: 'prepare', interval: 'annual', mode: 'sandbox', status: 'sandbox_active' });
  const response = await get(ctx, cookie, 'json', 'authority', '&prepared=true');
  assert.equal(response.headers.get('x-report-status'), 'PREPARED_INTERNAL_UNVERIFIED');
  assert.equal((await response.json()).status, 'PREPARED_INTERNAL_UNVERIFIED');
  assert.match(await text(ctx, cookie, 'txt', 'authority', '&prepared=true'), /PRIPRAVLJENO DELOVNO POROČILO/);
});
