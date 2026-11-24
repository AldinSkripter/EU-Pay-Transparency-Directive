import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {recognizeReceipt,receiptSuggestions} from '../server/finance-ocr.js';
import {validateFinanceAttachment} from '../server/finance-files.js';
import {calculateFinance,validateFinanceProfile,financePdf} from '../server/finance.js';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {invoiceDescription} from '../shared/invoice-columns.js';

test('receipt suggestions preserve ambiguity and validate calendar dates',()=>{
  const s=receiptSuggestions('Example GmbH\nRechnung Nr. R-101\n15.11.2026\nRechnungsbetrag 1.238,00 EUR');
  assert.equal(s.reference,'R-101');assert.equal(s.amount,'1238.00');assert.equal(s.incurredOn,'2026-11-15');
  assert.equal(receiptSuggestions('Za plačilo 122,00 EUR\nRačun št. SI-42').reference,'SI-42');
  assert.equal(receiptSuggestions('Rechnungsbetrag 100,00\nZahlbetrag 80,00').amount,'');
  assert.equal(receiptSuggestions('31.02.2026').incurredOn,'');
});
test('real local OCR reads German and Slovenian images without remote models',async()=>{
  for(const country of ['DE','SI']){
    const canvas=createCanvas(1200,650),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,650);ctx.fillStyle='black';ctx.font='32px Arial';
    const lines=country==='SI'?['Studio Ljubljana','Račun št. SI-42','15.11.2026','Za plačilo 122,00 EUR']:['Example GmbH','Rechnung Nr. R-101','15.11.2026','Rechnungsbetrag 119,00 EUR'];
    lines.forEach((s,i)=>ctx.fillText(s,50,80+i*85));
    const file=validateFinanceAttachment({filename:'receipt.png',data:canvas.toBuffer('image/png').toString('base64')});
    const result=await recognizeReceipt(file,country);assert.equal(result.requiresReview,true);assert.match(result.text,/15.11.2026/);assert.equal(result.suggestions.amount,country==='SI'?'122.00':'119.00');
  }
});
test('business invoice PDF contains selected columns and exact totals in DE AT SI',async()=>{
  assert.match(invoiceDescription({description:'Design',quantity:'2',unit:'h',unitPrice:'100',discountCents:2000,discountPercent:'10'},{columns:['description','total']},c=>String(c/100)),/2 h · Einzelpreis: 100 · Rabatt: 10%/);
  for(const [country,rate] of [['DE','19'],['AT','20'],['SI','22']]){
    const issuer=validateFinanceProfile({country,confirmCountry:true,name:'Studio',design:{template:'business',columns:['position','description','quantity','unitPrice','rate','discount','total']}},country);
    const calc=calculateFinance([{description:'Design',quantity:'2',unitPrice:'100',rate,discountPercent:'10'}],country);
    const bytes=await financePdf({...calc,kind:'invoice',status:'draft',customer:{name:'Buyer'},issueDate:'2026-11-15',serviceDate:'2026-11-15',dueDate:'2026-12-15'},issuer,country);
    const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});const pdf=await task.promise;const content=(await(await pdf.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');
    assert.match(content,country==='SI'?/Cena\/enoto/:/Einzelpreis/);assert.match(content,country==='SI'?/Št\./:/Pos\./);assert.match(content,/180,00/);assert.match(content,/10%/);await task.destroy();
  }
  for(const columns of [['total'],['description','total','bad'],['description','total','total']])assert.throws(()=>validateFinanceProfile({country:'DE',confirmCountry:true,name:'Test',design:{columns}},'DE'));
});
