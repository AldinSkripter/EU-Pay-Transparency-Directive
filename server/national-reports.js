import {payImportLimits} from '../shared/pay-import-limits.js';
import { parse } from 'csv-parse/sync';
import { pseudonymFor, renderDocument, mimeFor } from './worker-rights.js';

export const nationalRules = {
  DE: { id: 'DE-EntgTranspG-21-22', title: 'Bericht zur Gleichstellung und Entgeltgleichheit', source: 'https://www.gesetze-im-internet.de/entgtranspg/__21.html', detailSource: 'https://www.gesetze-im-internet.de/entgtranspg/__22.html', language: 'de', scope: 'Bestehender Bericht nach §§ 21–22 EntgTranspG; getrennt vom EU-Bericht nach Artikel 9.' },
  AT: { id: 'AT-GlBG-11a', title: 'Einkommensbericht', source: 'https://www.ris.bka.gv.at/eli/bgbl/i/2004/66/P11a/NOR40126105', detailSource: 'https://www.einkommensbericht.gv.at/2-erstellen/2-2-5-hochrechnung-teilzeit.html', language: 'de', scope: 'Bestehender Einkommensbericht nach § 11a GlBG; getrennt vom EU-Bericht nach Artikel 9.' },
  SI: { id: null, title: 'Poročilo o razliki v plačah med spoloma', source: 'https://www.gov.si/zbirke/projekti-in-programi/projekt-pay-day/', language: 'sl', scope: 'Poročilo po členu 9 je na voljo v slovenščini. Nacionalna predloga in način oddaje še nista potrjena.' },
};
const fail = () => { throw new Error('NATIONAL_DATA_INCOMPLETE'); };
const text = (value, max = 3000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) fail();
  return value.trim();
};
const number = (value, min = 0, max = 1e9) => {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !/^\d+(\.\d+)?$/.test(String(value))) fail();
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail();
  return n;
};
const round = n => Number(n.toFixed(4));
const averageCounts = input => Object.fromEntries(['men', 'women'].map(sex => {
  const fullTime = number(input?.[sex]?.fullTime), partTime = number(input?.[sex]?.partTime);
  return [sex, { fullTime, partTime, total: round(fullTime + partTime) }];
}));

export function germanSupplement(input, year) {
  if (input?.confirmed !== true || !['three', 'five'].includes(input.cycle) || typeof input.firstReport !== 'boolean') fail();
  const counts = averageCounts(input.counts), previous = input.firstReport ? null : averageCounts(input.previousCounts);
  if (previous && !Number.isInteger(number(input.previousYear, 2000, year - 1))) fail();
  return { confirmed: true, cycle: input.cycle, periodStart: year - (input.cycle === 'five' ? 4 : 2), periodEnd: year, firstReport: input.firstReport,
    equalityMeasures: text(input.equalityMeasures), equalityEffects: text(input.equalityEffects), equalPayMeasures: text(input.equalPayMeasures),
    // A reason for taking no measures belongs in these mandatory narrative fields.
    counts, previousCounts: previous, previousYear: previous ? number(input.previousYear, 2000, year - 1) : null };
}

export function austrianSupplement(input, snapshot, companyId, secret) {
  if (input?.confirmed !== true || input.anonymityReviewed !== true || typeof input.csv !== 'string' || Buffer.byteLength(input.csv) > payImportLimits.fileBytes) fail();
  let records;
  const headers = ['internal_id', 'pay_group', 'group_year', 'time_dependent_annual', 'time_independent_annual', 'fte_fraction', 'year_fraction'];
  try { records = parse(input.csv, { columns: supplied => {
    if (supplied.length !== headers.length || new Set(supplied).size !== headers.length || headers.some(h => !supplied.includes(h))) fail();
    return supplied;
  }, bom: true, skip_empty_lines: true, delimiter: ';', max_record_size: 4096 }); } catch { fail(); }
  if (!records.length || records.length !== snapshot.rows.length || records.length > 10000) fail();
  const expected = new Map(snapshot.rows.map(r => [r.anonymized_id, r])), seen = new Set(), groups = new Map();
  for (const record of records) {
    const hash = pseudonymFor(secret, companyId, text(record.internal_id, 255)), row = expected.get(hash);
    if (!row || seen.has(hash)) fail();
    seen.add(hash);
    const fte = number(record.fte_fraction, 0.0001, 1), year = number(record.year_fraction, 0.0001, 1);
    const dependent = number(record.time_dependent_annual), independent = number(record.time_independent_annual);
    if (Math.abs(dependent + independent - row.base_annual - row.bonuses_annual) > 0.011) fail();
    // Separate classification from Article 4 categories: collective/functional group and group year.
    const group = text(record.pay_group, 255), groupYear = record.group_year ? text(record.group_year, 255) : '';
    const key = JSON.stringify([group, groupYear]);
    if (!groups.has(key)) groups.set(key, { group, groupYear, men: [], women: [], other: 0 });
    const bucket = groups.get(key);
    if (row.gender === 'O') bucket.other++;
    else bucket[row.gender === 'M' ? 'men' : 'women'].push(dependent / fte / year + independent);
  }
  // Only aggregates are retained; source CSV and source identifiers are discarded.
  const aggregate = entries => entries.map(g => {
    const protectedGroup = g.men.length < 5 || g.women.length < 5;
    return { group: g.group, groupYear: g.groupYear, men: g.men.length, women: g.women.length, other: g.other, protected: protectedGroup,
      menMean: protectedGroup ? null : round(g.men.reduce((a, b) => a + b, 0) / g.men.length),
      womenMean: protectedGroup ? null : round(g.women.reduce((a, b) => a + b, 0) / g.women.length) };
  });
  const totals = new Map();
  for (const g of groups.values()) {
    if (!totals.has(g.group)) totals.set(g.group, { group: g.group, groupYear: '', men: [], women: [], other: 0 });
    const total = totals.get(g.group);
    total.men.push(...g.men); total.women.push(...g.women); total.other += g.other;
  }
  // Do not publish a parent mean when it could reveal suppressed child cells by subtraction.
  const grouped = aggregate([...totals.values()]);
  const detailed = aggregate([...groups.values()].filter(g => g.groupYear));
  for (const parent of grouped) if (aggregate([...groups.values()]).some(child => child.group === parent.group && child.protected)) {
    parent.protected = true; parent.menMean = null; parent.womenMean = null;
  }
  return { confirmed: true, anonymityReviewed: true, workforce: records.length, groups: grouped, groupYears: detailed,
    method: 'Arithmetisches Mittel; zeitabhängiges Jahresentgelt / Beschäftigungsausmaß / Jahresanteil + zeitunabhängiges Entgelt. Konstante oder zuvor fachlich aufbereitete Beschäftigungsverhältnisse. Klein- und ableitbare Gruppen geschützt (interne Mindestgröße 5, keine gesetzliche Anonymitätsgarantie).' };
}

export function nationalDocument(company, snapshot, supplement) {
  const rule = nationalRules[company.country];
  if (!rule?.id) throw new Error('NATIONAL_TEMPLATE_UNVERIFIED');
  if (!supplement || supplement.snapshotId !== snapshot.id || !supplement.confirmed) throw new Error('NATIONAL_DATA_INCOMPLETE');
  const money = n => n === null ? '— (geschützt)' : n.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
  const sections = [{ id: 'scope', title: 'Rechtsgrundlage und Berichtsrahmen', items: [['Unternehmen', company.name], ['Land', company.country], ['Bezugsjahr', String(snapshot.reporting_year)], ['Datenstand', snapshot.id], ['Rechtsgrundlage', rule.source]], paragraphs: [rule.scope] }];
  if (company.country === 'DE') {
    sections.push({ id: 'period', title: 'Berichtszeitraum', paragraphs: [`${supplement.periodStart}–${supplement.periodEnd}. Beschäftigtenzahlen beziehen sich auf das letzte Kalenderjahr ${snapshot.reporting_year}. Der gewählte Drei-/Fünfjahreszyklus und die persönliche Berichtspflicht sind vom Arbeitgeber geprüft.`] },
      { id: 'equality', title: 'Maßnahmen zur Förderung der Gleichstellung und deren Wirkungen (§ 21 Abs. 1)', items: [['Maßnahmen / Begründung fehlender Maßnahmen', supplement.equalityMeasures], ['Wirkungen', supplement.equalityEffects]] },
      { id: 'equal-pay', title: 'Maßnahmen zur Herstellung von Entgeltgleichheit (§ 21 Abs. 1)', paragraphs: [supplement.equalPayMeasures] },
      { id: 'counts', title: `Durchschnittliche Beschäftigtenzahlen ${snapshot.reporting_year} (§ 21 Abs. 2)`, table: { head: ['Geschlecht', 'Gesamt', 'Vollzeit', 'Teilzeit'], rows: ['men', 'women'].map(sex => [sex === 'men' ? 'Männer' : 'Frauen', ...['total', 'fullTime', 'partTime'].map(k => String(supplement.counts[sex][k]))]), widths: [0.34, 0.22, 0.22, 0.22] } });
    if (supplement.previousCounts) sections.push({ id: 'changes', title: `Veränderungen gegenüber dem letzten Bericht (${supplement.previousYear})`, table: { head: ['Geschlecht', 'Δ Gesamt', 'Δ Vollzeit', 'Δ Teilzeit'], rows: ['men', 'women'].map(sex => [sex === 'men' ? 'Männer' : 'Frauen', ...['total', 'fullTime', 'partTime'].map(k => String(round(supplement.counts[sex][k] - supplement.previousCounts[sex][k])))]), widths: [0.34, 0.22, 0.22, 0.22] } });
    sections.push({ id: 'delivery', title: 'Veröffentlichung (§ 22 Abs. 4)', paragraphs: ['Dem nächsten Lagebericht als Anlage beifügen und im Unternehmensregister offenlegen. Equitensa übermittelt nichts.'] });
  } else {
    const table = list => ({ head: ['Verwendungs-/Funktionsgruppe', 'Gruppenjahr', 'Männer', 'Frauen', 'Ø Männer / Jahr', 'Ø Frauen / Jahr'], rows: list.map(g => [g.group, g.groupYear || '—', String(g.men), String(g.women), money(g.menMean), money(g.womenMean)]), widths: [0.27, 0.11, 0.1, 0.1, 0.21, 0.21] });
    sections.push({ id: 'groups', title: 'Entgelt nach Verwendungs-/Funktionsgruppen (§ 11a Abs. 1)', table: table(supplement.groups) });
    if (supplement.groupYears.length) sections.push({ id: 'group-years', title: 'Entgelt nach Verwendungsgruppenjahren', table: table(supplement.groupYears) });
    sections.push({ id: 'method', title: 'Hochrechnung und Datenschutz', paragraphs: [supplement.method, 'Entgeltbestandteile einschließlich Sonderzahlungen und Sachleistungen müssen vollständig und fachlich richtig zugeordnet sein. Änderungen des Beschäftigungsausmaßes oder der Beschäftigungsdauer vor dem Import fachlich aufbereiten. Die Anonymität ist unter Berücksichtigung des betrieblichen Zusatzwissens zu prüfen.'] },
      { id: 'delivery', title: 'Bereitstellung (§ 11a Abs. 3)', paragraphs: ['Im ersten Quartal des Folgejahres an das zuständige Belegschaftsorgan übermitteln; besteht keines, betriebliche Einsicht und Bekanntmachung ermöglichen. Kein öffentlicher Bericht und keine automatische Behördenübermittlung.'] });
  }
  sections.push({ id: 'review', title: 'Bestätigung und Quellen', paragraphs: ['Zusatzangaben wurden vom Arbeitgeber bestätigt. Vor Verwendung Inhalt, Anwendungsbereich und aktuelle Rechtslage prüfen; keine amtlich zertifizierte Vorlage.', rule.source, rule.detailSource] });
  return { language: 'de', title: rule.title, subtitle: rule.id, status: 'Auf Grundlage der bestätigten Arbeitgeberangaben erstellt.', coverLine: `${company.name} · ${snapshot.reporting_year} · ${company.country}`, sections };
}

export function nationalReportRoutes(app, { store, secret, yearValue }) {
  const wrap = handler => async (req, res, next) => { try { await handler(req, res); } catch (e) { if (['NATIONAL_DATA_INCOMPLETE', 'NATIONAL_TEMPLATE_UNVERIFIED', 'NO_DATA', 'INVALID_YEAR', 'INVALID_FORMAT'].includes(e.message)) res.status(400).json({ error: e.message }); else next(e); } };
  const context = async req => {
    const year = yearValue(req.query.year ?? req.body?.year), company = req.session.company;
    return { year, company, snapshot: await store.latestSnapshot(company.id, year), key: `national_${year}` };
  };
  app.get('/api/national-report', wrap(async (req, res) => {
    const { year, company, snapshot, key } = await context(req), saved = await store.companyDocument(company.id, key);
    res.json({ year, country: company.country, rule: nationalRules[company.country], snapshotId: snapshot?.id || null, document: saved?.snapshotId === snapshot?.id ? saved : null });
  }));
  app.post('/api/national-report', wrap(async (req, res) => {
    const { year, company, snapshot, key } = await context(req);
    if (!nationalRules[company.country]?.id) throw new Error('NATIONAL_TEMPLATE_UNVERIFIED');
    if (!snapshot) throw new Error('NO_DATA');
    const input = company.country === 'DE' ? germanSupplement(req.body, year) : austrianSupplement(req.body, snapshot, company.id, secret);
    const document = { ...input, snapshotId: snapshot.id, year, rulesVersion: nationalRules[company.country].id, confirmedAt: new Date().toISOString(), confirmedBy: req.session.user.id };
    await store.saveCompanyDocument(company.id, key, document);
    await store.audit(company.id, 'national_report_saved', { year, snapshot_id: snapshot.id, user_id: req.session.user.id });
    res.json({ document });
  }));
  app.post('/api/national-report/document', wrap(async (req, res) => {
    const { year, company, snapshot, key } = await context(req), format = req.body.format || 'pdf';
    if (!['pdf', 'txt', 'html'].includes(format)) throw new Error('INVALID_FORMAT');
    if (!snapshot) throw new Error('NO_DATA');
    const doc = nationalDocument(company, snapshot, await store.companyDocument(company.id, key));
    const output = await renderDocument(doc, format, company, doc.title);
    await store.audit(company.id, 'national_report_exported', { year, snapshot_id: snapshot.id, format, user_id: req.session.user.id });
    res.setHeader('Content-Disposition', `attachment; filename="equitensa-${company.country}-${year}-national.${format}"`);
    res.type(mimeFor(format)).send(output);
  }));
}
