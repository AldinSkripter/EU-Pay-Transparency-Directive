import { completedRemediation } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, REVIEW_THRESHOLD_PERCENT } from '../server/pay.js';
import { article9 } from '../server/article9.js';
import { readiness } from '../server/workflow.js';

// Directive (EU) 2023/970 Art. 10(1)(a): difference in the average pay level between women and men of at
// least 5 % in any category of workers. Pay level = gross annual pay and the corresponding gross hourly pay.
let counter = 0;
const person = (gender, category, hourly, { hours = 2000, bonus = 0 } = {}) => {
  const base = hourly * hours - bonus;
  return { anonymized_id: `id${String(++counter).padStart(4, '0')}`, gender, worker_category: category, base_annual: base, bonuses_annual: bonus, paid_hours_annual: hours, base_hourly: base / hours, variable_hourly: bonus / hours, total_hourly: hourly };
};
const team = (category, men, women, { menPay = 100, womenPay = 100, menHours = 2000, womenHours = 2000 } = {}) => [
  ...Array.from({ length: men }, () => person('M', category, menPay, { hours: menHours })),
  ...Array.from({ length: women }, () => person('F', category, womenPay, { hours: womenHours })),
];
const group = (rows, category) => analyze(rows).groups.find(g => g.category === category);

test('threshold is exactly 5 percent', () => assert.equal(REVIEW_THRESHOLD_PERCENT, 5));

test('a gap just below 5 % is quiet, exactly 5 % and above raises the alarm', () => {
  assert.equal(group(team('A', 6, 6, { womenPay: 95.01 }), 'A').review_required, false);   // 4.99 %
  assert.equal(group(team('B', 6, 6, { womenPay: 95 }), 'B').review_required, true);       // 5.00 %
  assert.equal(group(team('C', 6, 6, { womenPay: 80 }), 'C').review_required, true);
});

test('the threshold is applied to the unrounded gap', () => {
  // 4.99996 % would display as 5.0000 once rounded to four decimals but is below the legal threshold.
  const rows = team('A', 6, 6, { womenPay: 100 * (1 - 0.0499996) });
  const result = group(rows, 'A');
  assert.equal(result.review_gap_hourly, 5);
  assert.equal(result.review_required, false);
});

test('a gap in favour of women counts as well', () => {
  const result = group(team('A', 6, 6, { womenPay: 112 }), 'A');
  assert.ok(result.review_gap_hourly < -5);
  assert.equal(result.review_required, true);
});

test('small protected categories still raise the alarm while their published gap stays hidden', () => {
  const result = group(team('Small', 3, 3, { womenPay: 80 }), 'Small');
  assert.equal(result.suppressed, true);
  assert.equal(result.mean_gap, null, 'published value stays protected');
  assert.equal(result.review_gap_hourly, 20);
  assert.equal(result.review_required, true);
});

test('a category with only one sex cannot be compared and raises no alarm', () => {
  const result = group(team('Men only', 8, 0), 'Men only');
  assert.equal(result.comparable, false);
  assert.equal(result.review_gap_hourly, null);
  assert.equal(result.review_required, false);
});

test('equal hourly pay but different annual pay (part time) is caught on the annual basis', () => {
  const result = group(team('PT', 6, 6, { womenHours: 1000 }), 'PT');
  assert.equal(result.review_gap_hourly, 0);
  assert.equal(result.review_gap_annual, 50);
  assert.equal(result.review_required, true);
});

test('the alarm is per category and counted for the whole report', () => {
  const analysis = analyze([...team('Fair', 6, 6), ...team('Gap', 6, 6, { womenPay: 85 }), ...team('Tiny', 2, 2, { womenPay: 70 })]);
  assert.deepEqual(analysis.groups.map(g => [g.category, g.review_required]), [['Fair', false], ['Gap', true], ['Tiny', true]]);
  assert.equal(analysis.review_count, 2);
});

test('only the employer\'s internal view carries the Art. 10 assessment values', () => {
  const analysis = analyze(team('Small', 3, 3, { womenPay: 80 }));
  const groupOf = audience => article9(analysis, { country: 'DE', audience }).find(i => i.letter === 'g').values[0];
  assert.equal(groupOf('internal').review_required, true);
  assert.equal(groupOf('internal').review_gap_hourly, 20);
  for (const audience of ['authority', 'workers']) {
    assert.equal(groupOf(audience).review_gap_hourly, undefined, audience);
    assert.equal(groupOf(audience).review_required, undefined, audience);
    assert.equal(groupOf(audience).mean_gap_hourly, null, 'small group stays protected for ' + audience);
  }
});

test('a protected category with an alarm must be explained before the report can be approved', () => {
  const analysis = analyze(team('Small', 3, 3, { womenPay: 80 }));
  const snapshot = { id: 's1', rows: [] };
  const categories = { Small: { skills: 'x', effort: 'x', responsibility: 'x', conditions: 'x' } };
  const base = { snapshotId: 's1', profile: { legalName: 'Acme', headcount: 200, payrollComplete: true }, criteriaAgreement: { status: 'agreed' }, classification: categories, approval: { manager: 'CEO', representatives: 'Works council', confirmed: true, consulted: true } };
  const open = readiness({ ...base, reviews: { Small: {} } }, analysis, snapshot);
  assert.equal(open.checks.find(c => c.id === 'reviews').done, false);
  const explained = readiness({ ...base, reviews: { Small: { explanation: 'Seniority differs', justified: true } } }, analysis, snapshot);
  assert.equal(explained.checks.find(c => c.id === 'reviews').done, true);
});

test('six month remediation window runs from the actual submission date', () => {
  const analysis = analyze(team('Gap', 6, 6, { womenPay: 85 }));
  const snapshot = { id: 's1', reporting_year: 2026, rows: [] };
  const workflow = reportingDate => ({ snapshotId: 's1', reportingDate, profile: { headcount: 200 }, classification: {}, reviews: { Gap: {} } });
  const past = readiness(workflow('2020-01-31'), analysis, snapshot).assessments[0];
  assert.equal(past.deadline, '2020-07-31');
  assert.equal(past.jointAssessmentRequired, true, 'deadline passed, not justified and not remedied');
  const future = readiness(workflow('2999-01-31'), analysis, snapshot).assessments[0];
  assert.equal(future.deadline, '2999-07-31');
  assert.equal(future.jointAssessmentRequired, false, 'still inside the six months');
  const remedied = readiness({ ...workflow('2020-01-31'), reviews: { Gap: { remedied: true, proof: completedRemediation('s1') } } }, analysis, snapshot).assessments[0];
  assert.equal(remedied.jointAssessmentRequired, false);
  const justified = readiness({ ...workflow('2020-01-31'), reviews: { Gap: { justified: true } } }, analysis, snapshot).assessments[0];
  assert.equal(justified.jointAssessmentRequired, false);
});
