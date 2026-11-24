import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import {createCanvas} from '@napi-rs/canvas';
import {ciiInvoice,validatedEinvoice,validatorAvailable,einvoiceProblems} from '../server/finance-einvoice.js';
import {calculateFinance,financePdf,issuanceProblems} from '../server/finance.js';
import {readEinvoiceXml} from '../server/finance-xml-reader.js';
import {readFinanceReceipt} from '../server/finance-document-reader.js';
import {validateFinanceAttachment} from '../server/finance-files.js';
const example=country=>{
 const p={name:'Test Studio',address:'Teststrasse 1',postalCode:'1000',city:'Teststadt',country,vatId:{DE:'DE123456789',AT:'ATU12345678',SI:'SI12345678'}[country],iban:'DE89370400440532013000',email:'seller@example.com',accent:'#7451f8'};
 const d={kind:'invoice',status:'draft',demo:true,id:'validation-test',reference:'REF-123',einvoice:{contactName:'Test Contact',contactPhone:'+4912345678'},customer:{...p,email:'buyer@example.com',business:true},issueDate:'2026-11-15',serviceDate:'2026-11-15',dueDate:'2026-11-29',...calculateFinance([{description:'Design & Development',quantity:'2',unit:'h',unitPrice:'100',rate:{DE:'19',AT:'20',SI:'22'}[country],discountPercent:'10'}],country)};
 return {p,d};
};
test('EU general-rule services preserve foreign buyer, zero VAT and reverse-charge category in every supported format',{skip:!validatorAvailable(),timeout:180000},async()=>{
 for(const [country,formats] of [['DE',['xrechnung','zugferd']],['AT',['ebinterface','ubl']],['SI',['eslog','ubl']]]){
  const {d,p}=example(country);
  const rc={...d,taxTreatment:'eu_b2b_services',taxEvidence:{generalRuleConfirmed:true,vatVerified:true,checkedOn:'2026-11-15',reference:'External VIES evidence 123'},customer:{...d.customer,country:'NL',vatId:'NL123456789B01'},...calculateFinance([{description:'Consulting',quantity:'2.5',unit:'h',unitPrice:'99.99',rate:'0',discountPercent:'10'}],country,'eu_b2b_services')};
  assert.equal(rc.netCents,22498);assert.equal(rc.grossCents,22498);assert.equal(rc.taxCents,0);
  assert.ok(!issuanceProblems({country,countryConfirmed:true,profile:p},rc).includes('cross_border_not_supported'));
  const common=ciiInvoice(rc,p,country,formats[0]);assert.match(common,/<ram:CountryID>NL<\/ram:CountryID>/);assert.match(common,/<ram:CategoryCode>AE<\/ram:CategoryCode>/);assert.match(common,/Reverse charge/);
  for(const format of formats){const result=await validatedEinvoice(rc,p,country,format,()=>financePdf(rc,p,country,{pdfa:true}));assert.match(result.report,/<summary status="valid"/);}
  for(const invalid of [{...rc,taxEvidence:{}},{...rc,customer:{...rc.customer,country:'US'}},{...rc,customer:{...rc.customer,business:false}},{...rc,customer:{...rc.customer,vatId:''}}])assert.ok(einvoiceProblems(invalid,p,country,formats[0]).length);
 }
});
test('country format gates, required contacts and Austrian high-value buyer UID',()=>{
 const {p,d}=example('DE');assert.deepEqual(einvoiceProblems(d,p,'DE','xrechnung'),[]);
 assert.ok(einvoiceProblems({...d,einvoice:{}},p,'DE','xrechnung').includes('contactPhone'));
 assert.ok(einvoiceProblems({...d,customer:{...d.customer,country:'AT'}},p,'DE','xrechnung').includes('private_domestic_b2b_only'));
 const at=example('AT');assert.ok(einvoiceProblems({...at.d,grossCents:1000001,customer:{...at.d.customer,vatId:''}},at.p,'AT','ubl').includes('customer.vatId'));
 assert.ok(einvoiceProblems(at.d,at.p,'AT','zugferd').includes('format'));
 assert.ok(einvoiceProblems({...d,lines:[{...d.lines[0],unit:'unknown'}]},p,'DE','xrechnung').includes('unitCode'));
});

test('goods and non-EU services validate distinct tax categories and foreign countries in all issuer formats',{skip:!validatorAvailable(),timeout:360000},async()=>{
 for(const country of ['DE','AT','SI'])for(const mode of ['eu_goods','export_goods','non_eu_b2b_services']){
  const {d,p}=example(country),buyerCountry=mode==='eu_goods'?'NL':'US';
  const invoice={...d,taxTreatment:mode,taxEvidence:{vatVerified:true,reference:'External VIES record',checkedOn:'2026-11-15',generalRuleConfirmed:true,goodsConditionsConfirmed:true,reportingConfirmed:true,destinationCountry:buyerCountry,transportReference:'CMR / customs departure evidence',businessEvidence:'Company registration evidence'},customer:{...d.customer,country:buyerCountry,vatId:mode==='eu_goods'?'NL123456789B01':''},...calculateFinance([{description:'Supply',quantity:'2',unit:'h',unitPrice:'100',rate:'0'}],country,mode)};
  const formats=country==='DE'?['xrechnung','zugferd']:country==='AT'?['ebinterface','ubl']:['eslog','ubl'];
  assert.equal(einvoiceProblems(invoice,p,country,formats[0]).length,0);
  for(const format of formats){
   const result=await validatedEinvoice(invoice,p,country,format,()=>financePdf(invoice,p,country,{pdfa:true}));assert.match(result.report,/<summary status="valid"/);
   if(format==='ebinterface')assert.match(result.bytes.toString(),new RegExp(`CountryCode="${buyerCountry}"`));
   if(format==='eslog')assert.match(result.bytes.toString(),new RegExp(`<D_3207>${buyerCountry}</D_3207>`));
  }
  const bad={...invoice,taxEvidence:{}};assert.ok(einvoiceProblems(bad,p,country,formats[0]).length>0);
 }
});

test('small-business exemption validates without an issuer VAT ID in DE AT SI',{skip:!validatorAvailable(),timeout:180000},async()=>{
 for(const country of ['DE','AT','SI']){
  const fixture=example(country),p={...fixture.p,vatId:'',taxId:country==='SI'?'12345678':'123456789'},d={...fixture.d,taxTreatment:'small_business',taxEvidence:{smallBusinessConfirmed:true},customer:{...fixture.d.customer,business:false,vatId:''},...calculateFinance([{description:'Service',quantity:'1',unit:'h',unitPrice:'100',rate:'0'}],country,'small_business')};
  assert.deepEqual(issuanceProblems({country,countryConfirmed:true,profile:p},d),[]);
  for(const format of country==='DE'?['xrechnung','zugferd']:country==='AT'?['ebinterface','ubl']:['eslog','ubl']){
   const result=await validatedEinvoice(d,p,country,format,()=>financePdf(d,p,country,{pdfa:true}));assert.match(result.report,/<summary status="valid"/);
  }
  assert.ok(issuanceProblems({country,countryConfirmed:true,profile:p},{...d,taxEvidence:{}}).includes('small_business_eligibility'));
 }
});
test('structured XML extraction escapes user text and rejects entities and non-EUR',()=>{
 const {p,d}=example('DE'),xml=ciiInvoice(d,{...p,name:'Studio & Sons <Ltd>'},'DE','xrechnung');
 assert.match(xml,/Studio &amp; Sons &lt;Ltd&gt;/);assert.equal(readEinvoiceXml(Buffer.from(xml)).suggestions.amount,'214.20');
 assert.throws(()=>readEinvoiceXml(Buffer.from(xml.replace('EUR','USD'))),/CURRENCY/);
 assert.throws(()=>readEinvoiceXml(Buffer.from('<!DOCTYPE x [<!ENTITY evil SYSTEM "file:///etc/passwd">]><Invoice/>')));
 assert.equal(validateFinanceAttachment({filename:'invoice.xml',data:Buffer.from(xml).toString('base64')}).mime,'application/xml');
});

test('domestic buyer VAT identifiers are checked consistently before PDF and structured issuance in DE AT SI',()=>{
 for(const [country,format] of [['DE','xrechnung'],['AT','ubl'],['SI','eslog']]){
  const {p,d}=example(country),state={country,countryConfirmed:true,profile:p};
  const invalid={...d,customer:{...d.customer,vatId:'NOT-A-VAT-ID'}};
  assert.ok(issuanceProblems(state,invalid).includes('customer.vatId_format'));
  assert.ok(einvoiceProblems(invalid,p,country,format).includes('customer.vatId_format'));
  assert.ok(!issuanceProblems(state,d).includes('customer.vatId_format'));
  assert.ok(!einvoiceProblems(d,p,country,format).includes('customer.vatId_format'));
 }
});
test('independent Mustang validation accepts XRechnung, ZUGFeRD PDF/A and UBL for AT/SI; rejects altered totals',{skip:!validatorAvailable(),timeout:120000},async()=>{
 for(const [country,format] of [['DE','xrechnung'],['DE','zugferd'],['AT','ubl'],['SI','ubl']]){
  const {d,p}=example(country);const r=await validatedEinvoice(d,p,country,format,()=>financePdf(d,p,country,{pdfa:true}));
  assert.match(r.report,/<summary status="valid"/);
  if(format==='zugferd'){
   assert.equal(r.bytes.subarray(0,5).toString(),'%PDF-');
   const imported=await readFinanceReceipt({mime:'application/pdf',bytes:r.bytes},country);assert.equal(imported.suggestions.amount,'214.20');assert.match(imported.format,/CII/);
  }else {const imported=readEinvoiceXml(r.bytes);assert.equal(imported.suggestions.amount,(d.grossCents/100).toFixed(2));}
 }
 const {d,p}=example('DE');await assert.rejects(()=>validatedEinvoice({...d,grossCents:d.grossCents+100},p,'DE','xrechnung'),e=>e.status===422);
});
const pdf=draw=>new Promise(resolve=>{const d=new PDFDocument({size:'A4'}),parts=[];d.on('data',x=>parts.push(x));d.on('end',()=>resolve(Buffer.concat(parts)));draw(d);d.end();});
test('text PDF and scanned PDF produce editable suggestions; page limits reject partial reads',async()=>{
 const bytes=await pdf(d=>d.fontSize(20).text('Example GmbH\nRechnung Nr. PDF-1\n15.11.2026\nRechnungsbetrag 119,00 EUR'));
 const result=await readFinanceReceipt({mime:'application/pdf',bytes},'DE');assert.equal(result.suggestions.amount,'119.00');assert.equal(result.requiresReview,true);
 const c=createCanvas(1000,600),x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1000,600);x.fillStyle='black';x.font='32px Arial';['Example GmbH','Rechnung Nr. SCAN-1','15.11.2026','Rechnungsbetrag 119,00 EUR'].forEach((s,i)=>x.fillText(s,40,80+i*80));
 const scanned=await pdf(d=>d.image(c.toBuffer('image/png'),40,40,{width:500}));
 const scan=await readFinanceReceipt({mime:'application/pdf',bytes:scanned},'DE');assert.equal(scan.suggestions.amount,'119.00');assert.equal(scan.format,'PDF / OCR');
 const large=await pdf(d=>{for(let i=0;i<5;i++)d.addPage();});await assert.rejects(()=>readFinanceReceipt({mime:'application/pdf',bytes:large},'DE'),/PAGE_LIMIT/);
});

test('German structured exports validate multiple tax rates and fractional discounted quantities',{skip:!validatorAvailable(),timeout:120000},async()=>{
 const {d,p}=example('DE');
 const invoice={...d,number:'TEST-PREVIEW',...calculateFinance([
  {description:'Consulting',quantity:'1.5',unit:'h',unitPrice:'99.99',rate:'19',discountPercent:'7.5'},
  {description:'Book',quantity:'3',unit:'Stk.',unitPrice:'12.35',rate:'7',discountPercent:'0'},
 ],'DE')};
 for(const format of ['xrechnung','zugferd']){
  const result=await validatedEinvoice(invoice,p,'DE',format,()=>financePdf(invoice,p,'DE',{pdfa:true}));
  assert.match(result.report,/<summary status="valid"/);
  const imported=format==='zugferd'?await readFinanceReceipt({mime:'application/pdf',bytes:result.bytes},'DE'):readEinvoiceXml(result.bytes);
  assert.equal(imported.suggestions.amount,(invoice.grossCents/100).toFixed(2));
 }
});
