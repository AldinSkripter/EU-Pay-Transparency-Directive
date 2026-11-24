// Article 10(2)(e): eligible people are unique returners whose category had an improvement
// while they were on maternity/paternity, parental or carers' leave. Never infer this from pay alone.
const clean = value => typeof value === 'string' && value.length <= 3000 ? value.trim() : '';
export function validateLeaveOutcome(input, limits) {
  const applicable = typeof input?.applicable === 'boolean' ? input.applicable : null;
  const result = { applicable, note: clean(input?.note) };
  for (const sex of ['men', 'women']) {
    const entry = input?.[sex];
    const count = value => {
      if (value === '' || value === null || value === undefined) return null;
      if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > limits[sex]) throw new Error('INVALID_ASSESSMENT_INPUT');
      return Number(value);
    };
    const eligible = applicable === true ? count(entry?.eligible) : null;
    const benefited = applicable === true ? count(entry?.benefited) : null;
    if (eligible !== null && benefited !== null && benefited > eligible) throw new Error('INVALID_ASSESSMENT_INPUT');
    result[sex] = { eligible, benefited };
  }
  return result;
}

export function leaveOutcomeComplete(outcome) {
  if (outcome?.applicable === false) return !!outcome.note?.trim();
  return outcome?.applicable === true && ['men', 'women'].every(sex => Number.isSafeInteger(outcome[sex]?.eligible) && outcome[sex].eligible >= 0 && Number.isSafeInteger(outcome[sex]?.benefited) && outcome[sex].benefited >= 0 && outcome[sex].benefited <= outcome[sex].eligible);
}

export function assessmentCompleteness(workflow, snapshot) {
  const missing = [];
  if (!snapshot || !Array.isArray(snapshot.rows) || !snapshot.rows.length || workflow?.snapshotId !== snapshot.id) return { ready: false, missing: [{ article: '10', field: 'snapshot' }] };
  if (!workflow.assessment?.previousMeasures?.trim()) missing.push({ article: '10(2)(g)', field: 'previousMeasures' });
  if (!workflow.assessment?.jointReviewConfirmed) missing.push({ article: '10(1),10(2)(d)', field: 'jointReview' });
  for (const category of new Set(snapshot.rows.map(r => r.worker_category))) {
    const rows = snapshot.rows.filter(r => r.worker_category === category), review = workflow.reviews?.[category];
    const men = rows.filter(r => r.gender === 'M'), women = rows.filter(r => r.gender === 'F');
    const mean = (list, field) => list.reduce((total, r) => total + r[field], 0) / list.length;
    const differs = men.length && women.length && ['base_annual', 'bonuses_annual', 'base_hourly', 'variable_hourly'].some(field => Math.abs(mean(men, field) - mean(women, field)) > 1e-8);
    if (differs && !review?.explanation?.trim()) missing.push({ article: '10(2)(d)', field: 'reasons', category });
    if (differs && !review?.justified && (!review?.action?.trim() || !review?.owner?.trim() || !review?.due)) missing.push({ article: '10(2)(f)', field: 'measures', category });
    if (!leaveOutcomeComplete(workflow.assessment?.leaveOutcomes?.[category])) missing.push({ article: '10(2)(e)', field: 'leaveOutcomes', category });
  }
  return { ready: missing.length === 0, missing };
}
