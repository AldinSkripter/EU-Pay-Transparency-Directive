import {Worker} from 'node:worker_threads';
import {recognizeReceipt} from './finance-ocr.js';
import {readEinvoiceXml} from './finance-xml-reader.js';
let pdfActive=false;
export async function readFinanceReceipt(file,country){
 if(file.mime==='application/xml'){try{return readEinvoiceXml(file.bytes);}catch(e){throw Object.assign(e,{status:400});}}
 if(file.mime!=='application/pdf')return recognizeReceipt(file,country);
 if(pdfActive)throw Object.assign(new Error('FINANCE_OCR_BUSY'),{status:429});pdfActive=true;
 let worker,timer;
 try{return await new Promise((resolve,reject)=>{
  worker=new Worker(new URL('./finance-pdf-worker.js',import.meta.url),{workerData:{bytes:file.bytes,country},resourceLimits:{maxOldGenerationSizeMb:256}});
  timer=setTimeout(()=>reject(Object.assign(new Error('FINANCE_OCR_TIMEOUT'),{status:408})),60000);
  worker.once('message',message=>message.error?reject(Object.assign(new Error(message.error),{status:400})):resolve(message.result));
  worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(Object.assign(new Error('FINANCE_PDF_FAILED'),{status:400}));});
 });}finally{clearTimeout(timer);if(worker)await worker.terminate();pdfActive=false;}
}
