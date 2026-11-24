import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,appendFile,stat,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {PayUploads} from '../server/pay-uploads.js';
import {PayrollRecords} from '../server/payroll-records.js';
import {MemoryStore} from '../server/store.js';

test('1,000,001 records for 1,000 workers cross the old row/result limits without truncation and preserve exact annual amounts', {skip:process.env.PAY_IMPORT_STRESS_TEST!=='1',timeout:600000},async t=>{
 const root=await mkdtemp(join(tmpdir(),'eq-pay-million-')),company=randomUUID(),key=randomBytes(32),uploads=new PayUploads({key,root:join(root,'uploads')}),source=join(root,'payroll.csv');
 t.after(async()=>{clearInterval(uploads.sweeper);for(const w of uploads.running.values())await w?.terminate();const target=resolve(root);if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('eq-pay-million-'))throw Error('UNSAFE_CLEANUP');await rm(target,{recursive:true,force:true});});
 await appendFile(source,'transaction_id;internal_id;period;pay_code;amount;currency;paid_hours;note\n');
 const count=1000001,padding='x'.repeat(160);
 for(let start=0;start<count;start+=10000){const lines=[];for(let i=start;i<Math.min(count,start+10000);i++)lines.push(`${i};${i%1000+1};2026-${String(Math.floor(i/1000)%12+1).padStart(2,'0')};BASE;0.01;EUR;160;${padding}\n`);await appendFile(source,lines.join(''));}
 const size=(await stat(source)).size;assert.ok(size>128*1024*1024);
 const job=await uploads.create(company,{name:'payroll.csv',size}),hash=createHash('sha256');let index=0;
 for await(const chunk of createReadStream(source,{highWaterMark:4*1024*1024})){hash.update(chunk);await uploads.chunk(company,job.id,index++,chunk,createHash('sha256').update(chunk).digest('hex'));}
 const options={kind:'transactions'};await uploads.process(company,job.id,options);let status;
 for(let i=0;i<6000;i++){status=await uploads.load(company,job.id);if(!['queued','processing'].includes(status.status))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(status.status,'ready',JSON.stringify(status));assert.equal(status.rowCount,count);assert.equal(status.fileHash,hash.digest('hex'));
 const parsed=await uploads.result(company,job.id,options);assert.equal(parsed.rows.length,30);assert.ok(Buffer.byteLength(JSON.stringify(parsed))<32768);
 const store=new MemoryStore(),records=new PayrollRecords(store),secret='s'.repeat(64),year=2026,base={company,secret,year,country:'SI',actor:'tester',source:'Payroll'};
 const hr=Array.from({length:1000},(_,i)=>({internal_id:String(i+1),gender:i%2?'M':'F',job_title:'Engineer',worker_category:'L3',hours_per_week:'40'})),headers=Object.keys(hr[0]);
 let result=await records.stage(company,year,0,{headers,rows:hr,fileHash:'hr'},(async function*(){yield hr;})(),{...base,kind:'hr',mapping:Object.fromEntries(headers.map(h=>[h,h]))});
 result=await records.stage(company,year,result.state.version,parsed,uploads.pages(company,job.id,options),{...base,kind:'transactions',mapping:Object.fromEntries(parsed.headers.filter(h=>h!=='note').map(h=>[h,h]))});
 assert.equal(result.added,count);assert.equal(result.calculation.transactionCount,count);
 result=await records.approve(company,year,result.state.version,[{source:'Payroll',code:'BASE',classification:'ordinary',reason:'Synthetic regular payroll'}],'tester',base);
 assert.equal(result.calculation.ready,true);assert.equal(result.calculation.rows.length,1000);assert.equal(result.calculation.rows.reduce((sum,r)=>sum+Math.round(r.base_annual*100),0),count);assert.ok(result.calculation.rows.every(r=>r.paid_hours_annual===1920));
 assert.equal(Object.keys(result.state.document.transactions).length,0);assert.ok(Buffer.byteLength(JSON.stringify(result.state.document))<8192);
 t.diagnostic(`source=${size} bytes; records=${count}; encrypted pages=${parsed.rowPages}; annual workers=${result.calculation.rows.length}`);
});
