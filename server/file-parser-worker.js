import { parentPort, workerData } from 'node:worker_threads';
import * as XLSX from 'xlsx';
import yauzl from 'yauzl';
import { SaxesParser } from 'saxes';
import iconv from 'iconv-lite';
import { parseDelimited } from './importer.js';

const fail = code => {throw new Error(code);};
const unsafe = name => ['__proto__','constructor','prototype'].includes(name);
function tableResult(table, extra={}) {
  const headers=table[0]?.map(v=>String(v ?? '').trim());
  if(!headers?.length || headers.length>200 || headers.some(h=>!h || h.length>255 || unsafe(h)) || new Set(headers).size!==headers.length) fail('INVALID_HEADERS');
  if(table.length<2 || table.length>10001) fail('INVALID_ROW_COUNT');
  const rows=table.slice(1).map(row=> {
    if(row.length>headers.length) fail('INVALID_COLUMNS');
    return Object.fromEntries(headers.map((h,i)=>[h,String(row[i] ?? '').trim()]));
  });
  return {headers,rows,...extra};
}
async function checkWorkbookZip(bytes) {
  const zip=await new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(e,z)=>e?reject(e):resolve(z)));
  return new Promise((resolve,reject)=> {
    let total=0,count=0,hasWorkbook=false;
    const stop=e=>{zip.close();reject(e);};
    zip.on('error',stop);
    zip.on('end',()=>hasWorkbook?resolve():reject(new Error('UNSUPPORTED_FILE_FORMAT')));
    zip.on('entry',entry=> {
      const name=entry.fileName;
      if(++count>1000 || entry.uncompressedSize>32*1024*1024 || total+entry.uncompressedSize>32*1024*1024 || (entry.generalPurposeBitFlag&1) || /(?:vbaProject|externalLinks|embeddings|macrosheets)/i.test(name) || (entry.externalFileAttributes>>>16&0xf000)===0xa000) return stop(new Error('UNSAFE_WORKBOOK'));
      if(name==='xl/workbook.xml')hasWorkbook=true;
      if(name.endsWith('/'))return zip.readEntry();
      zip.openReadStream(entry,(error,stream)=> {
        if(error)return stop(error);
        stream.on('error',stop);
        stream.on('data',chunk=>{total+=chunk.length;if(total>32*1024*1024){stream.destroy();stop(new Error('UNSAFE_WORKBOOK'));}});
        stream.on('end',()=>zip.readEntry());stream.resume();
      });
    });
    zip.readEntry();
  });
}
function decode(bytes,encoding) {
  if(encoding && !['utf-8','utf-16le','utf-16be','windows-1250','windows-1252'].includes(encoding))fail('INVALID_ENCODING');
  if(bytes[0]===0xff && bytes[1]===0xfe)encoding='utf-16le';
  if(bytes[0]===0xfe && bytes[1]===0xff)encoding='utf-16be';
  const selected=encoding||'utf-8';
  try {return {text:selected.startsWith('windows')?iconv.decode(bytes,selected):new TextDecoder(selected,{fatal:true}).decode(bytes),encoding:selected};}
  catch{fail('ENCODING_REQUIRED');}
}
function parseXml(text,recordPath) {
  if(/<!\s*(?:DOCTYPE|ENTITY)/i.test(text))fail('UNSAFE_XML');
  const parser=new SaxesParser({xmlns:true}),stack=[],groups=new Map();let nodes=0;
  parser.on('doctype',()=>fail('UNSAFE_XML'));
  parser.on('error',()=>fail('INVALID_XML'));
  parser.on('opentag',tag=> {
    if(++nodes>200000 || stack.length>=24 || unsafe(tag.name))fail('XML_LIMIT_EXCEEDED');
    const node={name:tag.name,attributes:{},children:[],text:''};
    for(const [name,attr] of Object.entries(tag.attributes)) {
      if(unsafe(name))fail('UNSAFE_XML');
      if(attr.uri!=='http://www.w3.org/2000/xmlns/')node.attributes[`@${name}`]=attr.value;
    }
    stack.push(node);
  });
  const addText=text=>{if(stack.length)stack.at(-1).text+=text;};
  parser.on('text',addText);parser.on('cdata',addText);
  parser.on('closetag',()=> {
    const node=stack.pop(),path=[...stack.map(n=>n.name),node.name].join('/');
    if(stack.length)stack.at(-1).children.push(node);
    if(node.children.length || Object.keys(node.attributes).length) {
      const flatten=(n,prefix='')=> {
        const result=Object.fromEntries(Object.entries(n.attributes).map(([k,v])=>[prefix+k,v]));
        const names=n.children.map(c=>c.name);
        if(new Set(names).size!==names.length)return null;
        for(const child of n.children) {
          const name=prefix+child.name;
          if(child.children.length || Object.keys(child.attributes).length){const nested=flatten(child,name+'.');if(!nested)return null;Object.assign(result,nested);}
          else result[name]=child.text.trim();
        }
        if(n.text.trim())result[prefix+'#text']=n.text.trim();
        return result;
      };
      const row=flatten(node);
      if(row && Object.keys(row).length>=2) {const list=groups.get(path)||[];list.push(row);groups.set(path,list);}
    }
  });
  parser.write(text).close();
  const paths=[...groups.keys()].filter(p=>groups.get(p).length>1);
  const choices=paths.length?paths:[...groups.keys()].filter(p=>!([...groups.keys()].some(other=>other.startsWith(p+'/'))));
  if(!choices.length)fail('XML_RECORDS_NOT_FOUND');
  const selected=recordPath|| (choices.length===1?choices[0]:null);
  if(!selected || !choices.includes(selected))return {format:'xml',recordPaths:choices,selectionRequired:true,headers:[],rows:[]};
  const objects=groups.get(selected),headers=[...new Set(objects.flatMap(r=>Object.keys(r)))];
  return tableResult([headers,...objects.map(r=>headers.map(h=>r[h]))],{format:'xml',recordPaths:choices,recordPath:selected});
}

async function run() {
  const bytes=Buffer.from(workerData.bytes),options=workerData.options;
  if(bytes.subarray(0,2).toString()==='PK' || bytes.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'))) {
    const zipped=bytes.subarray(0,2).toString()==='PK';
    if(zipped)await checkWorkbookZip(bytes);
    const workbook=XLSX.read(bytes,{type:'buffer',cellFormula:true,bookVBA:true,cellDates:false,sheetRows:10003});
    if(workbook.vbaraw || workbook.Workbook?.Sheets?.some(s=>s.Hidden===2))fail('UNSAFE_WORKBOOK');
    for(const name of workbook.SheetNames)for(const [address,cell] of Object.entries(workbook.Sheets[name])) {
      if(!address.startsWith('!') && (cell.f || cell.F || cell.l))fail('WORKBOOK_FORMULA_OR_LINK');
    }
    const sheets=workbook.SheetNames;
    const sheet=options.sheet || (sheets.length===1?sheets[0]:null);
    if(!sheet || !sheets.includes(sheet))return {format:zipped?'xlsx':'xls',sheets,selectionRequired:true,headers:[],rows:[]};
    const headerRow=options.headerRow ?? 1;
    if(!Number.isInteger(headerRow)||headerRow<1||headerRow>50)fail('INVALID_HEADER_ROW');
    const ws=workbook.Sheets[sheet];
    const range=XLSX.utils.decode_range(ws['!fullref'] || ws['!ref'] || 'A1');
    if(range.e.r-headerRow+1>10000 || range.e.c>199)fail('INVALID_ROW_COUNT');
    const table=XLSX.utils.sheet_to_json(ws,{header:1,range:headerRow-1,raw:true,defval:'',blankrows:false});
    return tableResult(table,{format:zipped?'xlsx':'xls',sheets,sheet,headerRow});
  }
  const {text,encoding}=decode(bytes,options.encoding);
  if(text.trimStart().startsWith('<'))return {...parseXml(text,options.recordPath),encoding};
  const parsed=parseDelimited(text);
  if(parsed.headers.length>200)fail('INVALID_COLUMNS');
  return {...parsed,format:'delimited',encoding};
}
try {parentPort.postMessage(await run());}catch(error){parentPort.postMessage({error:/^[A-Z_]+$/.test(error.message)?error.message:'INVALID_FILE'});}
