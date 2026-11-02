import { parentPort, workerData } from 'node:worker_threads';
import * as XLSX from 'xlsx';
import yauzl from 'yauzl';
import { SaxesParser } from 'saxes';
import iconv from 'iconv-lite';
import { parseDelimited, parseFixedWidth } from './importer.js';
import { textEncodingIds } from '../shared/import-formats.js';

const MB = 1024 * 1024;
const fail = code => {throw new Error(code);};
const unsafe = name => ['__proto__','constructor','prototype'].includes(name);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

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

// ---- ZIP: workbooks (xlsx, xlsb, ods) and plain containers -------------------------------------------------
// Every archive is scanned with hard limits before anything is parsed: entry count, uncompressed size,
// encryption and symbolic links. Entry names are only displayed, never used as file paths.
function scanZip(bytes) {
  return new Promise((resolve,reject)=> {
    yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(openError,zip)=> {
      if(openError)return reject(new Error('INVALID_FILE'));
      let total=0,count=0,mimetype='';const names=[];
      const stop=e=>{zip.close();reject(e);};
      zip.on('error',()=>stop(new Error('INVALID_FILE')));
      zip.on('end',()=>resolve({names,mimetype}));
      zip.on('entry',entry=> {
        const name=entry.fileName;
        if(++count>1000 || entry.uncompressedSize>32*MB || total+entry.uncompressedSize>32*MB || (entry.generalPurposeBitFlag&1) || name.length>255 || /[\u0000-\u001f]/.test(name) || (entry.externalFileAttributes>>>16&0xf000)===0xa000) return stop(new Error('UNSAFE_WORKBOOK'));
        names.push(name);
        if(name.endsWith('/'))return zip.readEntry();
        zip.openReadStream(entry,(error,stream)=> {
          if(error)return stop(error);
          stream.on('error',stop);
          stream.on('data',chunk=>{
            total+=chunk.length;
            if(total>32*MB){stream.destroy();stop(new Error('UNSAFE_WORKBOOK'));}
            else if(name==='mimetype' && mimetype.length<200)mimetype+=chunk.toString('latin1');
          });
          stream.on('end',()=>zip.readEntry());
        });
      });
      zip.readEntry();
    });
  });
}
function readZipEntry(bytes,wanted,limit) {
  return new Promise((resolve,reject)=> {
    yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(openError,zip)=> {
      if(openError)return reject(new Error('INVALID_FILE'));
      const stop=e=>{zip.close();reject(e);};
      zip.on('error',()=>stop(new Error('INVALID_FILE')));
      zip.on('end',()=>reject(new Error('INVALID_FILE')));
      zip.on('entry',entry=> {
        if(entry.fileName!==wanted)return zip.readEntry();
        zip.openReadStream(entry,(error,stream)=> {
          if(error)return stop(error);
          const chunks=[];let size=0;
          stream.on('error',stop);
          stream.on('data',chunk=>{size+=chunk.length;if(size>limit){stream.destroy();stop(new Error('PAYLOAD_TOO_LARGE'));}else chunks.push(chunk);});
          stream.on('end',()=>{zip.close();resolve(Buffer.concat(chunks));});
        });
      });
      zip.readEntry();
    });
  });
}
function classifyZip({names,mimetype}) {
  if(names.includes('xl/workbook.xml'))return 'xlsx';
  if(names.includes('xl/workbook.bin'))return 'xlsb';
  if(mimetype.trim()==='application/vnd.oasis.opendocument.spreadsheet' && names.includes('content.xml'))return 'ods';
  return 'container';
}
const unsafeWorkbookParts=/(?:vbaProject|externalLinks|embeddings|macrosheets|^Basic\/|^Scripts\/|^Dialogs\/|^Object \d)/i;

// ---- Workbooks (all spreadsheet formats go through the same checks) ---------------------------------------
function fromWorkbook(workbook, format, options) {
  if(workbook.vbaraw || workbook.Workbook?.Sheets?.some(s=>s.Hidden===2))fail('UNSAFE_WORKBOOK');
  for(const name of workbook.SheetNames)for(const [address,cell] of Object.entries(workbook.Sheets[name])) {
    if(!address.startsWith('!') && (cell.f || cell.F || cell.l))fail('WORKBOOK_FORMULA_OR_LINK');
  }
  const sheets=workbook.SheetNames;
  const sheet=options.sheet || (sheets.length===1?sheets[0]:null);
  if(!sheet || !sheets.includes(sheet))return {format,sheets,selectionRequired:true,headers:[],rows:[]};
  const headerRow=options.headerRow ?? 1;
  if(!Number.isInteger(headerRow)||headerRow<1||headerRow>50)fail('INVALID_HEADER_ROW');
  const ws=workbook.Sheets[sheet];
  const range=XLSX.utils.decode_range(ws['!fullref'] || ws['!ref'] || 'A1');
  if(range.e.r-headerRow+1>10000 || range.e.c>199)fail('INVALID_ROW_COUNT');
  const table=XLSX.utils.sheet_to_json(ws,{header:1,range:headerRow-1,raw:true,defval:'',blankrows:false});
  return tableResult(table,{format,sheets,sheet,headerRow});
}
const readWorkbook=(data,type)=>XLSX.read(data,{type,cellFormula:true,bookVBA:true,cellDates:false,sheetRows:10003});

// ---- Text ------------------------------------------------------------------------------------------------
function decode(bytes,encoding) {
  if(encoding && !textEncodingIds.includes(encoding))fail('INVALID_ENCODING');
  if(bytes[0]===0xff && bytes[1]===0xfe)encoding='utf-16le';
  if(bytes[0]===0xfe && bytes[1]===0xff)encoding='utf-16be';
  const selected=encoding||'utf-8';
  try {
    // Single-byte code pages map every byte, so only the Unicode encodings can reject the input.
    return {text:selected.startsWith('utf-')?new TextDecoder(selected,{fatal:true}).decode(bytes):iconv.decode(bytes,selected),encoding:selected};
  }catch{fail('ENCODING_REQUIRED');}
}
function lineStart(text,line) {
  let index=0;
  for(let n=1;n<line;n++){
    const next=text.slice(index).search(/\r\n|\n|\r/);
    if(next<0)fail('INVALID_HEADER_ROW');
    index+=next+(text.startsWith('\r\n',index+next)?2:1);
  }
  return index;
}
function parseText(text,options) {
  const plain=text.replace(/^\uFEFF/,'');
  let headerRow=options.headerRow ?? 1;
  if(!Number.isInteger(headerRow)||headerRow<1||headerRow>50)fail('INVALID_HEADER_ROW');
  // DATEV exports start with a metadata line ("EXTF";700;...) before the column names.
  const datev=/^"?(?:EXTF|DTVF)"?[;,]/.test(plain);
  if(datev && headerRow===1)headerRow=2;
  const body=headerRow>1?plain.slice(lineStart(plain,headerRow)):plain;
  try {return {...parseDelimited(body),format:datev?'datev':'delimited',headerRow};}
  catch(error) {
    if(error.message!=='INVALID_CSV')throw error;
    // Older ASC / DAT / LST / PRN exports align columns with spaces instead of separators.
    try {return {...parseFixedWidth(body),format:'fixed-width',headerRow};}catch{throw error;}
  }
}

// ---- XML -------------------------------------------------------------------------------------------------
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

// ---- JSON ------------------------------------------------------------------------------------------------
// Records are the objects of an array, either the document itself or an array inside it (HRIS exports
// like {"employees":[...]}). Nested objects become dotted columns; nested arrays are rejected, never guessed.
function parseJson(data,recordPath) {
  const arrays=[];
  const find=(value,path,depth)=> {
    if(depth>6)return;
    if(Array.isArray(value)){if(value.length && value.every(isObject))arrays.push(path||'$');return;}
    if(isObject(value))for(const [key,child] of Object.entries(value)){if(unsafe(key))fail('UNSAFE_JSON');find(child,path?`${path}.${key}`:key,depth+1);}
  };
  find(data,'',0);
  if(!arrays.length)fail('JSON_RECORDS_NOT_FOUND');
  const selected=recordPath||(arrays.length===1?arrays[0]:null);
  if(!selected || !arrays.includes(selected))return {format:'json',recordPaths:arrays,selectionRequired:true,headers:[],rows:[]};
  let list=data;
  if(selected!=='$')for(const key of selected.split('.'))list=list[key];
  let nodes=0;
  const flatten=(object,prefix,depth,out)=> {
    if(depth>6)fail('JSON_LIMIT_EXCEEDED');
    for(const [key,value] of Object.entries(object)) {
      if(unsafe(key)||++nodes>400000)fail('JSON_LIMIT_EXCEEDED');
      if(isObject(value))flatten(value,`${prefix}${key}.`,depth+1,out);
      else if(Array.isArray(value))fail('JSON_NESTED_ARRAY');
      else out[prefix+key]=value===null?'':String(value);
    }
    return out;
  };
  const objects=list.map(item=>flatten(item,'',0,{}));
  const headers=[...new Set(objects.flatMap(r=>Object.keys(r)))];
  return tableResult([headers,...objects.map(r=>headers.map(h=>r[h]))],{format:'json',recordPaths:arrays,recordPath:selected});
}
function tryJson(text) {
  const first=text[0];
  if(first!=='{' && first!=='[')return undefined;
  try {return {value:JSON.parse(text)};}
  catch{
    if(first==='{')fail('INVALID_JSON');
    return undefined;   // a "[Section]" line of an INI-style text export is not JSON
  }
}

// ---- Dispatcher ------------------------------------------------------------------------------------------
async function parseBytes(bytes,options,depth) {
  if(bytes.subarray(0,2).toString()==='PK') {
    const scan=await scanZip(bytes),kind=classifyZip(scan);
    if(kind==='container') {
      if(depth>0)fail('UNSUPPORTED_FILE_FORMAT');
      const files=scan.names.filter(n=>!n.endsWith('/') && !/^__MACOSX\//.test(n) && !/(?:^|\/)(?:\.DS_Store|Thumbs\.db)$/i.test(n));
      if(!files.length)fail('UNSUPPORTED_FILE_FORMAT');
      const entry=options.zipEntry || (files.length===1?files[0]:null);
      if(!entry || !files.includes(entry))return {format:'zip',container:'zip',zipEntries:files,selectionRequired:true,headers:[],rows:[]};
      const inner=await parseBytes(await readZipEntry(bytes,entry,8*MB),{...options,zipEntry:undefined},depth+1);
      return {...inner,container:'zip',zipEntries:files,zipEntry:entry};
    }
    // XLSB stores formulas in a binary form whose detection cannot be verified here, so it is not accepted.
    if(kind==='xlsb')fail('XLSB_NOT_SUPPORTED');
    if(scan.names.some(name=>unsafeWorkbookParts.test(name)))fail('UNSAFE_WORKBOOK');
    return fromWorkbook(readWorkbook(bytes,'buffer'),kind,options);
  }
  if(bytes.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))return fromWorkbook(readWorkbook(bytes,'buffer'),'xls',options);

  const {text,encoding}=decode(bytes,options.encoding);
  const lead=text.replace(/^\uFEFF/,'').trimStart(),head=lead.slice(0,4000);
  let result;
  if(lead.startsWith('<')) {
    if(/urn:schemas-microsoft-com:office:spreadsheet/.test(head)) {   // Excel 2003 XML
      if(/<!\s*(?:DOCTYPE|ENTITY)/i.test(text))fail('UNSAFE_XML');
      result=fromWorkbook(readWorkbook(lead,'string'),'spreadsheetml',options);
    }else if(/^<!doctype\s+html[^[]*>|^<html[\s>]|^<table[\s>]/i.test(lead)) {   // HTML table saved as .xls
      result=fromWorkbook(readWorkbook(lead,'string'),'html',options);
    }else result=parseXml(text,options.recordPath);
  }else {
    const json=tryJson(lead);
    result=json?parseJson(json.value,options.recordPath):parseText(text,options);
  }
  if(result.headers.length>200)fail('INVALID_COLUMNS');
  return {...result,encoding};
}

try {parentPort.postMessage(await parseBytes(Buffer.from(workerData.bytes),workerData.options,0));}
catch(error){parentPort.postMessage({error:/^[A-Z_]+$/.test(error.message)?error.message:'INVALID_FILE'});}
