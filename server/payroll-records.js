import {createHash} from 'node:crypto';
import {emptyLedger,addPayrollRecords,calculatePayroll,ledgerHash} from './payroll-ledger.js';
import {normalizeEmployee} from './pay.js';
import {validateImportContext} from './importer.js';
import {editPayrollInput,validatePayrollEdits} from './payroll-edits.js';
import {setImmediate} from 'node:timers/promises';

const PAGE=1000,fail=code=>{throw Error(code);};
const comparable=(kind,row)=>kind==='hr'?{...row,source_hash:null,source_row:null}:Object.fromEntries(Object.entries(row).filter(([k])=>!['file_hash','row'].includes(k)));
const same=(kind,a,b)=>{const left=comparable(kind,a),right=comparable(kind,b);return Object.keys(left).length===Object.keys(right).length&&Object.entries(left).every(([k,v])=>right[k]===v);};
const coded=(code,extra={})=>Object.assign(Error(code),extra);

// The production implementation stores individual indexed rows in PostgreSQL.
// MemoryStore remains an isolated synthetic demo/test implementation.
export class PayrollRecords{
 constructor(store){this.store=store;this.locks=new Map();this.cache=new Map();store.payrollRecordSets??=new Map();store.clearPayrollCache=(company,year)=>{for(const key of this.cache.keys())if(key.startsWith(`${company}:${year}:`))this.cache.delete(key);};}
 cacheKey(company,year,state){return state.document?.storage==='rows-v1'?`${company}:${year}:${state.version}:${ledgerHash(state.document)}`:null;}
 remember(company,year,result){const key=result?.calculation&&this.cacheKey(company,year,result.state);if(key){this.cache.delete(key);this.cache.set(key,result.calculation);while(this.cache.size>5)this.cache.delete(this.cache.keys().next().value);}return result;}
 async locked(key,fn){const previous=this.locks.get(key)||Promise.resolve();let release;const tail=new Promise(r=>release=r);this.locks.set(key,tail);await previous;try{return await fn();}finally{release();if(this.locks.get(key)===tail)this.locks.delete(key);}}
 async session(company,year,write,fn){
  if(this.store.pool){const client=await this.store.pool.connect();try{
   await client.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   if(write)await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${company}:${year}`]);
   if(write)await client.query('INSERT INTO payroll_ledgers(company_id,reporting_year,version,document) VALUES($1,$2,0,$3) ON CONFLICT DO NOTHING',[company,year,JSON.stringify(emptyLedger())]);
   const state=(await client.query('SELECT version,document FROM payroll_ledgers WHERE company_id=$1 AND reporting_year=$2'+(write?' FOR UPDATE':''),[company,year])).rows[0]||{version:0,document:null};
   const result=await fn(this.database(client,company,year,state));await client.query('COMMIT');return this.remember(company,year,result);
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
  return this.locked(`${company}:${year}`,async()=>{
   const state=await this.store.payrollLedger(company,year),existing=this.store.payrollRecordSets.get(`${company}:${year}`),sets=existing&&state.document?.storage==='rows-v1'?existing:{hr:new Map(),transactions:new Map()};
   const copy=write?{hr:new Map(sets.hr),transactions:new Map(sets.transactions)}:sets,adapter=this.memory(company,year,state,copy);
   const result=await fn(adapter);if(write&&adapter.changed){if((this.store.payrollLedgers.get(`${company}:${year}`)?.version||0)!==state.version)fail('PAYROLL_VERSION_CONFLICT');this.store.payrollRecordSets.set(`${company}:${year}`,copy);this.store.payrollLedgers.set(`${company}:${year}`,adapter.state);this.store.auditEvents.push({company_id:company,action:adapter.action,metadata:{year,actor:adapter.actor,version:adapter.state.version,...adapter.details},created_at:new Date().toISOString()});}return this.remember(company,year,result);
  });
 }
 database(client,company,year,state){return {state,
  async *pages(kind){let after='';for(;;){const rows=(await client.query('SELECT record_key,payload FROM payroll_records WHERE company_id=$1 AND reporting_year=$2 AND kind=$3 AND record_key>$4 ORDER BY record_key LIMIT $5',[company,year,kind,after,PAGE])).rows;if(!rows.length)return;after=rows.at(-1).record_key;yield rows.map(r=>r.payload);}},
  async lookup(kind,keys){if(!keys.length)return new Map();const rows=(await client.query('SELECT record_key,payload FROM payroll_records WHERE company_id=$1 AND reporting_year=$2 AND kind=$3 AND record_key=ANY($4::text[])',[company,year,kind,keys])).rows;return new Map(rows.map(r=>[r.record_key,r.payload]));},
  async insert(kind,rows){if(!rows.length)return;await client.query(`INSERT INTO payroll_records(company_id,reporting_year,kind,record_key,payload) SELECT $1,$2,$3,r->>'key',r FROM jsonb_array_elements($4::jsonb) AS r`,[company,year,kind,JSON.stringify(rows)]);},
  async clear(){await client.query('DELETE FROM payroll_records WHERE company_id=$1 AND reporting_year=$2',[company,year]);},
  async save(document,actor,action,details={}){const next=(await client.query('UPDATE payroll_ledgers SET version=version+1,document=$3,updated_at=clock_timestamp() WHERE company_id=$1 AND reporting_year=$2 RETURNING version,document',[company,year,JSON.stringify(document)])).rows[0];this.state=next;await client.query('INSERT INTO audit_events(company_id,action,metadata) VALUES($1,$2,$3)',[company,action,JSON.stringify({year,actor,version:next.version,...details})]);return next;}
 };}
 memory(company,year,state,sets){return {state,changed:false,
  async *pages(kind){let page=[];for(const row of sets[kind].values()){page.push(row);if(page.length===PAGE){yield page;page=[];}}if(page.length)yield page;},
  async lookup(kind,keys){return new Map(keys.filter(k=>sets[kind].has(k)).map(k=>[k,sets[kind].get(k)]));},
  async insert(kind,rows){for(const row of rows)sets[kind].set(row.key,row);},
  async clear(){sets.hr.clear();sets.transactions.clear();},
  async save(document,actor,action,details={}){this.changed=true;this.actor=actor;this.action=action;this.details=details;this.state={version:this.state.version+1,document:structuredClone(document)};return this.state;}
 };}
 async migrate(adapter){
  const old=adapter.state.document||emptyLedger();if(old.storage==='rows-v1')return old;
  for(const [kind,name] of [['hr','employees'],['transactions','transactions']]){let page=[];for(const key in old[name]||{}){page.push(old[name][key]);if(page.length===PAGE){await adapter.insert(kind,page);page=[];}}await adapter.insert(kind,page);}
  return {...old,employees:{},transactions:{},storage:'rows-v1',revisionHash:ledgerHash(old)};
 }
 async inspect(company,year,settings){return this.session(company,year,false,async a=>({state:a.state,calculation:this.cache.get(this.cacheKey(company,year,a.state))||(a.state.document?.storage==='rows-v1'?await this.calculate(a,settings):calculatePayroll(a.state.document||emptyLedger(),settings))}));}
 async stage(company,year,expectedVersion,parsed,pages,settings){return this.session(company,year,true,async a=>{
  if(a.state.version!==expectedVersion)fail('PAYROLL_VERSION_CONFLICT');
  const document=await this.migrate(a),hash=createHash('sha256').update(document.revisionHash||''),errors=[];let errorCount=0,offset=0,added=0,duplicates=0;
  const addError=e=>{errorCount++;if(errors.length<50)errors.push(e);};
  // Validate all edit coordinates before touching the transaction; apply per page below.
  const edits=validatePayrollEdits(parsed,settings);
  for await(const page of pages){
   const localEdits=edits.filter(e=>e.record>offset&&e.record<=offset+page.length).map(e=>({...e,record:e.record-offset}));
   const input=editPayrollInput({...parsed,rows:page},{...settings,edits:localEdits});
   const context=validateImportContext(input.headers,input.rows,{country:settings.country,year,mode:'transactions'});
   for(const e of context)addError({...e,row:e.row?e.row+offset:e.row});
   const result=addPayrollRecords(emptyLedger(),input,settings);
   for(const e of result.errors)addError({...e,row:e.row?e.row+offset:e.row});
   const entries=Object.values(result.document[settings.kind==='hr'?'employees':'transactions']);
   for(const e of entries){if(settings.kind==='hr')e.source_row+=offset;else e.row+=offset;}
   const existing=await a.lookup(settings.kind,entries.map(r=>r.key)),fresh=[];
   for(const row of entries){const old=existing.get(row.key);if(old){if(!same(settings.kind,old,row))addError({row:settings.kind==='hr'?row.source_row:row.row,error:settings.kind==='hr'?'CONFLICTING_HR_RECORD':'TRANSACTION_CONFLICT'});else duplicates++;}else {fresh.push(row);hash.update(ledgerHash(row));}}
   duplicates+=result.duplicates;added+=fresh.length;await a.insert(settings.kind,fresh);offset+=page.length;await setImmediate();
  }
  if(offset!==(parsed.rowCount??parsed.rows.length))fail('IMPORT_UPLOAD_CORRUPTED');
  if(errorCount)throw coded('IMPORT_VALIDATION_FAILED',{errors,errorCount});
  if(added||a.state.document?.storage!=='rows-v1'){document.revisionHash=hash.digest('hex');await a.save(document,settings.actor,'payroll_staged',{file_hash:parsed.fileHash,...(edits.length?{edit_count:edits.length,edits_hash:ledgerHash(edits)}:{})});}
  return {state:a.state,added,duplicates,calculation:await this.calculate(a,settings)};
 });}
 async approve(company,year,version,definitions,actor,settings){return this.session(company,year,true,async a=>{
  if(a.state.version!==version)fail('PAYROLL_VERSION_CONFLICT');const document=await this.migrate(a);
  if(!Array.isArray(definitions)||!definitions.length||definitions.length>200)fail('INVALID_PAY_CODES');
  const available=new Set();for await(const page of a.pages('transactions'))for(const tx of page)available.add(JSON.stringify([tx.source,tx.pay_code]));
  for(const item of definitions){if(!['ordinary','variable','excluded'].includes(item.classification)||typeof item.reason!=='string'||item.reason.trim().length<5||item.reason.length>2000)fail('INVALID_PAY_CODES');const key=JSON.stringify([item.source,item.code]);if(!available.has(key))fail('UNKNOWN_PAY_CODE');document.codes[key]={source:item.source,code:item.code,classification:item.classification,reason:item.reason.trim(),approved_by:actor,approved_at:new Date().toISOString()};}
  await a.save(document,actor,'pay_codes_approved');return {state:a.state,calculation:await this.calculate(a,settings)};
 });}
 async reset(company,year,version,actor,settings){return this.session(company,year,true,async a=>{if(a.state.version!==version)fail('PAYROLL_VERSION_CONFLICT');await a.clear();await a.save({...emptyLedger(),storage:'rows-v1',revisionHash:ledgerHash([])},actor,'payroll_draft_reset');return {state:a.state,calculation:await this.calculate(a,settings)};});}
 async calculate(a,{company,secret,year}){
  const employees=new Map(),codes=new Map(),errors=[],rows=[];let errorCount=0,transactionCount=0;
  const error=e=>{errorCount++;if(errors.length<100)errors.push(e);};
  for await(const page of a.pages('hr'))for(const e of page){if(employees.size>=10000)fail('PAYROLL_EMPLOYEE_CAPACITY');employees.set(e.key,{...e,base:0,variable:0,months:new Set(),hours:new Map()});}
  if(!employees.size)error({error:'HR_DATA_REQUIRED'});
  const definitions=a.state.document?.codes||{};
  for await(const page of a.pages('transactions')){
   const references=await a.lookup('transactions',page.filter(t=>t.correction_ref).map(t=>t.correction_ref));
   for(const tx of page){transactionCount++;const key=JSON.stringify([tx.source,tx.pay_code]),classification=definitions[key]?.classification||'unknown';
    if(!codes.has(key)){if(codes.size>=10000)fail('PAYROLL_CODE_CAPACITY');codes.set(key,{source:tx.source,code:tx.pay_code,...definitions[key],classification});if(classification==='unknown')error({error:'PAY_CODE_CLASSIFICATION_REQUIRED',source:tx.source,pay_code:tx.pay_code});}
    if(tx.correction_ref){const original=references.get(tx.correction_ref);if(!original||original.correction_ref||original.employee!==tx.employee||original.period!==tx.period||original.pay_code!==tx.pay_code||original.key===tx.key)error({error:'INVALID_CORRECTION_REFERENCE',row:tx.row});}
    const e=employees.get(tx.employee);if(!e){error({error:'UNMATCHED_PAYROLL_EMPLOYEE',employee:tx.employee.slice(0,12),row:tx.row});continue;}
    const month=Number(tx.period.slice(-2));e.months.add(month);if(month<e.first_month||month>e.last_month)error({error:'PAYROLL_OUTSIDE_EMPLOYMENT',employee:e.key.slice(0,12),period:tx.period});
    if(classification==='ordinary')e.base+=tx.amount_cents;if(classification==='variable')e.variable+=tx.amount_cents;
    if(!Number.isSafeInteger(e.base)||!Number.isSafeInteger(e.variable))fail('PAYROLL_TOTAL_OVERFLOW');
    if(tx.hours_cents){if(e.hours.has(tx.period)&&e.hours.get(tx.period)!==tx.hours_cents)error({error:'CONFLICTING_PERIOD_HOURS',employee:e.key.slice(0,12),period:tx.period});else e.hours.set(tx.period,tx.hours_cents);}
   }
   await setImmediate();
  }
  for(const e of employees.values()){
   for(let month=e.first_month;month<=e.last_month;month++){const period=`${year}-${String(month).padStart(2,'0')}`;if(!e.months.has(month)||!e.hours.has(period))error({error:'MISSING_PAYROLL_PERIOD_OR_HOURS',employee:e.key.slice(0,12),period});}
   try{rows.push({...normalizeEmployee({internal_id:e.key,gender:e.gender,job_title:e.job_title,worker_category:e.worker_category,base_annual:e.base/100,bonuses_annual:e.variable/100,paid_hours_annual:[...e.hours.values()].reduce((a,b)=>a+b,0)/100,hours_per_week:e.hours_per_week},company,secret),anonymized_id:e.key});}catch(ex){error({error:ex.message,employee:e.key.slice(0,12)});}
  }
  return {rows,codes:[...codes.values()],errors,errorCount,employeeCount:employees.size,transactionCount,ready:errorCount===0&&rows.length>0};
 }
}
