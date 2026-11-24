import test from 'node:test';
import assert from 'node:assert/strict';
import DecoderModule from '@zxing/library/cjs/core/qrcode/decoder/Decoder.js';
import {paymentPayload,qrMatrix,paymentQr,urlMatrix} from '../server/finance-qr.js';
import {financePdf} from '../server/finance.js';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const Decoder=DecoderModule.default;
const issuer={name:'Žiga Š Č',address:'Šubičeva 2',postalCode:'1000',city:'Ljubljana',iban:'SI56020170014356205',accent:'#7451f8',design:{paymentQr:true}};
const invoice={kind:'invoice',status:'issued',number:'RE-2026-001',grossCents:10980,netCents:9000,taxCents:1980,taxes:[{rate:'22',netCents:9000,taxCents:1980}],lines:[{description:'Service',quantity:'1',unit:'h',unitPrice:'90',rate:'22',netCents:9000}],dueDate:'2026-12-15',issueDate:'2026-11-15',serviceDate:'2026-11-15',customer:{name:'Čebelica',address:'Cesta 1',postalCode:'2000',city:'Maribor'}};
function decode(matrix){return new Decoder().decodeBooleanArray(matrix.map(r=>r.map(Boolean)),null);}
test('EPC codes round-trip through an independent decoder for DE and AT',()=>{
  for(const country of ['DE','AT']){
    const p=paymentPayload(invoice,issuer,country),matrix=qrMatrix(p),decoded=decode(matrix);
    assert.equal(decoded.getText(),p.text);assert.equal(decoded.getECLevel(),'M');assert.ok(matrix.length<=69);
    assert.match(p.text,/^BCD\n002\n1\nSCT\n\n/);assert.ok(p.text.includes('EUR109.80'));assert.ok(!p.text.endsWith('\n'));
  }
});
test('UPN has ECI ISO-8859-2, fixed version 15/M, exact fields and checksum',()=>{
  const p=paymentPayload(invoice,issuer,'SI'),matrix=qrMatrix(p),decoded=decode(matrix),fields=p.text.split('\n');
  assert.equal(matrix.length,77);assert.equal(decoded.getECLevel(),'M');assert.equal(decoded.getText(),p.text);
  assert.equal(fields[5],'Čebelica');assert.equal(fields[8],'00000010980');assert.equal(fields[13],'15.12.2026');assert.equal(fields[15],'SI99');assert.equal(fields[16],'Žiga Š Č');
  assert.equal(Number(fields[19]),fields.slice(0,19).reduce((n,v)=>n+v.length+1,0));assert.equal(fields.length,21);
  // First decoded data bits must carry ECI mode 7, assignment 4, then byte mode 4.
  const raw=decoded.getRawBytes();assert.equal(raw[0],0x70);assert.equal(raw[1]>>4,4);assert.equal(raw[1]&15,4);
});
test('invalid QR inputs fail explicitly and demos cannot encode a real payment',()=>{
  for(const [d,i,c] of [[{...invoice,grossCents:0},issuer,'DE'],[invoice,{...issuer,iban:'SI56000000000000000'},'SI'],[invoice,{...issuer,name:'Bad\nName'},'DE'],[invoice,{...issuer,name:'😀'},'SI'],[{...invoice,kind:'offer'},issuer,'AT']])assert.throws(()=>paymentPayload(d,i,c),/FINANCE_QR_INVALID/);
  for(const d of [{...invoice,status:'draft'},{...invoice,demo:true}]){
    const qr=paymentQr(d,issuer,'SI');assert.equal(qr.testOnly,true);assert.match(decode(qr.matrix).getText(),/^EQUITENSA TEST/);
  }
  assert.equal(paymentQr(invoice,{...issuer,design:{paymentQr:false}},'SI'),null);
  assert.equal(decode(urlMatrix('https://equitensa.si/example')).getText(),'https://equitensa.si/example');
});
test('PDF includes a readable QR section and labels test-only documents',async()=>{
  const pdf=await financePdf({...invoice,demo:true},issuer,'SI');
  const loading=getDocument({data:new Uint8Array(pdf),useSystemFonts:true});const document=await loading.promise;
  let text='';for(let n=1;n<=document.numPages;n++)text+=(await(await document.getPage(n)).getTextContent()).items.map(x=>x.str).join(' ');
  assert.match(text,/UPN QR.*TEST/);assert.match(text,/ni plačilni nalog/);await loading.destroy();
});
