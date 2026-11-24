import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';
import { MemoryStore,PostgresStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { lifecycleInventory,purgeYear,retentionPolicy,retentionDate } from '../server/data-lifecycle.js';
import { referenceRows } from './fixtures/eu-report-reference.js';
import { verifyAll } from './helpers.js';

const policy=()=>retentionPolicy({purpose:'Equal pay only',legalBasis:'Synthetic legal review; national retention reviewed',retentionMonths:12,owner:'DPO',reviewedOn:'2026-01-01',backupProcedure:'Synthetic backup expiry and restoration suppression procedure',confirmed:true,holds:[]});

test('retention requires a justified policy, uses calendar month ends, and accepts no invented legal defaults',()=>{
  assert.throws(()=>retentionPolicy({}),/RETENTION_POLICY_REQUIRED/);
  assert.equal(retentionDate(2020,2),'2021-02-28');assert.equal(retentionDate(2019,2),'2020-02-29');
  assert.equal(retentionDate(2020,12),'2021-12-31');
  assert.throws(()=>retentionPolicy({...policy(),holds:[{year:2020,reason:''}]}),/INVALID_HOLD/);
});

async function exercise(t,store){
  const a={id:randomUUID(),name:'A',country:'DE'},b={id:randomUUID(),name:'B',country:'SI'},actor=randomUUID();
  await store.createAccount(a,{id:actor,company_id:a.id,email:`${actor}@example.test`,password_hash:'x'});
  const otherActor=randomUUID();await store.createAccount(b,{id:otherActor,company_id:b.id,email:`${otherActor}@example.test`,password_hash:'x'});
  const first=await store.saveSnapshot(a.id,2020,referenceRows,'synthetic',{fingerprint:'f'.repeat(64),fileHash:'a'.repeat(64),structureHash:'b'.repeat(64),profile:{mapping:{id:'internal_id'}},actor});
  await store.saveSnapshot(a.id,2020,referenceRows,'second');
  await store.saveSnapshot(a.id,2021,referenceRows,'other-year');await store.saveSnapshot(b.id,2020,referenceRows,'other-tenant');
  await store.saveWorkflow(a.id,2020,{snapshotId:first.id,reviews:{private:'DELETE_ME'}});
  await store.savePayrollLedger(a.id,2020,0,{private:'DELETE_ME'},actor);
  await store.saveRightsNotice(a.id,2020,{sent_on:'2020-01-01',contact:'private@example.test'});
  await store.saveCompanyDocument(a.id,'national_2020',{private:'DELETE_ME'});
  await store.saveCompanyDocument(a.id,'employer_controls_2020',{private:'DELETE_ME'});
  const request=await store.createInfoRequest(a.id,{received_on:'2020-01-01',due_on:'2020-03-01',channel:'worker',requester_label:'DELETE_ME',note:'DELETE_ME'});
  await store.createIngestBatch(a.id,{source:'test',reporting_year:2020,record_count:1,payload:'DELETE_ME'});
  await store.audit(a.id,'draft_exported',{snapshot_id:first.id,workflow:{reviews:{private:'DELETE_ME'}}});
  await store.audit(a.id,'info_request_answered',{request_id:request.id,note:'DELETE_ME'});
  let preview=await lifecycleInventory(store,a.id,2020);
  assert.equal(preview.counts.employeeRows,32);assert.equal(preview.counts.requests,1);assert.equal(preview.counts.documents,2);
  await assert.rejects(purgeYear(store,a.id,2020,{fingerprint:preview.fingerprint,actor}),/RETENTION_POLICY_REQUIRED/);
  await store.saveCompanyDocument(a.id,'data_retention',{...policy(),holds:[{year:2020,reason:'Ongoing litigation'}]});
  await assert.rejects(purgeYear(store,a.id,2020,{fingerprint:preview.fingerprint,actor}),/LEGAL_HOLD_ACTIVE/);
  assert.ok(await store.latestSnapshot(a.id,2020));
  await store.saveCompanyDocument(a.id,'data_retention',policy());
  await store.saveSnapshot(a.id,2020,referenceRows,'new-data');
  await assert.rejects(purgeYear(store,a.id,2020,{fingerprint:preview.fingerprint,actor}),/DELETION_PREVIEW_CHANGED/);
  preview=await lifecycleInventory(store,a.id,2020);
  const receipt=await purgeYear(store,a.id,2020,{fingerprint:preview.fingerprint,actor});
  assert.equal(receipt.backupStatus,'pending');assert.equal(receipt.counts.snapshots,3);
  assert.equal(await store.latestSnapshot(a.id,2020),null);
  assert.ok(await store.latestSnapshot(a.id,2021));assert.ok(await store.latestSnapshot(b.id,2020));
  assert.equal((await lifecycleInventory(store,a.id,2020)).counts.employeeRows,0);
  assert.deepEqual(await store.getWorkflow(a.id,2020),{});assert.equal(await store.getInfoRequest(a.id,request.id),null);
  assert.equal(await store.companyDocument(a.id,'national_2020'),null);assert.equal(await store.companyDocument(a.id,'employer_controls_2020'),null);
  assert.equal((await store.companyDocument(a.id,`del_${receipt.id}`)).backupStatus,'pending');
  if(store.pool){
    const e=(await store.pool.query('SELECT metadata FROM audit_events WHERE company_id=$1',[a.id])).rows;
    assert.ok(!JSON.stringify(e).includes('DELETE_ME'));
    assert.equal((await store.pool.query('SELECT count(*)::int AS n FROM employees WHERE company_id=$1 AND snapshot_id=$2',[a.id,first.id])).rows[0].n,0);
  }else assert.ok(!JSON.stringify(store.auditEvents).includes('DELETE_ME'));
  const current=await lifecycleInventory(store,a.id,2021);
  await store.saveCompanyDocument(a.id,'data_retention',{...policy(),retentionMonths:1200});
  await assert.rejects(purgeYear(store,a.id,2021,{fingerprint:current.fingerprint,actor}),/RETENTION_NOT_DUE/);
  assert.ok(await store.latestSnapshot(a.id,2021));
}

test('memory lifecycle erases every retained version and derivative, respects holds and isolates tenant/year',async t=>exercise(t,new MemoryStore()));
test('PostgreSQL lifecycle erases cascades and copied audit evidence atomically; other tenant/year survives',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  const store=new PostgresStore('postgresql://unused');await store.pool.end();
  const query=async(sql,params)=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length};};store.pool={query,connect:async()=>({query,release(){}})};
  for(const name of ['001_initial','002_self_service','003_platform_control','004_google_auth','005_import_batches','006_payroll_ledger','007_account_security','008_worker_rights','009_company_documents','010_api_ingest','011_info_request_kinds'])await db.exec(await readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8'));
  await exercise(t,store);
});

test('deletion API requires password, explicit confirmation, current preview and legal review; backup remains pending',async t=>{
  const store=new MemoryStore(),origin='http://localhost:3000',password='correct-horse-123';
  const server=createApp({store,secret:'test',origins:[origin]}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}/api`;let cookie;
  const call=(path,body)=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const register=await call('/auth/register',{email:'privacy@example.test',password,companyName:'Test',country:'AT'});cookie=register.headers.get('set-cookie').split(';')[0];verifyAll(store);
  const company=[...store.companies.values()][0];await store.saveSnapshot(company.id,2020,referenceRows,'synthetic');
  assert.equal((await call('/data-retention',{policy:policy()})).status,200);
  const preview=await (await call('/data-retention?year=2020')).json();
  const body={year:2020,fingerprint:preview.fingerprint,confirmation:'AT 2020 DELETE',legalReviewConfirmed:true,password};
  assert.equal((await call('/data-retention/delete-year',{...body,confirmation:'yes'})).status,409);
  assert.equal((await call('/data-retention/delete-year',{...body,password:'wrong'})).status,403);
  assert.equal((await call('/data-retention/delete-year',{...body,password:undefined})).status,403);
  const response=await call('/data-retention/delete-year',body);assert.equal(response.status,200,await response.clone().text());
  const {receipt}=await response.json();assert.equal(receipt.backupStatus,'pending');
  assert.equal((await call('/data-retention/backup-complete',{receiptId:receipt.id,confirmed:true,evidence:''})).status,409);
  const completed=await call('/data-retention/backup-complete',{receiptId:receipt.id,confirmed:true,evidence:'Synthetic operator certificate and restore procedure'});assert.equal(completed.status,200);
  assert.equal((await completed.json()).receipt.backupStatus,'operator_confirmed');
  assert.equal((await (await call('/data-retention/receipts')).json()).receipts.length,1);
});
