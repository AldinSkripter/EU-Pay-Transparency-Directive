import { createHash,randomUUID } from 'node:crypto';
import { verifyPassword } from './auth.js';

const policyKey='data_retention';
const clean=(v,max=3000)=>typeof v==='string' && v.length<=max && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)?v.trim():'';
const validDate=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
const yearDocs=year=>[`national_${year}`,`employer_controls_${year}`];
export function retentionPolicy(input) {
  const months=Number(input?.retentionMonths),today=new Date().toISOString().slice(0,10);
  const doc={purpose:clean(input?.purpose),legalBasis:clean(input?.legalBasis),retentionMonths:months,owner:clean(input?.owner,255),reviewedOn:input?.reviewedOn,backupProcedure:clean(input?.backupProcedure),holds:[],confirmed:input?.confirmed===true};
  if(!doc.purpose||!doc.legalBasis||!Number.isInteger(months)||months<1||months>1200||!doc.owner||!validDate(doc.reviewedOn)||doc.reviewedOn>today||!doc.backupProcedure||!doc.confirmed)throw new Error('RETENTION_POLICY_REQUIRED');
  if(input.holds!==undefined && (!Array.isArray(input.holds)||input.holds.length>101))throw new Error('INVALID_HOLD');
  doc.holds=(input.holds||[]).map(h=>{const year=Number(h.year),reason=clean(h.reason);if(!Number.isInteger(year)||year<2000||year>2100||!reason)throw new Error('INVALID_HOLD');return {year,reason};});
  return doc;
}
export function retentionDate(year,months) {
  // Retention is measured from the end of the reporting year, with month-end clamping.
  const date=new Date(Date.UTC(year,11+months,1));date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);return date.toISOString().slice(0,10);
}
export async function lifecycleInventory(store,companyId,year,query=store.pool?.query.bind(store.pool)) {
  let snapshots,requests,ingest,ledger,workflow,documents,profiles,notices;
  if(query){
    snapshots=(await query('SELECT s.id,(SELECT count(*)::int FROM employees e WHERE e.company_id=s.company_id AND e.snapshot_id=s.id) AS employees FROM snapshots s WHERE company_id=$1 AND reporting_year=$2 ORDER BY id',[companyId,year])).rows;
    requests=(await query('SELECT id FROM info_requests WHERE company_id=$1 AND extract(year FROM received_on)=$2 ORDER BY id',[companyId,year])).rows;
    ingest=(await query('SELECT id FROM ingest_batches WHERE company_id=$1 AND reporting_year=$2 ORDER BY id',[companyId,year])).rows;
    ledger=(await query('SELECT version FROM payroll_ledgers WHERE company_id=$1 AND reporting_year=$2',[companyId,year])).rows[0]?.version||0;
    workflow=(await query('SELECT reporting_year FROM report_workflows WHERE company_id=$1 AND reporting_year=$2',[companyId,year])).rows.length;
    documents=(await query('SELECT kind FROM company_documents WHERE company_id=$1 AND kind=ANY($2::text[]) ORDER BY kind',[companyId,yearDocs(year)])).rows;
    profiles=(await query('SELECT DISTINCT structure_hash FROM import_batches WHERE company_id=$1 AND reporting_year=$2 ORDER BY structure_hash',[companyId,year])).rows;
    notices=(await query('SELECT notice_year FROM rights_notices WHERE company_id=$1 AND notice_year=$2',[companyId,year])).rows.length;
  }else{
    snapshots=store.snapshots.filter(s=>s.company_id===companyId&&s.reporting_year===year).map(s=>({id:s.id,employees:s.rows.length})).sort((a,b)=>a.id.localeCompare(b.id));
    requests=[...store.infoRequests.values()].filter(r=>r.company_id===companyId&&r.received_on.startsWith(String(year))).map(r=>({id:r.id})).sort((a,b)=>a.id.localeCompare(b.id));
    ingest=[...store.ingestBatches.values()].filter(r=>r.company_id===companyId&&r.reporting_year===year).map(r=>({id:r.id})).sort((a,b)=>a.id.localeCompare(b.id));
    ledger=store.payrollLedgers.get(`${companyId}:${year}`)?.version||0;
    workflow=store.workflows.has(`${companyId}:${year}`)?1:0;
    documents=yearDocs(year).filter(kind=>store.companyDocuments.has(`${companyId}:${kind}`)).map(kind=>({kind})).sort((a,b)=>a.kind.localeCompare(b.kind));
    profiles=[...new Set(store.importBatches.filter(b=>b.company_id===companyId&&b.reporting_year===year).map(b=>b.structure_hash))].sort().map(structure_hash=>({structure_hash}));
    notices=store.rightsNotices.has(`${companyId}:${year}`)?1:0;
  }
  const content={companyId,year,snapshots,requests,ingest,ledger,workflow,documents,profiles,notices};
  return {...content,fingerprint:createHash('sha256').update(JSON.stringify(content)).digest('hex'),counts:{snapshots:snapshots.length,employeeRows:snapshots.reduce((n,s)=>n+Number(s.employees),0),requests:requests.length,deliveries:ingest.length,payrollLedgers:ledger?1:0,workflows:workflow,documents:documents.length,importProfiles:profiles.length,notices}};
}
const auditBelongs=(metadata,year,ids)=>String(metadata?.year??metadata?.reporting_year??'')===String(year)||[metadata?.snapshot_id,metadata?.snapshotId,metadata?.request_id,metadata?.workflow?.snapshotId].some(id=>id&&ids.has(id));
export async function purgeYear(store,companyId,year,{fingerprint,exceptionReason='',exceptionReviewed=false,actor}) {
  let client;
  if(store.pool){client=await store.pool.connect();await client.query('BEGIN');}
  try{
    const query=client?.query.bind(client);
    if(query)await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${companyId}:${year}`]);
    const policy=query?(await query('SELECT document FROM company_documents WHERE company_id=$1 AND kind=$2 FOR UPDATE',[companyId,policyKey])).rows[0]?.document:await store.companyDocument(companyId,policyKey);
    retentionPolicy(policy);
    if(policy.holds.some(h=>h.year===year))throw new Error('LEGAL_HOLD_ACTIVE');
    const today=new Date().toISOString().slice(0,10),early=retentionDate(year,policy.retentionMonths)>today;
    if(early&&(!exceptionReviewed||!clean(exceptionReason)))throw new Error('RETENTION_NOT_DUE');
    const inventory=await lifecycleInventory(store,companyId,year,query);
    if(inventory.fingerprint!==fingerprint)throw new Error('DELETION_PREVIEW_CHANGED');
    const ids=new Set([...inventory.snapshots,...inventory.requests].map(r=>r.id));
    const receipt={id:randomUUID(),year,deletedOn:new Date().toISOString(),counts:inventory.counts,backupStatus:'pending',backupEvidence:'',exception:early,exceptionReason:early?clean(exceptionReason):'',actor};
    if(query){
      await query('DELETE FROM import_profiles WHERE company_id=$1 AND structure_hash=ANY($2::text[])',[companyId,inventory.profiles.map(p=>p.structure_hash)]);
      await query('DELETE FROM snapshots WHERE company_id=$1 AND reporting_year=$2',[companyId,year]);
      for(const table of ['report_workflows','payroll_ledgers','ingest_batches'])await query(`DELETE FROM ${table} WHERE company_id=$1 AND reporting_year=$2`,[companyId,year]);
      await query('DELETE FROM info_requests WHERE company_id=$1 AND extract(year FROM received_on)=$2',[companyId,year]);
      await query('DELETE FROM rights_notices WHERE company_id=$1 AND notice_year=$2',[companyId,year]);
      await query('DELETE FROM company_documents WHERE company_id=$1 AND kind=ANY($2::text[])',[companyId,yearDocs(year)]);
      // Older exports contain a full workflow in metadata. Remove that copy together with its source.
      await query(`DELETE FROM audit_events WHERE company_id=$1 AND (
        metadata->>'year'=$2 OR metadata->>'reporting_year'=$2 OR
        metadata->>'snapshot_id'=ANY($3::text[]) OR metadata->>'snapshotId'=ANY($3::text[]) OR
        metadata->>'request_id'=ANY($3::text[]) OR metadata->'workflow'->>'snapshotId'=ANY($3::text[]))`,[companyId,String(year),[...ids]]);
      await query('INSERT INTO company_documents(company_id,kind,document) VALUES($1,$2,$3)',[companyId,`del_${receipt.id}`,JSON.stringify(receipt)]);
      await query('INSERT INTO audit_events(company_id,action,metadata) VALUES($1,$2,$3)',[companyId,'year_data_deleted',JSON.stringify({receipt_id:receipt.id,year,counts:receipt.counts,actor})]);
      await query('COMMIT');
    }else{
      if(JSON.stringify(store.companyDocuments.get(`${companyId}:${policyKey}`))!==JSON.stringify(policy))throw new Error('DELETION_PREVIEW_CHANGED');
      // No awaits during the memory mutation: the demo operation is atomic within the event loop.
      store.snapshots=store.snapshots.filter(s=>!(s.company_id===companyId&&s.reporting_year===year));
      store.importBatches=store.importBatches.filter(b=>!(b.company_id===companyId&&b.reporting_year===year));
      for(const p of inventory.profiles)store.importProfiles.delete(`${companyId}:${p.structure_hash}`);
      store.workflows.delete(`${companyId}:${year}`);store.payrollLedgers.delete(`${companyId}:${year}`);store.payrollRecordSets?.delete(`${companyId}:${year}`);store.rightsNotices.delete(`${companyId}:${year}`);
      for(const r of inventory.requests)store.infoRequests.delete(r.id);
      for(const r of inventory.ingest)store.ingestBatches.delete(r.id);
      for(const kind of yearDocs(year))store.companyDocuments.delete(`${companyId}:${kind}`);
      store.auditEvents=store.auditEvents.filter(e=>e.company_id!==companyId||!auditBelongs(e.metadata,year,ids));
      store.companyDocuments.set(`${companyId}:del_${receipt.id}`,structuredClone(receipt));
      store.auditEvents.push({company_id:companyId,action:'year_data_deleted',metadata:{receipt_id:receipt.id,year,counts:receipt.counts,actor},created_at:receipt.deletedOn});
    }
    store.clearPayrollCache?.(companyId,year);
    return receipt;
  }catch(e){if(client)await client.query('ROLLBACK');throw e;}finally{client?.release();}
}
export function lifecycleRoutes(app,{store,yearValue,demo}) {
  const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(['RETENTION_POLICY_REQUIRED','INVALID_HOLD','LEGAL_HOLD_ACTIVE','RETENTION_NOT_DUE','DELETION_PREVIEW_CHANGED','INVALID_CONFIRMATION','INVALID_RECEIPT'].includes(e.message))return res.status(409).json({error:e.message});throw e;}};
  app.get('/api/data-retention',wrap(async(req,res)=>{
    const company=req.session.company,year=yearValue(req.query.year),policy=await store.companyDocument(company.id,policyKey),inventory=await lifecycleInventory(store,company.id,year);
    res.json({policy,year,counts:inventory.counts,fingerprint:inventory.fingerprint,reviewDue:policy?retentionDate(year,policy.retentionMonths):null,held:!!policy?.holds.some(h=>h.year===year)});
  }));
  app.post('/api/data-retention',wrap(async(req,res)=>{
    const policy=retentionPolicy(req.body.policy);await store.saveCompanyDocument(req.session.company.id,policyKey,policy);
    await store.audit(req.session.company.id,'retention_policy_saved',{user_id:req.session.user.id});res.json({policy});
  }));
  app.post('/api/data-retention/delete-year',wrap(async(req,res)=>{
    const company=req.session.company,year=yearValue(req.body.year);
    if(req.body.confirmation!==`${company.country} ${year} DELETE`||req.body.legalReviewConfirmed!==true)throw new Error('INVALID_CONFIRMATION');
    // Demo data are synthetic. A real account must reauthenticate before irreversible erasure.
    if(!(demo&&req.session.user.email.endsWith('@demo.invalid'))&&(typeof req.body.password!=='string'||req.body.password.length>128||!await verifyPassword(req.body.password,req.session.user.password_hash)))return res.status(403).json({error:'INVALID_LOGIN'});
    const receipt=await purgeYear(store,company.id,year,{fingerprint:req.body.fingerprint,exceptionReason:req.body.exceptionReason,exceptionReviewed:req.body.exceptionReviewed===true,actor:req.session.user.id});
    res.json({receipt});
  }));
  app.get('/api/data-retention/receipts',wrap(async(req,res)=>{
    const companyId=req.session.company.id;
    const receipts=store.pool?(await store.pool.query("SELECT document FROM company_documents WHERE company_id=$1 AND left(kind,4)='del_' ORDER BY updated_at DESC",[companyId])).rows.map(r=>r.document):[...store.companyDocuments.entries()].filter(([k])=>k.startsWith(`${companyId}:del_`)).map(([,v])=>v);
    res.json({receipts});
  }));
  app.post('/api/data-retention/backup-complete',wrap(async(req,res)=>{
    if(!/^[0-9a-f-]{36}$/.test(req.body.receiptId||''))throw new Error('INVALID_RECEIPT');
    const key=`del_${req.body.receiptId}`,receipt=await store.companyDocument(req.session.company.id,key),evidence=clean(req.body.evidence);
    if(!receipt||!evidence||req.body.confirmed!==true)throw new Error('INVALID_RECEIPT');
    const updated={...receipt,backupStatus:'operator_confirmed',backupEvidence:evidence,backupConfirmedOn:new Date().toISOString(),backupConfirmedBy:req.session.user.id};
    await store.saveCompanyDocument(req.session.company.id,key,updated);
    await store.audit(req.session.company.id,'backup_erasure_recorded',{receipt_id:receipt.id,user_id:req.session.user.id});res.json({receipt:updated});
  }));
}
