export const factors = ['skills', 'effort', 'responsibility', 'conditions'];
// Fixed-depth application documents only; used to preserve the internal annex in tabular exports.
export function evidenceEntries(value, path = '') {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [[path, String(value)]];
  return Object.entries(value).flatMap(([key, child]) => evidenceEntries(child, path ? `${path}.${key}` : key));
}
const clean = (value, max = 3000) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value) ? value.trim() : '';
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : '';

export function validateEvaluation(input, rows = []) {
  const mode = ['documented', 'scored'].includes(input?.mode) ? input.mode : '';
  const numeric = (value, max) => value === '' || value === null || value === undefined ? null : ['string','number'].includes(typeof value) && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= max ? Number(value) : null;
  const weights = Object.fromEntries(factors.map(key => [key, numeric(input?.weights?.[key], 100)]));
  const categories = Object.fromEntries([...new Set(rows.map(r => r.worker_category))].map(category => {
    const entry = input?.categories?.[category];
    const roles = [...new Set(rows.filter(r => r.worker_category === category).map(r => r.job_title))].map(title => {
      const role = Array.isArray(entry?.roles) ? entry.roles.find(r => r?.title === title) : null;
      const scores = Object.fromEntries(factors.map(key => [key, numeric(role?.scores?.[key], 5)]));
      return { title, scores, evidence: clean(role?.evidence), weightedScore: mode === 'scored' && factors.every(key => scores[key] && weights[key]) && Math.abs(Object.values(weights).reduce((sum, v) => sum + v, 0) - 100) < 0.0001 ? Number(factors.reduce((sum, key) => sum + scores[key] * weights[key] / 100, 0).toFixed(4)) : null };
    });
    return [category, { rationale: clean(entry?.rationale), evidence: clean(entry?.evidence), roles }];
  }));
  return { mode, methodology: clean(input?.methodology), reference: clean(input?.reference, 1000), assessedBy: clean(input?.assessedBy, 255), assessedOn: date(input?.assessedOn), genderNeutralConfirmed: input?.genderNeutralConfirmed === true, weights, categories };
}

export function evaluationCompleteness(evaluation, rows = []) {
  const missing = [];
  if (!evaluation || !['documented', 'scored'].includes(evaluation.mode)) return { ready: false, missing: ['methodology'] };
  for (const key of ['methodology', 'reference', 'assessedBy', 'assessedOn', 'genderNeutralConfirmed']) if (!evaluation[key]) missing.push(key);
  if (evaluation.assessedOn > new Date().toISOString().slice(0, 10)) missing.push('assessedOn');
  if (evaluation.mode === 'scored' && (factors.some(key => !(evaluation.weights?.[key] > 0 && evaluation.weights[key] <= 100)) || Math.abs(factors.reduce((sum, key) => sum + (evaluation.weights?.[key] || 0), 0) - 100) > 0.0001)) missing.push('weights');
  for (const category of new Set(rows.map(r => r.worker_category))) {
    const entry = evaluation.categories?.[category];
    if (!entry?.rationale || !entry?.evidence) missing.push(category);
    for (const title of new Set(rows.filter(r => r.worker_category === category).map(r => r.job_title))) {
      const role = entry?.roles?.find(r => r.title === title);
      if (evaluation.mode === 'scored' && (!role?.evidence || factors.some(key => !(role.scores?.[key] >= 1 && role.scores[key] <= 5)))) missing.push(`${category}: ${title}`);
    }
  }
  return { ready: missing.length === 0, missing };
}

export function remediationProof(input) {
  return { completedOn: date(input?.completedOn), evidence: clean(input?.evidence), verifiedBy: clean(input?.verifiedBy, 255), verifiedOn: date(input?.verifiedOn), verification: clean(input?.verification), targetSnapshotId: clean(input?.targetSnapshotId, 100), baselineSnapshotId: clean(input?.baselineSnapshotId, 100) };
}
export function remediationComplete(proof, snapshotId) {
  const today = new Date().toISOString().slice(0, 10);
  return !!proof?.completedOn && !!proof.evidence && !!proof.verifiedBy && !!proof.verifiedOn && proof.completedOn <= proof.verifiedOn && proof.verifiedOn <= today && !!proof.verification && proof.targetSnapshotId === snapshotId;
}

const labels = {
  de: { heading: 'Bewertung gleicher und gleichwertiger Arbeit', method: 'Methodik', source: 'Beleg / Referenz', person: 'Bewertet durch', date: 'Datum', category: 'Kategorie', rationale: 'Zuordnung und Begründung', role: 'Tätigkeit', score: 'Arbeitswert (1–5)', evidence: 'Belege', skills: 'Fähigkeiten', effort: 'Belastung', responsibility: 'Verantwortung', conditions: 'Arbeitsbedingungen', disclaimer: 'Punkteskala und Gewichtung sind eine betriebliche Arbeitshilfe, keine gesetzlich vorgeschriebene Skala. Gleiche Punktwerte allein bestätigen keine rechtliche Gleichwertigkeit. Zuordnung und geschlechtsneutrale Anwendung wurden vom Arbeitgeber geprüft.' },
  sl: { heading: 'Vrednotenje enakega in enakovrednega dela', method: 'Metodologija', source: 'Dokazilo / referenca', person: 'Ocenil', date: 'Datum', category: 'Kategorija', rationale: 'Razvrstitev in utemeljitev', role: 'Delovno mesto', score: 'Vrednost dela (1–5)', evidence: 'Dokazila', skills: 'Spretnosti', effort: 'Napor', responsibility: 'Odgovornost', conditions: 'Delovne razmere', disclaimer: 'Uteži in lestvica so pripomoček podjetja, ne zakonsko predpisana lestvica. Enako število točk samo ne potrjuje pravne enakovrednosti. Delodajalec preveri razvrstitev in spolno nevtralno uporabo.' },
};
export function evaluationSections(evaluation, language) {
  if (!evaluation?.mode) return [];
  const t = labels[language];
  return [{ id: 'job-evaluation', title: `${t.heading} · Art. 4, 10(4)`, items: [[t.method, evaluation.methodology], [t.source, evaluation.reference], [t.person, evaluation.assessedBy], [t.date, evaluation.assessedOn]], paragraphs: [t.disclaimer] },
    ...(evaluation.mode === 'scored' ? [{ id: 'job-weights', title: t.method, items: factors.map(key => [t[key], `${evaluation.weights[key] ?? '—'} %`]) }] : []),
    ...Object.entries(evaluation.categories).flatMap(([category, entry]) => [{ id: `evaluation-${category}`, title: `${t.category}: ${category}`, items: [[t.rationale, entry.rationale], [t.evidence, entry.evidence]], ...(evaluation.mode === 'scored' ? { table: { head: [t.role, ...factors.map(key => t[key]), t.score], rows: entry.roles.map(role => [role.title, ...factors.map(key => String(role.scores[key] ?? '—')), String(role.weightedScore ?? '—')]), widths: [0.3, 0.13, 0.13, 0.13, 0.13, 0.18] } } : {}) },
      ...(evaluation.mode === 'scored' ? [{ id: `evaluation-evidence-${category}`, title: t.evidence, items: entry.roles.map(role => [role.title, role.evidence]) }] : [])])];
}
