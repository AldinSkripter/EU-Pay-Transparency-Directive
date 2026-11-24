import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {SaxesParser} from 'saxes';
import JsonParser from 'stream-json/parser.js';
import Pick from 'stream-json/filters/pick.js';
import StreamArray from 'stream-json/streamers/stream-array.js';

const bad=k=>['__proto__','prototype','constructor'].includes(k);
const fail=code=>{throw Error(code);};
function collector(maxRows=10000,sink=null){const rows=[],headers=new Set();let size=0;return {rows,headers,add(row){
 const keys=Object.keys(row);if(keys.length<2||keys.some(k=>bad(k)||k.length>255))fail('INVALID_HEADERS');
 if((sink?sink.count:rows.length)>=maxRows)fail('INVALID_ROW_COUNT');
 for(const k of keys)headers.add(k);size+=Buffer.byteLength(JSON.stringify(row));if(headers.size>200)fail('INVALID_COLUMNS');if(!sink&&size>128*1024*1024)fail('IMPORT_RESULT_TOO_LARGE');if(sink)sink.add(row);else rows.push(row);
},result(extra){if(!(sink?sink.count:rows.length))fail('INVALID_ROW_COUNT');return {headers:[...headers],rows,...(sink?sink.result():{}),...extra};}};}
function guard(){let depth=0,length=0;return new Transform({objectMode:true,transform(t,_,cb){try{
 if(['startObject','startArray'].includes(t.name)&&++depth>24)fail('JSON_LIMIT_EXCEEDED');
 if(['endObject','endArray'].includes(t.name))depth--;
 if(['startString','startKey','startNumber'].includes(t.name))length=0;
 if(['stringChunk','numberChunk'].includes(t.name)&&(length+=t.value.length)>1024*1024)fail('IMPORT_CELL_TOO_LARGE');
 if(t.name==='keyValue'&&bad(t.value))fail('UNSAFE_JSON');cb(null,t);
 }catch(e){cb(e);}}});}
function flatten(value,prefix='',depth=0,out={}){
 if(depth>6||!value||typeof value!=='object'||Array.isArray(value))fail('JSON_NESTED_ARRAY');
 for(const [key,v] of Object.entries(value)){
  if(bad(key))fail('UNSAFE_JSON');const name=prefix+key;
  if(Array.isArray(v))fail('JSON_NESTED_ARRAY');
  if(v&&typeof v==='object')flatten(v,name+'.',depth+1,out);else out[name]=v==null?'':String(v);
 }return out;
}
export async function streamJson(source,recordPath,maxRows=10000,sink=null){
 const paths=new Set(),stack=[];
 await pipeline(Readable.from(source(true)),JsonParser.asStream(),guard(),async tokens=>{
  for await(const t of tokens){
   if(t.name==='keyValue')stack.at(-1).key=t.value;
   if(['startObject','startArray'].includes(t.name)){
    const parent=stack.at(-1),path=parent?(parent.type==='startObject'?[parent.path,parent.key].filter(Boolean).join('.'):parent.path):'';
    if(t.name==='startArray'&&!stack.some(s=>s.type==='startArray')){paths.add(path||'$');if(paths.size>64)fail('JSON_LIMIT_EXCEEDED');}
    stack.push({type:t.name,path});
   }else if(['endObject','endArray'].includes(t.name))stack.pop();
  }
 });
 const choices=[...paths],selected=recordPath||(choices.length===1?choices[0]:null);
 if(!choices.length)fail('JSON_RECORDS_NOT_FOUND');
 if(!selected||!choices.includes(selected))return {format:'json',selectionRequired:true,recordPaths:choices,headers:[],rows:[]};
 const result=collector(maxRows,sink),stages=[Readable.from(source(false)),JsonParser.asStream(),guard()];if(selected!=='$')stages.push(Pick.asStream({filter:selected,once:true}));stages.push(StreamArray.asStream());
 await pipeline(...stages,async values=>{for await(const item of values)result.add(flatten(item.value));});
 return result.result({format:'json',recordPaths:choices,recordPath:selected,encoding:'utf-8'});
}
async function xmlPass(source,selected,track,maxRows,sink=null){
 const parser=new SaxesParser({xmlns:true}),stack=[],groups=new Map(),result=collector(maxRows,sink);
 parser.on('error',()=>fail('INVALID_XML'));parser.on('doctype',()=>fail('UNSAFE_XML'));
 parser.on('opentag',tag=>{
  if(stack.length>=24||bad(tag.name))fail('XML_LIMIT_EXCEEDED');
  const attrs={};for(const [k,a] of Object.entries(tag.attributes)){if(bad(k))fail('UNSAFE_XML');if(a.uri!=='http://www.w3.org/2000/xmlns/')attrs['@'+k]=a.value;}
  stack.push({name:tag.name,text:'',fields:attrs,children:new Set(),repeated:false});
 });
 const append=t=>{if(stack.length){const n=stack.at(-1);if(!n.text&&!t.trim())return;n.text+=t;if(n.text.length>1024*1024)fail('IMPORT_CELL_TOO_LARGE');}};
 parser.on('text',append);parser.on('cdata',append);
 parser.on('closetag',()=>{
  const n=stack.pop(),path=[...stack.map(p=>p.name),n.name].join('/');
  if(Object.keys(n.fields).length&&n.text.trim())n.fields['#text']=n.text.trim();
  if(!n.repeated&&Object.keys(n.fields).length>=2){groups.set(path,(groups.get(path)||0)+1);if(groups.size>128)fail('XML_LIMIT_EXCEEDED');}
  if(path===selected){if(n.repeated)fail('XML_REPEATED_FIELD');result.add(n.fields);}
  const parent=stack.at(-1);if(!parent)return;
  if(parent.children.has(n.name)){parent.repeated=true;parent.fields={};}parent.children.add(n.name);if(parent.children.size>200)fail('INVALID_COLUMNS');
  if(parent.repeated||n.repeated)return;
  const keys=Object.keys(n.fields);
  if(keys.length)for(const [k,v] of Object.entries(n.fields))parent.fields[n.name+'.'+k]=v;
  else parent.fields[n.name]=n.text.trim();
  if(Object.keys(parent.fields).length>200){parent.repeated=true;parent.fields={};}
 });
 const decoder=new TextDecoder('utf-8',{fatal:true});for await(const b of source(track))parser.write(decoder.decode(b,{stream:true}));parser.write(decoder.decode()).close();
 return {groups,result};
}
export async function streamXml(source,recordPath,maxRows=10000,sink=null){
 const {groups}=await xmlPass(source,null,true,maxRows),repeated=[...groups.keys()].filter(p=>groups.get(p)>1);
 const choices=repeated.length?repeated:[...groups.keys()].filter(p=>![...groups.keys()].some(q=>q.startsWith(p+'/')));
 if(!choices.length)fail('XML_RECORDS_NOT_FOUND');const selected=recordPath||(choices.length===1?choices[0]:null);
 if(!selected||!choices.includes(selected))return {format:'xml',selectionRequired:true,recordPaths:choices,headers:[],rows:[]};
 return (await xmlPass(source,selected,false,maxRows,sink)).result.result({format:'xml',recordPaths:choices,recordPath:selected,encoding:'utf-8'});
}
