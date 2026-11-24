import { documentedEvaluation } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { renderHtml } from '../server/document-render.js';
import { verifyAll } from './helpers.js';

const origin = 'http://localhost:3000', password = 'correct-horse-123';
const today = new Date().toISOString().slice(0, 10);
const columns = ['internal_id', 'gender', 'job_title', 'worker_category', 'base_annual', 'bonuses_annual', 'paid_hours_annual', 'hours_per_week'];
const line = (id, gender, category, base) => [id, gender, 'Staff', category, base, '1000', '2000', '40'].join(';');
const csv = [columns.join(';'), ...Array.from({ length: 6 }, (_, i) => line(`M${i}`, 'M', 'Team', 50000 + i)), ...Array.from({ length: 6 }, (_, i) => line(`F${i}`, 'F', 'Team', 47000 + i))].join('\r\n');

async function boot(t, country) {
  const store = new MemoryStore(), server = createApp({ store, secret: 'd'.repeat(64), origins: [origin] }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const registered = await fetch(base + '/auth/register', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'hr@example.test', password, companyName: 'Firma', country }) });
  verifyAll(store);
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  const call = (path, body) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const imported = await call('/import', { csv, year: 2026, mapping: Object.fromEntries(columns.map(c => [c, c])), decimalSeparator: '.' });
  assert.equal(imported.status, 201);
  return { call };
}

test('accessible HTML (Art. 8): language, headings, labelled tables, escaped text, no scripts or images', () => {
  const doc = { language: 'sl', title: 'Naslov <b>', subtitle: 'Člen 7', status: 'Osnutek', coverLine: 'Firma · 2026', recipientLine: '', keyFigures: [['Razlika', '5 %']], sections: [
    { id: 'a', title: 'Razdelek', paragraphs: ['<script>alert(1)</script> & več'], items: [['Ključ', 'Vrednost']] },
    { id: 'b', title: 'Tabela', table: { head: ['Kategorija', 'Moški', 'Ženske'], rows: [['Team', '50000', '47000']] } },
  ] };
  const html = renderHtml(doc, { lang: 'sl', title: 'Naslov' });
  assert.match(html, /^<!DOCTYPE html>\n<html lang="sl">/);
  assert.match(html, /<title>Naslov<\/title>/);
  assert.match(html, /<h1>Naslov &lt;b&gt;<\/h1>/);
  assert.match(html, /<h2>Razdelek<\/h2>/);
  assert.match(html, /<th scope="col">Kategorija<\/th>/);
  assert.match(html, /<th scope="row">Team<\/th><td>50000<\/td>/);
  assert.match(html, /<caption>Tabela<\/caption>/);
  assert.ok(!html.includes('<script>alert') && html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; več'));
  assert.ok(!/<img|<svg|onclick|javascript:/i.test(html), 'no images or active content');
  assert.match(html, /<meta name="viewport"/);
});

test('every document has an accessible format: reports, assessment, worker answers, notice and criteria', async t => {
  for (const [country, lang] of [['DE', 'de'], ['SI', 'sl']]) {
    const { call } = await boot(t, country);
    for (const audience of ['internal', 'workers', 'authority', 'public']) {
      const response = await call(`/reports/html?year=2026&audience=${audience}`);
      assert.equal(response.status, 200, audience);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      const html = await response.text();
      assert.match(html, new RegExp(`<html lang="${lang}">`));
      assert.match(html, /<table>/);
      assert.match(html, /\(a\) /);
      assert.ok(!html.includes('<th scope="col"></th>'), 'no empty header cells');
    }
    const assessment = await call('/reports/html?year=2026&audience=internal&type=assessment');
    assert.equal(assessment.status, 200);
    assert.match(await assessment.text(), new RegExp(`<html lang="${lang}">`));

    const request = await (await call('/requests', { receivedOn: today, channel: 'worker', requesterLabel: 'A.B.' })).json();
    const answer = await call(`/requests/${request.request.id}/answer`, { year: 2026, internalId: 'F1', format: 'html' });
    assert.equal(answer.status, 200, await answer.clone().text());
    const answerHtml = await answer.text();
    assert.match(answerHtml, new RegExp(`<html lang="${lang}">`));
    assert.match(answerHtml, /<h1>/);
    assert.ok(!answerHtml.includes('F1'), 'the worker id is not echoed');

    const notice = await call('/rights-notice/document', { year: 2026, contact: 'hr@firma.test', format: 'html' });
    assert.equal(notice.status, 200);
    assert.match(await notice.text(), new RegExp(`<html lang="${lang}">`));

    assert.equal((await call('/pay-criteria', { ranges: { Team: { min: 40000, max: 50000, agreement: '' } }, progression: 'jährlich' })).status, 200);
    for (const kind of ['criteria', 'vacancy']) {
      const document = await call('/pay-criteria/document', { kind, year: 2026, format: 'html' });
      assert.equal(document.status, 200, kind);
      assert.match(await document.text(), new RegExp(`<html lang="${lang}">`));
    }
    assert.equal((await call('/rights-notice/document', { year: 2026, contact: 'x', format: 'docx' })).status, 400, 'unknown formats stay refused');
  }
});

test('requests: clarification requests and the labour inspectorate as a source (Art. 7(2), Art. 9(9)-(10))', async t => {
  const { call } = await boot(t, 'AT');
  const created = await call('/requests', { receivedOn: today, channel: 'labour_inspectorate', kind: 'clarification', requesterLabel: 'Arbeitsinspektorat' });
  assert.equal(created.status, 201);
  const { request } = await created.json();
  assert.deepEqual([request.channel, request.kind, request.due_on > today], ['labour_inspectorate', 'clarification', true]);
  const plain = (await (await call('/requests', { receivedOn: today, channel: 'worker', requesterLabel: 'C.D.' })).json()).request;
  assert.equal(plain.kind, 'information', 'the kind defaults to the Art. 7(1) information request');
  for (const bad of [{ channel: 'boss' }, { kind: 'complaint' }, { kind: 5 }]) assert.equal((await call('/requests', { receivedOn: today, channel: 'worker', requesterLabel: 'E.F.', ...bad })).status, 400, JSON.stringify(bad));
  const listed = (await (await call('/requests')).json()).requests;
  assert.deepEqual(listed.map(r => r.kind).sort(), ['clarification', 'information']);
});

test('Art. 4(4): agreement of the comparison criteria with workers\' representatives is recorded and shown in the internal report', async t => {
  const { call } = await boot(t, 'DE');
  const snapshot = (await (await call('/analysis?year=2026')).json()).snapshot;
  const base = { snapshotId: snapshot.id, profile: { legalName: 'Firma', headcount: 12, payrollComplete: true }, classification: {}, reviews: {}, approval: {}, reportingDate: '' };
  const saved = await (await call('/workflow', { year: 2026, workflow: { ...base, criteriaAgreement: { status: 'agreed', note: 'Betriebsvereinbarung vom 1.3.' } } })).json();
  assert.deepEqual(saved.workflow.criteriaAgreement, { status: 'agreed', note: 'Betriebsvereinbarung vom 1.3.' });
  const internal = await (await call('/reports/txt?year=2026&audience=internal')).text();
  assert.match(internal, /Kriterien mit Arbeitnehmervertretern vereinbart \(Art\. 4 Abs\. 4\): Ja, vereinbart/);
  const invalid = await (await call('/workflow', { year: 2026, workflow: { ...base, criteriaAgreement: { status: 'whatever', note: 5 } } })).json();
  assert.deepEqual(invalid.workflow.criteriaAgreement, { status: '', note: '' }, 'unknown values are not stored');
  const authority = await (await call('/reports/txt?year=2026&audience=authority')).text();
  assert.ok(!authority.includes('Kriterien mit Arbeitnehmervertretern vereinbart'), 'the internal working view does not reach other recipients');
});

test('evidence register (Art. 18(2)): reflects only what was recorded, in the company language, in every format', async t => {
  const { call } = await boot(t, 'DE');
  const empty = await (await call('/evidence/json?year=2026')).json();
  const state = label => empty.evidence.rows.find(r => r[0].includes(label))[1];
  assert.equal(state('Art. 5'), 'Offen');
  assert.equal(state('Art. 7 Abs. 3'), 'Offen');
  assert.equal(state('Art. 9 ·'), 'Teilweise', 'data imported but not yet confirmed by management');
  assert.equal(state('Art. 8'), 'Teilweise', 'available formats alone do not prove accessible delivery');

  const snapshot = (await (await call('/analysis?year=2026')).json()).snapshot;
  const criteria = { skills: 'a', effort: 'b', responsibility: 'c', conditions: 'd' };
  await call('/workflow', { year: 2026, workflow: { snapshotId: snapshot.id, profile: { legalName: 'Firma', headcount: 12, payrollComplete: true }, jobEvaluation:documentedEvaluation(['Team']), classification: { Team: criteria }, criteriaAgreement: { status: 'agreed', note: '' }, reviews: { Team: { explanation: 'Dienstalter', justified: true } }, approval: { manager: 'Dr. Muster', representatives: 'Betriebsrat 12.5.', confirmed: true, consulted: true }, reportingDate: '2027-05-30' } });
  await call('/pay-criteria', { ranges: { Team: { min: 40000, max: 50000, agreement: '' } }, progression: 'jährlich' });
  await call('/rights-notice', { year: 2026, contact: 'hr@firma.test', sentOn: today });
  const request = (await (await call('/requests', { receivedOn: today, channel: 'worker', requesterLabel: 'A.B.' })).json()).request;
  await call(`/requests/${request.id}/close`, { answeredOn: today, summary: 'Antwort versendet' });

  await call('/employer-controls', {year:2026,document:{snapshotId:snapshot.id,records:Object.fromEntries(['recruitment','criteriaAccess','accessibility','distribution'].map(id=>[id,{status:'recorded',owner:'Synthetic HR',reviewedOn:today,evidence:'Synthetic implementation and delivery receipt'}]))}});
  const done = await (await call('/evidence/json?year=2026')).json();
  for (const label of ['Art. 4 Abs. 4', 'Art. 5', 'Art. 6', 'Art. 7 Abs. 3', 'Art. 7 und', 'Art. 9 ·', 'Art. 10']) assert.equal(done.evidence.rows.find(r => r[0].includes(label))[1], 'Dokumentiert', label);
  assert.equal(done.evidence.duty.band, '<100');

  const txt = await (await call('/evidence/txt?year=2026')).text();
  assert.match(txt, /Nachweis der Umsetzung der Transparenzpflichten/);
  assert.match(txt, /Dr\. Muster/);
  assert.match(txt, /1 Anfragen erfasst, 1 beantwortet, 0 überfällig/);
  const html = await call('/evidence/html?year=2026');
  assert.match(html.headers.get('content-type'), /^text\/html/);
  assert.match(await html.text(), /<html lang="de">/);
  assert.equal((await call('/evidence/pdf?year=2026')).status, 200);
  assert.equal((await call('/evidence/docx?year=2026')).status, 400);

  const slovenian = await boot(t, 'SI');
  assert.match(await (await slovenian.call('/evidence/txt?year=2026')).text(), /Dokazilo o izvajanju obveznosti preglednosti/);
});
