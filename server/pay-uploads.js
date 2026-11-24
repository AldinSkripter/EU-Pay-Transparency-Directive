import express from 'express';
import {rateLimit} from 'express-rate-limit';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir,rm,statfs} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Worker} from 'node:worker_threads';
import {readPayRowPages} from './pay-row-pages.js';
import {seal,unseal} from './pay-upload-crypto.js';
import {payImportLimits as limits} from '../shared/pay-import-limits.js';
import {acceptedExtensions,textEncodingIds} from '../shared/import-formats.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=(code,status=422)=>{throw Object.assign(Error(code),{status});};
const canonical=input=>{
 const o={headerRow:input.headerRow??1,kind:input.kind||'annual'};if(!['annual','hr','transactions'].includes(o.kind))fail('INVALID_PAYROLL_KIND');if(!Number.isInteger(o.headerRow)||o.headerRow<1||o.headerRow>50)fail('INVALID_HEADER_ROW');
 for(const k of ['sheet','recordPath','encoding','zipEntry'])if(input[k]){if(typeof input[k]!=='string'||input[k].length>255)fail('INVALID_FILE');o[k]=input[k];}
 if(o.encoding&&!textEncodingIds.includes(o.encoding))fail('INVALID_ENCODING');return o;
};
export class PayUploads{
 constructor({key,root=resolve('var/pay-uploads'),demo=false,onError}){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('PAY_UPLOAD_KEY_REQUIRED');
  this.key=createHash('sha256').update(key).update('pay-upload-v1').digest();
  this.root=demo?join(resolve(root),'demo-'+this.key.toString('hex').slice(0,16)):resolve(root);this.running=new Map();this.locks=new Map();this.queue=[];this.active=0;this.known=new Set();this.onError=onError;
  this.sweeper=setInterval(()=>this.sweep().catch(()=>{}),15*60*1000);this.sweeper.unref();
 }
 path(company,id){if(!uuid.test(company)||!uuid.test(id))fail('IMPORT_UPLOAD_NOT_FOUND',404);return join(this.root,company,id);}
 async locked(key,fn){const previous=this.locks.get(key)||Promise.resolve();let release;const tail=new Promise(r=>{release=r;});this.locks.set(key,tail);await previous;try{return await fn();}finally{release();if(this.locks.get(key)===tail)this.locks.delete(key);}}
 async write(company,id,name,value){return this.locked(`io:${company}:${id}:${name}`,()=>this.writeValue(company,id,name,value));}
 async writeValue(company,id,name,value){const dir=this.path(company,id),temp=join(dir,randomUUID()+'.tmp');await writeFile(temp,seal(this.key,`${company}:${id}:${name}`,Buffer.from(JSON.stringify(value))),{mode:0o600,flag:'wx'});for(let attempt=0;;attempt++){try{await rename(temp,join(dir,name+'.enc'));break;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||attempt>=40)throw e;await new Promise(r=>setTimeout(r,50));}}}
 async read(company,id,name='meta'){return this.locked(`io:${company}:${id}:${name}`,()=>this.readValue(company,id,name));}
 async readValue(company,id,name='meta'){try{return JSON.parse(unseal(this.key,`${company}:${id}:${name}`,await readFile(join(this.path(company,id),name+'.enc'))));}catch(e){if(e.code==='ENOENT')fail('IMPORT_UPLOAD_NOT_FOUND',404);throw e;}}
 async load(company,id){const m=await this.read(company,id);if(Date.parse(m.expiresAt)<Date.now()){await this.remove(company,id);fail('IMPORT_UPLOAD_EXPIRED',410);}if(['queued','processing'].includes(m.status)&&!this.known.has(id)){m.status='uploaded';m.error='IMPORT_JOB_INTERRUPTED';await this.write(company,id,'meta',m);}return m;}
 public(m){const {chunks,companyId,...info}=m;return {...info,chunkCount:chunks.length,maxBytes:limits.uploadBytes,chunkBytes:limits.chunkBytes};}
 async create(company,body){return this.locked(company,async()=>{
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>255||!Number.isSafeInteger(body.size)||body.size<1||body.size>limits.uploadBytes)fail('IMPORT_UPLOAD_SIZE');
  const ext='.'+body.name.split('.').at(-1).toLowerCase();if(!acceptedExtensions.includes(ext))fail('UNSUPPORTED_FILE_FORMAT');
  const dir=join(this.root,company);await mkdir(dir,{recursive:true,mode:0o700});
  const entries=(await readdir(dir)).filter(id=>uuid.test(id));let pending=0,reserved=0;
  for(const id of entries){const m=await this.read(company,id);if(Date.parse(m.expiresAt)<Date.now())await this.remove(company,id);else {pending++;reserved+=m.size;}}
  if(pending>=25||reserved+body.size>2*limits.uploadBytes)fail('IMPORT_UPLOAD_QUOTA',429);
  const disk=await statfs(dir);if(Number(disk.bavail)*Number(disk.bsize)<body.size+256*1024*1024)fail('IMPORT_STORAGE_FULL',507);
  const id=randomUUID(),m={id,companyId:company,name:body.name.replace(/[\\/\x00-\x1f]/g,'_'),size:body.size,uploadedBytes:0,chunks:[],status:'uploading',progress:0,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+limits.jobLifetimeMs).toISOString()};
  await mkdir(this.path(company,id),{mode:0o700});await this.write(company,id,'meta',m);return this.public(m);
 });}
 async chunk(company,id,index,bytes,expectedHash){return this.locked(id,async()=>{
  const m=await this.load(company,id);if(m.status!=='uploading')fail('IMPORT_UPLOAD_STATE',409);
  if(!Number.isInteger(index)||index<0||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>limits.chunkBytes||!/^[a-f0-9]{64}$/.test(expectedHash||''))fail('IMPORT_CHUNK_INVALID');
  const digest=createHash('sha256').update(bytes).digest('hex');if(digest!==expectedHash)fail('IMPORT_CHUNK_CHECKSUM');
  if(index<m.chunks.length){if(m.chunks[index].hash!==digest||m.chunks[index].size!==bytes.length)fail('IMPORT_CHUNK_CONFLICT',409);return this.public(m);}
  if(index!==m.chunks.length||m.uploadedBytes+bytes.length>m.size||bytes.length!==Math.min(limits.chunkBytes,m.size-m.uploadedBytes))fail('IMPORT_CHUNK_OFFSET',409);
  const disk=await statfs(this.path(company,id));if(Number(disk.bavail)*Number(disk.bsize)<bytes.length+64*1024*1024)fail('IMPORT_STORAGE_FULL',507);
  await writeFile(join(this.path(company,id),`${index}.enc`),seal(this.key,`${company}:${id}:${index}`,bytes),{mode:0o600});
  m.chunks.push({hash:digest,size:bytes.length});m.uploadedBytes+=bytes.length;await this.write(company,id,'meta',m);return this.public(m);
 });}
 async process(company,id,options){return this.locked(id,async()=>{
  const m=await this.load(company,id),o=canonical(options);
  if(m.uploadedBytes!==m.size)fail('IMPORT_UPLOAD_INCOMPLETE');
  if(['ready','needs_selection'].includes(m.status)&&JSON.stringify(m.options)===JSON.stringify(o))return this.public(m);
  if(['queued','processing'].includes(m.status))return this.public(m);
  m.status='queued';m.options=o;m.generation=randomUUID();m.progress=0;delete m.error;this.known.add(id);await this.write(company,id,'meta',m);this.queue.push({company,id});this.pump();return this.public(m);
 });}
 pump(){if(this.active||!this.queue.length)return;const task=this.queue.shift();this.active++;this.run(task).catch(()=>{}).finally(()=>{this.active--;this.pump();});}
 async run({company,id}){
  // Register before yielding so a concurrent status request cannot mistake a queued job for a restart.
  this.running.set(id,null);let worker,timer;
  try{
   const m=await this.locked(id,async()=>{const current=await this.read(company,id);current.status='processing';await this.write(company,id,'meta',current);return current;});
   worker=new Worker(new URL('./pay-upload-worker.js',import.meta.url),{workerData:{job:m,options:m.options,key:this.key,dir:this.path(company,id),diagnostics:!!this.onError},resourceLimits:{maxOldGenerationSizeMb:768,maxYoungGenerationSizeMb:32}});this.running.set(id,worker);
   const result=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>{worker.terminate();reject(Error('IMPORT_TIMEOUT'));},10*60*1000);
    worker.on('message',message=>{
     if(message.progress!==undefined){this.locked(id,async()=>{const current=await this.read(company,id);current.progress=message.progress;await this.write(company,id,'meta',current);}).catch(()=>{});}
     else if(message.error){if(message.debug)this.onError?.(Error(message.debug));reject(Error(message.error));}else if(message.result)resolve(message.result);
    });worker.on('error',()=>reject(Error('IMPORT_WORKER_CAPACITY')));worker.on('exit',code=>{if(code!==0)reject(Error('IMPORT_JOB_INTERRUPTED'));});
   });
   await this.locked(id,async()=>{const current=await this.read(company,id);await this.write(company,id,'result',result);current.status=result.selectionRequired?'needs_selection':'ready';current.progress=100;current.format=result.format;current.rowCount=result.rowCount??result.rows.length;current.fileHash=result.fileHash;current.selection={sheets:result.sheets,zipEntries:result.zipEntries,recordPaths:result.recordPaths};await this.write(company,id,'meta',current);});
  }catch(e){this.onError?.(e);await this.locked(id,async()=>{try{const m=await this.read(company,id);m.status='needs_review';m.error=/^[A-Z_]+$/.test(e.message)?e.message:'INVALID_FILE';await this.write(company,id,'meta',m);}catch{}});}finally{clearTimeout(timer);this.running.delete(id);await worker?.terminate();}
 }
 async result(company,id,options){return this.locked(id,async()=>{const m=await this.load(company,id);if(!['ready','needs_selection'].includes(m.status)||JSON.stringify(canonical(options))!==JSON.stringify(m.options))fail(m.error||'IMPORT_JOB_PENDING',409);return this.read(company,id,'result');});}
 async *pages(company,id,options){const result=await this.result(company,id,options);if(!result.paged){for(let i=0;i<result.rows.length;i+=1000)yield result.rows.slice(i,i+1000);return;}yield* readPayRowPages({...result,dir:this.path(company,id),key:this.key,companyId:company,id});}
 async sweep(){
  let companies;try{companies=await readdir(this.root);}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const company of companies.filter(c=>uuid.test(c))){for(const id of (await readdir(join(this.root,company))).filter(i=>uuid.test(i))){try{const m=await this.read(company,id);if(Date.parse(m.expiresAt)<Date.now())await this.locked(id,()=>this.remove(company,id));}catch{}}}
 }
 async remove(company,id){this.queue=this.queue.filter(q=>q.id!==id);await this.running.get(id)?.terminate();this.running.delete(id);this.known.delete(id);await rm(this.path(company,id),{recursive:true,force:true});}
}

export function payUploadRoutes(app,uploads){
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}};
 const company=req=>req.session.company.id;
 const chunks=rateLimit({windowMs:60000,limit:600,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>company(req)});
 app.post('/api/pay-imports',wrap(async(req,res)=>res.status(201).json({job:await uploads.create(company(req),req.body)})));
 app.get('/api/pay-imports/:id',wrap(async(req,res)=>res.json({job:uploads.public(await uploads.load(company(req),req.params.id))})));
 app.put('/api/pay-imports/:id/chunks/:index',chunks,express.raw({type:'application/octet-stream',limit:limits.chunkBytes}),wrap(async(req,res)=>res.json({job:await uploads.chunk(company(req),req.params.id,Number(req.params.index),req.body,req.get('X-Chunk-SHA256'))})));
 app.post('/api/pay-imports/:id/process',wrap(async(req,res)=>res.status(202).json({job:await uploads.process(company(req),req.params.id,req.body)})));
 app.delete('/api/pay-imports/:id',wrap(async(req,res)=>{await uploads.load(company(req),req.params.id);await uploads.remove(company(req),req.params.id);res.json({ok:true});}));
}
