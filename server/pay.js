import { createHmac } from 'node:crypto';
import { obligation } from '../shared/plans.js';

function numeric(value, field, { min = 0, max = 1e9 } = {}) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) throw new Error(`INVALID_${field}`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`INVALID_${field}`);
  return n;
}
export function calculateFteHourlyRate(baseSalaryGross, bonusesAnnual, hoursPerWeek) {
  const base = numeric(baseSalaryGross, 'SALARY');
  const bonus = numeric(bonusesAnnual, 'BONUS');
  const hours = numeric(hoursPerWeek, 'HOURS', { min: 0.01, max: 100 });
  return ((base + bonus / 12) / hours * 40) / 173.33;
}
export function normalizeEmployee(row, companyId, secret) {
  if (!secret) throw new Error('PSEUDONYM_SECRET_REQUIRED');
  const id = String(row.internal_id || '').trim();
  const title = String(row.job_title || '').trim();
  const category = String(row.worker_category || '').trim();
  if (!id || id.length > 255 || !title || title.length > 255 || !category || category.length > 255 || /[\u0000-\u001f\u007f]/.test(id + title + category + String(row.job_category_kv || ''))) throw new Error('INVALID_EMPLOYEE_ID_TITLE_CATEGORY');
  const gender = String(row.gender || '').toUpperCase();
  if (!['M', 'F', 'O'].includes(gender)) throw new Error('INVALID_GENDER');
  const base = numeric(row.base_annual, 'BASE_ANNUAL');
  const bonus = numeric(row.bonuses_annual ?? 0, 'BONUSES_ANNUAL');
  const hours = numeric(row.paid_hours_annual, 'PAID_HOURS_ANNUAL', { min: 0.01, max: 8784 });
  const weekly = numeric(row.hours_per_week, 'HOURS_PER_WEEK', { min: 0.01, max: 100 });
  return {
    anonymized_id: createHmac('sha256', secret).update(`${companyId}:${id}`).digest('hex'),
    gender, job_title: title, worker_category: category,
    job_category_kv: String(row.job_category_kv || '').slice(0, 255),
    base_annual: base, bonuses_annual: bonus, paid_hours_annual: hours, hours_per_week: weekly,
    base_hourly: base / hours, variable_hourly: bonus / hours, total_hourly: (base + bonus) / hours,
    // Supplementary comparison only; never substituted for annual payroll amounts.
    fte_hourly_rate: calculateFteHourlyRate(base / 12, bonus, weekly),
  };
}
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const gap = (male, female) => male === null || female === null || male === 0 ? null : (male - female) / male * 100;
const round = n => !Number.isFinite(n) ? null : Number(n.toFixed(4));
// Directive (EU) 2023/970 Art. 10(1)(a): a joint pay assessment is triggered when the pay reporting shows a
// difference in the average pay level between women and men of at least 5 % in any category of workers.
// Pay level = gross annual pay and the corresponding gross hourly pay (Art. 3(1)(a)-(b)), so the alarm looks at
// total pay on both bases, in either direction. It runs on the real data: hiding small groups in a published
// table (suppression) must never hide an alarm, and the unrounded gap is compared with the threshold.
export const REVIEW_THRESHOLD_PERCENT = 5;
function groupMetrics(rows, minimum = 5) {
  const males = rows.filter(r => r.gender === 'M'), females = rows.filter(r => r.gender === 'F');
  const suppressed = males.length < minimum || females.length < minimum;
  const comparable = males.length > 0 && females.length > 0;
  const totalAnnual = r => r.base_annual + r.bonuses_annual;
  const reviewHourly = comparable ? gap(mean(males.map(r => r.total_hourly)), mean(females.map(r => r.total_hourly))) : null;
  const reviewAnnual = comparable ? gap(mean(males.map(totalAnnual)), mean(females.map(totalAnnual))) : null;
  const g = (field, aggregate = mean) => suppressed ? null : round(gap(aggregate(males.map(r => r[field])), aggregate(females.map(r => r[field]))));
  return {
    count: rows.length, male_count: males.length, female_count: females.length, other_count: rows.filter(r => r.gender === 'O').length,
    suppressed, comparable, review_gap_hourly: round(reviewHourly), review_gap_annual: round(reviewAnnual),
    review_required: [reviewHourly, reviewAnnual].some(value => value !== null && Math.abs(value) + 1e-9 >= REVIEW_THRESHOLD_PERCENT),
    // Art. 9(10): explanation/remedy is not limited to the Art. 10 five-percent trigger.
    // Compare components as well: equal totals can conceal offsetting differences.
    explanation_required: comparable && ['base_annual', 'bonuses_annual', 'base_hourly', 'variable_hourly'].some(field => Math.abs(mean(males.map(r => r[field])) - mean(females.map(r => r[field]))) > 1e-8),
    mean_gap: g('total_hourly'), median_gap: g('total_hourly', median),
    base_gap: g('base_hourly'), variable_gap: g('variable_hourly'), median_variable_gap: g('variable_hourly', median),
    annual_mean_gap: suppressed ? null : round(gap(mean(males.map(r => r.base_annual + r.bonuses_annual)), mean(females.map(r => r.base_annual + r.bonuses_annual)))),
    annual_median_gap: suppressed ? null : round(gap(median(males.map(r => r.base_annual + r.bonuses_annual)), median(females.map(r => r.base_annual + r.bonuses_annual)))),
    annual_base_gap: g('base_annual'), annual_variable_gap: g('bonuses_annual'), annual_median_variable_gap: g('bonuses_annual', median),
    male_variable_receivers: suppressed ? null : round(males.filter(r => r.bonuses_annual > 0).length / males.length * 100),
    female_variable_receivers: suppressed ? null : round(females.filter(r => r.bonuses_annual > 0).length / females.length * 100),
  };
}
// Art. 12(3): Member States may restrict workers' access where pay of an identifiable worker would be revealed,
// but for monitoring under Art. 29 the information must be available without restriction. So small groups are
// protected (fewer than `minimum` of either sex) for workers and the public only; the monitoring body and the
// employer's own view get the real values.
export const SMALL_GROUP_MINIMUM = 5;
export function analyze(rows, { suppress = true } = {}) {
  const minimum = suppress ? SMALL_GROUP_MINIMUM : 0;
  const overall = groupMetrics(rows, minimum);
  const groups = [...new Set(rows.map(r => r.worker_category))].sort().map(category => {
    const metrics = groupMetrics(rows.filter(r => r.worker_category === category), minimum);
    return { category, ...metrics };
  });
  // Art. 3(1)(f): rank all workers into four bands. M/F averages compare only M and F,
  // but another registered gender must not disappear from band populations or count as female.
  const bands = pay => {
    const sorted = [...rows].sort((a, b) => pay(a) - pay(b) || a.anonymized_id.localeCompare(b.anonymized_id));
    return Array.from({ length: 4 }, (_, i) => {
      const band = sorted.slice(Math.floor(i * sorted.length / 4), Math.floor((i + 1) * sorted.length / 4));
      const males = band.filter(r => r.gender === 'M').length, females = band.filter(r => r.gender === 'F').length;
      const suppressed = males < minimum || females < minimum;
      return { quartile: i + 1, count: band.length, suppressed, male_percent: suppressed ? null : round(males / band.length * 100), female_percent: suppressed ? null : round(females / band.length * 100) };
    });
  };
  const quartiles = bands(r => r.total_hourly), annual_quartiles = bands(r => r.base_annual + r.bonuses_annual);
  return { ...overall, groups, quartiles, annual_quartiles, review_count: groups.filter(g => g.review_required).length, methodology: 'annual-pay / declared-annual-paid-hours; unadjusted M/F; minimum subgroup 5; separate hourly/annual quartiles; stable quartile ties; version 2' };
}
export function reportingSchedule(count) {
  const duty = obligation(count);
  return { first_due: duty?.firstDue ?? null, frequency_years: duty?.frequencyYears ?? null, reference_year: duty?.referenceYear ?? null };
}
