import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {paymentQr,drawQr,urlMatrix,svgData} from './finance-qr.js';
import {rateLimit} from 'express-rate-limit';
import PDFDocument from 'pdfkit';
import {existsSync} from 'node:fs';
import {financeCountries} from '../shared/finance-country.js';
import {isContactCountry} from '../shared/contact-countries.js';
import {taxProblems,taxNotice,taxTreatments,zeroTax,taxCategory,availableTaxTreatments,taxEvidenceFields} from '../shared/finance-tax.js';
import {financePlans,financeQuote,financeHasFeature,financeRouteFeature} from '../shared/finance-plans.js';
import {parseFinanceBankCsv} from './finance-bank.js';
import {FinanceFileVault,validateFinanceAttachment} from './finance-files.js';
import {financeArchive} from './finance-archive.js';
import {financeReceivables,receivablesCsv} from '../shared/finance-receivables.js';
import {updateOfferTracking} from '../shared/finance-offers.js';
import {readFinanceReceipt} from './finance-document-reader.js';
import {columnOptions,defaultColumns,invoiceColumns,invoiceCell,invoiceDescription} from '../shared/invoice-columns.js';
import {validatedEinvoice,einvoiceProfiles,validatorAvailable,einvoiceProblems} from './finance-einvoice.js';
import {originalFiles,invoiceEmail,invoiceBundle,recordExternalDelivery} from './finance-delivery.js';

const fail=(code,status=400,fields=[])=>{throw Object.assign(new Error(code),{status,fields});};
const text=(value,max=255)=>{if(typeof value!=='string'||value.length>max)fail('FINANCE_INVALID_INPUT');return value.trim();};
const date=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('FINANCE_INVALID_DATE');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)fail('FINANCE_INVALID_DATE');return value;};
const today=()=>new Date().toISOString().slice(0,10);
const round=(a,b)=>(a+b/2n)/b;
function decimal(value,scale){
  if(typeof value!=='string'||!new RegExp(`^\\d{1,8}(?:[.,]\\d{1,${scale}})?$`).test(value))fail('FINANCE_INVALID_AMOUNT');
  const [whole,fraction='']=value.replace(',','.').split('.');return BigInt(whole)*10n**BigInt(scale)+BigInt(fraction.padEnd(scale,'0'));
}
function safe(value){const n=Number(value);if(!Number.isSafeInteger(n)||n>100000000000)fail('FINANCE_AMOUNT_LIMIT');return n;}
export function calculateFinance(lines,country,taxTreatment='domestic'){
  if(!taxTreatments.includes(taxTreatment))fail('FINANCE_INVALID_INPUT');
  if(!financeCountries[country]||!Array.isArray(lines)||!lines.length||lines.length>100)fail('FINANCE_INVALID_LINES');
  const totals=new Map();
  const items=lines.map(line=>{
    const description=text(line.description,500),unit=text(line.unit||'Stk.',20);
    if(!description||!(zeroTax({taxTreatment})?line.rate==='0':financeCountries[country].rates.includes(line.rate)))fail('FINANCE_INVALID_LINES');
    const quantity=decimal(line.quantity,4),unitCents=decimal(line.unitPrice,2);
    if(quantity<=0n)fail('FINANCE_INVALID_AMOUNT');
    const discount=decimal(line.discountPercent??'0',2);
    if(discount>10000n)fail('FINANCE_INVALID_AMOUNT');
    const subtotal=round(quantity*unitCents,10000n);
    const discountCents=round(subtotal*discount,10000n);
    const net=subtotal-discountCents,rate=decimal(line.rate,2);
    totals.set(line.rate,(totals.get(line.rate)||0n)+net);
    return {description,unit,quantity:line.quantity.replace(',','.'),unitPrice:line.unitPrice.replace(',','.'),rate:line.rate,discountPercent:(line.discountPercent??'0').replace(',','.'),discountCents:safe(discountCents),netCents:safe(net)};
  });
  const taxes=[...totals].map(([rate,net])=>({rate,netCents:safe(net),taxCents:safe(round(net*decimal(rate,2),10000n))}));
  const netCents=taxes.reduce((s,t)=>s+t.netCents,0),taxCents=taxes.reduce((s,t)=>s+t.taxCents,0);
  safe(BigInt(netCents+taxCents));
  return {lines:items,taxes,netCents,taxCents,grossCents:netCents+taxCents,currency:'EUR',rounding:'net per line, VAT per rate group; half up'};
}
export const financeInitial=company=>({revision:0,country:company.country,countryConfirmed:false,profile:{name:company.name,address:'',postalCode:'',city:'',taxId:'',vatId:'',iban:'',email:'',logo:'',accent:'#7451f8',footer:''},contacts:[],documents:[],expenses:[],sequence:{},subscription:null,events:[]});
export function validateFinanceProfile(body,country){
  if(body.country!==country||body.confirmCountry!==true)fail('FINANCE_COUNTRY_MISMATCH');
  const profile=Object.fromEntries(['name','address','postalCode','city','taxId','vatId','iban','email','footer'].map(k=>[k,text(body[k]||'',k==='footer'?1000:255)]));
  if(!profile.name)fail('FINANCE_INVALID_INPUT');
  if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))fail('FINANCE_INVALID_INPUT');
  if(profile.iban){const iban=profile.iban.replace(/\s/g,'').toUpperCase();if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban))fail('FINANCE_INVALID_IBAN');const expanded=(iban.slice(4)+iban.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));if(BigInt(expanded)%97n!==1n)fail('FINANCE_INVALID_IBAN');profile.iban=iban;}
  const accent=body.accent||'#7451f8';if(!/^#[a-f0-9]{6}$/i.test(accent))fail('FINANCE_INVALID_INPUT');profile.accent=accent;
  const logo=body.logo||'';
  if(logo){
    if(typeof logo!=='string'||logo.length>360000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(logo))fail('FINANCE_INVALID_LOGO');
    const raw=Buffer.from(logo.split(',')[1],'base64');
    if(raw.length>250000||!(logo.startsWith('data:image/png')?raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):raw[0]===255&&raw[1]===216&&raw[2]===255))fail('FINANCE_INVALID_LOGO');
    if(logo.startsWith('data:image/png')&&(raw.length<24||raw.readUInt32BE(16)>4096||raw.readUInt32BE(20)>4096))fail('FINANCE_INVALID_LOGO');
    try{const doc=new PDFDocument({autoFirstPage:false});doc.resume();const parsed=doc.openImage(raw);doc.end();if(parsed.width>4096||parsed.height>4096)fail('FINANCE_INVALID_LOGO');}catch{fail('FINANCE_INVALID_LOGO');}
  }
  profile.logo=logo;
  const design=body.design||{};
  const choices={template:['signature','minimal','editorial','business'],font:['sans','serif','mono'],density:['comfortable','compact'],logoPosition:['right','left'],tableStyle:['soft','plain','contrast'],titleAlign:['left','center','right']};
  profile.design={};
  const columns=design.columns??defaultColumns;
  if(!Array.isArray(columns)||columns.length>7||new Set(columns).size!==columns.length||!columns.includes('description')||!columns.includes('total')||columns.some(k=>!columnOptions.some(c=>c[0]===k)))fail('FINANCE_INVALID_INPUT');
  profile.design.columns=[...columns];
  for(const [key,values] of Object.entries(choices)){const value=design[key]||values[0];if(!values.includes(value))fail('FINANCE_INVALID_INPUT');profile.design[key]=value;}
  for(const [key,fallback] of Object.entries({textColor:'#272238',surfaceColor:'#f4f1fc'})){const value=design[key]||fallback;if(!/^#[a-f0-9]{6}$/i.test(value))fail('FINANCE_INVALID_INPUT');profile.design[key]=value;}
  for(const [key,min,max,fallback] of [['fontSize',9,13,10],['logoWidth',50,150,100],['pageMargin',30,60,45]]){const value=design[key]??fallback;if(!Number.isInteger(value)||value<min||value>max)fail('FINANCE_INVALID_INPUT');profile.design[key]=value;}
  profile.design.invoiceTitle=text(design.invoiceTitle||'',60);profile.design.offerTitle=text(design.offerTitle||'',60);
  if(design.paymentQr!==undefined&&typeof design.paymentQr!=='boolean')fail('FINANCE_INVALID_INPUT');
  profile.design.paymentQr=design.paymentQr===true;
  if(design.qrPosition!==undefined&&!['left','right'].includes(design.qrPosition))fail('FINANCE_INVALID_INPUT');
  profile.design.qrPosition=design.qrPosition||'right';
  const titleSize=design.titleSize??24;if(!Number.isInteger(titleSize)||titleSize<18||titleSize>36)fail('FINANCE_INVALID_INPUT');profile.design.titleSize=titleSize;
  if(design.blocks!==undefined&&(!Array.isArray(design.blocks)||design.blocks.length>8))fail('FINANCE_INVALID_INPUT');
  profile.design.blocks=(design.blocks||[]).map(block=>{if(!block||!['intro','afterItems','closing'].includes(block.position))fail('FINANCE_INVALID_INPUT');return {heading:text(block.heading||'',80),body:text(block.body||'',1200),position:block.position};});
  return profile;
}
function draft(body,state){
  const contact=state.contacts.find(c=>c.id===body.contactId);if(!contact)fail('FINANCE_CONTACT_REQUIRED');
  const kind=body.kind==='offer'?'offer':body.kind==='invoice'?'invoice':null;if(!kind)fail('FINANCE_INVALID_INPUT');
  const issueDate=date(body.issueDate),serviceDate=date(body.serviceDate),dueDate=date(body.dueDate);
  if(dueDate<issueDate)fail('FINANCE_INVALID_DATE');
  if(state.country==='AT'&&Array.isArray(body.lines)&&body.lines.some(l=>l.rate==='4.9')&&serviceDate<'2026-07-01')fail('FINANCE_RATE_DATE_UNSUPPORTED');
  let appearance=null;
  if(body.appearance!=null){const validated=validateFinanceProfile({...state.profile,country:state.country,confirmCountry:true,accent:body.appearance.accent,design:body.appearance.design},state.country);appearance={accent:validated.accent,design:validated.design};}
  const einvoice={contactName:text(body.einvoice?.contactName||'',100),contactPhone:text(body.einvoice?.contactPhone||'',50)};
  const taxTreatment=body.taxTreatment||'domestic';
  const taxEvidence={generalRuleConfirmed:body.taxEvidence?.generalRuleConfirmed===true,vatVerified:body.taxEvidence?.vatVerified===true,reference:text(body.taxEvidence?.reference||'',255),checkedOn:body.taxEvidence?.checkedOn?date(body.taxEvidence.checkedOn):'',smallBusinessConfirmed:body.taxEvidence?.smallBusinessConfirmed===true,localVatConfirmed:body.taxEvidence?.localVatConfirmed===true,goodsConditionsConfirmed:body.taxEvidence?.goodsConditionsConfirmed===true,reportingConfirmed:body.taxEvidence?.reportingConfirmed===true,transportReference:text(body.taxEvidence?.transportReference||'',255),destinationCountry:text(body.taxEvidence?.destinationCountry||'',2),businessEvidence:text(body.taxEvidence?.businessEvidence||'',255)};
  return {kind,contactId:contact.id,customer:structuredClone(contact),issueDate,serviceDate,dueDate,einvoice,taxTreatment,taxEvidence,taxNotice:taxNotice(state.country,taxTreatment),reference:text(body.reference||'',120),note:text(body.note||'',1000),paymentMethod:'bank_transfer',appearance,...calculateFinance(body.lines,state.country,taxTreatment)};
}
export function issuanceProblems(state,doc){
  const missing=[];
  if(!state.countryConfirmed)missing.push('country');
  for(const key of ['name','address','postalCode','city','iban'])if(!state.profile[key])missing.push('issuer.'+key);
  if(doc.taxTreatment!=='small_business'&&!state.profile.vatId&&!(state.country==='DE'&&state.profile.taxId))missing.push('issuer.vatId');
  const vatPattern={DE:/^DE\d{9}$/,AT:/^ATU\d{8}$/,SI:/^SI\d{8}$/};
  if(state.profile.vatId&&!vatPattern[state.country].test(state.profile.vatId))missing.push('issuer.vatId_format');
  for(const key of ['name','address','postalCode','city'])if(!doc.customer[key])missing.push('customer.'+key);
  missing.push(...taxProblems(doc,state.profile,state.country));
  if(doc.taxTreatment!=='small_business'&&state.country==='AT'&&doc.customer.business&&doc.customer.country===state.country&&doc.grossCents>1000000&&!doc.customer.vatId)missing.push('customer.vatId');
  if(doc.customer.vatId&&doc.customer.country===state.country&&!vatPattern[state.country].test(doc.customer.vatId))missing.push('customer.vatId_format');
  if(doc.taxTreatment!=='small_business'&&state.country==='DE'&&doc.customer.business&&doc.customer.country===state.country&&doc.kind==='invoice')missing.push('structured_einvoice_not_yet_validated');
  // Slovenia: only bank transfer and private-sector domestic business invoices.
  if(doc.customer.publicBody)missing.push('private_domestic_b2b_only');
  if(doc.issueDate>today())missing.push('future_issue_date');
  if(state.country==='SI'&&doc.kind==='invoice'&&doc.issueDate>='2028-01-01')missing.push('structured_einvoice_not_yet_validated');
  return missing;
}
function log(state,actor,action,id){state.revision++;state.events.push({at:new Date().toISOString(),actor,action,id});if(state.events.length>1000)state.events.shift();}
function contactFields(body){
  const fields=Object.fromEntries(['name','address','postalCode','city','vatId','email'].map(k=>[k,text(body[k]||'')]));
  if(!fields.name||!isContactCountry(body.country)||(fields.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)))fail('FINANCE_INVALID_INPUT');
  return {...fields,country:body.country,business:body.business===true,publicBody:body.publicBody===true};
}
function csvCell(value){const s=String(value??'');return '"'+(/^[\s]*[=+@-]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
function expenseFields(body,state,id){
  const supplier=text(body.supplier),reference=text(body.reference),incurredOn=date(body.incurredOn),amountCents=safe(decimal(body.amount,2)),category=body.category||'other';
  if(!supplier||!reference||amountCents<=0||incurredOn>today()||!['software','office','travel','services','other'].includes(category))fail('FINANCE_INVALID_INPUT');
  if(state.expenses.some(e=>e.id!==id&&e.supplier.toLowerCase()===supplier.toLowerCase()&&e.reference===reference))fail('FINANCE_DUPLICATE_EXPENSE',409);
  return {supplier,reference,incurredOn,amountCents,category,currency:'EUR',status:'recorded',note:text(body.note||'',1000)};
}
export function financeRoutes(app,{store,demo,accountKey,control}){
  const vault=new FinanceFileVault({key:accountKey,demo});
  // Existing HR sessions do not grant production Finance permissions. The module
  // stays closed outside isolated demos until its own roles/entitlements ship.
  app.use('/api/finance',(req,res,next)=>demo?next():res.status(503).json({error:'FINANCE_RELEASE_NOT_ENABLED'}));
  const wrap=fn=>async(req,res,next)=>{try{const feature=financeRouteFeature(req.path,req.method);if(feature&&!financeHasFeature((await load(req)).subscription?.plan,feature))fail('FINANCE_PLAN_UPGRADE_REQUIRED',403);await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message,fields:e.fields});next(e);}};
  const load=req=>store.companyDocument(req.session.company.id,'finance_v1').then(s=>s||financeInitial(req.session.company));
  const mutate=(req,fn)=>store.mutateFinance(req.session.company.id,financeInitial(req.session.company),s=>{
    const feature=financeRouteFeature(req.path,req.method);if(feature&&!financeHasFeature(s.subscription?.plan,feature))fail('FINANCE_PLAN_UPGRADE_REQUIRED',403);
    if(!Number.isSafeInteger(req.body.revision)||req.body.revision!==s.revision)fail('FINANCE_VERSION_CONFLICT',409);
    const result=fn(s);log(s,req.session.user.id,req.path,result?.id||null);return {state:s,result};
  });
  app.get('/api/finance',wrap(async(req,res)=>{const state=await load(req);res.json({state,country:financeCountries[state.country],plans:financePlans,demo,stage:'development',capabilities:{recurringDrafts:true,bankCsv:true,reminderDrafts:true,structuredEInvoice:false,bankFeed:false,ocr:true,photoOcr:true,pdfOcr:true,structuredInvoiceDrafts:true,liveCheckout:false,teamInvitations:false}});}));
  app.post('/api/finance/settings',wrap(async(req,res)=>res.json(await mutate(req,s=>{s.profile=validateFinanceProfile(req.body,s.country);s.countryConfirmed=true;}))));
  app.post('/api/finance/designs',wrap(async(req,res)=>res.status(201).json(await mutate(req,s=>{
    s.designs??=[];if(s.designs.length>=30)fail('FINANCE_RECORD_LIMIT');
    const name=text(req.body.name,60);if(!name)fail('FINANCE_INVALID_INPUT');
    const brand=validateFinanceProfile({...s.profile,country:s.country,confirmCountry:true,accent:req.body.appearance?.accent,design:req.body.appearance?.design},s.country);
    const entry={id:randomUUID(),name,appearance:{accent:brand.accent,design:brand.design},createdAt:new Date().toISOString()};s.designs.push(entry);return entry;
  }))));
  app.post('/api/finance/designs/:id/remove',wrap(async(req,res)=>res.json(await mutate(req,s=>{
    const entry=(s.designs||[]).find(d=>d.id===req.params.id);if(!entry)fail('FINANCE_NOT_FOUND',404);
    s.designs=s.designs.filter(d=>d.id!==entry.id);return {id:entry.id};
  }))));
  app.get('/api/finance/tax-options',wrap(async(req,res)=>{
    const s=await load(req),buyer=s.contacts.find(c=>c.id===req.query.contactId);
    if(!buyer)fail('FINANCE_CONTACT_REQUIRED');
    res.set('Cache-Control','no-store').json({issuerCountry:s.country,customerCountry:buyer.country,currency:'EUR',productionEnabled:false,options:availableTaxTreatments(buyer,s.country).map(id=>({id,category:taxCategory({taxTreatment:id}),rates:zeroTax({taxTreatment:id})?['0']:financeCountries[s.country].rates,notice:taxNotice(s.country,id),requiredEvidence:taxEvidenceFields[id]}))});
  }));
  app.post('/api/finance/preview',wrap(async(req,res)=>{const state=await load(req);res.json({document:{...draft(req.body,state),status:'draft',number:null}});}));
  app.post('/api/finance/qr-preview',wrap(async(req,res)=>{
    const state=await load(req),document={...draft(req.body,state),status:'draft',demo:true};
    const issuer={...state.profile,...document.appearance};const qr=paymentQr(document,issuer,state.country);
    res.json({qr:qr?{image:qr.image,format:qr.format,testOnly:qr.testOnly}:null});
  }));
  app.post('/api/finance/documents/:id/share',wrap(async(req,res)=>res.json(await mutate(req,s=>{
    const d=s.documents.find(d=>d.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    if(req.body.enabled===false){delete d.share;return {id:d.id,revoked:true};}
    if(req.body.enabled!==true||![7,30,90].includes(req.body.days))fail('FINANCE_INVALID_INPUT');
    const token=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+req.body.days*86400000).toISOString();
    const origin=req.get('origin'); // Mutations have already passed the exact origin allowlist.
    const url=`${origin}/shared-finance/${req.session.company.id}/${d.id}/${token}`;
    const snapshot=structuredClone(d);delete snapshot.share;
    if(d.kind==='invoice')paymentQr(snapshot,d.issuer||{...s.profile,...d.appearance},s.country);
    d.share={tokenHash:createHash('sha256').update(token).digest('hex'),url,expiresAt,snapshot,issuer:structuredClone(d.issuer||{...s.profile,...d.appearance}),country:s.country};
    return {url,expiresAt,image:svgData(urlMatrix(url))};
  }))));
  // Deliberately outside /api: a narrow bearer link grants only its frozen PDF.
  app.get('/shared-finance/:company/:document/:token',rateLimit({windowMs:60000,limit:30,standardHeaders:true,legacyHeaders:false}),wrap(async(req,res)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});
    if(!demo)return res.status(503).send('FINANCE_RELEASE_NOT_ENABLED');
    const {company,document,token}=req.params;
    if(!/^[a-f0-9-]{36}$/.test(company)||!/^[a-f0-9-]{36}$/.test(document)||!/^[a-f0-9]{64}$/.test(token))return res.sendStatus(404);
    if(control&&(await control.read()).suspended[company])return res.sendStatus(404);
    const s=await store.companyDocument(company,'finance_v1'),share=s?.documents.find(d=>d.id===document)?.share;
    if(!share||Date.parse(share.expiresAt)<=Date.now()||!timingSafeEqual(Buffer.from(share.tokenHash,'hex'),createHash('sha256').update(token).digest()))return res.sendStatus(404);
    const original=share.snapshot.originals?.find(file=>file.extension==='pdf');
    const pdf=original?await vault.get(company,original):await financePdf(share.snapshot,share.issuer,share.country);
    res.type('pdf').set('Content-Disposition','inline; filename="equitensa-document.pdf"').send(pdf);
  }));
  app.post('/api/finance/expenses/:id/attachments',wrap(async(req,res)=>{
    const state=await load(req);if(!state.expenses.some(e=>e.id===req.params.id))fail('FINANCE_NOT_FOUND',404);
    if(state.revision!==req.body.revision)fail('FINANCE_VERSION_CONFLICT',409);
    if((state.attachments||[]).length>=50)fail('FINANCE_RECORD_LIMIT');
    const metadata=await vault.put(req.session.company.id,validateFinanceAttachment(req.body));
    try{const result=await mutate(req,s=>{if(!s.expenses.some(e=>e.id===req.params.id))fail('FINANCE_NOT_FOUND',404);s.attachments??=[];if(s.attachments.length>=50)fail('FINANCE_RECORD_LIMIT');const file={...metadata,expenseId:req.params.id,uploadedAt:new Date().toISOString(),uploadedBy:req.session.user.id};s.attachments.push(file);return file;});res.status(201).json(result);}catch(error){await vault.discard(req.session.company.id,metadata.id);throw error;}
  }));
  app.get('/api/finance/attachments/:id',wrap(async(req,res)=>{
    const s=await load(req),file=(s.attachments||[]).find(f=>f.id===req.params.id);if(!file)fail('FINANCE_NOT_FOUND',404);
    const bytes=await vault.get(req.session.company.id,file),filename=encodeURIComponent(file.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
    res.type('application/octet-stream').set({'Content-Disposition':`attachment; filename="receipt-${file.id}.${file.extension}"; filename*=UTF-8''${filename}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}).send(bytes);
  }));
  app.get('/api/finance/archive.zip',wrap(async(req,res)=>{
    const s=await load(req),companyId=req.session.company.id;
    async function* entries(){yield {name:'finance-data.json',bytes:Buffer.from(JSON.stringify(s,null,2))};for(const file of s.attachments||[]){const name=file.filename.replace(/[^\p{L}\p{N}._ -]/gu,'_');yield {name:`receipts/${file.id}-${name}`,bytes:await vault.get(companyId,file)};}for(const d of s.documents)for(const file of d.originals||[])yield {name:`issued/${d.id}/${file.filename}`,bytes:await vault.get(companyId,file)};}
    res.type('application/zip').set({'Content-Disposition':'attachment; filename="equitensa-finance-backup.zip"','Cache-Control':'no-store'});
    const write=async chunk=>{if(res.destroyed)throw Error('FINANCE_DOWNLOAD_CLOSED');if(res.write(chunk))return;await new Promise((resolve,reject)=>{const cleanup=()=>{res.off('drain',drain);res.off('close',closed);res.off('error',failed);};const drain=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(new Error('FINANCE_DOWNLOAD_CLOSED'));},failed=e=>{cleanup();reject(e);};res.once('drain',drain);res.once('close',closed);res.once('error',failed);});};
    await financeArchive(entries(),write);res.end();
  }));
  app.post('/api/finance/bank/preview',wrap(async(req,res)=>res.json({transactions:parseFinanceBankCsv(req.body)})));
  app.post('/api/finance/bank/import',wrap(async(req,res)=>res.status(201).json(await mutate(req,s=>{
    const rows=parseFinanceBankCsv(req.body);s.bankTransactions??=[];let imported=0,skipped=0;
    for(const row of rows){const old=s.bankTransactions.find(t=>t.id===row.id);if(old){if(old.amountCents!==row.amountCents||old.bookedOn!==row.bookedOn||old.description!==row.description)fail('FINANCE_BANK_CONFLICT',409);skipped++;continue;}if(s.bankTransactions.length>=2000)fail('FINANCE_RECORD_LIMIT');s.bankTransactions.push(row);imported++;}
    return {imported,skipped};
  }))));
  app.post('/api/finance/bank/:id/allocate',wrap(async(req,res)=>res.json(await mutate(req,s=>{
    const t=(s.bankTransactions||[]).find(t=>t.id===req.params.id),d=s.documents.find(d=>d.id===req.body.documentId);if(!t||!d)fail('FINANCE_NOT_FOUND',404);
    if(req.body.confirm!==true||t.amountCents<=0||d.kind!=='invoice'||d.status!=='issued')fail('FINANCE_PAYMENT_NOT_ALLOWED');
    const allocated=s.documents.reduce((n,d)=>n+d.payments.filter(p=>p.bankTransactionId===t.id).reduce((n,p)=>n+p.amountCents,0),0),outstanding=d.grossCents-d.payments.reduce((n,p)=>n+p.amountCents,0),amount=safe(decimal(req.body.amount,2));
    if(amount<=0||amount>t.amountCents-allocated||amount>outstanding||t.bookedOn<d.issueDate)fail('FINANCE_INVALID_AMOUNT');
    const payment={id:randomUUID(),amountCents:amount,paidOn:t.bookedOn,reference:t.externalId,bankTransactionId:t.id};d.payments.push(payment);return payment;
  }))));
  app.post('/api/finance/contacts',wrap(async(req,res)=>res.status(201).json(await mutate(req,s=>{
    if(s.contacts.length>=500)fail('FINANCE_RECORD_LIMIT');
    const c={...contactFields(req.body),id:randomUUID()};s.contacts.push(c);return c;
  }))));
  app.post('/api/finance/contacts/:id',wrap(async(req,res)=>res.json(await mutate(req,s=>{const c=s.contacts.find(c=>c.id===req.params.id);if(!c)fail('FINANCE_NOT_FOUND',404);Object.assign(c,contactFields(req.body));return c;}))));
  const saveProduct=(req,s,id)=>{
    s.products??=[];const existing=id?s.products.find(p=>p.id===id):null;if(id&&!existing)fail('FINANCE_NOT_FOUND',404);
    if(!id&&s.products.length>=1000)fail('FINANCE_RECORD_LIMIT');
    const sku=text(req.body.sku||'',60);if(sku&&s.products.some(p=>p.id!==id&&p.sku.toLowerCase()===sku.toLowerCase()))fail('FINANCE_DUPLICATE_PRODUCT',409);
    const item=calculateFinance([{description:req.body.name,quantity:'1',unitPrice:req.body.unitPrice,rate:req.body.rate,unit:req.body.unit}],s.country).lines[0];
    const product={id:id||randomUUID(),sku,name:item.description,unit:item.unit,unitPrice:item.unitPrice,rate:item.rate,archived:req.body.archived===true};
    if(existing)Object.assign(existing,product);else s.products.push(product);return product;
  };
  app.post('/api/finance/products',wrap(async(req,res)=>res.status(201).json(await mutate(req,s=>saveProduct(req,s)))));
  app.post('/api/finance/products/:id',wrap(async(req,res)=>res.json(await mutate(req,s=>saveProduct(req,s,req.params.id)))));
  app.post('/api/finance/documents/:id/duplicate',wrap(async(req,res)=>res.status(201).json(await mutate(req,s=>{
    const source=s.documents.find(d=>d.id===req.params.id);if(!source)fail('FINANCE_NOT_FOUND',404);if(s.documents.length>=500)fail('FINANCE_RECORD_LIMIT');
    const issueDate=today(),due=new Date(issueDate+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+14);
    const copy={...draft({...source,issueDate,serviceDate:issueDate,dueDate:due.toISOString().slice(0,10)},s),id:randomUUID(),status:'draft',number:null,createdAt:new Date().toISOString(),payments:[],copiedFromId:source.id};s.documents.push(copy);return copy;
  }))));
  app.post('/api/finance/recurring',wrap(async(req,res)=>res.status(201).json(await mutate(req,s=>{
    s.recurring??=[];if(s.recurring.length>=100)fail('FINANCE_RECORD_LIMIT');
    const source=s.documents.find(d=>d.id===req.body.documentId);if(!source||source.kind!=='invoice')fail('FINANCE_NOT_FOUND',404);
    const startDate=date(req.body.startDate),interval=Number(req.body.interval),paymentDays=Number(req.body.paymentDays);
    if(![1,3,12].includes(interval)||!Number.isInteger(paymentDays)||paymentDays<0||paymentDays>90)fail('FINANCE_INVALID_INPUT');
    const brand=source.appearance||source.issuer||s.profile;
    const template={kind:'invoice',contactId:source.contactId,lines:structuredClone(source.lines),appearance:{accent:brand.accent,design:structuredClone(brand.design||{})},note:source.note,taxTreatment:source.taxTreatment||'domestic',taxEvidence:{},reference:source.reference||'',einvoice:structuredClone(source.einvoice||{}),customer:{name:source.customer.name},grossCents:source.grossCents};
    const due=new Date(startDate+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+paymentDays);
    draft({...template,issueDate:startDate,serviceDate:startDate,dueDate:due.toISOString().slice(0,10)},s);
    const entry={id:randomUUID(),name:text(req.body.name||source.customer.name,100),template,startDate,nextDate:startDate,interval,paymentDays,autoOnOpen:req.body.autoOnOpen===true,period:0,paused:false,createdAt:new Date().toISOString()};s.recurring.push(entry);return entry;
  }))));
  app.post('/api/finance/recurring/:id/toggle',wrap(async(req,res)=>res.json(await mutate(req,s=>{const entry=(s.recurring||[]).find(r=>r.id===req.params.id);if(!entry)fail('FINANCE_NOT_FOUND',404);entry.paused=!entry.paused;return entry;}))));
  app.post('/api/finance/recurring/run',wrap(async(req,res)=>res.json(await mutate(req,s=>{
    const generated=[];
    for(const entry of s.recurring||[]){
      if(entry.paused||(req.body.autoOnly===true&&!entry.autoOnOpen))continue;
      let count=0;
      while(entry.nextDate<=today()&&count<12&&generated.length<50){
        if(s.documents.length>=500)fail('FINANCE_RECORD_LIMIT');
        const due=new Date(entry.nextDate+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+entry.paymentDays);
        const document={...draft({...entry.template,issueDate:entry.nextDate,serviceDate:entry.nextDate,dueDate:due.toISOString().slice(0,10)},s),id:randomUUID(),status:'draft',number:null,payments:[],createdAt:new Date().toISOString(),recurringId:entry.id,recurringPeriod:entry.period};
        s.documents.push(document);generated.push(document.id);count++;entry.period++;
        const anchor=new Date(entry.startDate+'T12:00:00Z'),day=anchor.getUTCDate();anchor.setUTCDate(1);anchor.setUTCMonth(anchor.getUTCMonth()+entry.period*entry.interval);const last=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+1,0)).getUTCDate();anchor.setUTCDate(Math.min(day,last));entry.nextDate=anchor.toISOString().slice(0,10);
      }
    }
    return {generated,remaining:(s.recurring||[]).some(r=>!r.paused&&r.nextDate<=today())};
  }))));
  app.get('/api/finance/documents/:id/reminder.eml',wrap(async(req,res)=>{
    const s=await load(req),d=s.documents.find(d=>d.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    const outstanding=d.grossCents-d.payments.reduce((n,p)=>n+p.amountCents,0);
    if(d.kind!=='invoice'||d.status!=='issued'||outstanding<=0||d.dueDate>=today())fail('FINANCE_REMINDER_NOT_ALLOWED',409);
    const email=s.contacts.find(c=>c.id===d.contactId)?.email||d.customer.email;if(!email||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email))fail('FINANCE_CUSTOMER_EMAIL_REQUIRED');
    const sl=s.country==='SI',amount=new Intl.NumberFormat(financeCountries[s.country].locale,{style:'currency',currency:'EUR'}).format(outstanding/100);
    const subject=(sl?'TEST: Opomnik za račun ':'TEST: Zahlungserinnerung ')+d.number;
    const body=sl?`TESTNI OSNUTEK – ni poslano.\n\nSpoštovani,\nza račun ${d.number} z zapadlostjo ${d.dueDate} je evidentiran odprt znesek ${amount}. Prosimo, preverite stanje in nas kontaktirajte, če je plačilo že opravljeno.\n\n${d.issuer?.name||s.profile.name}`:`TESTENTWURF – nicht versendet.\n\nGuten Tag,\nfür Rechnung ${d.number} mit Fälligkeit ${d.dueDate} ist ein offener Betrag von ${amount} erfasst. Bitte prüfen Sie den Stand und melden Sie sich, falls Ihre Zahlung bereits erfolgt ist.\n\n${d.issuer?.name||s.profile.name}`;
    const encoded=Buffer.from(body).toString('base64').match(/.{1,76}/g).join('\r\n');
    res.type('message/rfc822').set('Content-Disposition',`attachment; filename="reminder-${d.number}.eml"`).send(`To: ${email}\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\nX-Unsent: 1\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encoded}\r\n`);
  }));
  app.get('/api/finance/export.csv',wrap(async(req,res)=>{
    const s=await load(req),kind=req.query.kind||'documents',year=req.query.year;
    if(year!==undefined&&!/^\d{4}$/.test(year))fail('FINANCE_INVALID_INPUT');
    let rows;
    const includesDate=value=>!year||String(value).startsWith(year+'-');
    if(kind==='documents')rows=[['id','type','status','number','customer','issue_date','due_date','net_eur','vat_eur','gross_eur','paid_eur','customer_country','tax_treatment','tax_notice'],...s.documents.filter(d=>includesDate(d.issueDate)).map(d=>[d.id,d.kind,d.status,d.number,d.customer.name,d.issueDate,d.dueDate,(d.netCents/100).toFixed(2),(d.taxCents/100).toFixed(2),(d.grossCents/100).toFixed(2),(d.payments.reduce((n,p)=>n+p.amountCents,0)/100).toFixed(2),d.customer.country,d.taxTreatment||'domestic',d.taxNotice||''])];
    else if(kind==='expenses')rows=[['supplier','reference','date','gross_eur','currency','category','note'],...s.expenses.filter(e=>includesDate(e.incurredOn)).map(e=>[e.supplier,e.reference,e.incurredOn,(e.amountCents/100).toFixed(2),'EUR',e.category||'other',e.note])];
    else if(kind==='payments')rows=[['document_id','number','customer','date','amount_eur','reference'],...s.documents.flatMap(d=>d.payments.filter(p=>includesDate(p.paidOn)).map(p=>[d.id,d.number,d.customer.name,p.paidOn,(p.amountCents/100).toFixed(2),p.reference]))];
    else if(kind==='contacts')rows=[['id','name','address','postal_code','city','country','vat_id','email'],...s.contacts.map(c=>[c.id,c.name,c.address,c.postalCode,c.city,c.country,c.vatId,c.email])];
    else if(kind==='products')rows=[['sku','name','unit','unit_price_net_eur','vat_rate','archived'],...(s.products||[]).map(p=>[p.sku,p.name,p.unit,p.unitPrice,p.rate,p.archived])];
    else fail('FINANCE_INVALID_INPUT');
    res.type('text/csv').set('Content-Disposition',`attachment; filename="finance-${kind}${year?'-'+year:''}.csv"`).send('\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'));
  }));
  app.get('/api/finance/receivables',wrap(async(req,res)=>{const s=await load(req);res.json(financeReceivables(s.documents));}));
  app.get('/api/finance/receivables.csv',wrap(async(req,res)=>{
    const s=await load(req);const contactId=req.query.contactId;
    if(Object.keys(req.query).some(key=>key!=='contactId'))fail('FINANCE_INVALID_INPUT');
    if(contactId!==undefined&&(typeof contactId!=='string'||!s.contacts.some(c=>c.id===contactId)))fail('FINANCE_NOT_FOUND',404);
    res.type('text/csv').set('Content-Disposition','attachment; filename="finance-open-items.csv"').send(receivablesCsv(financeReceivables(s.documents),contactId));
  }));
  app.post('/api/finance/documents',wrap(async(req,res)=>res.status(201).json(await mutate(req,s=>{
    if(s.documents.length>=500)fail('FINANCE_RECORD_LIMIT');
    const d={...draft(req.body,s),id:randomUUID(),status:'draft',number:null,createdAt:new Date().toISOString(),payments:[]};s.documents.push(d);return d;
  }))));
  app.post('/api/finance/documents/:id/edit',wrap(async(req,res)=>res.json(await mutate(req,s=>{
    const d=s.documents.find(d=>d.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    if(d.offerTracking&&d.offerTracking.status!=='prepared')fail('FINANCE_OFFER_TRANSITION',409);
    if(d.status!=='draft')fail('FINANCE_ALREADY_ISSUED',409);Object.assign(d,draft(req.body,s));delete d.share;return d;
  }))));
  app.post('/api/finance/documents/:id/convert',wrap(async(req,res)=>res.status(201).json(await mutate(req,s=>{
    const offer=s.documents.find(d=>d.id===req.params.id);if(!offer)fail('FINANCE_NOT_FOUND',404);
    if(offer.kind!=='offer'||s.documents.some(d=>d.sourceOfferId===offer.id))fail('FINANCE_ALREADY_CONVERTED',409);
    if(offer.offerTracking&&offer.offerTracking.status!=='accepted')fail('FINANCE_OFFER_TRANSITION',409);
    if(s.documents.length>=500)fail('FINANCE_RECORD_LIMIT');
    const issueDate=today(),due=new Date(issueDate+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+14);
    const d={...structuredClone(offer),issueDate,dueDate:due.toISOString().slice(0,10),originals:undefined,issuanceRequest:undefined,deliveries:undefined,share:undefined,offerTracking:undefined,kind:'invoice',id:randomUUID(),sourceOfferId:offer.id,status:'draft',number:null,issuer:undefined,issuedAt:undefined,demo:undefined,payments:[],createdAt:new Date().toISOString()};s.documents.push(d);return d;
  }))));
  app.post('/api/finance/documents/:id/offer-status',wrap(async(req,res)=>res.json(await mutate(req,s=>{
    const d=s.documents.find(d=>d.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    if(s.documents.some(invoice=>invoice.sourceOfferId===d.id))fail('FINANCE_ALREADY_CONVERTED',409);
    return updateOfferTracking(d,req.body,req.session.user.id);
  }))));
  app.get('/api/finance/documents/:id/issue-check',wrap(async(req,res)=>{
    const s=await load(req),d=s.documents.find(item=>item.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    const format=req.query.format,issuer={...s.profile,...d.appearance};
    const fields=[...new Set([...issuanceProblems(s,d).filter(problem=>!(format&&problem==='structured_einvoice_not_yet_validated')),...(format?einvoiceProblems(d,issuer,s.country,format):[])])];
    if(d.status!=='draft')fields.push('already_issued');if(format&&!validatorAvailable())fields.push('validator_unavailable');
    res.set('Cache-Control','no-store').json({country:s.country,format:format||'pdf',fields,ready:fields.length===0,demo,validationPending:!!format,revision:s.revision});
  }));
  app.post('/api/finance/documents/:id/issue',rateLimit({windowMs:60000,limit:10}),wrap(async(req,res)=>{
    const s=await load(req),companyId=req.session.company.id;
    const d=s.documents.find(d=>d.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    const requestKey=req.get('Idempotency-Key')??req.body.requestKey;
    if(req.get('Idempotency-Key')&&req.body.requestKey&&req.get('Idempotency-Key')!==req.body.requestKey)fail('FINANCE_INVALID_INPUT');
    if(requestKey!==undefined&&!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey))fail('FINANCE_INVALID_INPUT');
    const requestHash=createHash('sha256').update(JSON.stringify({confirm:req.body.confirm,taxScopeConfirmed:req.body.taxScopeConfirmed,format:req.body.format||null})).digest('hex');
    if(requestKey&&d.issuanceRequest?.key===requestKey){
      if(d.issuanceRequest.hash!==requestHash)fail('FINANCE_IDEMPOTENCY_CONFLICT',409);
      return res.json({state:s,result:d});
    }
    if(s.revision!==req.body.revision)fail('FINANCE_VERSION_CONFLICT',409);
    if(d.status!=='draft')fail('FINANCE_ALREADY_ISSUED',409);
    // No production issuance before independent module entitlements and document review.
    if(!demo)fail('FINANCE_RELEASE_NOT_ENABLED',503);
    if(req.body.confirm!==true||req.body.taxScopeConfirmed!==true)fail('FINANCE_CONFIRMATION_REQUIRED');
    const format=req.body.format;
    const missing=issuanceProblems(s,d).filter(problem=>!(format&&problem==='structured_einvoice_not_yet_validated'));if(missing.length)fail('FINANCE_ISSUE_BLOCKED',422,missing);
    const key=`${d.kind}-${d.issueDate.slice(0,4)}`,sequence=(s.sequence[key]||0)+1;s.sequence[key]=sequence;
    Object.assign(d,{number:`${d.kind==='offer'?'AN':'RE'}-${d.issueDate.slice(0,4)}-${String(sequence).padStart(5,'0')}`,status:'issued',issuer:structuredClone({...s.profile,...d.appearance}),country:s.country,issuedAt:new Date().toISOString(),demo:true});
    const generated=[];
    if(format){const output=await validatedEinvoice(d,d.issuer,s.country,format,()=>financePdf(d,d.issuer,s.country,{pdfa:true}));generated.push({...output,format});}
    if(!generated.some(file=>file.extension==='pdf'))generated.push({bytes:await financePdf(d,d.issuer,s.country),mime:'application/pdf',extension:'pdf',format:'pdf',validation:'visual-document'});
    const originals=[];let committed;
    try{
      for(const file of generated){const metadata=await vault.put(companyId,{bytes:file.bytes,filename:`${d.number}-${file.format}.${file.extension}`,mime:file.mime,extension:file.extension,size:file.bytes.length,sha256:createHash('sha256').update(file.bytes).digest('hex')});originals.push({...metadata,format:file.format,validation:file.validation,createdAt:d.issuedAt});}
      d.originals=originals;if(requestKey)d.issuanceRequest={key:requestKey,hash:requestHash};
      committed=await mutate(req,current=>{const target=current.documents.find(item=>item.id===d.id);if(!target||target.status!=='draft')fail('FINANCE_ALREADY_ISSUED',409);current.sequence[key]=sequence;Object.assign(target,d);delete target.share;return target;});
    }catch(error){
      // A database connection error can occur after COMMIT. Never delete an
      // original on an ambiguous commit outcome; reconcile unreferenced files later.
      if(error.status)await Promise.all(originals.map(file=>vault.discard(companyId,file.id)));
      throw error;
    }
    res.json(committed);
  }));
  app.post('/api/finance/documents/:id/payment',wrap(async(req,res)=>res.json(await mutate(req,s=>{
    const d=s.documents.find(d=>d.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    if(d.status!=='issued'||d.kind!=='invoice')fail('FINANCE_PAYMENT_NOT_ALLOWED');
    const amount=safe(decimal(req.body.amount,2)),paid=d.payments.reduce((v,p)=>v+p.amountCents,0);
    const paidOn=date(req.body.paidOn);if(amount<=0||amount>d.grossCents-paid||paidOn>today()||paidOn<d.issueDate)fail('FINANCE_INVALID_AMOUNT');
    const reference=text(req.body.reference||'',100);d.payments.push({id:randomUUID(),amountCents:amount,paidOn,reference});return d;
  }))));
  app.get('/api/finance/documents/:id/bundle.zip',wrap(async(req,res)=>{
    const s=await load(req),d=s.documents.find(item=>item.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    const files=await originalFiles(vault,req.session.company.id,d);
    res.set({'Content-Type':'application/zip','Cache-Control':'no-store','Content-Disposition':`attachment; filename="${d.number}-originals.zip"`}).send(await invoiceBundle(d,files));
  }));
  app.post('/api/finance/documents/:id/email-draft',wrap(async(req,res)=>{
    const s=await load(req),d=s.documents.find(item=>item.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    if(d.kind!=='invoice')fail('FINANCE_INVALID_INPUT');
    const files=await originalFiles(vault,req.session.company.id,d),bytes=await invoiceEmail(d,files,s.country,req.body);
    res.set({'Content-Type':'message/rfc822','Cache-Control':'no-store','Content-Disposition':`attachment; filename="${d.number}.eml"`}).send(bytes);
  }));
  app.post('/api/finance/documents/:id/delivery',wrap(async(req,res)=>res.json(await mutate(req,s=>{
    const d=s.documents.find(item=>item.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);return recordExternalDelivery(d,req.body,req.session.user.id);
  }))));
  app.get('/api/finance/einvoice-capabilities',wrap(async(req,res)=>res.json({formats:einvoiceProfiles[req.session.company.country],validatorAvailable:validatorAvailable(),productionReleased:false,scope:'private-domestic-b2b-EUR-positive-VAT',deliveryConnected:false})));
  app.post('/api/finance/einvoice-preview',rateLimit({windowMs:60000,limit:5}),wrap(async(req,res)=>{
    const s=await load(req);if(!s.countryConfirmed)fail('FINANCE_COUNTRY_MISMATCH');
    const d={...draft(req.body,s),number:'TEST-PREVIEW',status:'draft',demo:true};
    const issuer={...s.profile,...d.appearance};
    const result=await validatedEinvoice(d,issuer,s.country,req.body.format,()=>financePdf(d,issuer,s.country,{pdfa:true}));
    res.set({'Content-Type':result.mime,'Content-Disposition':`attachment; filename="TEST-${req.body.format}.${result.extension}"`,'Cache-Control':'no-store','X-Equitensa-Validation':result.validation,'X-Equitensa-Document-Status':'test-draft'}).send(result.bytes);
  }));
  app.post('/api/finance/receipt-scan',rateLimit({windowMs:60000,limit:5}),wrap(async(req,res)=>{
    const file=validateFinanceAttachment(req.body);
    res.json(await readFinanceReceipt(file,req.session.company.country));
  }));
  app.post('/api/finance/receipt-import',wrap(async(req,res)=>{
    if(req.body.reviewed!==true)fail('FINANCE_INVALID_INPUT');
    const file=validateFinanceAttachment(req.body.attachment||{});
    const metadata=await vault.put(req.session.company.id,file);
    try{const result=await mutate(req,s=>{
      s.attachments??=[];if(s.expenses.length>=500||s.attachments.length>=50)fail('FINANCE_RECORD_LIMIT');
      if(s.attachments.some(a=>a.sha256===metadata.sha256))fail('FINANCE_DUPLICATE_EXPENSE',409);
      const entry={id:randomUUID(),...expenseFields(req.body,s)};s.expenses.push(entry);
      s.attachments.push({...metadata,expenseId:entry.id,uploadedAt:new Date().toISOString(),uploadedBy:req.session.user.id});return entry;
    });res.status(201).json(result);}catch(error){await vault.discard(req.session.company.id,metadata.id);throw error;}
  }));
  app.post('/api/finance/expenses',wrap(async(req,res)=>res.status(201).json(await mutate(req,s=>{
    if(s.expenses.length>=500)fail('FINANCE_RECORD_LIMIT');
    const e={id:randomUUID(),...expenseFields(req.body,s)};s.expenses.push(e);return e;
  }))));
  app.post('/api/finance/expenses/:id',wrap(async(req,res)=>res.json(await mutate(req,s=>{const e=s.expenses.find(e=>e.id===req.params.id);if(!e)fail('FINANCE_NOT_FOUND',404);Object.assign(e,expenseFields(req.body,s,e.id),{updatedAt:new Date().toISOString()});return e;}))));
  app.post('/api/finance/quote',wrap(async(req,res)=>{try{res.json(financeQuote(req.body.plan,req.body.paidSeats,req.body.interval));}catch{fail('FINANCE_INVALID_QUOTE');}}));
  app.post('/api/finance/demo-subscription',wrap(async(req,res)=>{
    if(!demo)return res.status(404).json({error:'NOT_FOUND'});
    res.json(await mutate(req,s=>{if(req.body.accepted!==true)fail('FINANCE_CONFIRMATION_REQUIRED');let q;try{q=financeQuote(req.body.plan,req.body.paidSeats,req.body.interval);}catch{fail('FINANCE_INVALID_QUOTE');}s.subscription={...q,status:'sandbox_active',acceptedAt:new Date().toISOString(),acceptedBy:req.session.user.id};return s.subscription;}));
  }));
  app.get('/api/finance/documents/:id/pdf',wrap(async(req,res)=>{
    const s=await load(req),d=s.documents.find(d=>d.id===req.params.id);if(!d)fail('FINANCE_NOT_FOUND',404);
    const original=d.originals?.find(file=>file.extension==='pdf');
    const issuer=d.issuer||{...s.profile,...d.appearance};const output=original?await vault.get(req.session.company.id,original):await financePdf(d,issuer,s.country);
    res.type('pdf').set({'Content-Disposition':`attachment; filename="${d.number||'draft-'+d.id}.pdf"`,'Cache-Control':'no-store'}).send(output);
  }));
  app.get('/api/finance/documents/:id/originals/:file',wrap(async(req,res)=>{
    const s=await load(req),d=s.documents.find(item=>item.id===req.params.id),file=d?.originals?.find(item=>item.id===req.params.file);if(!file)fail('FINANCE_NOT_FOUND',404);
    res.set({'Content-Type':file.mime,'Content-Disposition':`attachment; filename="${file.filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).send(await vault.get(req.session.company.id,file));
  }));
  app.get('/api/finance/export',wrap(async(req,res)=>{
    const s=await load(req);res.set('Content-Disposition','attachment; filename="finance-export.json"').json({format:'equitensa-finance-v1',exportedAt:new Date().toISOString(),...s});
  }));
}
export function financePdf(d,issuer,country,{pdfa=false}={}){return new Promise((resolve,reject)=>{
  const payment=d.kind==='invoice'?paymentQr(d,issuer,country):null;
  const design={template:'signature',font:'sans',density:'comfortable',logoPosition:'right',textColor:'#272238',surfaceColor:'#f4f1fc',fontSize:10,logoWidth:100,pageMargin:45,blocks:[],...issuer.design};
  const margin=design.pageMargin,width=595.28-2*margin;
  const pdf=new PDFDocument({size:'A4',margin,...(pdfa?{subset:'PDF/A-1b',pdfVersion:'1.4'}:{})}),buffers=[];pdf.on('data',c=>buffers.push(c));pdf.on('end',()=>resolve(Buffer.concat(buffers)));pdf.on('error',reject);
  const fonts={serif:['C:/Windows/Fonts/georgia.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'],mono:['C:/Windows/Fonts/consola.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf']};
  const font=[...(fonts[design.font]||[]),process.env.PDF_FONT_PATH,'C:/Windows/Fonts/arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(p=>p&&existsSync(p));
  if(!font){pdf.end();reject(new Error('PDF_FONT_REQUIRED'));return;}pdf.font(font);
  const sl=country==='SI',money=c=>new Intl.NumberFormat(financeCountries[country].locale,{style:'currency',currency:'EUR'}).format(c/100);
  if(design.template==='signature')pdf.rect(0,0,595,9).fill(issuer.accent);
  if(design.template==='editorial')pdf.rect(30,25,535,80).fill(design.surfaceColor);
  if(issuer.logo)pdf.image(Buffer.from(issuer.logo.split(',')[1],'base64'),design.logoPosition==='left'?margin:595.28-margin-design.logoWidth,35,{fit:[design.logoWidth,55]});
  const titleX=issuer.logo&&design.logoPosition==='left'?margin+design.logoWidth+20:margin;
  const title=(d.kind==='offer'?design.offerTitle:design.invoiceTitle)||(d.kind==='offer'?(sl?'Ponudba':'Angebot'):(sl?'Račun':'Rechnung'));
  if(design.template!=='business')pdf.fillColor(issuer.accent).fontSize(design.titleSize||24).text(title,titleX,45,{width:width-(issuer.logo?design.logoWidth+20:0),align:design.titleAlign||'left'});
  pdf.x=margin;pdf.y=Math.max(115,pdf.y+20);
  pdf.fillColor(design.textColor).fontSize(design.fontSize).text(d.status==='draft'?`${d.number?d.number+' · ':''}${sl?'OSNUTEK – ni izdan račun':'ENTWURF – keine ausgestellte Rechnung'}`:d.number,{width});
  if(d.demo)pdf.text(sl?'TESTNI DOKUMENT – brez dejanske dobave':'TESTDOKUMENT – keine tatsächliche Lieferung');
  const partiesY=pdf.y+25,colWidth=(width-30)/2;
  pdf.fontSize(design.fontSize+1).text(issuer.name,margin,partiesY,{width:colWidth}).fontSize(design.fontSize).text(`${issuer.address}\n${issuer.postalCode} ${issuer.city}\n${country}\n${issuer.vatId||issuer.taxId}`,{width:colWidth});
  const issuerBottom=pdf.y;
  pdf.fontSize(design.fontSize+1).text(d.customer.name,margin+colWidth+30,partiesY,{width:colWidth}).fontSize(design.fontSize).text(`${d.customer.address}\n${d.customer.postalCode} ${d.customer.city}\n${d.customer.country}\n${d.customer.vatId||''}`,{width:colWidth});
  pdf.y=Math.max(issuerBottom,pdf.y)+25;pdf.x=margin;
  const datesY=pdf.y;
  [[sl?'Datum izdaje':'Ausstellungsdatum',d.issueDate],[sl?'Datum dobave':'Leistungsdatum',d.serviceDate],[sl?'Zapadlost':'Fällig am',d.dueDate]].forEach(([label,value],i)=>pdf.fontSize(design.fontSize-1).text(`${label}\n${value}`,margin+i*width/3,datesY,{width:width/3-8}));
  pdf.x=margin;pdf.y+=22;
  if(design.template==='business'){pdf.fillColor(design.textColor).fontSize(design.titleSize||24).text(title,margin,pdf.y,{width,align:design.titleAlign||'left'}).moveDown(.5);pdf.fontSize(design.fontSize);}
  if(d.reference)pdf.fillColor(design.textColor).fontSize(design.fontSize).text(`${sl?'Referenca':'Referenz'}: ${d.reference}`,{width}).moveDown(.5);
  const blocks=position=>{for(const block of design.blocks.filter(b=>b.position===position)){if(pdf.y>650)pdf.addPage();pdf.moveDown(.6);if(block.heading)pdf.fillColor(issuer.accent).fontSize(design.fontSize+1).text(block.heading,{width});if(block.body)pdf.fillColor(design.textColor).fontSize(design.fontSize).text(block.body,{width});}};
  blocks('intro');
  const columns=invoiceColumns(design),weight=columns.reduce((n,c)=>n+c[3],0);
  const cells=(line,index)=>columns.map(c=>({key:c[0],label:sl?c[2]:c[1],value:invoiceCell(c[0],line,index,money),width:width*c[3]/weight}));
  const tableHeader=()=>{const y=pdf.y;let x=margin;pdf.rect(margin,y,width,32).fill(design.tableStyle==='contrast'?issuer.accent:design.tableStyle==='plain'?'#ffffff':design.surfaceColor);pdf.fillColor(design.tableStyle==='contrast'?'#ffffff':design.textColor).fontSize(8);for(const c of cells(d.lines[0],0)){pdf.text(c.label,x+4,y+6,{width:c.width-8,align:c.key==='description'?'left':'right'});x+=c.width;}pdf.y=y+40;pdf.x=margin;};
  tableHeader();
  for(const [index,line] of d.lines.entries()){
    const row=cells(line,index);const desc=row.find(c=>c.key==='description');
    desc.value=invoiceDescription(line,design,money,sl);
    pdf.fontSize(design.fontSize);
    const rowHeight=Math.max(...row.map(c=>pdf.heightOfString(c.value,{width:c.width-8})))+20;
    if(pdf.y+rowHeight>pdf.page.height-margin-20){pdf.addPage();tableHeader();}
    const y=pdf.y;let x=margin;pdf.fillColor(design.textColor).fontSize(design.fontSize);
    for(const c of row){pdf.text(c.value,x+4,y,{width:c.width-8,align:c.key==='description'?'left':'right'});x+=c.width;}
    pdf.y=y+rowHeight;pdf.moveTo(margin,pdf.y).lineTo(margin+width,pdf.y).strokeColor('#e8e3ef').stroke();pdf.y+=10;pdf.x=margin;
  }
  blocks('afterItems');
  if(pdf.y>620)pdf.addPage();pdf.moveDown().fontSize(design.fontSize);
  const totalX=margin+width-245;
  pdf.text(`Netto: ${money(d.netCents)}`,totalX,pdf.y,{width:245,align:'right'});
  d.taxes.forEach(t=>pdf.text(`${sl?'DDV':'USt.'} ${t.rate}%: ${money(t.taxCents)} (${money(t.netCents)})`,totalX,pdf.y,{width:245,align:'right'}));
  pdf.moveDown(.5).fillColor(issuer.accent).fontSize(design.fontSize+5).text(`${sl?'Skupaj':'Gesamt'}: ${money(d.grossCents)}`,totalX,pdf.y,{width:245,align:'right'}).fillColor(design.textColor).fontSize(design.fontSize).moveDown();pdf.x=margin;
  if(design.template!=='business')pdf.text(`IBAN: ${issuer.iban}`).text(issuer.email||'');
  if(zeroTax(d))pdf.moveDown().text(taxNotice(country,d.taxTreatment),{width});
  if(d.note)pdf.moveDown().text(d.note,{width});blocks('closing');if(issuer.footer)pdf.moveDown().text(issuer.footer,{width});
  if(design.template==='business'){
    if(pdf.y>660)pdf.addPage();pdf.moveDown(2);const y=pdf.y;
    pdf.moveTo(margin,y).lineTo(margin+width,y).strokeColor(issuer.accent).stroke();pdf.fontSize(8);
    const foot=[`${issuer.name}\n${issuer.address||''}\n${issuer.postalCode||''} ${issuer.city||''}\n${issuer.vatId||issuer.taxId||''}`,issuer.email||'',`IBAN\n${issuer.iban||''}`];let bottom=y;
    foot.forEach((value,i)=>{pdf.text(value,margin+i*width/3,y+12,{width:width/3-12});bottom=Math.max(bottom,pdf.y);});pdf.x=margin;pdf.y=bottom+16;
  }
  const qrBlock=(matrix,label,details)=>{
    const size=102; // 35.98 mm with quiet zone; UPN matrix modules are 1.2 pt.
    pdf.x=margin;pdf.moveDown();if(pdf.y+size+45>pdf.page.height-margin)pdf.addPage();
    const y=pdf.y,x=design.qrPosition==='left'?margin:margin+width-size;
    drawQr(pdf,matrix,x,y,size);
    const tx=design.qrPosition==='left'?margin+size+16:margin;
    pdf.fillColor(design.textColor).fontSize(10).text(label,tx,y+8,{width:width-size-20});
    pdf.fontSize(9).text(details,{width:width-size-20});pdf.y=Math.max(y+size+12,pdf.y+12);pdf.x=margin;
  };
  if(payment)qrBlock(payment.matrix,`${payment.format}${payment.testOnly?' · TEST':''}`,payment.testOnly?(sl?'Testni prikaz – ni plačilni nalog.':'Testvorschau – kein Zahlungsauftrag.'):`${issuer.name}\n${issuer.iban}\n${money(d.grossCents)}\n${d.number}\n${sl?'Koda namena: OTHR · Sklic: SI99':'In der Banking-App prüfen und bestätigen.'}`);
  if(d.share&&Date.parse(d.share.expiresAt)>Date.now())qrBlock(urlMatrix(d.share.url),sl?'Odpri dokument':'Dokument öffnen',`${sl?'Velja do':'Gültig bis'} ${d.share.expiresAt.slice(0,10)}\n${sl?'Vsak s povezavo lahko odpre kopijo PDF.':'Jeder mit diesem Link kann die PDF-Kopie öffnen.'}`);
  pdf.end();
});}
