import {parentPort,workerData} from 'node:worker_threads';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {parse} from 'csv-parse';
import iconv from 'iconv-lite';
import {uploadChunks} from './pay-upload-crypto.js';
import {parseBytes} from './file-parser-worker.js';
import {payImportLimits} from '../shared/pay-import-limits.js';
import {textEncodingIds} from '../shared/import-formats.js';
import {streamJson,streamXml} from './pay-stream-structured.js';
import {PayRowPages} from './pay-row-pages.js';
import {streamWorkbook} from './pay-stream-workbook.js';

const fail=code=>{throw Error(code);};
const meta=workerData.job,key=Buffer.from(workerData.key),hash=createHash('sha256');
const maxRows=workerData.options.kind==='transactions'?Infinity:10000;
const sink=workerData.options.kind==='transactions'?new PayRowPages({...meta,key,dir:workerData.dir}):null;
let consumed=0,lastProgress=0;
async function* source(track=true){for await(const bytes of uploadChunks({...meta,key,dir:workerData.dir})){
 if(track){consumed+=bytes.length;hash.update(bytes);}
 if(consumed-lastProgress>8*1024*1024){parentPort.postMessage({progress:Math.floor(consumed/meta.size*95)});lastProgress=consumed;}
 yield bytes;
}}
async function parseLargeText(factory=()=>uploadChunks({...meta,key,dir:workerData.dir}),trackedSource=source){
 // Infer only a uniform delimiter from a bounded header. Never infer salary meaning or row values.
 let head='';for await(const b of await factory()){const content=b.toString('utf8').replace(/^\uFEFF/,'').trimStart();if(content){head=content.slice(0,65536);break;}}
 const lead=head.replace(/^\uFEFF/,'').trimStart();
 if(lead.startsWith('{')||lead.startsWith('['))return streamJson(trackedSource,workerData.options.recordPath,maxRows,sink);
 if(lead.startsWith('<'))return streamXml(trackedSource,workerData.options.recordPath,maxRows);
 if(head.startsWith('PK')||head.startsWith('\uFFFD'))fail('LARGE_FORMAT_NEEDS_CONVERSION');
 const o=workerData.options,encoding=o.encoding||'utf-8';if(!textEncodingIds.includes(encoding))fail('INVALID_ENCODING');
 const decoder=encoding.startsWith('utf-')?new TextDecoder(encoding,{fatal:true}):null;
 const decode=async function*(){for await(const b of trackedSource())yield decoder?decoder.decode(b,{stream:true}):iconv.decode(b,encoding);if(decoder)yield decoder.decode();};
 // Single-byte code pages are stateless; UTF encodings use a streaming decoder across chunk boundaries.
 let headerRow=o.headerRow||1;if(/^\uFEFF?"?(?:EXTF|DTVF)"?[;,]/.test(head)&&headerRow===1)headerRow=2;
 const lines=head.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/),header=lines[headerRow-1]||'';
 const scores=[',',';','\t','|'].map(delimiter=>({delimiter,count:header.split(delimiter).length-1})).sort((a,b)=>b.count-a.count);
 if(!scores[0].count||scores[0].count===scores[1].count)fail('IMPORT_DELIMITER_REQUIRED');
 const parser=Readable.from(decode()).pipe(parse({delimiter:scores[0].delimiter,skip_empty_lines:true,bom:true,trim:true,from_line:headerRow,max_record_size:2*1024*1024}));
 let headers,bytes=0;const rows=[];
 for await(const values of parser){
  if(!headers){headers=values;if(headers.length<2||headers.length>200||new Set(headers).size!==headers.length||headers.some(h=>!h||h.length>255||['__proto__','constructor','prototype'].includes(h)))fail('INVALID_HEADERS');continue;}
  if(values.length!==headers.length)fail('INVALID_COLUMNS');
  if(rows.length>=maxRows)fail('INVALID_ROW_COUNT');
  const row=Object.fromEntries(headers.map((h,i)=>[h,values[i]]));bytes+=Buffer.byteLength(JSON.stringify(row));if(!sink&&bytes>128*1024*1024)fail('IMPORT_RESULT_TOO_LARGE');
  if(sink)sink.add(row);else rows.push(row);
 }
 if(!(sink?sink.count:rows.length))fail('INVALID_ROW_COUNT');
 return {format:'delimited',headers,rows,...(sink?sink.result():{}),headerRow,encoding,delimiter:scores[0].delimiter};
}
try{
 let parsed;
 let first;for await(const b of uploadChunks({...meta,key,dir:workerData.dir})){first=b;break;}
 if(first[0]===80&&first[1]===75){
   parsed=await streamWorkbook(meta,key,workerData.dir,{...workerData.options,sink},async(factory,size,entry)=>{
    const inner=async function*(){for await(const b of await factory())yield b;};
    if(size<=payImportLimits.fileBytes&&(workerData.options.kind!=='transactions'||/\.(?:xlsx|ods|xls|html?|prn)$/i.test(entry))){const chunks=[];for await(const b of inner())chunks.push(b);return parseBytes(Buffer.concat(chunks),workerData.options,1);}
    return parseLargeText(factory,inner);
   });
   for await(const b of source()){} // Full outer content digest, including entries not selected for import.
 }else if(workerData.options.kind==='transactions'&&/\.(?:csv|txt|tsv|tab|psv|asc|dat|exp|lst|json|xml)$/i.test(meta.name)){parsed=await parseLargeText();}
 else if(meta.size<=payImportLimits.fileBytes){const blocks=[];for await(const b of source())blocks.push(b);parsed=await parseBytes(Buffer.concat(blocks),workerData.options,0);}
 else parsed=await parseLargeText();
 if(consumed!==meta.size)fail('IMPORT_UPLOAD_INCOMPLETE');
 if(sink&&!parsed.paged&&!parsed.selectionRequired){for(const row of parsed.rows)sink.add(row);Object.assign(parsed,sink.result());}
 parsed.fileHash=hash.digest('hex');parentPort.postMessage({result:parsed});
}catch(e){parentPort.postMessage({error:/^[A-Z_]+$/.test(e.message)?e.message:(e.code?.startsWith('CSV_')?'INVALID_CSV':'INVALID_FILE'),debug:workerData.diagnostics?e.stack:undefined});}
