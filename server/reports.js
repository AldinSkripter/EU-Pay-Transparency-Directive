import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { existsSync } from 'node:fs';
import { analyze } from './pay.js';
import { regulatory } from './regulatory.js';
import { readiness } from './workflow.js';
import { article9, article9Rows } from './article9.js';
const art9=(company,snapshot,analysis)=>article9(analysis,{country:company.country,audience:snapshot.audience||'internal'});
const labels = {
  DE: { title: 'Entgelttransparenz · Arbeitsbericht', draft: 'ENTWURF · Keine behördlich validierte Vorlage', year: 'Berichtsjahr', count: 'Beschäftigte', mean: 'Mittlere Entgeltlücke (Stunde)', median: 'Mediane Entgeltlücke (Stunde)', group: 'Beschäftigtenkategorie', note: 'Ein Prüfhinweis ab 5 % ist keine automatische Feststellung einer Diskriminierung. Kleine Gruppen werden zum Schutz personenbezogener Daten unterdrückt.' },
  SI: { title: 'Preglednost plač · Delovno poročilo', draft: 'OSNUTEK · Predloga ni potrjena za uradno oddajo', year: 'Leto poročanja', count: 'Zaposleni', mean: 'Povprečna plačna vrzel (ura)', median: 'Mediana plačne vrzeli (ura)', group: 'Kategorija zaposlenih', note: 'Opozorilo pri 5 % ni samodejna ugotovitev diskriminacije. Majhne skupine so skrite zaradi varstva osebnih podatkov.' },
};
labels.AT = labels.DE;
const fieldLabels = {
  DE: { base_gap:'Grundvergütungslücke (Stunde)',variable_gap:'Variable Entgeltlücke (Stunde)',median_variable_gap:'Mediane variable Entgeltlücke (Stunde)',annual_mean_gap:'Mittlere jährliche Entgeltlücke',annual_median_gap:'Mediane jährliche Entgeltlücke',annual_base_gap:'Jährliche Grundvergütungslücke',annual_variable_gap:'Jährliche variable Entgeltlücke',annual_median_variable_gap:'Mediane jährliche variable Entgeltlücke',male_variable_receivers:'Anteil mit variabler Vergütung (M)',female_variable_receivers:'Anteil mit variabler Vergütung (F)' },
  SI: { base_gap:'Vrzel osnovnega plačila (ura)',variable_gap:'Vrzel variabilnega plačila (ura)',median_variable_gap:'Mediana variabilne vrzeli (ura)',annual_mean_gap:'Povprečna letna plačna vrzel',annual_median_gap:'Mediana letne plačne vrzeli',annual_base_gap:'Letna vrzel osnovnega plačila',annual_variable_gap:'Letna vrzel variabilnega plačila',annual_median_variable_gap:'Mediana letne variabilne vrzeli',male_variable_receivers:'Delež z variabilnim plačilom (M)',female_variable_receivers:'Delež z variabilnim plačilom (Ž)' },
};
fieldLabels.AT = fieldLabels.DE;
const percent = n => n === null ? '—' : `${n.toFixed(2)} %`;
const statusLabel=(company,snapshot)=>snapshot.prepared ? company.country==='SI'?'PRIPRAVLJENO DELOVNO POROČILO · Uradna shema ni potrjena':'VORBEREITETER ARBEITSBERICHT · Amtliches Schema nicht validiert' : labels[company.country].draft;
function workflowEntries(snapshot) {
  if (!snapshot.workflow?.snapshotId || !['internal',undefined].includes(snapshot.audience)) return [];
  const flatten=(value,prefix='')=>Object.entries(value).flatMap(([key,v])=>v && typeof v==='object' ? flatten(v,`${prefix}${key}.`) : [[`${prefix}${key}`,v]]);
  return flatten(snapshot.workflow);
}
export function reportText(company, snapshot) {
  const t = labels[company.country], a = analyze(snapshot.rows);
  const fields = fieldLabels[company.country];
  const groups=['internal','workers','authority'].includes(snapshot.audience || 'internal') ? a.groups : [];
  const si=company.country==='SI', w=snapshot.workflow;
  const annex=snapshot.audience && snapshot.audience!=='internal' || !w?.snapshotId ? [] : [
    '',si?'DOKUMENTIRAN PREGLED':'DOKUMENTIERTE PRÜFUNG',
    `${si?'Pravna oseba':'Rechtliche Einheit'}: ${w.profile.legalName}`,
    `${si?'Potrjeno število zaposlenih':'Bestätigte Beschäftigtenzahl'}: ${w.profile.headcount}`,
    `${si?'Preverjena popolnost':'Vollständigkeit geprüft'}: ${w.profile.payrollComplete}`,
    ...a.groups.flatMap(g=>[`${t.group}: ${g.category}`,...Object.entries(w.classification[g.category] || {}).map(([k,v])=>`${k}: ${v}`),...Object.entries(w.reviews[g.category] || {}).map(([k,v])=>`${k}: ${v}`)]),
    `${si?'Potrjuje vodstvo':'Bestätigende Leitung'}: ${w.approval.manager}`,
    `${si?'Posvetovanje':'Konsultation'}: ${w.approval.representatives}`,
    `${si?'Potrditev':'Bestätigung'}: ${w.approval.confirmed}; ${si?'Posvetovanje dokumentirano':'Konsultation dokumentiert'}: ${w.approval.consulted}`,
    `${si?'Datum oddaje (navedba uporabnika)':'Meldedatum (Angabe des Nutzers)'}: ${w.reportingDate || '—'}`,
    ...readiness(w,a,snapshot).assessments.map(r=>`${r.category}: ${si?'Šestmesečni rok':'Sechsmonatsfrist'} ${r.deadline || '—'}; ${si?'Preverite skupno oceno':'Gemeinsame Bewertung prüfen'}: ${r.jointAssessmentRequired}`),
  ];
  return [t.title, statusLabel(company,snapshot), company.name, `${t.year}: ${snapshot.reporting_year}`, `Snapshot: ${snapshot.id}`, `Audience: ${snapshot.audience || 'internal'}`, `Rules: ${regulatory.version}`, `${t.count}: ${a.count}`, '', 'ARTICLE 9(1) · Directive (EU) 2023/970', ...art9(company,snapshot,a).filter(i=>i.letter!=='g').flatMap(i=>[`(${i.letter}) ${i.title}`,...(Array.isArray(i.values)?i.values.map(v=>`    Q${v.quartile}: M=${percent(v.male_percent)} F=${percent(v.female_percent)} (n=${v.count})`):Object.entries(i.values).map(([k,v])=>`    ${k}: ${percent(v)}`))]), '', `${t.mean}: ${percent(a.mean_gap)}`, `${t.median}: ${percent(a.median_gap)}`, ...Object.entries(fields).map(([key,label])=>`${label}: ${percent(a[key])}`), '', ...groups.map(g => `${t.group}: ${g.category} | n=${g.count}\n${t.mean}: ${percent(g.mean_gap)} | ${fields.base_gap}: ${percent(g.base_gap)} | ${fields.variable_gap}: ${percent(g.variable_gap)}\n${fields.annual_base_gap}: ${percent(g.annual_base_gap)} | ${fields.annual_variable_gap}: ${percent(g.annual_variable_gap)}`), '', ...a.quartiles.map(q => `Q${q.quartile}: M=${percent(q.male_percent)} F=${percent(q.female_percent)}`), '', t.note, `Method: ${a.methodology}`, si?'Uradni nacionalni kanal in shema nista preverjena. Dokument ni potrdilo uradne oddaje.':'Nationaler Meldekanal und amtliches Schema sind nicht verifiziert. Dieses Dokument bestätigt keine amtliche Einreichung.', regulatory.source,...annex].join('\n');
}
// Prefix spreadsheet formula characters even inside quoted CSV cells.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
export function reportCsv(company, snapshot) {
  const a = analyze(snapshot.rows);
  const header = ['status','country','year','snapshot','category','count','mean_gap_hourly','median_gap_hourly','base_gap_hourly','variable_gap_hourly','median_variable_gap_hourly','annual_mean_gap','annual_median_gap','annual_base_gap','annual_variable_gap','annual_median_variable_gap','male_variable_receivers_percent','female_variable_receivers_percent'];
  const rows = [{ category: 'ALL', ...a }, ...(['internal','workers','authority'].includes(snapshot.audience || 'internal')?a.groups:[])];
  const records = [header, ...rows.map(g => [snapshot.prepared?'PREPARED_INTERNAL_UNVERIFIED':'DRAFT_UNVERIFIED',company.country,snapshot.reporting_year,snapshot.id,g.category,g.count,g.mean_gap,g.median_gap,g.base_gap,g.variable_gap,g.median_variable_gap,g.annual_mean_gap,g.annual_median_gap,g.annual_base_gap,g.annual_variable_gap,g.annual_median_variable_gap,g.male_variable_receivers,g.female_variable_receivers])];
  records.push([], ['quartile','count','male_percent','female_percent'], ...a.quartiles.map(q => [q.quartile,q.count,q.male_percent,q.female_percent]));
  records.push([], ['art9_letter','reference','indicator','item','metric','value'], ...article9Rows(art9(company,snapshot,a)));
  if (workflowEntries(snapshot).length) records.push([],['review_field','value'],...workflowEntries(snapshot));
  return '\uFEFF' + records.map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function reportData(company,snapshot) {
  const analysis=analyze(snapshot.rows),audience=snapshot.audience||'internal';
  const {groups,review_count,...summary}=analysis;
  return {schema:'urn:equitensa:internal:report:v1',status:snapshot.prepared?'PREPARED_INTERNAL_UNVERIFIED':'DRAFT_UNVERIFIED',company:{name:company.name,country:company.country},reportingYear:snapshot.reporting_year,snapshotId:snapshot.id,rulesVersion:regulatory.version,source:regulatory.source,officialSubmission:false,methodology:analysis.methodology,summary,article9:art9(company,snapshot,analysis),
    ...(['internal','workers','authority'].includes(audience)?{groups}:{}),audience,
    ...(audience==='internal'?{review:workflowEntries(snapshot)}:{}),
  };
}
export function reportJson(company,snapshot) {return JSON.stringify(reportData(company,snapshot),null,2);}
export function reportXlsx(company,snapshot) {
  const data=reportData(company,snapshot),book=XLSX.utils.book_new();
  const append=(name,rows)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
  append('Report',[['field','value'],...Object.entries(data).filter(([key])=>!['summary','groups','review'].includes(key)).map(([key,value])=>[key,typeof value==='object'?JSON.stringify(value):value])]);
  append('Article 9',[['letter','reference','indicator','item','metric','value'],...article9Rows(data.article9)]);
  append('Indicators',[['indicator','value'],...Object.entries(data.summary).filter(([key])=>!['quartiles','methodology'].includes(key))]);
  append('Quartiles',[['quartile','count','suppressed','male_percent','female_percent'],...data.summary.quartiles.map(q=>[q.quartile,q.count,q.suppressed,q.male_percent,q.female_percent])]);
  if(data.groups?.length){const columns=Object.keys(data.groups[0]);append('Categories',[columns,...data.groups.map(g=>columns.map(c=>g[c]))]);}
  if(data.review?.length)append('Review',[['field','value'],...data.review]);
  // aoa_to_sheet writes text cells as strings; never construct formula objects from user input.
  return XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true});
}
export function reportXml(company, snapshot) {
  const escape = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
  const a = analyze(snapshot.rows);
  const metric = (name, n) => n === null ? `<${name} suppressed="true"/>` : `<${name}>${n}</${name}>`;
  const metrics = g => ['mean_gap','median_gap','base_gap','variable_gap','median_variable_gap','annual_mean_gap','annual_median_gap','annual_base_gap','annual_variable_gap','annual_median_variable_gap','male_variable_receivers','female_variable_receivers'].map(k => metric(k,g[k])).join('');
  // Explicit internal namespace: no invented AJPES schema or official submission claim.
  const groups=['internal','workers','authority'].includes(snapshot.audience || 'internal')?a.groups:[];
  const review=workflowEntries(snapshot).map(([k,v])=>`<Field name="${escape(k)}">${escape(v ?? '')}</Field>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<PayTransparencyDraft xmlns="urn:equitensa:internal:draft:v1" status="${snapshot.prepared ? 'PREPARED_INTERNAL_UNVERIFIED' : 'DRAFT_UNVERIFIED'}" country="${company.country}" year="${snapshot.reporting_year}" audience="${snapshot.audience || 'internal'}"><Company>${escape(company.name)}</Company><Snapshot>${snapshot.id}</Snapshot><Overall count="${a.count}">${metrics(a)}</Overall><Categories>${groups.map(g => `<Category name="${escape(g.category)}" count="${g.count}">${metrics(g)}</Category>`).join('')}</Categories><Quartiles>${a.quartiles.map(q => `<Quartile number="${q.quartile}" count="${q.count}">${metric('male_percent',q.male_percent)}${metric('female_percent',q.female_percent)}</Quartile>`).join('')}</Quartiles>${review ? `<ReviewDocumentation>${review}</ReviewDocumentation>` : ''}</PayTransparencyDraft>`;
}
export function reportPdf(company, snapshot) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48,bufferPages:true,info:{Title:`Equitensa ${company.country} ${snapshot.reporting_year}`,Author:company.name} }), chunks = [];
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const fontPath = [process.env.PDF_FONT_PATH, 'C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(path => path && existsSync(path));
    if (!fontPath) { doc.destroy(); reject(new Error('PDF_FONT_REQUIRED')); return; }
    const a=analyze(snapshot.rows),si=company.country==='SI';
    doc.font(fontPath).fillColor('#6951db').fontSize(21).text('equitensa');
    doc.moveDown(2).fillColor('#867393').fontSize(9).text('EU 2023/970 · PAY TRANSPARENCY');
    doc.moveDown(1).fillColor('#292332').fontSize(30).text(si?'Preglednost plačil':'Entgelttransparenz');
    doc.fontSize(19).fillColor('#6951db').text(String(snapshot.reporting_year));
    doc.moveDown(1).fontSize(13).fillColor('#51465c').text(company.name);
    doc.moveDown(1).fontSize(9).fillColor('#9d7892').text(statusLabel(company,snapshot));
    doc.moveDown(2).fontSize(11).fillColor('#51465c').text(`${a.count} ${labels[company.country].count} · ${company.country}`);
    const y=doc.y+28;
    [[labels[company.country].mean,percent(a.mean_gap)],[labels[company.country].median,percent(a.median_gap)]].forEach(([label,value],i)=>{const x=48+i*252;doc.roundedRect(x,y,238,105,10).fill('#f3eef9');doc.fillColor('#8a739d').fontSize(9).text(label,x+17,y+18,{width:200});doc.fillColor('#6951db').fontSize(26).text(value,x+17,y+48);});
    doc.fillColor('#8a739d').fontSize(9).text(`Snapshot: ${snapshot.id}\nAudience: ${snapshot.audience || 'internal'}\nRules: ${regulatory.version}\n${si?'Brez potrdila o uradni oddaji':'Keine Bestätigung einer amtlichen Einreichung'}`,48,y+145,{lineGap:6});
    doc.addPage().fontSize(10).fillColor('#51465c').text(reportText(company,snapshot),48,48,{lineGap:5});
    const range=doc.bufferedPageRange();
    for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.fontSize(8).fillColor('#a092af').text(`Equitensa · ${snapshot.reporting_year} · ${i+1} / ${range.count}`,48,798,{lineBreak:false});}
    doc.end();
  });
}
