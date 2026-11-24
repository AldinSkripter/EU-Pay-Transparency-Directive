import { randomUUID } from 'node:crypto';
import { employerControls, directiveArticles } from '../shared/employer-controls.js';
import { regulatory } from './regulatory.js';
import { reportLanguage } from './report-i18n.js';
import { renderText, renderHtml, renderPdf } from './document-render.js';

const text = (v, max=3000) => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v) ? v.trim() : '';
const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const key = year => `employer_controls_${year}`;
export function validateControls(input, snapshot) {
  if (!snapshot || input?.snapshotId !== snapshot.id) throw new Error('SNAPSHOT_CHANGED');
  const today = new Date().toISOString().slice(0,10);
  return { snapshotId:snapshot.id, records:Object.fromEntries(employerControls.map(control => {
    const entry=input.records?.[control.id] || {}, status=['open','recorded','not_applicable'].includes(entry.status) ? entry.status : 'open';
    if (status === 'not_applicable' && !control.optional) throw new Error('INVALID_CONTROL');
    const result={status, owner:text(entry.owner,255), reviewedOn:validDate(entry.reviewedOn) ? entry.reviewedOn : '', evidence:text(entry.evidence), action:text(entry.action), due:validDate(entry.due) ? entry.due : ''};
    if (status !== 'open' && (!result.owner || !result.reviewedOn || result.reviewedOn > today || !result.evidence)) throw new Error('CONTROL_EVIDENCE_REQUIRED');
    return [control.id,result];
  })) };
}
export function controlState(document, snapshotId, today=new Date().toISOString().slice(0,10)) {
  const stale=!!document?.snapshotId && document.snapshotId !== snapshotId;
  const records=employerControls.map(control=>{
    const record=document?.records?.[control.id];
    return {id:control.id, articles:control.articles, status:stale?'stale':record?.status || 'open', overdue:!!record?.due && record.due < today && record.status==='open'};
  });
  return {stale, records, missing:records.filter(r=>!['recorded','not_applicable'].includes(r.status)).map(r=>r.id), independentlyVerified:false};
}
export function controlSections(document, language, snapshotId) {
  const sl=language==='sl', state=controlState(document,snapshotId);
  const status=value=>({open:sl?'Odprto':'Offen',stale:sl?'Zastarelo':'Veraltet',recorded:sl?'Dokazilo vneseno – ni neodvisno preverjeno':'Nachweis erfasst – nicht unabhängig geprüft',not_applicable:sl?'Se ne uporablja (utemeljitev delodajalca)':'Nicht anwendbar (Arbeitgeberbegründung)'})[value];
  return [{id:'employer-obligations',title:sl?'Dokazila delodajalca izven izračuna plač':'Arbeitgebernachweise über die Entgeltberechnung hinaus', paragraphs:[sl?'Vnosi so izjave in reference delodajalca, ne neodvisna pravna preveritev. Odprta in zastarela dokazila so prikazana tudi v izvozu.':'Einträge sind Angaben und Referenzen des Arbeitgebers, keine unabhängige Rechtsprüfung. Offene und veraltete Nachweise bleiben auch im Export sichtbar.'], table:{head:[sl?'Obveznost':'Pflicht',sl?'Stanje':'Stand'],rows:employerControls.map(c=>[`${c[language]} · Art. ${c.articles.join(', ')}`,status(state.records.find(r=>r.id===c.id).status)])}},
    ...employerControls.map(c=>{const r=document?.records?.[c.id] || {};return {id:`control-${c.id}`,title:`${c[language]} · Art. ${c.articles.join(', ')}`,items:[[sl?'Odgovorna oseba':'Verantwortlich',r.owner||'—'],[sl?'Pregledano dne':'Geprüft am',r.reviewedOn||'—'],[sl?'Dokazila / reference':'Nachweise / Referenzen',r.evidence||'—'],[sl?'Odprti ukrepi':'Offene Maßnahmen',r.action||'—'],[sl?'Rok':'Frist',r.due||'—']]};}),
    ...(document?.retentionPolicy?[{id:'retention-policy',title:sl?'Politika hrambe podatkov':'Aufbewahrungsrichtlinie',items:[
      [sl?'Namen':'Zweck',document.retentionPolicy.purpose],[sl?'Pravna podlaga':'Rechtsgrundlage',document.retentionPolicy.legalBasis],[sl?'Meseci od konca leta':'Monate ab Jahresende',String(document.retentionPolicy.retentionMonths)],[sl?'Odgovorna oseba':'Verantwortlich',document.retentionPolicy.owner],[sl?'Pregledano dne':'Geprüft am',document.retentionPolicy.reviewedOn],[sl?'Kopije in prejemniki':'Backups und Empfänger',document.retentionPolicy.backupProcedure],
    ],paragraphs:document.retentionPolicy.holds.map(h=>`${h.year}: ${h.reason}`)}]:[]),
    articleOverview(language),
  ];
}
function articleOverview(language){const sl=language==='sl';return {id:'all-articles',title:sl?'Vseh 37 členov':'Alle 37 Artikel',table:{head:['Art.',sl?'Vsebina':'Inhalt',sl?'Izvajalec / vrsta':'Zuständigkeit / Art'],rows:directiveArticles.map(a=>[String(a.article),a[language],{framework:sl?'Pravni okvir':'Rechtsrahmen',institutional:sl?'Država / institucije':'Staat / Institutionen',enforcement:sl?'Pravno varstvo; sodelovanje delodajalca':'Rechtsschutz; Mitwirkung des Arbeitgebers',employer:sl?'Obveznost delodajalca':'Arbeitgeberpflicht'}[a.role]])}};}
export function controlsDocument(company,year,document,snapshotId) {
  const language=reportLanguage(company.country),sl=language==='sl';
  return {language,title:sl?'Pregled členov in dokazil delodajalca':'Artikelübersicht und Arbeitgebernachweise',subtitle:`Richtlinie / Direktiva (EU) 2023/970 · ${company.name} · ${company.country} · ${year}`, status:sl?'EVIDENCA DELODAJALCA – NI POTRDILO SKLADNOSTI':'ARBEITGEBERREGISTER – KEINE KONFORMITÄTSBESTÄTIGUNG',sections:[
    {id:'source',title:null,paragraphs:[regulatory.source,sl?'Vseh 37 členov je prikazanih. Izračun plač, izvedba obveznosti delodajalca in ukrepi države oziroma sodišča so ločene naloge.':'Alle 37 Artikel sind aufgeführt. Entgeltberechnung, tatsächliche Arbeitgeberpflichten und Aufgaben von Staat beziehungsweise Gerichten sind getrennte Aufgaben.']},
    ...controlSections(document,language,snapshotId),
  ]};
}
export function employerControlRoutes(app,{store,yearValue}) {
  app.get('/api/employer-controls',async(req,res)=>{
    const year=yearValue(req.query.year),company=req.session.company,snapshot=await store.latestSnapshot(company.id,year),document=await store.companyDocument(company.id,key(year));
    res.json({year,snapshotId:snapshot?.id||null,document:document||{snapshotId:snapshot?.id||null,records:{}},state:controlState(document,snapshot?.id),articles:directiveArticles});
  });
  app.post('/api/employer-controls',async(req,res)=>{
    const year=yearValue(req.body.year),company=req.session.company,snapshot=await store.latestSnapshot(company.id,year);
    let document;
    try{document=validateControls(req.body.document,snapshot);}catch(e){return res.status(e.message==='SNAPSHOT_CHANGED'?409:422).json({error:e.message});}
    document.recordId=randomUUID();document.savedOn=new Date().toISOString();
    await store.saveCompanyDocument(company.id,key(year),document);
    await store.audit(company.id,'employer_evidence_saved',{year,snapshot_id:snapshot.id,record_id:document.recordId,user_id:req.session.user.id});
    res.json({document,state:controlState(document,snapshot.id)});
  });
  app.get('/api/employer-controls/:format',async(req,res)=>{
    const format=req.params.format;if(!['json','txt','html','pdf'].includes(format))return res.status(400).json({error:'INVALID_FORMAT'});
    const year=yearValue(req.query.year),company=req.session.company,snapshot=await store.latestSnapshot(company.id,year),document=await store.companyDocument(company.id,key(year));
    const state=controlState(document,snapshot?.id);
    await store.audit(company.id,'employer_evidence_exported',{year,format,record_id:document?.recordId||null,user_id:req.session.user.id});
    res.setHeader('Content-Disposition',`attachment; filename="equitensa-employer-evidence-${company.country}-${year}.${format}"`);
    if(format==='json')return res.json({company:{name:company.name,country:company.country},year,document,retentionPolicy:await store.companyDocument(company.id,'data_retention'),state,articles:directiveArticles,source:regulatory.source});
    const doc=controlsDocument(company,year,{...document,retentionPolicy:await store.companyDocument(company.id,'data_retention')},snapshot?.id);
    const output=format==='txt'?renderText(doc):format==='html'?renderHtml(doc,{lang:doc.language,title:doc.title}):await renderPdf(doc,{author:company.name,title:doc.title});
    res.type({txt:'text/plain',html:'text/html',pdf:'application/pdf'}[format]).send(output);
  });
}
