import {payImportLimits as limits} from '../shared/pay-import-limits';
const announce=job=>window.dispatchEvent(new CustomEvent('equitensa-pay-upload',{detail:job}));
async function request(path,options){const r=await fetch('/api/pay-imports'+path,options);const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),data);announce(data.job);return data.job;}
const post=(path,body)=>request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export async function cancelPayUpload(id){const r=await fetch('/api/pay-imports/'+id,{method:'DELETE'});if(!r.ok)throw Error('IMPORT_CANCEL_FAILED');announce(null);}
export async function uploadPayFile(file){
 if(file.size>limits.uploadBytes)throw Error('IMPORT_UPLOAD_SIZE');
 const storageKey='eq-pay-upload:'+JSON.stringify([file.name,file.size,file.lastModified]);let job;
 try{const saved=sessionStorage.getItem(storageKey);if(saved)job=await request('/'+saved);}catch{/* An expired upload starts afresh. */}
 if(!job||job.status!=='uploading')job=await post('',{name:file.name,size:file.size});
 sessionStorage.setItem(storageKey,job.id);
 // Resume by resending/checking previous chunks. Size/name alone never establish file identity.
 for(let offset=0,index=0;offset<file.size;offset+=limits.chunkBytes,index++){
  const bytes=await file.slice(offset,Math.min(file.size,offset+limits.chunkBytes)).arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  let error;
  for(let attempt=0;attempt<3;attempt++)try{job=await request(`/${job.id}/chunks/${index}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Chunk-SHA256':digest},body:bytes});error=null;break;}catch(e){error=e;if(['IMPORT_CHUNK_CONFLICT','IMPORT_UPLOAD_NOT_FOUND'].includes(e.message)){sessionStorage.removeItem(storageKey);throw e;}}
  if(error)throw error;
 }
 return {uploadId:job.id,name:file.name};
}
export async function preparePayFile(body){
 const id=body.file?.uploadId;if(!id)return;
 let job=await post('/'+id+'/process',Object.fromEntries(['kind','sheet','headerRow','recordPath','encoding','zipEntry'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]])));
 const deadline=Date.now()+11*60*1000;
 while(['queued','processing'].includes(job.status)){
  if(Date.now()>deadline)throw Error('IMPORT_TIMEOUT');
  await new Promise(resolve=>setTimeout(resolve,2000));job=await request('/'+id);
 }
 if(!['ready','needs_selection'].includes(job.status))throw Object.assign(Error(job.error||'IMPORT_JOB_PENDING'),{uploadId:id});
}
