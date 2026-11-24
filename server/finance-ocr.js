import {createWorker} from 'tesseract.js';
import deu from '@tesseract.js-data/deu';
import slv from '@tesseract.js-data/slv';

// Conservative suggestions, never an accounting decision. Missing values stay empty.
export function receiptSuggestions(text) {
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const ref=text.match(/(?:Rechnungs?(?:nummer|nr\.?|[- ]Nr\.?)|Beleg(?:nummer|nr\.?)|Račun\s*(?:št\.?|številka)|Številka\s*računa)\s*[:#]?\s*([\w/-]+)/iu);
  const dates=[...text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/g)].map(m=>`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`).filter(s=>{const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;});
  const totals=lines.filter(s=>/(gesamtbetrag|rechnungsbetrag|bruttobetrag|zu zahlen|zahlbetrag|za plačilo|skupaj za plačilo)/i.test(s)).flatMap(s=>[...s.matchAll(/\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})\b/g)].map(m=>m[1].includes(',')?m[1].replaceAll('.','').replace(',','.'):m[1]));
  const unique=[...new Set(totals)];
  return {supplier:lines[0]?.slice(0,255)||'',reference:ref?.[1]||'',incurredOn:dates[0]||'',amount:unique.length===1?unique[0]:'',category:'other',note:''};
}
let active=false;
export async function recognizeReceipt(file,country) {
  if(!['image/jpeg','image/png'].includes(file.mime))throw Object.assign(new Error('FINANCE_OCR_IMAGE_REQUIRED'),{status:400});
  if(active)throw Object.assign(new Error('FINANCE_OCR_BUSY'),{status:429});
  active=true;let worker,timer,expired=false;
  try {
    const lang=country==='SI'?slv:deu;
    const operation=(async()=>{
      worker=await createWorker(lang.code,1,{langPath:lang.langPath,gzip:true,cacheMethod:'none',errorHandler:()=>{}});
      if(expired){await worker.terminate();throw new Error('FINANCE_OCR_TIMEOUT');}
      const result=await worker.recognize(file.bytes);
      const text=result.data.text.slice(0,30000);
      return {text,confidence:result.data.confidence,suggestions:receiptSuggestions(text),requiresReview:true};
    })();
    return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Object.assign(new Error('FINANCE_OCR_TIMEOUT'),{status:408}));},60000);})]);
  } finally {clearTimeout(timer);if(worker)await worker.terminate();active=false;}
}
