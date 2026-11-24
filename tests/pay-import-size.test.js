import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {parseImportInput} from '../server/file-parser.js';
import {makeZip} from './helpers.js';
import {payImportLimits} from '../shared/pay-import-limits.js';
import {createHash} from 'node:crypto';

const largeCsv=()=>['internal_id;gender;job_title;worker_category;base_annual;paid_hours_annual;hours_per_week;notes',...Array.from({length:1000},(_,i)=>`${i+1};${i%2?'M':'F'};Engineer;Engineering;60000;2080;40;${'x'.repeat(8000)}`)].join('\n');

test('authenticated chunk upload reaches the real annual preview and is isolated from another company',async t=>{
 const server=createApp({store:new MemoryStore(),secret:'s'.repeat(64),demo:true}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,cookie)=>fetch(origin+'/api'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const demo=await post('/demo',{country:'AT'}),cookie=demo.headers.get('set-cookie').split(';')[0];
 const bytes=Buffer.from(largeCsv()),created=await post('/pay-imports',{name:'payroll.csv',size:bytes.length},cookie);assert.equal(created.status,201);const {job}=await created.json();
 t.after(()=>fetch(origin+'/api/pay-imports/'+job.id,{method:'DELETE',headers:{Origin:origin,Cookie:cookie}}).catch(()=>{}));
 for(let offset=0,index=0;offset<bytes.length;offset+=payImportLimits.chunkBytes,index++){
  const chunk=bytes.subarray(offset,offset+payImportLimits.chunkBytes),r=await fetch(`${origin}/api/pay-imports/${job.id}/chunks/${index}`,{method:'PUT',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/octet-stream','X-Chunk-SHA256':createHash('sha256').update(chunk).digest('hex')},body:chunk});assert.equal(r.status,200,await r.clone().text());
 }
 const other=await post('/demo',{country:'SI'}),foreign=await fetch(origin+'/api/pay-imports/'+job.id,{headers:{Cookie:other.headers.get('set-cookie').split(';')[0]}});assert.equal(foreign.status,404);
 assert.equal((await post('/pay-imports/'+job.id+'/process',{},cookie)).status,202);
 let current;for(let i=0;i<1000;i++){current=await (await fetch(origin+'/api/pay-imports/'+job.id,{headers:{Cookie:cookie}})).json();if(current.job.status==='ready')break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(current.job.status,'ready',JSON.stringify(current));
 const preview=await post('/import/preview',{year:2026,file:{uploadId:job.id,name:'payroll.csv'}},cookie);assert.equal(preview.status,200,await preview.clone().text());assert.equal((await preview.json()).count,1000);
 await fetch(origin+'/api/pay-imports/'+job.id,{method:'DELETE',headers:{Origin:origin,Cookie:cookie}});
});

test('1000-employee wide payroll export over 4 MB parses directly and inside ZIP',async()=>{
 const bytes=Buffer.from(largeCsv());assert.ok(bytes.length>6*1024*1024&&bytes.length<payImportLimits.fileBytes);
 for(const content of [bytes,makeZip([{name:'payroll.csv',data:bytes}])]){
  const result=await parseImportInput({file:{base64:content.toString('base64')}});
  assert.equal(result.rows.length,1000);assert.equal(result.rows[999].internal_id,'1000');assert.equal(result.rows[999].notes.length,8000);
 }
});

test('real Pay HTTP preview accepts base64 upload above the previous JSON limit and keeps Finance at its existing body limit',async t=>{
 const server=createApp({store:new MemoryStore(),secret:'s'.repeat(64),demo:true}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,cookie)=>fetch(origin+'/api'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const demo=await post('/demo',{country:'DE'});assert.equal(demo.status,200);const cookie=demo.headers.get('set-cookie').split(';')[0];
 const response=await post('/import/preview',{year:2026,file:{name:'payroll.csv',base64:Buffer.from(largeCsv()).toString('base64')}},cookie);
 assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).count,1000);
 const oversizedFinance=await post('/finance/preview',{padding:'x'.repeat(7*1024*1024)},cookie);assert.equal(oversizedFinance.status,413);
});
