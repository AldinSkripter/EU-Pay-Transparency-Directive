import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedEinvoice,einvoiceProblems} from '../server/finance-einvoice.js';
import {calculateFinance} from '../server/finance.js';
import {readEinvoiceXml} from '../server/finance-xml-reader.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

for(const [country,format,rates] of [['AT','ebinterface',['20','13','10','4.9']],['SI','eslog',['22','9.5','5']]]){
 test(`${country} native XML validates schema and EN16931 calculations with discounts and mixed rates`,{timeout:60000},async()=>{
  const p={name:'Studio & Test',address:'Test 1',postalCode:'1000',city:'Test',iban:'DE89370400440532013000',email:'test@example.invalid',vatId:country==='AT'?'ATU12345678':'SI12345678'};
  const d={kind:'invoice',status:'draft',demo:true,number:'TEST-PREVIEW',reference:'ORDER-1',customer:{...p,name:'Buyer',country,business:true},issueDate:'2026-11-15',serviceDate:'2026-11-15',dueDate:'2026-11-29',...calculateFinance(rates.map(rate=>({description:'Item & <test>',quantity:'1.5',unit:'h',unitPrice:'99.99',discountPercent:'7.5',rate})),country)};
  const result=await validatedEinvoice(d,p,country,format);
  assert.equal(result.validation,'EN16931-core-and-national-XSD');
  const xml=result.bytes.toString();
  assert.match(xml,/Studio &amp; Test/);assert.ok(xml.includes((d.grossCents/100).toFixed(2)));
  assert.match(xml,country==='AT'?/schema\/6p1\//:/urn:eslog:2.00/);
  const imported=readEinvoiceXml(result.bytes);
  assert.equal(imported.suggestions.amount,(d.grossCents/100).toFixed(2));
  assert.equal(imported.suggestions.supplier,p.name);
  assert.equal(imported.suggestions.reference,'TEST-PREVIEW');
  assert.equal(imported.suggestions.incurredOn,d.issueDate);
  await assert.rejects(()=>validatedEinvoice({...d,grossCents:d.grossCents+1},p,country,format),e=>e.status===422);
  assert.ok(einvoiceProblems({...d,customer:{...d.customer,publicBody:true}},p,country,format).includes('private_domestic_b2b_only'));
 });
}

test('national schema validator rejects wrong namespaces and external entity documents',{timeout:30000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'equitensa-schema-test-')),file=join(dir,'invoice.xml');
 try{
  for(const xml of ['<Invoice xmlns="urn:wrong"/>','<!DOCTYPE Invoice [<!ENTITY ex SYSTEM "file:///not-allowed">]><Invoice xmlns="http://www.ebinterface.at/schema/6p1/">&ex;</Invoice>']){
   await writeFile(file,xml);
   await assert.rejects(()=>promisify(execFile)('java',['-Xmx128m',resolve('server/InvoiceSchemaValidator.java'),resolve('server/schemas/ebinterface/Invoice.xsd'),file],{timeout:15000,windowsHide:true}));
  }
 }finally{await unlink(file);await rmdir(dir);}
});
