import { analyze, REVIEW_THRESHOLD_PERCENT } from './pay.js';
import { article9, article9Rows } from './article9.js';
import { readiness } from './workflow.js';
import { regulatory } from './regulatory.js';
import { reportLanguage, reportLocale, texts, countryNames } from './report-i18n.js';

// Art. 12(3): small groups are only protected for workers and the public. The monitoring body (Art. 29) and the
// employer's own view receive the information without restriction.
export const suppressFor = audience => ['workers', 'public'].includes(audience);
export const audienceOf = snapshot => snapshot.audience || 'internal';
export const analysisFor = snapshot => analyze(snapshot.rows, { suppress: suppressFor(audienceOf(snapshot)) });
const hasGroups = audience => ['internal', 'workers', 'authority'].includes(audience);
const knowsNames = audience => ['internal', 'authority'].includes(audience);

export const percentFormatter = language => value => value === null || value === undefined || Number.isNaN(value) ? '—'
  : `${Number(value).toLocaleString(reportLocale(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const criteriaLabels = {
  de: { skills: 'Fähigkeiten', effort: 'Belastung', responsibility: 'Verantwortung', conditions: 'Arbeitsbedingungen' },
  sl: { skills: 'Spretnosti', effort: 'Napor', responsibility: 'Odgovornost', conditions: 'Delovne razmere' },
};
const metricLabels = {
  de: { hourly: 'Pro Stunde', annual: 'Jährlich', male_percent: 'Männer', female_percent: 'Frauen' },
  sl: { hourly: 'Na uro', annual: 'Letno', male_percent: 'Moški', female_percent: 'Ženske' },
};

export function workforce(rows) {
  const count = gender => rows.filter(r => r.gender === gender).length;
  return { total: rows.length, men: count('M'), women: count('F'), other: count('O') };
}

// Art. 9(6): accuracy confirmed by management after consulting workers' representatives.
export function confirmationOf(snapshot) {
  const w = snapshot.workflow?.snapshotId ? snapshot.workflow : {}, a = w.approval || {}, audience = audienceOf(snapshot);
  return {
    confirmed: !!a.confirmed, consulted: !!a.consulted, reportingDate: w.reportingDate || null,
    ...(knowsNames(audience) ? { manager: a.manager || null } : {}),
    ...(audience === 'internal' ? { representatives: a.representatives || null } : {}),
  };
}

// Art. 10(1)(a): categories whose average pay level differs by 5 % or more.
export function article10Of(analysis, workflow = {}) {
  return {
    thresholdPercent: REVIEW_THRESHOLD_PERCENT,
    categories: analysis.groups.map(g => {
      const review = workflow.reviews?.[g.category] || {};
      return { category: g.category, comparable: g.comparable, gapHourly: g.review_gap_hourly, gapAnnual: g.review_gap_annual, atOrAboveThreshold: g.review_required, justified: !!review.justified, remedied: !!review.remedied };
    }),
  };
}

// Previous years, newest first (Art. 9(9): the previous four years on request; Art. 29(3)(c): four years published).
export function historyOf(company, snapshot) {
  const audience = audienceOf(snapshot);
  if (audience === 'public') return [];
  return (snapshot.history || []).filter(h => h.rows?.length).map(h => ({
    year: h.year,
    workforce: workforce(h.rows),
    indicators: article9(analyze(h.rows, { suppress: suppressFor(audience) }), { country: company.country, audience }),
  }));
}

export const statusOf = snapshot => snapshot.prepared ? 'PREPARED_INTERNAL_UNVERIFIED' : 'DRAFT_UNVERIFIED';
const statusText = (t, snapshot) => snapshot.prepared ? t.statusPrepared : t.statusDraft;

// ---- Document model for text and PDF -------------------------------------------------------------------------
// section: { title, paragraphs?, items?: [[label, value]], table?: { head, rows, widths? } }
export function buildDocument(company, snapshot) {
  const language = reportLanguage(company.country), t = texts[language], audience = audienceOf(snapshot);
  const analysis = analysisFor(snapshot), pct = percentFormatter(language), items = article9(analysis, { country: company.country, audience });
  const by = Object.fromEntries(items.map(i => [i.letter, i]));
  const people = workforce(snapshot.rows), confirmation = confirmationOf(snapshot), yesNo = value => value ? t.yes : t.no;
  const sections = [];

  sections.push({ id: 'meta', title: null, items: [
    [t.company, company.name], [t.country, countryNames[language][company.country]], [t.year, String(snapshot.reporting_year)],
    [t.period, t.periodValue(snapshot.reporting_year)], [t.recipient, t.recipients[audience]], [t.rules, regulatory.version], [t.snapshot, snapshot.id],
  ] });
  sections.push({ id: 'workforce', title: t.workforce, items: [[t.workers, String(people.total)], [t.men, String(people.men)], [t.women, String(people.women)], [t.other, String(people.other)]] });

  const pair = item => [pct(item.values.hourly), pct(item.values.annual)];
  sections.push({ id: 'indicators', title: t.indicators, table: {
    head: ['', `${t.hourly}`, `${t.annual}`],
    rows: ['a', 'b', 'c', 'd'].map(letter => [`(${letter}) ${by[letter].title}`, ...pair(by[letter])]),
    widths: [0.6, 0.2, 0.2],
  } });
  sections.push({ id: 'recipients', title: null, table: {
    head: ['', t.menShort, t.womenShort],
    rows: [[`(e) ${by.e.title}`, pct(by.e.values.male_percent), pct(by.e.values.female_percent)]],
    widths: [0.6, 0.2, 0.2],
  } });
  sections.push({ id: 'quartiles', title: `(f) ${by.f.title}`, table: {
    head: [t.quartile, t.menShort, t.womenShort, t.count],
    rows: by.f.values.map(q => [`Q${q.quartile}`, q.suppressed ? `— (${t.protectedValue})` : pct(q.male_percent), q.suppressed ? `— (${t.protectedValue})` : pct(q.female_percent), String(q.count)]),
    widths: [0.25, 0.25, 0.25, 0.25],
  } });
  if (by.g) {
    const internal = audience === 'internal';
    sections.push({ id: 'categories', title: `(g) ${by.g.title}`, table: {
      head: [t.category, `${t.menShort} / ${t.womenShort}`, `${t.total} (${t.hourly})`, `${t.base} (${t.hourly})`, `${t.variable} (${t.hourly})`, ...(internal ? ['≥ 5 %'] : [])],
      rows: by.g.values.map(g => {
        const mark = g.suppressed ? ` (${t.protectedValue})` : '';
        return [g.category, `${g.male_count} / ${g.female_count}`, g.suppressed ? `—${mark}` : pct(g.mean_gap_hourly), g.suppressed ? '—' : pct(g.base_gap_hourly), g.suppressed ? '—' : pct(g.variable_gap_hourly), ...(internal ? [g.review_required ? t.yes : g.comparable ? t.no : '—'] : [])];
      }),
      widths: internal ? [0.28, 0.14, 0.18, 0.16, 0.16, 0.08] : [0.32, 0.14, 0.18, 0.18, 0.18],
    } });
  }

  sections.push({ id: 'confirmation', title: t.confirmation, paragraphs: [t.confirmationText], items: [
    [t.confirmedBy, confirmation.confirmed ? t.yes : t.notConfirmed],
    ...(confirmation.manager !== undefined ? [[t.owner, confirmation.manager || '—']] : []),
    [t.consultation, yesNo(confirmation.consulted)],
    ...(confirmation.representatives !== undefined ? [[t.consultation + ' · ' + t.reasons, confirmation.representatives || '—']] : []),
    [t.reportingDate, confirmation.reportingDate || '—'],
  ] });

  if (audience === 'internal') {
    const ten = article10Of(analysis, snapshot.workflow), flagged = ten.categories.filter(c => c.atOrAboveThreshold);
    const view = readiness(snapshot.workflow, analysis, snapshot);
    sections.push({ id: 'article10', title: t.assessment, paragraphs: [t.assessmentIntro, flagged.length ? '' : t.assessmentNone].filter(Boolean), ...(flagged.length ? { table: {
      head: [t.category, t.gapHourly, t.gapAnnual, t.justified, t.remedied, t.deadline, t.required],
      rows: flagged.map(c => { const a = view.assessments.find(x => x.category === c.category) || {}; return [c.category, pct(c.gapHourly), pct(c.gapAnnual), yesNo(c.justified), yesNo(c.remedied), a.deadline || '—', yesNo(a.jointAssessmentRequired)]; }),
      widths: [0.2, 0.13, 0.13, 0.12, 0.12, 0.16, 0.14],
    } } : {}) });
  }

  const history = historyOf(company, snapshot);
  if (audience !== 'public') sections.push({ id: 'history', title: t.history, paragraphs: [history.length ? history.map(h => `${h.year} (${h.workforce.total}): ${['a', 'c'].map(l => `(${l}) ${pct(h.indicators.find(i => i.letter === l).values.hourly)}`).join(' · ')}`).join('\n') : t.historyNone] });

  const w = snapshot.workflow?.snapshotId ? snapshot.workflow : null;
  if (audience === 'internal' && w) {
    sections.push({ id: 'review', title: t.review, items: [
      [t.legalEntity, w.profile?.legalName || '—'], [t.confirmedHeadcount, String(w.profile?.headcount ?? '—')], [t.payrollComplete, yesNo(w.profile?.payrollComplete)],
      [t.criteriaAgreement, ({ agreed: t.criteriaAgreed, no_representatives: t.criteriaNoRepresentatives, pending: t.criteriaPending })[w.criteriaAgreement?.status] || '—'],
      ...analysis.groups.flatMap(g => [
        ...Object.entries(w.classification?.[g.category] || {}).map(([key, value]) => [`${g.category} · ${criteriaLabels[language][key] || key}`, value || '—']),
        ...Object.entries({ [t.reasons]: w.reviews?.[g.category]?.explanation, [t.action]: w.reviews?.[g.category]?.action, [t.owner]: w.reviews?.[g.category]?.owner, [t.due]: w.reviews?.[g.category]?.due }).filter(([, v]) => v).map(([key, value]) => [`${g.category} · ${key}`, value]),
      ]),
    ] });
  }

  const notes = [...t.methodLines];
  notes.push(audience === 'authority' ? t.protectionAuthority : audience === 'internal' ? t.protectionInternal : t.protectionWorkers);
  if (audience === 'public') notes.push(t.publicLimit);
  notes.push(t.notOfficial, `${t.source}: ${regulatory.source}`);
  sections.push({ id: 'methodology', title: t.methodology, paragraphs: notes });

  return { language, title: t.title, subtitle: t.subtitle, status: statusText(t, snapshot), sections, coverLine: `${company.name} · ${snapshot.reporting_year} · ${countryNames[language][company.country]}`, recipientLine: `${t.recipient}: ${t.recipients[audience]}`, keyFigures: [[`(a) ${t.hourly}`, pct(by.a.values.hourly)], [`(c) ${t.hourly}`, pct(by.c.values.hourly)]] };
}

export { article9Rows };
