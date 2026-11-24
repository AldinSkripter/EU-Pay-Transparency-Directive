import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import {payImportLimits} from '../shared/pay-import-limits.js';

let active = 0;
export async function parseImportInput(body) {
  if (!body.file) {
    if (typeof body.csv !== 'string' || !body.csv.trim()) throw new Error('CSV_REQUIRED');
  } else if (typeof body.file.base64 !== 'string' || body.file.base64.length > 4*Math.ceil(payImportLimits.fileBytes/3) || body.file.base64.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.file.base64)) {
    throw new Error('INVALID_FILE');
  }
  for (const option of ['sheet','recordPath','encoding','zipEntry']) if (body[option] !== undefined && (typeof body[option] !== 'string' || body[option].length > 255)) throw new Error('INVALID_FILE');
  const bytes = body.file ? Buffer.from(body.file.base64,'base64') : Buffer.from(body.csv);
  if(body.file && bytes.toString('base64')!==body.file.base64)throw new Error('INVALID_FILE');
  if (!bytes.length || bytes.length > payImportLimits.fileBytes) throw new Error('PAYLOAD_TOO_LARGE');
  if (active >= 3) throw new Error('IMPORT_BUSY');
  active++;
  try {
    const parsed = await new Promise((resolve,reject)=> {
      const worker = new Worker(new URL('./file-parser-worker.js',import.meta.url), {
        workerData:{bytes,options:{sheet:body.sheet,headerRow:body.headerRow,recordPath:body.recordPath,encoding:body.encoding,zipEntry:body.zipEntry}},
        resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32},
      });
      const timer = setTimeout(()=>{worker.terminate();reject(new Error('IMPORT_TIMEOUT'));},20000);
      worker.once('message',result=>{clearTimeout(timer);if(result.error)reject(new Error(result.error));else resolve(result);});
      worker.once('error',()=>{clearTimeout(timer);reject(new Error('INVALID_FILE'));});
      worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new Error('INVALID_FILE'));});
    });
    return {...parsed,fileHash:createHash('sha256').update(bytes).digest('hex')};
  } finally {active--;}
}
