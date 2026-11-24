import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmployee, analyze, calculateFteHourlyRate, reportingSchedule } from '../server/pay.js';
const secret = 'a'.repeat(64);
const row = overrides => ({ internal_id: '1', gender: 'M', job_title: 'Engineer', worker_category: 'Engineering L3', base_annual: 60000, bonuses_annual: 0, paid_hours_annual: 2080, hours_per_week: 40, ...overrides });
test('annual payroll preserves 14 payments and fractional contract hours', () => {
  const employee = normalizeEmployee(row({ base_annual: 42000, paid_hours_annual: 2002, hours_per_week: 38.5 }), 'a', secret);
  assert.equal(employee.total_hourly, 42000 / 2002);
  assert.equal(employee.base_annual, 42000);
  assert.equal(employee.hours_per_week, 38.5);
  assert.notEqual(employee.total_hourly, calculateFteHourlyRate(3000, 0, 38.5));
});
test('invalid numeric values fail instead of becoming zero or infinity', () => {
  for (const value of [' ', '\t', [], [100], {}, true, false]) {
    assert.throws(() => normalizeEmployee(row({ base_annual: value }), 'a', secret), /INVALID_BASE_ANNUAL/);
    assert.throws(() => normalizeEmployee(row({ bonuses_annual: value }), 'a', secret), /INVALID_BONUSES_ANNUAL/);
  }
  for (const value of [0,-1,'',null,undefined,Infinity,NaN,true]) assert.throws(() => normalizeEmployee(row({ paid_hours_annual: value }), 'a', secret));
  assert.throws(() => normalizeEmployee(row({ gender: 'unknown' }), 'a', secret));
  assert.throws(() => calculateFteHourlyRate(1000, 0, 0));
});
test('pseudonyms are stable within a tenant and different between tenants', () => {
  const a = normalizeEmployee(row(), 'a', secret), b = normalizeEmployee(row(), 'b', secret);
  assert.equal(a.anonymized_id.length, 64);
  assert.equal(a.anonymized_id, normalizeEmployee(row(), 'a', secret).anonymized_id);
  assert.notEqual(a.anonymized_id, b.anonymized_id);
  assert.equal(a.internal_id, undefined);
});
test('all statutory indicators include zero bonus recipients and the exact 5% boundary', () => {
  const rows = Array.from({ length: 40 }, (_, i) => normalizeEmployee(row({ internal_id: String(i), gender: i < 20 ? 'M' : 'F', base_annual: i < 20 ? 100 : 95, paid_hours_annual: 1 }), 'a', secret));
  const result = analyze(rows);
  assert.equal(result.mean_gap, 5); assert.equal(result.median_gap, 5);
  assert.equal(result.annual_mean_gap, 5); assert.equal(result.annual_median_gap, 5);
  assert.equal(result.annual_base_gap, 5); assert.equal(result.annual_variable_gap, null);
  assert.equal(result.review_count, 1); assert.equal(result.variable_gap, null);
  assert.equal(result.male_variable_receivers, 0); assert.equal(result.female_variable_receivers, 0);
  assert.equal(result.quartiles.reduce((n, q) => n + q.count, 0), 40);
  assert.deepEqual(analyze([...rows].reverse()).quartiles, result.quartiles);
});
test('small subgroups are suppressed and other gender records stay in headcount', () => {
  const rows = [normalizeEmployee(row(), 'a', secret),normalizeEmployee(row({ internal_id:'2',gender:'F' }), 'a',secret),normalizeEmployee(row({ internal_id:'3',gender:'O' }), 'a',secret)];
  const result = analyze(rows);
  assert.equal(result.count, 3); assert.equal(result.other_count, 1);
  assert.equal(result.mean_gap, null); assert.equal(result.review_count, 0);
  assert.equal(result.groups[0].suppressed, true);
  assert.equal(result.quartiles.reduce((n,q) => n+q.count,0),3);
});
test('reporting schedule changes at the EU headcount thresholds', () => {
  assert.equal(reportingSchedule(99).first_due,null);
  assert.equal(reportingSchedule(100).first_due,'2031-06-07');
  assert.equal(reportingSchedule(149).reference_year,2030);
  assert.equal(reportingSchedule(150).frequency_years,3);
  assert.equal(reportingSchedule(249).first_due,'2027-06-07');
  assert.equal(reportingSchedule(250).frequency_years,1);
});
