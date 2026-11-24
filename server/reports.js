import * as XLSX from 'xlsx';
import { regulatory } from './regulatory.js';
import { article9, article9Rows } from './article9.js';
import { reportLanguage, texts } from './report-i18n.js';
import { analysisFor, audienceOf, buildDocument, confirmationOf, article10Of, historyOf, statusOf, workforce } from './report-model.js';
import { renderText, renderPdf, renderHtml } from './document-render.js';

// Review fields are the employer's own Art. 10 working values. They must never reach other recipients because
// they are computed from the real numbers of small, otherwise protected groups.
const reviewKeys = ['review_gap_hourly', 'review_gap_annual', 'review_required', 'explanation_required', 'comparable'];
const withoutReview = value => Object.fromEntries(Object.entries(value).filter(([key]) => !reviewKeys.includes(key)));
const groupsFor = (analysis, audience) => ['internal', 'workers', 'authority'].includes(audience) ? analysis.groups.map(g => audience === 'internal' ? g : withoutReview(g)) : [];

function workflowEntries(snapshot) {
  if (snapshot.workflow?.snapshotId !== snapshot.id || !['internal', undefined].includes(snapshot.audience)) return [];
  const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, v]) => v && typeof v === 'object' ? flatten(v, `${prefix}${key}.`) : [[`${prefix}${key}`, v]]);
  return flatten(snapshot.workflow);
}

export function reportText(company, snapshot) { return renderText(buildDocument(company, snapshot)); }
export function reportHtml(company, snapshot) { const doc = buildDocument(company, snapshot); return renderHtml(doc, { lang: doc.language, title: `${doc.title} ${company.country} ${snapshot.reporting_year}` }); }

// Prefix spreadsheet formula characters even inside quoted CSV cells.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

export function reportData(company, snapshot) {
  const audience = audienceOf(snapshot), analysis = analysisFor(snapshot);
  const { groups, review_count, ...rawSummary } = analysis, summary = audience === 'internal' ? rawSummary : withoutReview(rawSummary);
  const history = historyOf(company, snapshot);
  return {
    schema: 'urn:equitensa:internal:report:v1', status: statusOf(snapshot), language: reportLanguage(company.country),
    company: { name: company.name, country: company.country }, reportingYear: snapshot.reporting_year, snapshotId: snapshot.id,
    rulesVersion: regulatory.version, source: regulatory.source, officialSubmission: false, methodology: analysis.methodology,
    workforce: workforce(snapshot.rows), confirmation: confirmationOf(snapshot), summary,
    article9: article9(analysis, { country: company.country, audience }),
    ...(['internal', 'workers', 'authority'].includes(audience) ? { groups: groupsFor(analysis, audience) } : {}),
    audience,
    ...(audience === 'internal' ? { article10: article10Of(analysis, snapshot.workflow?.snapshotId === snapshot.id ? snapshot.workflow : {}), review: workflowEntries(snapshot) } : {}),
    ...(history.length ? { history } : {}),
  };
}
export function reportJson(company, snapshot) { return JSON.stringify(reportData(company, snapshot), null, 2); }

export function reportCsv(company, snapshot) {
  const data = reportData(company, snapshot), a = data.summary;
  const header = ['status', 'country', 'year', 'snapshot', 'category', 'count', 'mean_gap_hourly', 'median_gap_hourly', 'base_gap_hourly', 'variable_gap_hourly', 'median_variable_gap_hourly', 'annual_mean_gap', 'annual_median_gap', 'annual_base_gap', 'annual_variable_gap', 'annual_median_variable_gap', 'male_variable_receivers_percent', 'female_variable_receivers_percent'];
  const status = snapshot.prepared ? 'PREPARED_INTERNAL_UNVERIFIED' : 'DRAFT_UNVERIFIED';
  const rows = [{ category: 'ALL', ...a }, ...(data.groups || [])];
  const records = [header, ...rows.map(g => [status, company.country, snapshot.reporting_year, snapshot.id, g.category, g.count, g.mean_gap, g.median_gap, g.base_gap, g.variable_gap, g.median_variable_gap, g.annual_mean_gap, g.annual_median_gap, g.annual_base_gap, g.annual_variable_gap, g.annual_median_variable_gap, g.male_variable_receivers, g.female_variable_receivers])];
  records.push([], ['quartile', 'count', 'male_percent', 'female_percent'], ...a.quartiles.map(q => [q.quartile, q.count, q.male_percent, q.female_percent]));
  records.push([], ['quartile_annual', 'count', 'male_percent', 'female_percent'], ...a.annual_quartiles.map(q => [q.quartile, q.count, q.male_percent, q.female_percent]));
  records.push([], ['art9_letter', 'reference', 'indicator', 'item', 'metric', 'value'], ...article9Rows(data.article9));
  records.push([], ['confirmation_field', 'value'], ...Object.entries(data.confirmation).map(([key, value]) => [key, value]));
  if (data.article10) records.push([], ['art10_category', 'comparable', 'gap_hourly', 'gap_annual', 'at_or_above_5_percent', 'justified', 'remedied'], ...data.article10.categories.map(c => [c.category, c.comparable, c.gapHourly, c.gapAnnual, c.atOrAboveThreshold, c.justified, c.remedied]));
  if (data.history) records.push([], ['history_year', 'art9_letter', 'indicator', 'item', 'metric', 'value'], ...data.history.flatMap(h => article9Rows(h.indicators).map(([letter, , title, item, metric, value]) => [h.year, letter, title, item, metric, value])));
  if (data.review?.length) records.push([], ['review_field', 'value'], ...data.review);
  return '\uFEFF' + records.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function reportXlsx(company, snapshot) {
  const data = reportData(company, snapshot), book = XLSX.utils.book_new();
  const append = (name, rows) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  append('Report', [['field', 'value'], ...Object.entries(data).filter(([key]) => !['summary', 'groups', 'review', 'article9', 'article10', 'history', 'confirmation', 'workforce'].includes(key)).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value])]);
  append('Article 9', [['letter', 'reference', 'indicator', 'item', 'metric', 'value'], ...article9Rows(data.article9)]);
  append('Indicators', [['indicator', 'value'], ...Object.entries(data.summary).filter(([key]) => !['quartiles', 'annual_quartiles', 'methodology'].includes(key))]);
  append('Quartiles', [['quartile', 'count', 'suppressed', 'male_percent', 'female_percent'], ...data.summary.quartiles.map(q => [q.quartile, q.count, q.suppressed, q.male_percent, q.female_percent])]);
  append('Annual quartiles', [['quartile', 'count', 'suppressed', 'male_percent', 'female_percent'], ...data.summary.annual_quartiles.map(q => [q.quartile, q.count, q.suppressed, q.male_percent, q.female_percent])]);
  append('Workforce', [['group', 'count'], ...Object.entries(data.workforce)]);
  append('Confirmation', [['field', 'value'], ...Object.entries(data.confirmation).map(([key, value]) => [key, value ?? ''])]);
  if (data.groups?.length) { const columns = Object.keys(data.groups[0]); append('Categories', [columns, ...data.groups.map(g => columns.map(c => g[c]))]); }
  if (data.article10) append('Article 10', [['category', 'comparable', 'gap_hourly', 'gap_annual', 'at_or_above_5_percent', 'justified', 'remedied'], ...data.article10.categories.map(c => [c.category, c.comparable, c.gapHourly, c.gapAnnual, c.atOrAboveThreshold, c.justified, c.remedied])]);
  if (data.history) // Excel reserves the sheet name "History".
  append('Previous years', [['year', 'letter', 'indicator', 'item', 'metric', 'value'], ...data.history.flatMap(h => article9Rows(h.indicators).map(([letter, , title, item, metric, value]) => [h.year, letter, title, item, metric, value]))]);
  if (data.review?.length) append('Review', [['field', 'value'], ...data.review]);
  // aoa_to_sheet writes text cells as strings; never construct formula objects from user input.
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
}

export const xmlEscape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function reportXml(company, snapshot) {
  const escape = xmlEscape, data = reportData(company, snapshot), a = data.summary, audience = data.audience;
  const metric = (name, n) => n === null || n === undefined ? `<${name} suppressed="true"/>` : `<${name}>${n}</${name}>`;
  const metrics = g => ['mean_gap', 'median_gap', 'base_gap', 'variable_gap', 'median_variable_gap', 'annual_mean_gap', 'annual_median_gap', 'annual_base_gap', 'annual_variable_gap', 'annual_median_variable_gap', 'male_variable_receivers', 'female_variable_receivers'].map(k => metric(k, g[k])).join('');
  const indicators = list => list.map(i => `<Indicator letter="${i.letter}" reference="${escape(i.reference)}"><Title>${escape(i.title)}</Title>${article9Rows([i]).map(([, , , item, name, value]) => `<Value item="${escape(item)}" metric="${escape(name)}">${value === null || value === undefined ? '' : escape(value)}</Value>`).join('')}</Indicator>`).join('');
  const confirmation = data.confirmation, review = (data.review || []).map(([k, v]) => `<Field name="${escape(k)}">${escape(v ?? '')}</Field>`).join('');
  // Explicit internal namespace: no invented AJPES or national schema and no official submission claim.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<PayTransparencyDraft xmlns="urn:equitensa:internal:draft:v1" status="${snapshot.prepared ? 'PREPARED_INTERNAL_UNVERIFIED' : 'DRAFT_UNVERIFIED'}" country="${company.country}" language="${data.language}" year="${snapshot.reporting_year}" audience="${audience}"><Company>${escape(company.name)}</Company><Snapshot>${snapshot.id}</Snapshot><Workforce total="${data.workforce.total}" men="${data.workforce.men}" women="${data.workforce.women}" other="${data.workforce.other}"/><Confirmation confirmed="${confirmation.confirmed}" consulted="${confirmation.consulted}"${confirmation.reportingDate ? ` reportingDate="${escape(confirmation.reportingDate)}"` : ''}${confirmation.manager ? ` manager="${escape(confirmation.manager)}"` : ''}/><Article9 reference="Directive (EU) 2023/970, Art. 9(1)">${indicators(data.article9)}</Article9><Overall count="${a.count}">${metrics(a)}</Overall><Categories>${(data.groups || []).map(g => `<Category name="${escape(g.category)}" count="${g.count}">${metrics(g)}</Category>`).join('')}</Categories><Quartiles>${a.quartiles.map(q => `<Quartile number="${q.quartile}" count="${q.count}">${metric('male_percent', q.male_percent)}${metric('female_percent', q.female_percent)}</Quartile>`).join('')}</Quartiles><AnnualQuartiles>${a.annual_quartiles.map(q => `<Quartile number="${q.quartile}" count="${q.count}">${metric('male_percent', q.male_percent)}${metric('female_percent', q.female_percent)}</Quartile>`).join('')}</AnnualQuartiles>${data.article10 ? `<Article10 thresholdPercent="${data.article10.thresholdPercent}">${data.article10.categories.map(c => `<Category name="${escape(c.category)}" comparable="${c.comparable}" atOrAboveThreshold="${c.atOrAboveThreshold}" justified="${c.justified}" remedied="${c.remedied}">${metric('gap_hourly', c.gapHourly)}${metric('gap_annual', c.gapAnnual)}</Category>`).join('')}</Article10>` : ''}${data.history ? `<History>${data.history.map(h => `<Year value="${h.year}">${indicators(h.indicators)}</Year>`).join('')}</History>` : ''}${review ? `<ReviewDocumentation>${review}</ReviewDocumentation>` : ''}</PayTransparencyDraft>`;
}

export function reportPdf(company, snapshot) {
  const doc = buildDocument(company, snapshot), t = texts[doc.language];
  return renderPdf(doc, { author: company.name, title: `${t.title} ${company.country} ${snapshot.reporting_year}` });
}
