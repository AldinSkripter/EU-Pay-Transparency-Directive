import {writeFileSync,statfsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {seal,unseal} from './pay-upload-crypto.js';

// Worker-local sink: bounded pages, encrypted before touching disk. The manifest is
// published only after the entire source was parsed and authenticated successfully.
export class PayRowPages{
 constructor({dir,key,companyId,id,generation}){if(!/^[a-f0-9-]{36}$/i.test(generation||''))throw Error('IMPORT_UPLOAD_CORRUPTED');Object.assign(this,{dir,key,companyId,id,generation});this.rows=[];this.bytes=0;this.count=0;this.pages=0;this.preview=[];}
 add(row){
  const bytes=Buffer.byteLength(JSON.stringify(row));if(bytes>2*1024*1024)throw Error('IMPORT_CELL_TOO_LARGE');
  if(this.rows.length&&(this.bytes+bytes>1024*1024||this.rows.length>=1000))this.flush();
  this.rows.push(row);this.bytes+=bytes;this.count++;if(this.preview.length<30)this.preview.push(row);
 }
 flush(){if(!this.rows.length)return;const disk=statfsSync(this.dir);if(Number(disk.bavail)*Number(disk.bsize)<64*1024*1024)throw Error('IMPORT_STORAGE_FULL');const index=this.pages++;writeFileSync(join(this.dir,`rows-${this.generation}-${index}.enc`),seal(this.key,`${this.companyId}:${this.id}:rows:${this.generation}:${index}`,Buffer.from(JSON.stringify(this.rows))),{mode:0o600,flag:'wx'});this.rows=[];this.bytes=0;}
 result(){this.flush();return {rows:this.preview,rowCount:this.count,rowPages:this.pages,rowGeneration:this.generation,paged:true};}
}
export async function* readPayRowPages({dir,key,companyId,id,rowPages,rowCount,rowGeneration}){
 if(!/^[a-f0-9-]{36}$/i.test(rowGeneration||''))throw Error('IMPORT_UPLOAD_CORRUPTED');
 let count=0;
 for(let index=0;index<rowPages;index++){
  let rows;try{const bytes=await readFile(join(dir,`rows-${rowGeneration}-${index}.enc`));if(bytes.length>3*1024*1024)throw Error('IMPORT_UPLOAD_CORRUPTED');rows=JSON.parse(unseal(key,`${companyId}:${id}:rows:${rowGeneration}:${index}`,bytes));}catch{throw Error('IMPORT_UPLOAD_CORRUPTED');}
  if(!Array.isArray(rows)||rows.length>1000)throw Error('IMPORT_UPLOAD_CORRUPTED');
  count+=rows.length;if(count>rowCount)throw Error('IMPORT_UPLOAD_CORRUPTED');yield rows;
 }
 if(count!==rowCount)throw Error('IMPORT_UPLOAD_CORRUPTED');
}
