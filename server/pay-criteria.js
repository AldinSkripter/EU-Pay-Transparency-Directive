import { reportLanguage, reportLocale, countryNames } from './report-i18n.js';
import { renderDocument } from './worker-rights.js';

// Directive (EU) 2023/970 Art. 5: applicants receive the initial pay or its range (and the collective agreement,
// where one applies) before the interview, are not asked about their pay history, and job titles and notices are
// gender neutral. Art. 6: the criteria for pay, pay levels and pay progression are easily accessible to workers.
export const PAY_CRITERIA = 'pay_criteria';
const KEYS = ['skills', 'effort', 'responsibility', 'conditions'];
const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1))] : null;
const clean = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value) ? value.trim() : null;

// Suggestion only: the employer decides the range on objective, gender-neutral criteria.
export function suggestRanges(rows) {
  const byCategory = new Map();
  for (const row of rows) byCategory.set(row.worker_category, [...(byCategory.get(row.worker_category) || []), row]);
  return Object.fromEntries([...byCategory].sort(([a], [b]) => a.localeCompare(b)).map(([category, list]) => {
    const sorted = list.map(r => r.base_annual).sort((a, b) => a - b), by = gender => list.filter(r => r.gender === gender).map(r => r.base_annual).sort((a, b) => a - b);
    const men = percentile(by('M'), 50), women = percentile(by('F'), 50);
    return [category, { count: list.length, min: sorted[0], max: sorted.at(-1), p10: percentile(sorted, 10), median: percentile(sorted, 50), p90: percentile(sorted, 90), medianGapPercent: men && women ? Number(((men - women) / men * 100).toFixed(2)) : null }];
  }));
}

export function validateCriteria(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !input.ranges || typeof input.ranges !== 'object' || Array.isArray(input.ranges)) throw new Error('INVALID_CRITERIA');
  const entries = Object.entries(input.ranges);
  if (entries.length > 200) throw new Error('INVALID_CRITERIA');
  const ranges = {};
  for (const [category, range] of entries) {
    const name = clean(category, 255);
    if (!name || ['__proto__', 'constructor', 'prototype'].includes(name) || !range || typeof range !== 'object') throw new Error('INVALID_CRITERIA');
    const min = Number(range.min), max = Number(range.max), agreement = range.agreement === undefined || range.agreement === '' ? '' : clean(range.agreement, 255);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min || max > 10_000_000 || agreement === null) throw new Error('INVALID_CRITERIA');
    ranges[name] = { min: Math.round(min), max: Math.round(max), agreement };
  }
  const progression = input.progression === undefined || input.progression === '' ? '' : clean(input.progression, 3000);
  if (progression === null) throw new Error('INVALID_CRITERIA');
  return { ranges, progression };
}

const text = {
  de: {
    criteriaTitle: 'Kriterien für Entgelt, Entgeltniveaus und Entgeltentwicklung', criteriaSubtitle: 'Richtlinie (EU) 2023/970 · Artikel 6',
    criteriaIntro: 'Diese Kriterien sind objektiv und geschlechtsneutral. Sie gelten für alle Beschäftigten und sind für alle leicht zugänglich.',
    criteria: { skills: 'Fähigkeiten', effort: 'Belastung', responsibility: 'Verantwortung', conditions: 'Arbeitsbedingungen' },
    range: 'Entgeltband (brutto pro Jahr)', agreement: 'Anzuwendender Kollektivvertrag', progression: 'Entgeltentwicklung', notSet: 'Noch nicht festgelegt.',
    vacancyTitle: 'Gehaltsangabe für Stellenanzeigen', vacancySubtitle: 'Richtlinie (EU) 2023/970 · Artikel 5',
    entry: 'Einstiegsentgelt', per: 'brutto pro Jahr', applies: 'Es gilt der Kollektivvertrag',
    vacancyChecklistTitle: 'Vor der Veröffentlichung prüfen', vacancyChecklist: ['Das Entgelt oder Entgeltband steht in der Anzeige oder wird vor dem Vorstellungsgespräch mitgeteilt (Art. 5 Abs. 1).', 'Stellenbezeichnung und Anzeige sind geschlechtsneutral, z. B. „(m/w/d)“ (Art. 5 Abs. 3).', 'Im Gespräch wird nicht nach dem bisherigen Entgelt gefragt (Art. 5 Abs. 2).', 'Das Entgeltband beruht auf objektiven, geschlechtsneutralen Kriterien.'],
    company: 'Unternehmen', country: 'Land', draft: 'Entwurf zur Prüfung durch den Arbeitgeber.',
  },
  sl: {
    criteriaTitle: 'Merila za plače, ravni plač in napredovanje', criteriaSubtitle: 'Direktiva (EU) 2023/970 · člen 6',
    criteriaIntro: 'Ta merila so objektivna in spolno nevtralna. Veljajo za vse zaposlene in so vsem lahko dostopna.',
    criteria: { skills: 'Spretnosti', effort: 'Napor', responsibility: 'Odgovornost', conditions: 'Delovne razmere' },
    range: 'Plačilni razpon (bruto na leto)', agreement: 'Veljavna kolektivna pogodba', progression: 'Napredovanje v plači', notSet: 'Še ni določeno.',
    vacancyTitle: 'Podatek o plači za oglase za delovna mesta', vacancySubtitle: 'Direktiva (EU) 2023/970 · člen 5',
    entry: 'Izhodiščna plača', per: 'bruto na leto', applies: 'Velja kolektivna pogodba',
    vacancyChecklistTitle: 'Pred objavo preverite', vacancyChecklist: ['Plača ali plačilni razpon je naveden v oglasu ali sporočen pred razgovorom (člen 5(1)).', 'Naziv delovnega mesta in oglas sta spolno nevtralna, npr. „(m/ž)“ (člen 5(3)).', 'Na razgovoru se ne sprašuje o dosedanji plači (člen 5(2)).', 'Plačilni razpon temelji na objektivnih, spolno nevtralnih merilih.'],
    company: 'Podjetje', country: 'Država', draft: 'Osnutek za pregled delodajalca.',
  },
};

export function criteriaDocument(company, criteria, classification = {}) {
  const language = reportLanguage(company.country), t = text[language], locale = reportLocale(language);
  const money = n => n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const categories = [...new Set([...Object.keys(criteria.ranges), ...Object.keys(classification)])].sort((a, b) => a.localeCompare(b));
  return { language, title: t.criteriaTitle, subtitle: t.criteriaSubtitle, status: t.draft, coverLine: `${company.name} · ${countryNames[language][company.country]}`, recipientLine: '', keyFigures: [],
    sections: [{ id: 'intro', title: null, paragraphs: [t.criteriaIntro] },
      ...categories.map(category => { const range = criteria.ranges[category], c = classification[category] || {}; return { id: category, title: category, items: [...KEYS.filter(k => c[k]).map(k => [t.criteria[k], c[k]]), [t.range, range ? `${money(range.min)} – ${money(range.max)}` : t.notSet], ...(range?.agreement ? [[t.agreement, range.agreement]] : [])] }; }),
      { id: 'progression', title: t.progression, paragraphs: [criteria.progression || t.notSet] }] };
}
export function vacancyDocument(company, criteria, categories) {
  const language = reportLanguage(company.country), t = text[language], locale = reportLocale(language);
  const money = n => n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const chosen = (categories?.length ? categories : Object.keys(criteria.ranges)).filter(c => criteria.ranges[c]);
  return { language, title: t.vacancyTitle, subtitle: t.vacancySubtitle, status: t.draft, coverLine: `${company.name} · ${countryNames[language][company.country]}`, recipientLine: '', keyFigures: [],
    sections: [...chosen.map(category => { const r = criteria.ranges[category]; return { id: category, title: category, paragraphs: [`${t.entry}: ${money(r.min)} – ${money(r.max)} ${t.per}.${r.agreement ? ` ${t.applies}: ${r.agreement}.` : ''}`] }; }),
      { id: 'check', title: t.vacancyChecklistTitle, paragraphs: t.vacancyChecklist.map((line, i) => `${i + 1}. ${line}`) }] };
}

export function payCriteriaRoutes(app, { store, yearValue }) {
  const wrap = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { if (/^[A-Z_]+$/.test(error.message)) res.status(error.message === 'NO_CRITERIA' ? 404 : 400).json({ error: error.message }); else next(error); } };
  const empty = { ranges: {}, progression: '' };
  app.get('/api/pay-criteria', wrap(async (req, res) => {
    const year = yearValue(req.query.year), company = req.session.company, snapshot = await store.latestSnapshot(company.id, year);
    res.json({ year, document: await store.companyDocument(company.id, PAY_CRITERIA) || empty, suggestions: snapshot ? suggestRanges(snapshot.rows) : {} });
  }));
  app.post('/api/pay-criteria', wrap(async (req, res) => {
    const document = validateCriteria(req.body);
    await store.saveCompanyDocument(req.session.company.id, PAY_CRITERIA, document);
    await store.audit(req.session.company.id, 'pay_criteria_saved', { categories: Object.keys(document.ranges).length, user_id: req.session.user.id });
    res.json({ document });
  }));
  app.post('/api/pay-criteria/document', wrap(async (req, res) => {
    const company = req.session.company, kind = req.body.kind, format = req.body.format || 'txt', year = yearValue(req.body.year);
    if (!['criteria', 'vacancy'].includes(kind) || !['txt', 'pdf'].includes(format)) throw new Error('INVALID_CRITERIA');
    const criteria = await store.companyDocument(company.id, PAY_CRITERIA);
    if (!criteria || !Object.keys(criteria.ranges).length) throw new Error('NO_CRITERIA');
    const workflow = await store.getWorkflow(company.id, year);
    const doc = kind === 'criteria' ? criteriaDocument(company, criteria, workflow.classification || {}) : vacancyDocument(company, criteria, Array.isArray(req.body.categories) ? req.body.categories.filter(c => typeof c === 'string') : []);
    const output = await renderDocument(doc, format, company, doc.title);
    res.setHeader('Content-Disposition', `attachment; filename="equitensa-${kind === 'criteria' ? 'pay-criteria' : 'vacancy-pay'}.${format}"`);
    res.type(format === 'pdf' ? 'application/pdf' : 'text/plain').send(output);
  }));
}
