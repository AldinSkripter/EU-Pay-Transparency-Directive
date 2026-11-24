import {parentPort,workerData} from 'node:worker_threads';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {recognizeReceipt,receiptSuggestions} from './finance-ocr.js';
import {readEinvoiceXml} from './finance-xml-reader.js';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
let task;
try{
 task=getDocument({data:new Uint8Array(workerData.bytes),isEvalSupported:false,useSystemFonts:false,stopAtErrors:true,standardFontDataUrl:join(dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts').replaceAll('\\','/')+'/'});const doc=await task.promise;
 if(doc.numPages>5)throw Error('FINANCE_PDF_PAGE_LIMIT');
 const attachments=await doc.getAttachments();const candidates=[...(attachments||new Map()).entries()].filter(([id,a])=>/^(factur-x|zugferd-invoice|xrechnung)\.xml$/i.test(a.filename));
 if(candidates.length>1)throw Error('FINANCE_MULTIPLE_INVOICES');
 let result;
 if(candidates.length===1){const embedded=await doc.getAttachmentContent(candidates[0][0]);result=readEinvoiceXml(embedded);result.format='PDF + '+result.format;}
 else{
  const pages=[];let scanned=false;
  for(let i=1;i<=doc.numPages;i++){
   const page=await doc.getPage(i),content=await page.getTextContent();let text=content.items.map(t=>t.str+(t.hasEOL?'\n':' ')).join('');
   if(text.trim().length<40){
    const initial=page.getViewport({scale:1}),scale=Math.min(2,1800/Math.max(initial.width,initial.height));
    const viewport=page.getViewport({scale});if(!Number.isFinite(viewport.width)||viewport.width<1||viewport.height<1)throw Error('FINANCE_INVALID_PDF');
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    text=(await recognizeReceipt({mime:'image/png',bytes:canvas.toBuffer('image/png')},workerData.country)).text;scanned=true;
   }
   pages.push(text.slice(0,30000));page.cleanup();
  }
  const text=pages.join('\n').slice(0,60000);result={text,suggestions:receiptSuggestions(text),requiresReview:true,format:scanned?'PDF / OCR':'PDF / Text',validated:false};
 }
 parentPort.postMessage({result});
}catch(e){parentPort.postMessage({error:e.message});}finally{if(task)await task.destroy();}
