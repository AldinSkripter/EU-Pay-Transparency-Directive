import { obligation } from '../shared/plans.js';
import { analyze } from './pay.js';
import { readiness } from './workflow.js';
import { reportLanguage, countryNames } from './report-i18n.js';
import { requestState, summarize, renderDocument, mimeFor } from './worker-rights.js';

// Directive (EU) 2023/970 Art. 18(2): where an employer has not implemented the transparency obligations of Arts. 5, 6,
// 7, 9 and 10, it is for the employer to prove that there was no pay discrimination (unless the infringement was
// manifestly unintentional and minor). A dated record of what was actually done is therefore worth keeping. This
// document only restates what the company recorded in Equitensa; it proves nothing that was not recorded.
const text = {
  de: {
    title: 'Nachweis der Umsetzung der Transparenzpflichten', subtitle: 'Richtlinie (EU) 2023/970 · Artikel 4, 5, 6, 7, 9, 10 · Beweislast: Artikel 18 Absatz 2',
    draft: 'Zusammenstellung der in Equitensa erfassten Angaben. Keine Rechtsberatung und keine behördliche Bestätigung.',
    intro: 'Wenn ein Arbeitgeber die Pflichten aus den Artikeln 5, 6, 7, 9 und 10 nicht umgesetzt hat, muss er im Streitfall beweisen, dass keine Entgeltdiskriminierung vorlag (Art. 18 Abs. 2). Diese Übersicht hält fest, was erfasst wurde.',
    head: ['Pflicht', 'Stand', 'Nachweis'], done: 'Erfüllt', partial: 'Teilweise', open: 'Offen', voluntary: 'Freiwillig',
    company: 'Unternehmen', country: 'Land', year: 'Bezugsjahr', headcount: 'Beschäftigte (bestätigt)', generated: 'Erstellt am',
    r4: 'Art. 4 Abs. 4 · Kriterien für gleichwertige Arbeit', r5: 'Art. 5 · Entgeltangaben vor der Einstellung', r6: 'Art. 6 · Kriterien der Entgeltfestlegung', r7a: 'Art. 7 Abs. 3 · Jährliche Information der Beschäftigten', r7b: 'Art. 7 und Art. 9 Abs. 10 · Anfragen und Klarstellungen', r8: 'Art. 8 · Barrierefreie Information', r9: 'Art. 9 · Bericht über das Entgeltgefälle', r10: 'Art. 10 · Gemeinsame Entgeltbewertung',
    e4: (n, total, agreement) => `Kriterien (Fähigkeiten, Belastung, Verantwortung, Arbeitsbedingungen) dokumentiert für ${n} von ${total} Kategorien. Vereinbarung mit Arbeitnehmervertretern: ${agreement}.`,
    agreement: { agreed: 'vereinbart', no_representatives: 'keine Arbeitnehmervertretung vorhanden', pending: 'noch nicht vereinbart', '': 'nicht erfasst' },
    e5: (n, total) => `Einstiegsentgelt oder Spanne erfasst für ${n} von ${total} Kategorien.`, e5none: 'Keine Entgeltspannen erfasst.',
    e6: progression => progression ? 'Kriterienblatt und Regeln für das Entgeltwachstum erfasst.' : 'Spannen erfasst, Regeln für das Entgeltwachstum fehlen.', e6none: 'Kein Kriterienblatt erfasst.',
    e7a: date => `Jährliche Information versendet am ${date}.`, e7anone: 'Versand der jährlichen Information nicht erfasst.',
    e7b: s => `${s.total} Anfragen erfasst, ${s.answered} beantwortet, ${s.overdue} überfällig, ${s.open - s.overdue} offen innerhalb der Frist.`, e7bnone: 'Keine Anfragen erfasst.',
    e8: 'Alle Dokumente nach Art. 5, 6 und 7 stehen zusätzlich als barrierefreies HTML und als reiner Text zur Verfügung; das PDF ist nicht getaggt.',
    e9: { dutyYes: (band, due, years) => `Berichtspflicht (${band}): erstmals bis ${due}, danach ${years === 1 ? 'jährlich' : `alle ${years} Jahre`}.`, dutyNo: 'Unter 100 Beschäftigten besteht nach der Richtlinie keine Berichtspflicht; Mitgliedstaaten können sie vorsehen.', data: n => `Entgeltdaten für ${n} Beschäftigte erfasst.`, nodata: 'Keine Entgeltdaten erfasst.', confirmed: (who, reps, date) => `Richtigkeit bestätigt durch ${who} nach Anhörung der Arbeitnehmervertreter (${reps})${date ? `; Meldedatum ${date}` : ''}.`, unconfirmed: 'Bestätigung der Leitung nach Anhörung der Arbeitnehmervertreter fehlt (Art. 9 Abs. 6).' },
    e10: { none: 'Keine Kategorie mit einem Unterschied von mindestens 5 %.', some: (n, justified, unresolved) => `${n} Kategorien mit einem Unterschied von mindestens 5 %: ${justified} gerechtfertigt oder behoben, ${unresolved} ungeklärt.`, deadline: date => `Sechsmonatsfrist nach der Meldung endet am ${date}.` },
    na: 'Keine Datengrundlage',
  },
  sl: {
    title: 'Dokazilo o izvajanju obveznosti preglednosti', subtitle: 'Direktiva (EU) 2023/970 · členi 4, 5, 6, 7, 9, 10 · dokazno breme: člen 18(2)',
    draft: 'Povzetek podatkov, vnesenih v Equitensa. Ni pravno svetovanje in ni potrditev organa.',
    intro: 'Če delodajalec ni izvedel obveznosti iz členov 5, 6, 7, 9 in 10, mora v sporu dokazati, da ni bilo diskriminacije pri plačilu (člen 18(2)). Ta pregled beleži, kaj je bilo vneseno.',
    head: ['Obveznost', 'Stanje', 'Dokaz'], done: 'Izpolnjeno', partial: 'Delno', open: 'Odprto', voluntary: 'Prostovoljno',
    company: 'Podjetje', country: 'Država', year: 'Referenčno leto', headcount: 'Zaposleni (potrjeno)', generated: 'Izdelano dne',
    r4: 'Člen 4(4) · Merila za enakovredno delo', r5: 'Člen 5 · Podatki o plači pred zaposlitvijo', r6: 'Člen 6 · Merila za določanje plač', r7a: 'Člen 7(3) · Letno obveščanje zaposlenih', r7b: 'Člen 7 in člen 9(10) · Zahteve in pojasnila', r8: 'Člen 8 · Dostopne informacije', r9: 'Člen 9 · Poročilo o razliki v plačah', r10: 'Člen 10 · Skupna ocena plač',
    e4: (n, total, agreement) => `Merila (spretnosti, napor, odgovornost, delovne razmere) dokumentirana za ${n} od ${total} kategorij. Dogovor s predstavniki delavcev: ${agreement}.`,
    agreement: { agreed: 'dogovorjeno', no_representatives: 'predstavnikov delavcev ni', pending: 'še ni dogovorjeno', '': 'ni vneseno' },
    e5: (n, total) => `Izhodiščna plača ali razpon vnesena za ${n} od ${total} kategorij.`, e5none: 'Razponi plač niso vneseni.',
    e6: progression => progression ? 'List meril in pravila napredovanja v plači vneseni.' : 'Razponi vneseni, pravil napredovanja v plači ni.', e6none: 'List meril ni vnesen.',
    e7a: date => `Letno obvestilo poslano dne ${date}.`, e7anone: 'Pošiljanje letnega obvestila ni vneseno.',
    e7b: s => `${s.total} zahtev vnesenih, ${s.answered} odgovorjenih, ${s.overdue} zamujenih, ${s.open - s.overdue} odprtih v roku.`, e7bnone: 'Zahtev ni.',
    e8: 'Vsi dokumenti po členih 5, 6 in 7 so na voljo tudi kot dostopen HTML in navadno besedilo; PDF ni označen (tagged).',
    e9: { dutyYes: (band, due, years) => `Obveznost poročanja (${band}): prvič do ${due}, nato ${years === 1 ? 'vsako leto' : `vsaka ${years} leta`}.`, dutyNo: 'Pod 100 zaposlenimi direktiva ne zahteva poročanja; države članice ga lahko predpišejo.', data: n => `Podatki o plačah vneseni za ${n} zaposlenih.`, nodata: 'Podatkov o plačah ni.', confirmed: (who, reps, date) => `Točnost potrdil(a) ${who} po posvetovanju s predstavniki delavcev (${reps})${date ? `; datum oddaje ${date}` : ''}.`, unconfirmed: 'Manjka potrdilo vodstva po posvetovanju s predstavniki delavcev (člen 9(6)).' },
    e10: { none: 'Nobena kategorija nima razlike 5 % ali več.', some: (n, justified, unresolved) => `${n} kategorij z razliko 5 % ali več: ${justified} utemeljenih ali odpravljenih, ${unresolved} nerazrešenih.`, deadline: date => `Šestmesečni rok po oddaji poroča ${date}.` },
    na: 'Ni podlage v podatkih',
  },
};

export async function evidenceDocument(store, company, year, today = new Date().toISOString().slice(0, 10)) {
  const language = reportLanguage(company.country), t = text[language];
  const snapshot = await store.latestSnapshot(company.id, year);
  const analysis = snapshot ? analyze(snapshot.rows, { suppress: false }) : null;
  let workflow = snapshot ? await store.getWorkflow(company.id, year) : {};
  if (!snapshot || workflow.snapshotId !== snapshot.id) workflow = {};
  const criteria = await store.companyDocument(company.id, 'pay_criteria');
  const notice = await store.rightsNotice(company.id, year);
  const requests = (await store.listInfoRequests(company.id)).filter(r => r.received_on.slice(0, 4) === String(year)).map(r => requestState(r, today));
  const categories = analysis?.groups.map(g => g.category) || [];
  const headcount = workflow.profile?.headcount || analysis?.count || null, duty = obligation(headcount);
  const rows = [];
  const add = (label, state, evidence) => rows.push([label, state, evidence]);

  const documented = categories.filter(c => ['skills', 'effort', 'responsibility', 'conditions'].every(k => workflow.classification?.[c]?.[k]));
  add(t.r4, categories.length && documented.length === categories.length && workflow.criteriaAgreement?.status && workflow.criteriaAgreement.status !== 'pending' ? t.done : documented.length ? t.partial : t.open, categories.length ? t.e4(documented.length, categories.length, t.agreement[workflow.criteriaAgreement?.status || '']) : t.na);

  const ranged = categories.filter(c => criteria?.ranges?.[c]);
  add(t.r5, categories.length && ranged.length === categories.length ? t.done : ranged.length ? t.partial : t.open, ranged.length ? t.e5(ranged.length, categories.length) : t.e5none);
  add(t.r6, criteria?.progression ? t.done : criteria ? t.partial : t.open, criteria ? t.e6(!!criteria.progression) : t.e6none);
  add(t.r7a, notice ? t.done : t.open, notice ? t.e7a(notice.sent_on) : t.e7anone);
  const summary = summarize(requests);
  add(t.r7b, summary.overdue ? t.partial : requests.length ? t.done : t.open, requests.length ? t.e7b(summary) : t.e7bnone);
  add(t.r8, t.done, t.e8);

  const approval = workflow.approval || {}, confirmed = !!approval.confirmed && !!approval.consulted;
  const dutyLine = duty?.reporting ? t.e9.dutyYes(duty.band, duty.firstDue, duty.frequencyYears) : t.e9.dutyNo;
  const e9 = [dutyLine, analysis ? t.e9.data(analysis.count) : t.e9.nodata, confirmed ? t.e9.confirmed(approval.manager || '—', approval.representatives || '—', workflow.reportingDate) : t.e9.unconfirmed].join(' ');
  add(t.r9, !analysis ? t.open : confirmed ? t.done : t.partial, e9);

  const flagged = analysis?.groups.filter(g => g.review_required) || [];
  const resolved = flagged.filter(g => workflow.reviews?.[g.category]?.justified || workflow.reviews?.[g.category]?.remedied);
  const deadline = readiness(workflow, analysis || { count: 0, groups: [] }, snapshot).assessments.find(a => a.deadline)?.deadline;
  add(t.r10, !analysis ? t.open : !flagged.length ? t.done : resolved.length === flagged.length ? t.done : t.partial, !analysis ? t.na : !flagged.length ? t.e10.none : [t.e10.some(flagged.length, resolved.length, flagged.length - resolved.length), deadline ? t.e10.deadline(deadline) : ''].filter(Boolean).join(' '));

  return {
    language, title: t.title, subtitle: t.subtitle, status: t.draft, coverLine: `${company.name} · ${year} · ${countryNames[language][company.country]}`, recipientLine: '', keyFigures: [],
    sections: [
      { id: 'intro', title: null, paragraphs: [t.intro] },
      { id: 'facts', title: null, items: [[t.company, company.name], [t.country, countryNames[language][company.country]], [t.year, String(year)], [t.headcount, headcount ? String(headcount) : '—'], [t.generated, today]] },
      { id: 'register', title: t.title, table: { head: t.head, rows } },
    ],
    data: { year, headcount, duty, rows },
  };
}

export function evidenceRoutes(app, { store, yearValue }) {
  app.get('/api/evidence/:format', async (req, res) => {
    const format = req.params.format;
    if (!['json', 'txt', 'html', 'pdf'].includes(format)) return res.status(400).json({ error: 'INVALID_FORMAT' });
    let year;
    try { year = yearValue(req.query.year); } catch { return res.status(400).json({ error: 'INVALID_YEAR' }); }
    const company = req.session.company, doc = await evidenceDocument(store, company, year);
    await store.audit(company.id, 'evidence_exported', { year, format, user_id: req.session.user.id });
    if (format === 'json') return res.json({ evidence: doc.data });
    const output = await renderDocument(doc, format, company, `${doc.title} ${company.country} ${year}`);
    res.setHeader('Content-Disposition', `attachment; filename="equitensa-evidence-${company.country}-${year}.${format}"`);
    res.type(mimeFor(format)).send(output);
  });
}
