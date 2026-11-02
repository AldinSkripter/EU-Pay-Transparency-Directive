import { createHmac } from 'node:crypto';
import { reportLanguage, reportLocale, countryNames } from './report-i18n.js';
import { SMALL_GROUP_MINIMUM } from './pay.js';
import { renderText, renderPdf } from './document-render.js';

// Directive (EU) 2023/970 Art. 7: workers may ask for their individual pay level and the average pay levels, by sex,
// of the category of workers doing the same work or work of equal value. The employer must answer in writing within
// two months (Art. 7(4)) and must remind all workers of the right every year (Art. 7(3)).
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const validDate = value => typeof value === 'string' && ISO.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function addMonths(iso, months) {
  const date = new Date(`${iso}T00:00:00Z`), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  return date.toISOString().slice(0, 10);
}
export const RESPONSE_MONTHS = 2;
export const dueOn = receivedOn => addMonths(receivedOn, RESPONSE_MONTHS);
export const channels = ['worker', 'representative', 'equality_body'];
const dayDiff = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export function requestState(request, today = new Date().toISOString().slice(0, 10)) {
  const daysLeft = dayDiff(today, request.due_on);
  const state = request.status === 'answered' ? 'answered' : daysLeft < 0 ? 'overdue' : daysLeft <= 14 ? 'due_soon' : 'open';
  return { ...request, state, daysLeft: request.status === 'answered' ? null : daysLeft };
}
export function summarize(requests) {
  const count = state => requests.filter(r => r.state === state).length;
  return { total: requests.length, open: count('open') + count('due_soon') + count('overdue'), dueSoon: count('due_soon'), overdue: count('overdue'), answered: count('answered') };
}

const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round = n => n === null ? null : Number(n.toFixed(2));

// The employee is found through the same pseudonym used in the data snapshots; the source ID is never stored.
export const pseudonymFor = (secret, companyId, internalId) => createHmac('sha256', secret).update(`${companyId}:${internalId}`).digest('hex');

export function buildAnswer(company, row, rows, { year, request }) {
  const group = rows.filter(r => r.worker_category === row.worker_category), men = group.filter(r => r.gender === 'M'), women = group.filter(r => r.gender === 'F');
  // Art. 12(3): where the averages would reveal the pay of an identifiable worker they are withheld from the worker.
  const protectedValues = men.length < SMALL_GROUP_MINIMUM || women.length < SMALL_GROUP_MINIMUM;
  const avg = (list, pick) => protectedValues || !list.length ? null : round(mean(list.map(pick)));
  const side = list => ({ count: list.length, annual: avg(list, r => r.base_annual + r.bonuses_annual), hourly: avg(list, r => r.total_hourly), variableAnnual: avg(list, r => r.bonuses_annual) });
  return {
    language: reportLanguage(company.country), year, request: { receivedOn: request.received_on, dueOn: request.due_on, requester: request.requester_label },
    worker: { category: row.worker_category, annual: round(row.base_annual + row.bonuses_annual), baseAnnual: round(row.base_annual), variableAnnual: round(row.bonuses_annual), hourly: round(row.total_hourly) },
    category: { men: side(men), women: side(women), protected: protectedValues },
  };
}

const text = {
  de: {
    title: 'Auskunft über das Entgelt', subtitle: 'Richtlinie (EU) 2023/970 · Artikel 7',
    company: 'Unternehmen', country: 'Land', year: 'Datenstand (Bezugsjahr)', received: 'Anfrage eingegangen am', due: 'Antwort fällig bis', requester: 'Anfragende Person oder Stelle',
    own: 'Ihr individuelles Entgeltniveau', category: 'Kategorie (gleiche oder gleichwertige Arbeit)', annual: 'Bruttojahresentgelt gesamt', base: 'davon Grundentgelt (jährlich)', variable: 'davon ergänzende oder variable Bestandteile (jährlich)', hourly: 'Bruttostundenentgelt gesamt',
    averages: 'Durchschnittliche Entgeltniveaus in Ihrer Kategorie, nach Geschlecht', men: 'Männer', women: 'Frauen', count: 'Anzahl', avgAnnual: 'Durchschnitt Bruttojahresentgelt', avgHourly: 'Durchschnitt Bruttostundenentgelt', avgVariable: 'Durchschnitt variable Bestandteile (jährlich)',
    protected: 'Die Durchschnittswerte werden nicht mitgeteilt, weil sie das Entgelt einzelner Beschäftigter erkennbar machen könnten (Art. 12 Abs. 3). Arbeitnehmervertretung, Arbeitsaufsicht oder Gleichbehandlungsstelle können Zugang erhalten.',
    rights: 'Ihre Rechte', rightsLines: ['Sind die Angaben unrichtig oder unvollständig, können Sie zusätzliche, angemessene Klarstellungen verlangen und eine begründete Antwort erhalten (Art. 7 Abs. 2).', 'Sie dürfen Ihr eigenes Entgelt zur Durchsetzung des Grundsatzes des gleichen Entgelts offenlegen (Art. 7 Abs. 5).', 'Angaben zum Entgelt anderer dürfen auf Verlangen des Arbeitgebers nur zur Ausübung Ihres Rechts auf gleiches Entgelt verwendet werden (Art. 7 Abs. 6).'],
    method: 'Methodik', methodLines: ['Entgeltniveau = Bruttojahresentgelt und entsprechendes Bruttostundenentgelt einschließlich ergänzender oder variabler Bestandteile (Art. 3 Abs. 1 Buchst. a und b).', 'Durchschnitt = arithmetisches Mittel. Stundenentgelt = tatsächliche Jahresvergütung / bestätigte bezahlte Jahresstunden.', 'Die Kategorie fasst Beschäftigte zusammen, die gleiche oder gleichwertige Arbeit nach objektiven, geschlechtsneutralen Kriterien verrichten (Art. 4 Abs. 4).'],
    draft: 'Entwurf zur Prüfung durch den Arbeitgeber. Vor dem Versand Angaben und Kategorie kontrollieren.',
    noticeTitle: 'Hinweis auf Ihr Recht auf Entgeltinformation', noticeSubtitle: 'Richtlinie (EU) 2023/970 · Artikel 7 Absatz 3',
    noticeIntro: 'Sie haben das Recht, schriftlich Auskunft zu verlangen über Ihr individuelles Entgeltniveau und über die durchschnittlichen Entgeltniveaus, aufgeschlüsselt nach Geschlecht, für Gruppen von Beschäftigten, die die gleiche oder eine gleichwertige Arbeit verrichten wie Sie.',
    noticeSteps: 'So gehen Sie vor', noticeStepLines: contact => [`Richten Sie Ihre Anfrage, formlos und schriftlich, an: ${contact}.`, 'Sie können die Anfrage auch über die Arbeitnehmervertretung oder über die Gleichbehandlungsstelle stellen.', 'Wir antworten schriftlich innerhalb angemessener Frist, spätestens innerhalb von zwei Monaten nach Ihrer Anfrage.', 'Sind die Angaben unrichtig oder unvollständig, können Sie Klarstellungen verlangen.', 'Sie dürfen Ihr Entgelt offenlegen, um den Grundsatz des gleichen Entgelts durchzusetzen.'],
    noticeSent: 'Diese Information erhalten Sie jährlich.',
  },
  sl: {
    title: 'Informacija o plači', subtitle: 'Direktiva (EU) 2023/970 · člen 7',
    company: 'Podjetje', country: 'Država', year: 'Podatkovni posnetek (leto)', received: 'Zahteva prejeta', due: 'Odgovor do', requester: 'Prosilec',
    own: 'Vaša individualna raven plače', category: 'Kategorija (enako ali enakovredno delo)', annual: 'Bruto letno plačilo skupaj', base: 'od tega osnovno plačilo (letno)', variable: 'od tega dopolnilne ali spremenljive sestavine (letno)', hourly: 'Bruto urno plačilo skupaj',
    averages: 'Povprečne ravni plač v vaši kategoriji po spolu', men: 'Moški', women: 'Ženske', count: 'Število', avgAnnual: 'Povprečje bruto letnega plačila', avgHourly: 'Povprečje bruto urnega plačila', avgVariable: 'Povprečje spremenljivih sestavin (letno)',
    protected: 'Povprečij ne sporočamo, ker bi lahko razkrila plačo posameznega zaposlenega (člen 12(3)). Predstavniki delavcev, inšpektorat za delo ali organ za enakost lahko dobijo dostop.',
    rights: 'Vaše pravice', rightsLines: ['Če so podatki nepravilni ali nepopolni, lahko zahtevate dodatna razumna pojasnila in prejmete utemeljen odgovor (člen 7(2)).', 'Svojo plačo lahko razkrijete za uveljavljanje načela enakega plačila (člen 7(5)).', 'Podatke o plačah drugih sme delodajalec zahtevati, da se uporabijo samo za uveljavljanje pravice do enakega plačila (člen 7(6)).'],
    method: 'Metodologija', methodLines: ['Raven plače = bruto letno plačilo in ustrezno bruto urno plačilo, vključno z dopolnilnimi ali spremenljivimi sestavinami (člen 3(1)(a) in (b)).', 'Povprečje = aritmetična sredina. Urno plačilo = dejansko letno plačilo / potrjene letne plačane ure.', 'Kategorija zajema zaposlene, ki opravljajo enako ali enakovredno delo po objektivnih, spolno nevtralnih merilih (člen 4(4)).'],
    draft: 'Osnutek za pregled delodajalca. Pred pošiljanjem preverite podatke in kategorijo.',
    noticeTitle: 'Obvestilo o vaši pravici do informacij o plačah', noticeSubtitle: 'Direktiva (EU) 2023/970 · člen 7(3)',
    noticeIntro: 'Imate pravico pisno zahtevati informacije o svoji individualni ravni plače in o povprečnih ravneh plač, razčlenjenih po spolu, za skupine zaposlenih, ki opravljajo enako ali enakovredno delo kot vi.',
    noticeSteps: 'Kako postopate', noticeStepLines: contact => [`Zahtevo, neformalno in pisno, naslovite na: ${contact}.`, 'Zahtevo lahko vložite tudi prek predstavnikov delavcev ali organa za enakost.', 'Pisno odgovorimo v razumnem roku, najpozneje v dveh mesecih po zahtevi.', 'Če so podatki nepravilni ali nepopolni, lahko zahtevate pojasnila.', 'Svojo plačo lahko razkrijete za uveljavljanje načela enakega plačila.'],
    noticeSent: 'To informacijo prejmete vsako leto.',
  },
};

export function answerDocument(company, answer) {
  const t = text[answer.language], locale = reportLocale(answer.language);
  const money = n => n === null ? '—' : n.toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  const { worker, category } = answer;
  return {
    language: answer.language, title: t.title, subtitle: t.subtitle, status: t.draft, coverLine: `${company.name} · ${answer.year}`, recipientLine: `${t.requester}: ${answer.request.requester}`,
    keyFigures: [[t.annual, money(worker.annual)], [t.hourly, money(worker.hourly)]],
    sections: [
      { id: 'meta', title: null, items: [[t.company, company.name], [t.country, countryNames[answer.language][company.country]], [t.year, String(answer.year)], [t.received, answer.request.receivedOn], [t.due, answer.request.dueOn], [t.requester, answer.request.requester]] },
      { id: 'own', title: t.own, items: [[t.category, worker.category], [t.annual, money(worker.annual)], [t.base, money(worker.baseAnnual)], [t.variable, money(worker.variableAnnual)], [t.hourly, money(worker.hourly)]] },
      { id: 'averages', title: t.averages, ...(category.protected ? { paragraphs: [t.protected] } : {}), table: { head: ['', t.men, t.women], rows: [[t.count, String(category.men.count), String(category.women.count)], [t.avgAnnual, money(category.men.annual), money(category.women.annual)], [t.avgHourly, money(category.men.hourly), money(category.women.hourly)], [t.avgVariable, money(category.men.variableAnnual), money(category.women.variableAnnual)]], widths: [0.5, 0.25, 0.25] } },
      { id: 'rights', title: t.rights, paragraphs: t.rightsLines },
      { id: 'method', title: t.method, paragraphs: t.methodLines },
    ],
  };
}
export function noticeDocument(company, { year, contact }) {
  const language = reportLanguage(company.country), t = text[language];
  return { language, title: t.noticeTitle, subtitle: t.noticeSubtitle, status: String(year), coverLine: `${company.name} · ${year}`, recipientLine: '', keyFigures: [],
    sections: [{ id: 'intro', title: null, paragraphs: [t.noticeIntro] }, { id: 'steps', title: t.noticeSteps, paragraphs: t.noticeStepLines(contact).map((line, i) => `${i + 1}. ${line}`) }, { id: 'sent', title: null, paragraphs: [t.noticeSent] }] };
}
export const renderDocument = async (doc, format, company, title) => format === 'pdf' ? renderPdf(doc, { author: company.name, title }) : renderText(doc);

const cleanText = (value, max, required = false) => {
  if (value === undefined || value === null || value === '') return required ? null : '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) return null;
  return value.trim();
};

export function workerRightsRoutes(app, { store, secret, yearValue }) {
  const wrap = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { if (/^[A-Z_]+$/.test(error.message)) res.status(error.message === 'REQUEST_NOT_FOUND' || error.message === 'NO_DATA' || error.message === 'EMPLOYEE_NOT_FOUND' ? 404 : 400).json({ error: error.message }); else next(error); } };
  const state = rows => rows.map(r => requestState(r));
  app.get('/api/requests', wrap(async (req, res) => { const requests = state(await store.listInfoRequests(req.session.company.id)); res.json({ requests, summary: summarize(requests), responseMonths: RESPONSE_MONTHS }); }));
  app.post('/api/requests', wrap(async (req, res) => {
    const { receivedOn, channel, requesterLabel, note } = req.body, label = cleanText(requesterLabel, 120, true), extra = cleanText(note, 2000);
    const today = new Date().toISOString().slice(0, 10);
    if (!validDate(receivedOn) || receivedOn > today || !channels.includes(channel) || !label || extra === null) throw new Error('INVALID_REQUEST');
    const created = await store.createInfoRequest(req.session.company.id, { received_on: receivedOn, due_on: dueOn(receivedOn), channel, requester_label: label, note: extra, created_by: req.session.user.id });
    await store.audit(req.session.company.id, 'info_request_created', { request_id: created.id, channel, user_id: req.session.user.id });
    res.status(201).json({ request: requestState(created) });
  }));
  // The employee ID travels in the body, never in a URL, and is not stored: only the pseudonym is compared.
  app.post('/api/requests/:id/answer', wrap(async (req, res) => {
    const company = req.session.company, request = await store.getInfoRequest(company.id, req.params.id);
    if (!request) throw new Error('REQUEST_NOT_FOUND');
    const year = yearValue(req.body.year), internalId = cleanText(req.body.internalId, 255, true), format = req.body.format || 'json';
    if (!internalId || !['json', 'txt', 'pdf'].includes(format)) throw new Error('INVALID_REQUEST');
    const snapshot = await store.latestSnapshot(company.id, year);
    if (!snapshot) throw new Error('NO_DATA');
    const row = snapshot.rows.find(r => r.anonymized_id === pseudonymFor(secret, company.id, internalId));
    if (!row) throw new Error('EMPLOYEE_NOT_FOUND');
    const answer = buildAnswer(company, row, snapshot.rows, { year, request });
    await store.audit(company.id, 'info_answer_generated', { request_id: request.id, year, format, user_id: req.session.user.id });
    if (format === 'json') return res.json({ answer });
    const doc = answerDocument(company, answer), output = await renderDocument(doc, format, company, doc.title);
    res.setHeader('Content-Disposition', `attachment; filename="equitensa-pay-information-${year}.${format}"`);
    res.type(format === 'pdf' ? 'application/pdf' : 'text/plain').send(output);
  }));
  app.post('/api/requests/:id/close', wrap(async (req, res) => {
    const company = req.session.company, request = await store.getInfoRequest(company.id, req.params.id), summary = cleanText(req.body.summary, 2000);
    if (!request) throw new Error('REQUEST_NOT_FOUND');
    const today = new Date().toISOString().slice(0, 10);
    if (!validDate(req.body.answeredOn) || req.body.answeredOn < request.received_on || req.body.answeredOn > today || summary === null) throw new Error('INVALID_REQUEST');
    const closed = await store.answerInfoRequest(company.id, request.id, { answeredOn: req.body.answeredOn, summary });
    await store.audit(company.id, 'info_request_answered', { request_id: request.id, user_id: req.session.user.id, on_time: req.body.answeredOn <= request.due_on });
    res.json({ request: requestState(closed) });
  }));
  // Art. 7(3): annual notice to all workers.
  app.get('/api/rights-notice', wrap(async (req, res) => { const year = yearValue(req.query.year ?? new Date().getUTCFullYear()); res.json({ year, notice: await store.rightsNotice(req.session.company.id, year) }); }));
  app.post('/api/rights-notice', wrap(async (req, res) => {
    const year = yearValue(req.body.year), contact = cleanText(req.body.contact, 255, true), today = new Date().toISOString().slice(0, 10);
    if (!contact || !validDate(req.body.sentOn) || req.body.sentOn > today) throw new Error('INVALID_REQUEST');
    await store.saveRightsNotice(req.session.company.id, year, { sent_on: req.body.sentOn, contact });
    await store.audit(req.session.company.id, 'rights_notice_recorded', { year, user_id: req.session.user.id });
    res.json({ year, notice: await store.rightsNotice(req.session.company.id, year) });
  }));
  app.post('/api/rights-notice/document', wrap(async (req, res) => {
    const company = req.session.company, year = yearValue(req.body.year), contact = cleanText(req.body.contact, 255, true), format = req.body.format || 'txt';
    if (!contact || !['txt', 'pdf'].includes(format)) throw new Error('INVALID_REQUEST');
    const doc = noticeDocument(company, { year, contact }), output = await renderDocument(doc, format, company, doc.title);
    res.setHeader('Content-Disposition', `attachment; filename="equitensa-pay-information-notice-${year}.${format}"`);
    res.type(format === 'pdf' ? 'application/pdf' : 'text/plain').send(output);
  }));
}
