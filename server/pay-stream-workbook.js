import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {join,posix} from 'node:path';
import yauzl from 'yauzl';
import {SaxesParser} from 'saxes';
import {unseal} from './pay-upload-crypto.js';

const fail=code=>{throw Error(code);};
class EncryptedReader extends yauzl.RandomAccessReader{
 constructor(job,key,dir){super();this.job=job;this.key=key;this.dir=dir;this.cache=new Map();}
 _readStreamForRange(start,end){const self=this;return Readable.from((async function*(){
  const chunkSize=4*1024*1024;
  for(let i=Math.floor(start/chunkSize);i<Math.ceil(end/chunkSize);i++){
   let bytes=self.cache.get(i);if(!bytes){bytes=unseal(self.key,`${self.job.companyId}:${self.job.id}:${i}`,await readFile(join(self.dir,`${i}.enc`)));if(self.cache.size>=4)self.cache.delete(self.cache.keys().next().value);self.cache.set(i,bytes);}
   yield bytes.subarray(Math.max(0,start-i*chunkSize),Math.min(bytes.length,end-i*chunkSize));
  }
 })());}
}
async function archive(job,key,dir){
 const zip=await yauzl.fromRandomAccessReaderPromise(new EncryptedReader(job,key,dir),job.size,{lazyEntries:true,autoClose:false,validateEntrySizes:true});
 const entries=new Map();let total=0;
 try{for await(const entry of zip.eachEntry()){
  if(entries.size>=1000||(total+=entry.uncompressedSize)>4*1024*1024*1024||entry.uncompressedSize>4*1024*1024*1024||(entry.generalPurposeBitFlag&1)||entry.fileName.length>255||/[\x00-\x1f]/.test(entry.fileName)||(entry.externalFileAttributes>>>16&0xf000)===0xa000)fail('UNSAFE_WORKBOOK');
  if(entries.has(entry.fileName))fail('UNSAFE_WORKBOOK');entries.set(entry.fileName,entry);
 }}catch(e){zip.close();throw e;}
 return {zip,entries,open:async name=>{if(!entries.has(name))fail('INVALID_FILE');return zip.openReadStreamPromise(entries.get(name));}};
}
async function sax(stream,events){const p=new SaxesParser({xmlns:true});p.on('doctype',()=>fail('UNSAFE_XML'));p.on('error',()=>fail('INVALID_XML'));for(const [k,fn] of Object.entries(events))p.on(k,fn);const d=new TextDecoder('utf-8',{fatal:true});for await(const b of stream)p.write(d.decode(b,{stream:true}));p.write(d.decode()).close();}
const attr=(tag,name)=>Object.values(tag.attributes).find(a=>a.name===name||a.local===name)?.value;
function table(maxRows=10000,sink=null,discard=false){let headers,size=0;const rows=[];let count=0;return {add(values){
 if(!values.some(v=>String(v??'').trim()))return;
 if(!headers){headers=values.map(v=>String(v??'').trim());if(headers.length<2||headers.length>200||headers.some(h=>!h||h.length>255||['__proto__','constructor','prototype'].includes(h))||new Set(headers).size!==headers.length)fail('INVALID_HEADERS');return;}
 if(count>=maxRows)fail('INVALID_ROW_COUNT');if(values.length>headers.length)fail('INVALID_COLUMNS');
 const row=Object.fromEntries(headers.map((h,i)=>[h,String(values[i]??'').trim()]));size+=Buffer.byteLength(JSON.stringify(row));if(!sink&&!discard&&size>128*1024*1024)fail('IMPORT_RESULT_TOO_LARGE');count++;if(sink)sink.add(row);else if(!discard)rows.push(row);
 },result(extra){if(!headers||!count)fail('INVALID_ROW_COUNT');return {headers,rows,...(sink?sink.result():{}),...extra};}};}
async function xlsx(a,options){
 const sheets=[],rels=new Map(),strings=[];let size=0;
 await sax(await a.open('xl/workbook.xml'),{opentag:t=>{if(t.local==='sheet'){if(attr(t,'state')==='veryHidden')fail('UNSAFE_WORKBOOK');sheets.push({name:attr(t,'name'),id:attr(t,'id')});}}});
 await sax(await a.open('xl/_rels/workbook.xml.rels'),{opentag:t=>{if(t.local==='Relationship'){if(attr(t,'TargetMode')==='External')fail('WORKBOOK_FORMULA_OR_LINK');const target=attr(t,'Target');rels.set(attr(t,'Id'),target.startsWith('/')?target.slice(1):posix.normalize('xl/'+target));}}});
 const names=sheets.map(s=>s.name),chosen=options.sheet||(sheets.length===1?names[0]:null);
 if(!chosen||!names.includes(chosen))return {format:'xlsx',sheets:names,selectionRequired:true,headers:[],rows:[]};
 if(a.entries.has('xl/sharedStrings.xml')){
  let text='',inside=false;
  await sax(await a.open('xl/sharedStrings.xml'),{opentag:t=>{if(t.local==='si')text='';if(t.local==='t')inside=true;},text:t=>{if(inside){text+=t;if(text.length>1024*1024)fail('IMPORT_CELL_TOO_LARGE');}},closetag:t=>{if(t.local==='t')inside=false;if(t.local==='si'){size+=Buffer.byteLength(text);if(size>64*1024*1024||strings.length>=1000000)fail('IMPORT_SHARED_STRINGS_LIMIT');strings.push(text);}}});
 }
 let selected;
 for(const sheet of sheets){
  const output=table(options.kind==='transactions'?Infinity:10000,sheet.name===chosen?options.sink:null,sheet.name!==chosen);let row=[],rowNumber=0,cell=null,inside=false;
  await sax(await a.open(rels.get(sheet.id)),{opentag:t=>{
   if(['f','hyperlink'].includes(t.local))fail('WORKBOOK_FORMULA_OR_LINK');
   if(t.local==='row'){rowNumber=Number(attr(t,'r'));if(!Number.isInteger(rowNumber)||rowNumber<1||rowNumber>(options.kind==='transactions'?1048576:10001)+(options.headerRow||1))fail('INVALID_ROW_COUNT');row=[];}
   if(t.local==='c'){const address=attr(t,'r')||'',letters=address.match(/^[A-Z]+/)?.[0];if(!letters)fail('INVALID_FILE');let col=0;for(const c of letters)col=col*26+c.charCodeAt(0)-64;if(col>200)fail('INVALID_COLUMNS');cell={col:col-1,type:attr(t,'t'),text:''};}
   if(['v','t'].includes(t.local))inside=true;
  },text:t=>{if(inside&&cell){cell.text+=t;if(cell.text.length>1024*1024)fail('IMPORT_CELL_TOO_LARGE');}},closetag:t=>{
   if(['v','t'].includes(t.local))inside=false;
   if(t.local==='c'){if(cell.type==='e')fail('INVALID_FILE');const value=cell.type==='s'?strings[Number(cell.text)]:cell.text;if(value===undefined)fail('INVALID_FILE');row[cell.col]=value;cell=null;}
   if(t.local==='row'&&rowNumber>=(options.headerRow||1)){for(let i=0;i<row.length;i++)row[i]??='';output.add(row);}
  }});
  if(sheet.name===chosen)selected=output;
 }
 return selected.result({format:'xlsx',sheets:names,sheet:chosen,headerRow:options.headerRow||1});
}
async function ods(a,options){
 const names=[];await sax(await a.open('content.xml'),{opentag:t=>{if(t.local==='table'){const name=attr(t,'name');if(!name||names.includes(name)||names.length>=1000)fail('INVALID_FILE');names.push(name);}}});
 const chosen=options.sheet||(names.length===1?names[0]:null);if(!chosen||!names.includes(chosen))return {format:'ods',sheets:names,selectionRequired:true,headers:[],rows:[]};
 let current,output,selected,row=[],cell=null,texting=false,rowRepeat=1,rowNumber=0;
 await sax(await a.open('content.xml'),{opentag:t=>{
  if(attr(t,'formula')||attr(t,'href'))fail('WORKBOOK_FORMULA_OR_LINK');
  if(t.local==='table'){current=attr(t,'name');if(!current||!names.includes(current))fail('INVALID_FILE');output=table(options.kind==='transactions'?Infinity:10000,!chosen&&names.length===1||chosen===current?options.sink:null,!!chosen&&chosen!==current);rowNumber=0;}
  if(t.local==='table-row'){row=[];rowRepeat=Number(attr(t,'number-rows-repeated')||1);if(!Number.isInteger(rowRepeat)||rowRepeat<1||rowRepeat>(options.kind==='transactions'?1000000:10001))fail('INVALID_ROW_COUNT');}
  if(['table-cell','covered-table-cell'].includes(t.local)){const repeats=Number(attr(t,'number-columns-repeated')||1);if(!Number.isInteger(repeats)||repeats<1||repeats>200)fail('INVALID_COLUMNS');cell={repeats,value:attr(t,'value')??attr(t,'string-value')??'',text:''};}
  if(t.local==='p')texting=true;
 },text:t=>{if(texting&&cell){cell.text+=t;if(cell.text.length>1024*1024)fail('IMPORT_CELL_TOO_LARGE');}},closetag:t=>{
  if(t.local==='p')texting=false;
  if(['table-cell','covered-table-cell'].includes(t.local)){if(!cell)fail('INVALID_FILE');if(row.length+cell.repeats>200)fail('INVALID_COLUMNS');for(let i=0;i<cell.repeats;i++)row.push(cell.value||cell.text);cell=null;}
  if(t.local==='table-row'){for(let i=0;i<rowRepeat;i++){rowNumber++;if(rowNumber>=(options.headerRow||1))output.add(row);}}
  if(t.local==='table'){if(current===chosen||!chosen&&names.length===1)selected=output;}
 }});
 if(!chosen&&names.length!==1||chosen&&!names.includes(chosen))return {format:'ods',sheets:names,selectionRequired:true,headers:[],rows:[]};
 return selected.result({format:'ods',sheets:names,sheet:chosen||names[0],headerRow:options.headerRow||1});
}
export async function streamWorkbook(job,key,dir,options,parseInner){
 const a=await archive(job,key,dir);
 try{
  if([...a.entries.keys()].some(n=>/(?:vbaProject|externalLinks|embeddings|macrosheets|^Basic\/|^Scripts\/|^Dialogs\/|^Object \d)/i.test(n)))fail('UNSAFE_WORKBOOK');
  if(a.entries.has('xl/workbook.xml'))return await xlsx(a,options);
  if(a.entries.has('xl/workbook.bin'))fail('XLSB_NOT_SUPPORTED');
  if(a.entries.has('content.xml')&&a.entries.has('mimetype'))return await ods(a,options);
  const entries=[...a.entries.keys()].filter(n=>!n.endsWith('/')&&!/^__MACOSX\//.test(n)&&!/(?:^|\/)(?:\.DS_Store|Thumbs\.db)$/i.test(n));
  const entry=options.zipEntry||(entries.length===1?entries[0]:null);
  if(!entry||!entries.includes(entry))return {format:'zip',zipEntries:entries,selectionRequired:true,headers:[],rows:[]};
  if(a.entries.get(entry).uncompressedSize>1024*1024*1024)fail('PAYLOAD_TOO_LARGE');
  const result=await parseInner(()=>a.open(entry),a.entries.get(entry).uncompressedSize,entry);return {...result,container:'zip',zipEntries:entries,zipEntry:entry};
 }finally{a.zip.close();}
}
