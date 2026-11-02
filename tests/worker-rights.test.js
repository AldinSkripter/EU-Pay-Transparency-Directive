import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { addMonths, dueOn, requestState, summarize, validDate } from '../server/worker-rights.js';
import { verifyAll } from './helpers.js';

const origin = 'http://localhost:3000', password = 'correct-horse-123';
const today = new Date().toISOString().slice(0, 10), shift = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

test('response deadline is two calendar months, clamped to the end of short months (Art. 7(4))', () => {
  assert.equal(dueOn('2026-06-15'), '2026-08-15');
  assert.equal(dueOn('2026-12-31'), '2027-02-28');
  assert.equal(dueOn('2027-12-31'), '2028-02-29');
  assert.equal(dueOn('2026-01-31'), '2026-03-31');
  assert.equal(dueOn('2026-10-31'), '2026-12-31');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
  assert.ok(validDate('2026-02-28') && !validDate('2026-02-30') && !validDate('2026-2-3') && !validDate(20260228));
});

test('request state: open, due soon, overdue, answered', () => {
  const request = due => ({ due_on: due, status: 'open' });
  assert.equal(requestState(request('2026-11-30'), '2026-11-02').state, 'open');
  assert.equal(requestState(request('2026-11-16'), '2026-11-02').state, 'due_soon');
  assert.equal(requestState(request('2026-11-02'), '2026-11-02').state, 'due_soon', 'due today is still on time');
  assert.equal(requestState(request('2026-11-01'), '2026-11-02').state, 'overdue');
  assert.equal(requestState({ due_on: '2020-01-01', status: 'answered' }, '2026-11-02').state, 'answered');
  assert.equal(requestState(request('2026-11-16'), '2026-11-02').daysLeft, 14);
  const list = [request('2026-11-30'), request('2026-11-05'), request('2026-10-01'), { due_on: '2026-10-01', status: 'answered' }].map(r => requestState(r, '2026-11-02'));
  assert.deepEqual(summarize(list), { total: 4, open: 3, dueSoon: 1, overdue: 1, answered: 1 });
});

async function boot(t) {
  const store = new MemoryStore(), server = createApp({ store, secret: 'c'.repeat(64), origins: [origin] }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, cookie, body) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const company = async (country, email) => {
    const registered = await request('/auth/register', null, { email, password, companyName: `Firma ${country}`, country });
    verifyAll(store);
    return registered.headers.get('set-cookie').split(';')[0];
  };
  const importData = async (cookie, rows) => {
    const csv = ['internal_id,gender,job_title,worker_category,base_annual,bonuses_annual,paid_hours_annual,hours_per_week', ...rows.map(r => r.join(','))].join('\n');
    const preview = await (await request('/import/preview', cookie, { csv, year: 2026 })).json();
    const response = await request('/import', cookie, { csv, year: 2026, mapping: preview.mapping, decimalSeparator: '.', contextConfirmed: true });
    assert.equal(response.status, 201, await response.clone().text());
  };
  return { store, request, company, importData };
}
// 6 + 6 in "Team" (pay 50 000/45 000 + 2 000 bonus for men), 1 + 1 in "Solo".
const staff = () => [...Array.from({ length: 6 }, (_, i) => [`M${i}`, 'M', 'Engineer', 'Team', 50000, 2000, 2000, 40]), ...Array.from({ length: 6 }, (_, i) => [`F${i}`, 'F', 'Engineer', 'Team', 45000, 0, 2000, 40]), ['M-solo', 'M', 'Lead', 'Solo', 90000, 0, 2000, 40], ['F-solo', 'F', 'Lead', 'Solo', 80000, 0, 2000, 40]];

test('Art. 7 requests: log, deadline, answer from pay data, close, tenant isolation', async t => {
  const { request, company, importData, store } = await boot(t);
  const cookie = await company('DE', 'hr@de.example'), other = await company('SI', 'hr@si.example');
  await importData(cookie, staff());

  assert.deepEqual((await (await request('/requests', cookie)).json()).summary, { total: 0, open: 0, dueSoon: 0, overdue: 0, answered: 0 });
  for (const bad of [{ receivedOn: shift(1) }, { channel: 'friend' }, { requesterLabel: '' }, { requesterLabel: 'x'.repeat(121) }, { requesterLabel: 'bad\u0000name' }, { receivedOn: '2026-02-30' }, { note: 'x'.repeat(2001) }]) {
    const response = await request('/requests', cookie, { receivedOn: today, channel: 'worker', requesterLabel: 'Anna', ...bad });
    assert.equal(response.status, 400, JSON.stringify(bad).slice(0, 60));
  }
  const created = await request('/requests', cookie, { receivedOn: shift(-80), channel: 'worker', requesterLabel: 'Anna F.', note: 'Per email' });
  assert.equal(created.status, 201);
  const open = (await created.json()).request;
  assert.equal(open.state, 'overdue', 'received 80 days ago, two months are over');
  assert.equal(open.due_on, dueOn(shift(-80)));
  const fresh = (await (await request('/requests', cookie, { receivedOn: today, channel: 'representative', requesterLabel: 'Works council' })).json()).request;
  assert.equal(fresh.state, 'open');
  const listed = await (await request('/requests', cookie)).json();
  assert.equal(listed.requests[0].id, open.id, 'earliest deadline first');
  assert.deepEqual([listed.summary.open, listed.summary.overdue], [2, 1]);

  // The answer: own pay and category averages by sex (Art. 7(1)); employee ID is only compared as a pseudonym.
  const answer = (id, body) => request(`/requests/${id}/answer`, cookie, { year: 2026, internalId: 'F2', ...body });
  const data = (await (await answer(open.id, {})).json()).answer;
  assert.equal(data.language, 'de');
  assert.deepEqual(data.worker, { category: 'Team', annual: 45000, baseAnnual: 45000, variableAnnual: 0, hourly: 22.5 });
  assert.equal(data.category.protected, false);
  assert.deepEqual([data.category.men.count, data.category.women.count], [6, 6]);
  assert.equal(data.category.men.annual, 52000); assert.equal(data.category.women.annual, 45000);
  assert.equal(data.category.men.hourly, 26); assert.equal(data.category.men.variableAnnual, 2000);
  // A category too small to be anonymous: averages are withheld (Art. 12(3)), own pay still given.
  const solo = (await (await answer(open.id, { internalId: 'F-solo' })).json()).answer;
  assert.equal(solo.worker.annual, 80000); assert.equal(solo.category.protected, true);
  assert.equal(solo.category.men.annual, null); assert.equal(solo.category.women.annual, null);
  assert.equal((await answer(open.id, { internalId: 'nobody' })).status, 404);
  assert.equal((await answer(open.id, { internalId: '' })).status, 400);
  assert.equal((await answer(open.id, { year: 2031 })).status, 404, 'no data for that year');
  assert.equal((await answer('00000000-0000-4000-8000-000000000000', {})).status, 404);
  const txt = (await (await answer(open.id, { format: 'txt' })).text()).replaceAll(String.fromCharCode(160), ' ');
  assert.ok(txt.startsWith('Auskunft über das Entgelt'));
  assert.ok(txt.includes('45.000,00 €') && txt.includes('52.000,00 €') && txt.includes('Art. 7 Abs. 2'));
  const pdf = Buffer.from(await (await answer(open.id, { format: 'pdf' })).arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await answer(open.id, { format: 'docx' })).status, 400);

  // Another company can neither see nor answer this request, and ID lookups never cross tenants.
  assert.deepEqual((await (await request('/requests', other)).json()).requests, []);
  assert.equal((await request(`/requests/${open.id}/answer`, other, { year: 2026, internalId: 'F2' })).status, 404);
  assert.equal((await request(`/requests/${open.id}/close`, other, { answeredOn: today, summary: 'x' })).status, 404);

  // Closing: answered date must lie between receipt and today.
  assert.equal((await request(`/requests/${open.id}/close`, cookie, { answeredOn: shift(-100), summary: 'x' })).status, 400);
  assert.equal((await request(`/requests/${open.id}/close`, cookie, { answeredOn: shift(1), summary: 'x' })).status, 400);
  const closed = (await (await request(`/requests/${open.id}/close`, cookie, { answeredOn: today, summary: 'Letter sent' })).json()).request;
  assert.equal(closed.state, 'answered'); assert.equal(closed.answered_on, today);
  assert.deepEqual((await (await request('/requests', cookie)).json()).summary, { total: 2, open: 1, dueSoon: 0, overdue: 0, answered: 1 });

  // The audit trail keeps who and when but never the employee ID or the pay figures.
  const audit = JSON.stringify(store.auditEvents);
  for (const action of ['info_request_created', 'info_answer_generated', 'info_request_answered']) assert.ok(audit.includes(action), action);
  assert.ok(!audit.includes('F2') && !audit.includes('45000'));
  assert.equal(store.auditEvents.find(e => e.action === 'info_request_answered').metadata.on_time, false, 'late answer is recorded as late');
});

test('Art. 7(3) annual notice: record it once a year and generate the text in the company language', async t => {
  const { request, company } = await boot(t);
  const si = await company('SI', 'hr@si.example'), at = await company('AT', 'hr@at.example');
  assert.equal((await (await request('/rights-notice?year=2026', si)).json()).notice, null);
  assert.equal((await request('/rights-notice', si, { year: 2026, sentOn: shift(1), contact: 'hr@si.example' })).status, 400, 'not in the future');
  assert.equal((await request('/rights-notice', si, { year: 2026, sentOn: today, contact: '' })).status, 400);
  const saved = (await (await request('/rights-notice', si, { year: 2026, sentOn: today, contact: 'kadrovska@firma.si' })).json()).notice;
  assert.deepEqual([saved.sent_on, saved.contact], [today, 'kadrovska@firma.si']);
  assert.equal((await (await request('/rights-notice?year=2026', at)).json()).notice, null, 'per company');
  assert.equal((await (await request('/rights-notice?year=2027', si)).json()).notice, null, 'per year');

  const slovenian = await (await request('/rights-notice/document', si, { year: 2026, contact: 'kadrovska@firma.si' })).text();
  assert.ok(slovenian.startsWith('Obvestilo o vaši pravici do informacij o plačah'));
  assert.ok(slovenian.includes('kadrovska@firma.si') && slovenian.includes('dveh mesecih'));
  const german = await (await request('/rights-notice/document', at, { year: 2026, contact: 'personal@firma.at' })).text();
  assert.ok(german.startsWith('Hinweis auf Ihr Recht auf Entgeltinformation') && german.includes('zwei Monaten') && german.includes('personal@firma.at'));
  assert.equal((await request('/rights-notice/document', at, { year: 2026, contact: 'x', format: 'pdf' })).headers.get('content-type'), 'application/pdf');
});

test('unverified accounts cannot use the request tools', async t => {
  const { request } = await boot(t);
  const registered = await request('/auth/register', null, { email: 'x@example.test', password, companyName: 'X', country: 'DE' });
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/requests', cookie)).status, 403);
});
