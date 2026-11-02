import * as XLSX from 'xlsx';
import { analyze, REVIEW_THRESHOLD_PERCENT, SMALL_GROUP_MINIMUM } from './pay.js';
import { regulatory } from './regulatory.js';
import { reportLanguage, reportLocale, texts, countryNames } from './report-i18n.js';
import { audienceOf, statusOf, suppressFor, percentFormatter } from './report-model.js';
import { renderText, renderPdf } from './document-render.js';
import { csvCell, xmlEscape } from './reports.js';

// Joint pay assessment, Directive (EU) 2023/970 Art. 10(2)-(3): the content the directive prescribes, filled from
// the pay data and from what the employer documented with the workers' representatives.
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round = n => n === null ? null : Number(n.toFixed(4));
export const assessmentAudiences = ['internal', 'workers', 'authority'];

export function assessmentData(company, snapshot) {
  const audience = audienceOf(snapshot), protect = suppressFor(audience), rows = snapshot.rows;
  const workflow = snapshot.workflow?.snapshotId ? snapshot.workflow : {};
  const analysis = analyze(rows, { suppress: false });
  const categories = analysis.groups.map(group => {
    const men = rows.filter(r => r.worker_category === group.category && r.gender === 'M'), women = rows.filter(r => r.worker_category === group.category && r.gender === 'F');
    const hide = protect && (men.length < SMALL_GROUP_MINIMUM || women.length < SMALL_GROUP_MINIMUM);
    const average = (list, pick) => hide ? null : round(mean(list.map(pick)));
    const pay = list => ({ annual: average(list, r => r.base_annual + r.bonuses_annual), hourly: average(list, r => r.total_hourly), baseHourly: average(list, r => r.base_hourly), variableAnnual: average(list, r => r.bonuses_annual), variableHourly: average(list, r => r.variable_hourly) });
    const review = workflow.reviews?.[group.category] || {};
    const compared = men.length + women.length;
    return {
      category: group.category,
      proportion: { men: men.length, women: women.length, womenPercent: compared ? round(women.length / compared * 100) : null },
      averagePay: { men: pay(men), women: pay(women) },
      gaps: { hourly: hide ? null : group.review_gap_hourly, annual: hide ? null : group.review_gap_annual },
      comparable: group.comparable, protected: hide, atOrAboveThreshold: group.review_required,
      reasons: review.explanation || null, justified: !!review.justified,
      leaveReturn: workflow.assessment?.leaveReturn?.[group.category] || null,
      measures: { action: review.action || null, owner: review.owner || null, due: review.due || null, remedied: !!review.remedied },
    };
  });
  return {
    schema: 'urn:equitensa:internal:assessment:v1', status: statusOf(snapshot), language: reportLanguage(company.country),
    company: { name: company.name, country: company.country }, reportingYear: snapshot.reporting_year, snapshotId: snapshot.id,
    rulesVersion: regulatory.version, source: regulatory.source, officialSubmission: false, audience, thresholdPercent: REVIEW_THRESHOLD_PERCENT,
    reportingDate: workflow.reportingDate || null, categories, previousMeasures: workflow.assessment?.previousMeasures || null,
    categoriesAtOrAboveThreshold: categories.filter(c => c.atOrAboveThreshold).map(c => c.category),
  };
}
export const assessmentJson = (company, snapshot) => JSON.stringify(assessmentData(company, snapshot), null, 2);

export function assessmentDocument(company, snapshot) {
  const data = assessmentData(company, snapshot), language = data.language, t = texts[language], pct = percentFormatter(language), locale = reportLocale(language);
  const money = n => n === null ? '—' : n.toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  const yesNo = value => value ? t.yes : t.no, missing = t.notCaptured, s = t.assessmentSections, protectedMark = c => c.protected ? ` (${t.protectedValue})` : '';
  const sections = [
    { id: 'meta', title: null, items: [[t.company, company.name], [t.country, countryNames[language][company.country]], [t.year, String(snapshot.reporting_year)], [t.recipient, t.recipients[data.audience]], [t.reportingDate, data.reportingDate || '—'], [t.rules, regulatory.version]] },
    { id: 'intro', title: null, paragraphs: [t.assessmentIntro, data.categoriesAtOrAboveThreshold.length ? `${t.assessment}: ${data.categoriesAtOrAboveThreshold.join(', ')}` : t.assessmentNone] },
    { id: 'a', title: s.a, table: { head: [t.category, t.men, t.women, `${t.women} %`], rows: data.categories.map(c => [c.category, String(c.proportion.men), String(c.proportion.women), pct(c.proportion.womenPercent)]), widths: [0.4, 0.2, 0.2, 0.2] } },
    { id: 'b', title: s.b, table: { head: [t.category, `${t.menShort} · ${t.annual}`, `${t.womenShort} · ${t.annual}`, `${t.menShort} · ${t.hourly}`, `${t.womenShort} · ${t.hourly}`, `${t.menShort} · ${t.variable}`, `${t.womenShort} · ${t.variable}`], rows: data.categories.map(c => [c.category + protectedMark(c), money(c.averagePay.men.annual), money(c.averagePay.women.annual), money(c.averagePay.men.hourly), money(c.averagePay.women.hourly), money(c.averagePay.men.variableAnnual), money(c.averagePay.women.variableAnnual)]), widths: [0.22, 0.13, 0.13, 0.13, 0.13, 0.13, 0.13] } },
    { id: 'c', title: s.c, table: { head: [t.category, t.gapHourly, t.gapAnnual, '≥ 5 %'], rows: data.categories.map(c => [c.category + protectedMark(c), c.comparable ? pct(c.gaps.hourly) : t.notComparable, c.comparable ? pct(c.gaps.annual) : '—', c.atOrAboveThreshold ? t.yes : t.no]), widths: [0.4, 0.2, 0.2, 0.2] } },
    { id: 'd', title: s.d, items: data.categories.map(c => [`${c.category} (${t.justified}: ${yesNo(c.justified)})`, c.reasons || missing]) },
    { id: 'e', title: s.e, items: data.categories.map(c => [c.category, c.leaveReturn || missing]) },
    { id: 'f', title: s.f, table: { head: [t.category, t.action, t.owner, t.due, t.remedied], rows: data.categories.map(c => [c.category, c.measures.action || '—', c.measures.owner || '—', c.measures.due || '—', yesNo(c.measures.remedied)]), widths: [0.24, 0.32, 0.18, 0.14, 0.12] } },
    { id: 'g', title: s.g, paragraphs: [data.previousMeasures || missing] },
    { id: 'distribution', title: null, paragraphs: [t.assessmentRecipients, t.notOfficial, `${t.source}: ${regulatory.source}`] },
  ];
  return { language, title: t.assessmentTitle, subtitle: t.assessmentSubtitle, status: snapshot.prepared ? t.statusPrepared : t.statusDraft, sections, coverLine: `${company.name} · ${snapshot.reporting_year} · ${countryNames[language][company.country]}`, recipientLine: `${t.recipient}: ${t.recipients[data.audience]}`, keyFigures: [[t.assessment, String(data.categoriesAtOrAboveThreshold.length)], [t.category, String(data.categories.length)]] };
}
export const assessmentText = (company, snapshot) => renderText(assessmentDocument(company, snapshot));
export const assessmentPdf = (company, snapshot) => { const doc = assessmentDocument(company, snapshot); return renderPdf(doc, { author: company.name, title: `${doc.title} ${company.country} ${snapshot.reporting_year}` }); };

const flatRows = data => data.categories.map(c => [c.category, c.proportion.men, c.proportion.women, c.proportion.womenPercent, c.averagePay.men.annual, c.averagePay.women.annual, c.averagePay.men.hourly, c.averagePay.women.hourly, c.averagePay.men.variableAnnual, c.averagePay.women.variableAnnual, c.gaps.hourly, c.gaps.annual, c.comparable, c.protected, c.atOrAboveThreshold, c.justified, c.reasons, c.leaveReturn, c.measures.action, c.measures.owner, c.measures.due, c.measures.remedied]);
const flatHead = ['category', 'men', 'women', 'women_percent', 'men_avg_annual', 'women_avg_annual', 'men_avg_hourly', 'women_avg_hourly', 'men_avg_variable_annual', 'women_avg_variable_annual', 'gap_hourly_percent', 'gap_annual_percent', 'comparable', 'protected', 'at_or_above_5_percent', 'justified', 'reasons_art10_2d', 'leave_return_art10_2e', 'measure_art10_2f', 'owner', 'due', 'remedied'];
export function assessmentCsv(company, snapshot) {
  const data = assessmentData(company, snapshot);
  return '\uFEFF' + [flatHead, ...flatRows(data), [], ['previous_measures_art10_2g', data.previousMeasures]].map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function assessmentXlsx(company, snapshot) {
  const data = assessmentData(company, snapshot), book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([flatHead, ...flatRows(data)]), 'Categories');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['field', 'value'], ['status', data.status], ['company', data.company.name], ['country', data.company.country], ['year', data.reportingYear], ['audience', data.audience], ['threshold_percent', data.thresholdPercent], ['reporting_date', data.reportingDate ?? ''], ['previous_measures_art10_2g', data.previousMeasures ?? '']]), 'Assessment');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
}
export function assessmentXml(company, snapshot) {
  const data = assessmentData(company, snapshot), e = xmlEscape, v = n => n === null || n === undefined ? '' : e(n);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<JointPayAssessmentDraft xmlns="urn:equitensa:internal:assessment:v1" status="${data.status}" country="${company.country}" language="${data.language}" year="${data.reportingYear}" audience="${data.audience}" thresholdPercent="${data.thresholdPercent}"><Company>${e(company.name)}</Company>${data.categories.map(c => `<Category name="${e(c.category)}" comparable="${c.comparable}" protected="${c.protected}" atOrAboveThreshold="${c.atOrAboveThreshold}"><Proportion men="${c.proportion.men}" women="${c.proportion.women}"/><GapHourly>${v(c.gaps.hourly)}</GapHourly><GapAnnual>${v(c.gaps.annual)}</GapAnnual><Reasons justified="${c.justified}">${v(c.reasons)}</Reasons><LeaveReturn>${v(c.leaveReturn)}</LeaveReturn><Measure remedied="${c.measures.remedied}" owner="${v(c.measures.owner)}" due="${v(c.measures.due)}">${v(c.measures.action)}</Measure></Category>`).join('')}<PreviousMeasures>${v(data.previousMeasures)}</PreviousMeasures></JointPayAssessmentDraft>`;
}
