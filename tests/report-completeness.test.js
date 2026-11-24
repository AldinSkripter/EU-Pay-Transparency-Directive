import { documentedEvaluation } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { normalizeEmployee } from '../server/pay.js';
import { buildDocument } from '../server/report-model.js';
import { assessmentData, assessmentDocument, assessmentCsv, assessmentXml, assessmentXlsx } from '../server/assessment.js';
import { validateWorkflow, readiness } from '../server/workflow.js';
import { analyze } from '../server/pay.js';

// Identical hourly pay; women worked half a year. Annual and hourly results must differ.
const rows = Array.from({ length: 12 }, (_, i) => normalizeEmployee({ internal_id: String(i), gender: i < 6 ? 'M' : 'F', job_title: 'Engineer', worker_category: 'Engineering', base_annual: i < 6 ? 60000 : 30000, bonuses_annual: i < 6 ? 6000 : 3000, paid_hours_annual: i < 6 ? 2000 : 1000, hours_per_week: 40 }, 'test-company', 'test-secret'));
const snap = (audience = 'authority', records = rows) => ({ id: 's1', reporting_year: 2026, rows: records, audience, history: [{ year: 2025, rows: records }] });

test('DE/AT/SI documents preserve different annual and hourly category gaps and full history', () => {
  for (const country of ['DE', 'AT', 'SI']) {
    const doc = buildDocument({ name: 'Company', country }, snap());
    assert.equal(doc.language, country === 'SI' ? 'sl' : 'de');
    assert.equal(doc.sections.find(s => s.id === 'categories').table.rows[0][3], '0,00 %');
    assert.deepEqual(doc.sections.find(s => s.id === 'categories-annual').table.rows[0].slice(2), ['50,00 %', '50,00 %']);
    const history = doc.sections.filter(s => s.id.startsWith('history-2025-'));
    assert.equal(history.length, 6);
    assert.deepEqual(history.find(s => s.id.endsWith('categories-annual')).table.rows[0].slice(2), ['50,00 %', '50,00 %']);
    assert.equal(buildDocument({ name: 'Company', country }, snap('public')).sections.some(s => s.id.startsWith('categories') || s.id.startsWith('history')), false);
  }
});

test('small-group protection applies to added annual and historical tables', () => {
  const doc = buildDocument({ name: 'X', country: 'DE' }, snap('workers', rows.slice(0, 7)));
  for (const id of ['categories-annual', 'history-2025-categories-annual']) {
    const values = doc.sections.find(s => s.id === id).table.rows[0].slice(2);
    assert.ok(values.every(v => v.includes('geschützt')));
  }
});

test('joint assessment preserves pay components in document, XML, CSV and XLSX', () => {
  const company = { name: 'X', country: 'AT' }, snapshot = snap();
  const pay = assessmentData(company, snapshot).categories[0].averagePay.men;
  assert.deepEqual(pay, { annual: 66000, hourly: 33, baseAnnual: 60000, baseHourly: 30, variableAnnual: 6000, variableHourly: 3 });
  const xml = assessmentXml(company, snapshot);
  for (const [key, value] of Object.entries(pay)) assert.ok(xml.includes(`<${key}>${value}</${key}>`));
  assert.ok(assessmentCsv(company, snapshot).includes('"Engineering","men","66000","33","60000","30","6000","3"'));
  const book = XLSX.read(assessmentXlsx(company, snapshot), { type: 'buffer' });
  const sheet = XLSX.utils.sheet_to_json(book.Sheets['Pay components'], { header: 1 });
  assert.deepEqual(sheet[1].slice(1), ['men', 66000, 33, 60000, 30, 6000, 3]);
  assert.equal(assessmentDocument(company, snapshot).sections.filter(s => s.id.startsWith('components-')).length, 2);
  const protectedXml = assessmentXml(company, snap('workers', rows.slice(0, 7)));
  assert.ok(protectedXml.includes('<annual></annual>'));
  assert.ok(!protectedXml.includes('<annual>66000</annual>'));
});

test('material changes to agreement, assessment and submission invalidate management confirmation', () => {
  const snapshot = snap();
  const previous = validateWorkflow({ snapshotId: 's1', approval: { manager: 'Manager', representatives: 'Council', confirmed: true, consulted: true } }, snapshot);
  assert.equal(validateWorkflow(previous, snapshot, previous).approval.confirmed, true);
  for (const change of [{ criteriaAgreement: { status: 'agreed' } }, { assessment: { previousMeasures: 'Changed evidence' } }, { reportingDate: '2027-06-01' }]) {
    const result = validateWorkflow({ ...previous, ...change }, snapshot, previous);
    assert.equal(result.approval.confirmed, false);
    assert.equal(result.approval.consulted, false);
  }
});

test('criteria cannot be complete while agreement with representatives is pending or unspecified', () => {
  const snapshot = snap(), analysis = analyze(rows), classification = { Engineering: { skills: 'Skills', effort: 'Effort', responsibility: 'Responsibility', conditions: 'Conditions' } };
  const complete = status => readiness({ snapshotId: snapshot.id, jobEvaluation:documentedEvaluation(['Engineering']), classification, criteriaAgreement: { status } }, analysis, snapshot).checks.find(c => c.id === 'categories').done;
  assert.equal(complete('pending'), false); assert.equal(complete(''), false);
  assert.equal(complete('agreed'), true); assert.equal(complete('no_representatives'), true);
});

test('changing the approving manager or consultation record requires fresh approval', () => {
  const snapshot = snap();
  const previous = validateWorkflow({ snapshotId: snapshot.id, approval: { manager: 'Original manager', representatives: 'Original council consultation', confirmed: true, consulted: true } }, snapshot);
  for (const change of [{manager:'New manager'}, {representatives:'Different consultation record'}]) {
    const changed = validateWorkflow({...previous,approval:{...previous.approval,...change}},snapshot,previous);
    assert.equal(changed.approval.confirmed,false);
    assert.equal(changed.approval.consulted,false);
    assert.equal(readiness(changed,analyze(snapshot.rows),snapshot).checks.find(c=>c.id==='approval').done,false);
    const reconfirmed=validateWorkflow({...changed,approval:{...changed.approval,confirmed:true,consulted:true}},snapshot,changed);
    assert.equal(reconfirmed.approval.confirmed,true);
    assert.equal(reconfirmed.approval.consulted,true);
  }
});
