import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import * as XLSX from 'xlsx';
import { validateEvaluation,evaluationCompleteness,remediationComplete } from '../server/employer-input.js';
import { validateWorkflow,readiness } from '../server/workflow.js';
import { assessmentCsv,assessmentXml,assessmentXlsx,assessmentDocument } from '../server/assessment.js';
import { employerControls,directiveArticles } from '../shared/employer-controls.js';
import { validateControls,controlState,controlsDocument } from '../server/employer-controls.js';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { referenceSnapshot } from './fixtures/eu-report-reference.js';
import { completedRemediation,documentedEvaluation,verifyAll } from './helpers.js';

test('Article 4 evaluation requires real methodology and category evidence; scoring never invents equivalence',()=>{
  const rows=[{worker_category:'A',job_title:'Care'},{worker_category:'A',job_title:'Technical'}];
  assert.equal(evaluationCompleteness(validateEvaluation({},rows),rows).ready,false);
  const input={...documentedEvaluation(['A']),mode:'scored',weights:{skills:40,effort:20,responsibility:30,conditions:10},categories:{A:{rationale:'Compared demands',evidence:'Role profiles',roles:[{title:'Care',scores:{skills:4,effort:3,responsibility:5,conditions:2},evidence:'Observed demands'},{title:'Technical',scores:{skills:3,effort:2,responsibility:4,conditions:3},evidence:'Observed demands'}]}}};
  const result=validateEvaluation(input,rows);
  assert.deepEqual(result.categories.A.roles.map(r=>r.weightedScore),[3.9,3.1]);
  assert.equal(evaluationCompleteness(result,rows).ready,true);
  for(const patch of [{weights:{skills:40,effort:20,responsibility:20,conditions:10}},{genderNeutralConfirmed:false},{reference:''},{assessedOn:'2999-01-01'}])assert.equal(evaluationCompleteness(validateEvaluation({...input,...patch},rows),rows).ready,false);
  const changed=structuredClone(input);changed.categories.A.roles[0].evidence='';
  assert.equal(evaluationCompleteness(validateEvaluation(changed,rows),rows).ready,false);
  assert.equal(evaluationCompleteness(validateEvaluation(input,[...rows,{worker_category:'B',job_title:'New'}]),[...rows,{worker_category:'B',job_title:'New'}]).ready,false);
  assert.equal(validateEvaluation({...input,weights:{skills:[40]}},rows).weights.skills,null);
});

test('remediation requires current-snapshot implementation and verification proof, never a checkbox alone',()=>{
  const snapshot=referenceSnapshot('internal'),input=structuredClone(snapshot.workflow),category='Reference category';
  input.reviews[category].remedied=true;
  assert.throws(()=>validateWorkflow(input,snapshot),/REMEDIATION_PROOF_REQUIRED/);
  input.reviews[category].proof=completedRemediation(snapshot.id);
  const saved=validateWorkflow(input,snapshot);
  assert.equal(saved.reviews[category].remedied,true);
  for(const proof of [{...input.reviews[category].proof,targetSnapshotId:'old'},{...input.reviews[category].proof,verifiedOn:'2999-01-01'},{...input.reviews[category].proof,verifiedOn:'2020-01-01'}])assert.equal(remediationComplete(proof,snapshot.id),false);
  saved.approval.confirmed=true;saved.approval.consulted=true;
  const changed=validateWorkflow({...saved,jobEvaluation:{...saved.jobEvaluation,reference:'Changed evidence'}},snapshot,saved);
  assert.equal(changed.approval.confirmed,false);
  const missing=readiness({...saved,jobEvaluation:{}},{count:16,groups:[]},snapshot);
  assert.equal(missing.checks.find(c=>c.id==='categories').done,false);
});

test('internal assessment evidence survives document/CSV/XML/XLSX without entering worker or authority exports',()=>{
  const snapshot=referenceSnapshot('internal'),company={name:'Test',country:'DE'};
  snapshot.workflow.reviews['Reference category'].proof=completedRemediation(snapshot.id);
  const marker='INTERNAL_EVIDENCE_MARKER';snapshot.workflow.jobEvaluation.reference=marker;
  assert.ok(assessmentCsv(company,snapshot).includes(marker));assert.ok(assessmentXml(company,snapshot).includes(marker));
  const book=XLSX.read(assessmentXlsx(company,snapshot),{type:'buffer'});
  assert.ok(XLSX.utils.sheet_to_csv(book.Sheets['Employer evidence']).includes(marker));
  assert.ok(assessmentDocument(company,snapshot).sections.some(s=>s.id==='job-evaluation'));
  for(const audience of ['workers','authority']){
    const safe={...snapshot,audience};assert.ok(!assessmentCsv(company,safe).includes(marker));assert.ok(!assessmentXml(company,safe).includes(marker));
    assert.ok(!XLSX.read(assessmentXlsx(company,safe),{type:'buffer'}).SheetNames.includes('Employer evidence'));
  }
});

test('all 37 articles are represented; employer records require dated evidence and become stale after new data',()=>{
  assert.deepEqual(directiveArticles.map(a=>a.article),Array.from({length:37},(_,i)=>i+1));
  const snapshot=referenceSnapshot(),input={snapshotId:snapshot.id,records:{privacy:{status:'recorded'}}};
  assert.throws(()=>validateControls(input,snapshot),/CONTROL_EVIDENCE_REQUIRED/);
  const document=validateControls({snapshotId:snapshot.id,records:{privacy:{status:'recorded',owner:'DPO',reviewedOn:'2026-01-01',evidence:'Purpose limitation, retention schedule and backup procedure v1'},procurement:{status:'not_applicable',owner:'Legal',reviewedOn:'2026-01-01',evidence:'No public contracts'}}},snapshot);
  assert.equal(controlState(document,snapshot.id).records.find(c=>c.id==='privacy').status,'recorded');
  assert.equal(controlState(document,'new').records.find(c=>c.id==='privacy').status,'stale');
  assert.equal(controlState(document,snapshot.id).independentlyVerified,false);
  assert.throws(()=>validateControls({snapshotId:snapshot.id,records:{privacy:{status:'not_applicable'}}},snapshot),/INVALID_CONTROL/);
  assert.throws(()=>validateControls({snapshotId:'old'},snapshot),/SNAPSHOT_CHANGED/);
  assert.equal(controlsDocument({name:'Test',country:'SI'},2026,document,snapshot.id).sections.find(s=>s.id==='all-articles').table.rows.length,37);
  assert.ok(employerControls.some(c=>c.articles.includes(25)));
});

test('DE/AT/SI employer evidence: tenant isolation, internal annex, all exports and changed-snapshot refusal',async t=>{
  const store=new MemoryStore(),origin='http://localhost:3000';
  const server=createApp({store,secret:'test-secret',origins:[origin]}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const call=(path,cookie,body)=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal((await call('/employer-controls')).status,401);
  let previousCookie;
  for(const country of ['DE','AT','SI']){
    const registered=await call('/auth/register',null,{email:`${country}@example.test`,password:'correct-horse-123',companyName:`Test ${country}`,country});verifyAll(store);
    const cookie=registered.headers.get('set-cookie').split(';')[0],company=[...store.companies.values()].find(c=>c.country===country);
    const snapshot=await store.saveSnapshot(company.id,2026,referenceSnapshot().rows,'synthetic');
    const doc={snapshotId:snapshot.id,records:{privacy:{status:'recorded',owner:'DPO',reviewedOn:'2026-01-01',evidence:`PRIVATE_${country}_EVIDENCE`}}};
    assert.equal((await call('/employer-controls',cookie,{year:2026,document:doc})).status,200);
    const read=await (await call('/employer-controls?year=2026',cookie)).json();assert.equal(read.state.stale,false);assert.equal(read.articles.length,37);
    if(previousCookie)assert.ok(!(await (await call('/employer-controls/json?year=2026',previousCookie)).text()).includes(`PRIVATE_${country}_EVIDENCE`));
    for(const format of ['json','txt','html','pdf']){
      const response=await call(`/employer-controls/${format}?year=2026`,cookie);assert.equal(response.status,200);
      if(format==='pdf')assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
      if(format==='html')assert.ok((await response.text()).includes(`<html lang="${country==='SI'?'sl':'de'}">`));
    }
    const marker=`PRIVATE_${country}_EVIDENCE`;
    for(const audience of ['internal','authority','workers','public']){
      const response=await call(`/reports/txt?year=2026&audience=${audience}`,cookie);assert.equal(response.status,200);
      assert.equal((await response.text()).includes(marker),audience==='internal');
    }
    await store.saveSnapshot(company.id,2026,referenceSnapshot().rows,'changed');
    assert.equal((await (await call('/employer-controls?year=2026',cookie)).json()).state.stale,true);
    assert.equal((await call('/employer-controls',cookie,{year:2026,document:doc})).status,409);
    previousCookie=cookie;
  }
});
