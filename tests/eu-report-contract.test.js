import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { SaxesParser } from 'saxes';
import { referenceSnapshot, referenceWorkflow, expectedArticle9 } from './fixtures/eu-report-reference.js';
import { reportData, reportCsv, reportXml, reportXlsx, reportHtml } from '../server/reports.js';
import { buildDocument } from '../server/report-model.js';
import { assessmentData, assessmentCsv, assessmentXlsx, assessmentXml, assessmentDocument } from '../server/assessment.js';
import { assessmentCompleteness } from '../server/assessment-input.js';
import { validateWorkflow, readiness } from '../server/workflow.js';
import { analyze } from '../server/pay.js';

test('report readiness lists actionable missing fields and clears them only after completion', () => {
  const snapshot=referenceSnapshot('internal'), analysis=analyze(snapshot.rows,{suppress:false});
  assert.deepEqual(readiness(snapshot.workflow,analysis,snapshot).missing,[]);
  snapshot.workflow.profile.payrollComplete=false;
  snapshot.workflow.approval.confirmed=false;
  snapshot.workflow.reviews={};
  const state=readiness(snapshot.workflow,analysis,snapshot);
  assert.equal(state.ready,false);
  for(const field of ['payrollComplete','confirmation','explanation','measures']) assert.ok(state.missing.some(item=>item.field===field),field);
  assert.ok(state.missing.every(item=>item.step && item.article));
  snapshot.workflow.snapshotId='old';
  assert.ok(readiness(snapshot.workflow,analysis,snapshot).missing.some(item=>item.field==='currentSnapshot'));
});

test('Article 10 EU reporting scope respects the first reference year and three-year rhythm', () => {
  const snapshot = referenceSnapshot('internal'), analysis = analyze(snapshot.rows, { suppress: false });
  for (const [headcount, year, expected] of [[250,2025,false],[250,2026,true],[250,2027,true],[200,2026,true],[200,2027,false],[200,2029,true],[120,2029,false],[120,2030,true],[120,2031,false],[120,2033,true],[99,2033,false]]) {
    snapshot.reporting_year = year; snapshot.workflow.profile.headcount = headcount;
    assert.equal(readiness(snapshot.workflow, analysis, snapshot).assessments[0].reportingRequiredByEu, expected, `${headcount}/${year}`);
  }
});

test('Article 9(10): small and offsetting component differences require review without triggering Article 10', () => {
  for (const offset of [false, true]) {
    const snapshot = referenceSnapshot('internal');
    snapshot.rows = snapshot.rows.map(r => {
      const base = r.gender === 'M' ? 100 : 99;
      const bonus = offset && r.gender === 'F' ? 1 : 0;
      return { ...r, base_annual: base, bonuses_annual: bonus, base_hourly: base, variable_hourly: bonus, total_hourly: base + bonus };
    });
    const analysis = analyze(snapshot.rows, { suppress: false });
    assert.equal(analysis.groups[0].review_required, false);
    assert.equal(analysis.groups[0].explanation_required, true);
    snapshot.workflow.reviews = {};
    assert.equal(readiness(snapshot.workflow, analysis, snapshot).checks.find(c => c.id === 'reviews').done, false);
    snapshot.workflow.reviews['Reference category'] = { explanation: 'Documented objective criteria', justified: true };
    assert.equal(readiness(snapshot.workflow, analysis, snapshot).checks.find(c => c.id === 'reviews').done, true);
    snapshot.audience = 'workers';
    const external = reportData({ name: 'Example', country: 'DE' }, snapshot);
    assert.equal(external.summary.explanation_required, undefined);
    assert.equal(external.groups[0].explanation_required, undefined);
  }
});

test('standalone assessment exports identify the company/year and both sex proportions', () => {
  const snapshot = referenceSnapshot('authority'), company = { name: 'Report company', country: 'SI' };
  const csv = assessmentCsv(company, snapshot);
  assert.ok(csv.includes('"company","Report company"'));
  assert.ok(csv.includes('"reporting_year","2026"'));
  const book = XLSX.read(assessmentXlsx(company, snapshot), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(book.Sheets.Categories);
  assert.equal(rows[0].men_percent, 50); assert.equal(rows[0].women_percent, 50);
  assert.equal(rows[0].total, 16);
  const xml = assessmentXml(company, snapshot);
  new SaxesParser().write(xml).close();
  assert.match(xml, /menPercent="50" womenPercent="50"/);
});

test('reports never reuse approval, reasons or assessment evidence from another snapshot', () => {
  const snapshot = referenceSnapshot('internal'), company = { name: 'Example', country: 'DE' };
  snapshot.workflow.snapshotId = 'superseded-snapshot';
  const report = reportData(company, snapshot);
  assert.equal(report.confirmation.confirmed, false);
  assert.equal(report.confirmation.consulted, false);
  assert.equal(report.confirmation.manager, null);
  assert.deepEqual(report.review, []);
  assert.ok(report.article10.categories.every(c => !c.justified && !c.remedied));
  const assessment = assessmentData(company, snapshot);
  assert.equal(assessment.jointReviewConfirmed, false);
  assert.equal(assessment.previousMeasures, null);
  assert.equal(assessment.completeness.ready, false);
  assert.ok(assessment.categories.every(c => c.reasons === null && c.leaveOutcomes.applicable === null));
  assert.ok(!buildDocument(company, snapshot).sections.some(s => s.id === 'review'));
});

test('Article 9(a-g): independent numeric reference, both bases, all three jurisdictions', () => {
  for (const country of ['DE', 'AT', 'SI']) {
    const data = reportData({ name: 'Synthetic example', country }, referenceSnapshot());
    const by = Object.fromEntries(data.article9.map(item => [item.letter, item.values]));
    for (const letter of ['a', 'b', 'c', 'd', 'e']) assert.deepEqual(by[letter], expectedArticle9[letter], `${country} (${letter})`);
    for (const [key, value] of Object.entries(expectedArticle9.g)) assert.equal(by.g[0][key], value, `${country} (g) ${key}`);
    assert.deepEqual(by.f.map(q => q.male_percent), [100, 100, 0, 0]);
    assert.deepEqual(by.f.map(q => q.annual_male_percent), [0, 0, 100, 100]);
    assert.deepEqual(by.f.map(q => q.annual_female_percent), [100, 100, 0, 0]);
  }
});

test('Article 9(f): reversed annual/hourly quartiles survive every report representation', () => {
  const company = { name: 'Synthetic example', country: 'SI' }, snapshot = referenceSnapshot();
  const doc = buildDocument(company, snapshot);
  assert.deepEqual(doc.sections.find(s => s.id === 'quartiles').table.rows[0].slice(1, 3), ['100,00 %', '0,00 %']);
  assert.deepEqual(doc.sections.find(s => s.id === 'quartiles-annual').table.rows[0].slice(1, 3), ['0,00 %', '100,00 %']);
  assert.match(reportHtml(company, snapshot), /Letno/);
  assert.ok(reportCsv(company, snapshot).includes('annual_male_percent'));
  const xml = reportXml(company, snapshot), parser = new SaxesParser();
  parser.write(xml).close(); assert.match(xml, /<AnnualQuartiles>/); assert.match(xml, /annual_male_percent/);
  const book = XLSX.read(reportXlsx(company, snapshot), { type: 'buffer' });
  const values = XLSX.utils.sheet_to_json(book.Sheets['Annual quartiles'], { header: 1 });
  assert.deepEqual(values[1], [1, 4, false, 0, 100]);
});

test('Article 10(2)(e): compute 4/8 and 6/8, preserve all formats and protect small returner groups', () => {
  const company = { name: 'Synthetic example', country: 'DE' }, snapshot = referenceSnapshot();
  const outcome = assessmentData(company, snapshot).categories[0].leaveOutcomes;
  assert.equal(outcome.men.percent, 50); assert.equal(outcome.women.percent, 75);
  assert.equal(assessmentData(company, snapshot).completeness.ready, true);
  const section = assessmentDocument(company, snapshot).sections.find(s => s.id === 'e');
  assert.deepEqual(section.table.rows[0].slice(2), ['8', '4', '50,00 %']);
  assert.ok(assessmentCsv(company, snapshot).includes('"Reference category","women","true","false","8","6","75"'));
  const xml = assessmentXml(company, snapshot); new SaxesParser().write(xml).close();
  assert.match(xml, /<Benefited>6<\/Benefited><Percent>75<\/Percent>/);
  const book = XLSX.read(assessmentXlsx(company, snapshot), { type: 'buffer' });
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Leave outcomes'], { header: 1 })[2][6], 75);
  snapshot.audience = 'workers'; snapshot.workflow.assessment.leaveOutcomes['Reference category'].men = { eligible: 1, benefited: 1 };
  const hidden = assessmentData(company, snapshot).categories[0].leaveOutcomes;
  assert.equal(hidden.protected, true); assert.equal(hidden.men.percent, null); assert.equal(hidden.men.benefited, null);
});

test('Article 10: missing required content prevents completion, including differences below 5%', () => {
  const snapshot = referenceSnapshot();
  for (const field of ['previousMeasures', 'jointReviewConfirmed', 'leaveOutcomes']) {
    const w = structuredClone(referenceWorkflow); delete w.assessment[field];
    assert.equal(assessmentCompleteness(w, snapshot).ready, false, field);
  }
  const w = structuredClone(referenceWorkflow); w.reviews['Reference category'].explanation = '';
  assert.ok(assessmentCompleteness(w, snapshot).missing.some(m => m.field === 'reasons'));
  // A small difference also requires reasons and measures in a joint assessment.
  const low = referenceSnapshot();
  low.rows = low.rows.map(r => ({ ...r, base_annual: r.gender === 'M' ? 60000 : 59400, bonuses_annual: 0, base_hourly: r.gender === 'M' ? 30 : 29.7, variable_hourly: 0, total_hourly: r.gender === 'M' ? 30 : 29.7 }));
  w.reviews = {};
  const missing = assessmentCompleteness(w, low).missing;
  assert.ok(missing.some(m => m.field === 'reasons')); assert.ok(missing.some(m => m.field === 'measures'));
});

test('return counts reject invented or inconsistent numbers and changes invalidate management approval', () => {
  const snapshot = referenceSnapshot();
  for (const counts of [{ eligible: 8, benefited: 9 }, { eligible: 9, benefited: 8 }, { eligible: -1, benefited: 0 }, { eligible: 0.5, benefited: 0 }]) {
    const w = structuredClone(referenceWorkflow); w.assessment.leaveOutcomes['Reference category'].men = counts;
    assert.throws(() => validateWorkflow(w, snapshot), /INVALID_ASSESSMENT_INPUT/);
  }
  const prior = validateWorkflow(referenceWorkflow, snapshot), changed = structuredClone(prior);
  changed.assessment.leaveOutcomes['Reference category'].men.benefited = 5;
  assert.equal(validateWorkflow(changed, snapshot, prior).approval.confirmed, false);
  changed.assessment.leaveOutcomes['Reference category'] = { applicable: false, note: 'No relevant returners' };
  assert.equal(assessmentCompleteness(changed, snapshot).ready, true);
  changed.assessment.leaveOutcomes['Reference category'].note = '';
  assert.equal(assessmentCompleteness(changed, snapshot).ready, false);
});

test('100–149 reporting threshold depends on reference year, not an arbitrary submission date', () => {
  const snapshot = referenceSnapshot(), w = structuredClone(referenceWorkflow);
  w.profile.headcount = 120; w.reportingDate = '2031-06-07';
  snapshot.reporting_year = 2026;
  const analysis = { count: 16, groups: [{ category: 'Reference category', review_required: true }] };
  assert.equal(readiness(w, analysis, snapshot).assessments[0].reportingRequiredByEu, false);
  snapshot.reporting_year = 2030;
  assert.equal(readiness(w, analysis, snapshot).assessments[0].reportingRequiredByEu, true);
});

test('quartile populations include every worker and never classify other genders as women', () => {
  const snapshot = referenceSnapshot();
  snapshot.rows.push({ ...snapshot.rows[0], anonymized_id: 'other', gender: 'O', base_annual: 500000, bonuses_annual: 0, total_hourly: 250, base_hourly: 250, variable_hourly: 0 });
  const result = analyze(snapshot.rows, { suppress: false });
  assert.equal(result.quartiles.reduce((sum, q) => sum + q.count, 0), 17);
  assert.equal(result.annual_quartiles.reduce((sum, q) => sum + q.count, 0), 17);
  assert.equal(result.quartiles[3].female_percent, 80);
  assert.equal(result.annual_quartiles[3].male_percent, 80);
  const proportions = assessmentData({ name: 'Synthetic', country: 'DE' }, snapshot).categories[0].proportion;
  assert.equal(proportions.total, 17); assert.equal(proportions.other, 1);
  assert.equal(proportions.womenPercent, 47.0588);
});

test('empty bands and absent sexes export unavailable values, never NaN or invented zeroes', () => {
  const snapshot = referenceSnapshot(); snapshot.rows = snapshot.rows.slice(0, 1);
  const report = reportData({ name: 'Synthetic', country: 'DE' }, snapshot);
  assert.equal(report.summary.female_variable_receivers, null);
  assert.equal(report.summary.quartiles[0].male_percent, null);
  const xml = reportXml({ name: 'Synthetic', country: 'DE' }, snapshot);
  assert.doesNotMatch(xml, /NaN|Infinity/);
});
