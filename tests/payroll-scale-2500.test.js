import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {normalizeEmployee} from '../server/pay.js';
import {reportData} from '../server/reports.js';

for(const country of ['DE','AT','SI'])test(`${country}: 2,500 Scale workers, twelve monthly uploads and all seven EU indicator groups`,{timeout:180000},async t=>{
 const store=new MemoryStore(),secret='s'.repeat(64),server=createApp({store,secret,demo:true}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const origin=`http://127.0.0.1:${server.address().port}`,send=(path,body,cookie)=>fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const demo=await send('/demo',{country}),cookie=demo.headers.get('set-cookie').split(';')[0],jobs=[];
 const upload=async(name,csv,kind)=>{
  const bytes=Buffer.from(csv),created=await send('/pay-imports',{name,size:bytes.length},cookie);assert.equal(created.status,201);const {job}=await created.json();jobs.push(job.id);
  const put=await fetch(origin+`/api/pay-imports/${job.id}/chunks/0`,{method:'PUT',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/octet-stream','X-Chunk-SHA256':createHash('sha256').update(bytes).digest('hex')},body:bytes});assert.equal(put.status,200);
  await send(`/pay-imports/${job.id}/process`,{kind},cookie);let state;
  for(let i=0;i<100;i++){state=await (await send(`/pay-imports/${job.id}`,undefined,cookie)).json();if(!['queued','processing'].includes(state.job.status))break;await new Promise(r=>setTimeout(r,2000));}assert.equal(state.job.status,'ready',JSON.stringify(state));return {file:{uploadId:job.id,name},kind,year:2026};
 };
 const company=[...store.companies.values()][0];
 await store.createOrder({id:randomUUID(),company_id:company.id,plan:'scale',status:'sandbox_active',mode:'subscription',interval:'month'});
 const hr=['internal_id;gender;job_title;worker_category;hours_per_week',...Array.from({length:2500},(_,i)=>`${i+1};${i<1250?'F':'M'};Engineer;Engineering;40`)].join('\n');
 const header='transaction_id;internal_id;period;pay_code;amount;currency;paid_hours',lines=[header];
 for(let id=1;id<=2500;id++)for(let month=1;month<=12;month++){const period=`2026-${String(month).padStart(2,'0')}`;lines.push(`${id}-${month}-B;${id};${period};BASE;${id<=1250?4500:5000};EUR;160`,`${id}-${month}-V;${id};${period};BONUS;1000;EUR;`);}
 let version=0;const hrInput=await upload('hr.csv',hr,'hr'),txInput=await upload('payroll.csv',lines.join('\n'),'transactions');
 const annualMisuse=await send('/import/preview',txInput,cookie);assert.equal(annualMisuse.status,422);assert.equal((await annualMisuse.json()).error,'PAYROLL_TRANSACTION_IMPORT_REQUIRED');
 for(const input of [hrInput,txInput]){
  const preview=await send('/payroll/preview',input,cookie);assert.equal(preview.status,200,await preview.clone().text());const data=await preview.json();assert.equal(data.count,input.kind==='hr'?2500:60000);assert.equal(data.rows.length,30);
  if(input.kind==='hr'){
 const staged=await send('/payroll/stage',{...input,version,source:'Payroll',mapping:data.mapping,contextConfirmed:true},cookie);assert.equal(staged.status,200,await staged.clone().text());version=(await staged.json()).version;
 }else for(let month=1;month<=12;month++){
 const period='2026-'+String(month).padStart(2,'0'),monthly=await upload('month-'+month+'.csv',[header,...lines.slice(1).filter(line=>line.split(';')[2]===period)].join('\n'),'transactions');
 const staged=await send('/payroll/stage',{...monthly,version,source:'Payroll',mapping:data.mapping,contextConfirmed:true},cookie);assert.equal(staged.status,200,await staged.clone().text());const result=await staged.json();version=result.version;assert.equal(result.added,5000);assert.equal(result.transactionCount,month*5000);
 if(month===1){const blocked=await send('/payroll/finalize',{year:2026,version,contextConfirmed:true},cookie);assert.equal(blocked.status,422);assert.equal((await blocked.json()).error,'PAYROLL_INCOMPLETE');}
 if(month===12){const duplicate=await send('/payroll/stage',{...monthly,version,source:'Payroll',mapping:data.mapping,contextConfirmed:true},cookie);assert.equal(duplicate.status,200);const repeated=await duplicate.json();assert.equal(repeated.added,0);assert.equal(repeated.duplicates,5000);assert.equal(repeated.version,version);}
 }
 }
 const approved=await send('/payroll/codes',{year:2026,version,codes:[{source:'Payroll',code:'BASE',classification:'ordinary',reason:'Confirmed base pay'},{source:'Payroll',code:'BONUS',classification:'variable',reason:'Confirmed bonus pay'}]},cookie);assert.equal(approved.status,200,await approved.clone().text());const classified=await approved.json();assert.equal(classified.ready,true);version=classified.version;
 const finalized=await send('/payroll/finalize',{year:2026,version,contextConfirmed:true},cookie);assert.equal(finalized.status,201,await finalized.clone().text());assert.equal((await finalized.json()).snapshot.count,2500);
 const snapshot=await store.latestSnapshot(company.id,2026);assert.equal(snapshot.rows.length,2500);
 const reference=Array.from({length:2500},(_,i)=>normalizeEmployee({internal_id:String(i+1),gender:i<1250?'F':'M',job_title:'Engineer',worker_category:'Engineering',base_annual:i<1250?54000:60000,bonuses_annual:12000,paid_hours_annual:1920,hours_per_week:40},company.id,secret));
 const byId=(a,b)=>a.anonymized_id.localeCompare(b.anonymized_id);assert.deepEqual([...snapshot.rows].sort(byId),[...reference].sort(byId));
 const exported=await send('/reports/json?year=2026',undefined,cookie);assert.equal(exported.status,200);const report=await exported.json();assert.deepEqual(report.article9,reportData(company,{...snapshot,rows:reference}).article9);assert.equal(report.language,country==='SI'?'sl':'de');assert.equal(report.officialSubmission,false);assert.equal(report.confirmation.confirmed,false);
 const prepared=await send('/reports/json?year=2026&prepared=true',undefined,cookie);assert.ok([402,409].includes(prepared.status));
 const replay=await send('/payroll/finalize',{year:2026,version:version+1,contextConfirmed:true},cookie);assert.equal(replay.status,200,await replay.clone().text());assert.equal((await replay.json()).replayed,true);
 for(const format of ['csv','xml','xlsx','pdf']){const response=await send('/reports/'+format+'?year=2026',undefined,cookie);assert.equal(response.status,200,format);const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>100);if(format==='pdf')assert.equal(bytes.subarray(0,5).toString(),'%PDF-');}
 t.diagnostic(country+': 2500 workers; 60000 entries; 12 separate monthly uploads; exact seven indicator groups; CSV/XML/XLSX/PDF passed');
 for(const id of jobs)await fetch(origin+'/api/pay-imports/'+id,{method:'DELETE',headers:{Origin:origin,Cookie:cookie}});
});
