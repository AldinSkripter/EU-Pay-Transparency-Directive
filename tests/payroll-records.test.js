import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {MemoryStore,PostgresStore} from '../server/store.js';
import {PayrollRecords} from '../server/payroll-records.js';
import {emptyLedger,addPayrollRecords,approvePayrollCodes,calculatePayroll} from '../server/payroll-ledger.js';

const secret='s'.repeat(64),year=2026;
const identity=headers=>Object.fromEntries(headers.map(h=>[h,h]));
const hr=[{internal_id:'E1',gender:'F',job_title:'Engineer',worker_category:'L3',hours_per_week:'40',first_month:'1',last_month:'12'}];
const monthly=()=>Array.from({length:12},(_,i)=>({transaction_id:`T${i+1}`,internal_id:'E1',period:`2026-${String(i+1).padStart(2,'0')}`,pay_code:'BASE',amount:'5000.25',currency:'EUR',paid_hours:'160',correction_ref:''}));
const parsed=rows=>({headers:Object.keys(rows[0]),rows,fileHash:'source',rowCount:rows.length});
const pages=async function*(rows,size=5){for(let i=0;i<rows.length;i+=size)yield rows.slice(i,i+size);};
const settings=(company,kind,rows,extra={})=>({company,secret,year,country:'AT',actor:'tester',source:'Payroll',kind,mapping:identity(Object.keys(rows[0])),...extra});

for(const mode of ['memory','postgres'])test(`${mode}: paged payroll preserves annual arithmetic, rollback, duplicates, corrections, isolation and deletion`,async t=>{
 let store,db;
 if(mode==='memory')store=new MemoryStore();else{
  db=new PGlite();t.after(()=>db.close());store=new PostgresStore('postgresql://unused');await store.pool.end();
  const query=async(sql,params)=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length};};store.pool={query,connect:async()=>({query,release(){}})};
  for(const name of ['001_initial','002_self_service','005_import_batches','006_payroll_ledger','012_payroll_records'])await db.exec(await readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8'));
 }
 const company=randomUUID(),other=randomUUID(),records=new PayrollRecords(store);
 if(db){for(const id of [company,other])await db.query('INSERT INTO companies(id,name,country) VALUES($1,$2,$3)',[id,'Test','AT']);}
 let state=await records.stage(company,year,0,parsed(hr),pages(hr),settings(company,'hr',hr));
 const tx=monthly();state=await records.stage(company,year,state.state.version,parsed(tx),pages(tx),settings(company,'transactions',tx));assert.equal(state.calculation.transactionCount,12);assert.equal(state.calculation.ready,false);
 state=await records.approve(company,year,state.state.version,[{source:'Payroll',code:'BASE',classification:'ordinary',reason:'Verified regular pay'}],'tester',settings(company,'transactions',tx));
 assert.equal(state.calculation.ready,true);assert.equal(state.calculation.rows[0].base_annual,60003);assert.equal(state.calculation.rows[0].paid_hours_annual,1920);
 let legacy=addPayrollRecords(emptyLedger(),parsed(hr),settings(company,'hr',hr)).document;legacy=addPayrollRecords(legacy,parsed(tx),settings(company,'transactions',tx)).document;legacy=approvePayrollCodes(legacy,[{source:'Payroll',code:'BASE',classification:'ordinary',reason:'Verified regular pay'}],'tester');
 assert.deepEqual(state.calculation.rows,calculatePayroll(legacy,{company,secret,year}).rows);
 const version=state.state.version;
 const replay=await records.stage(company,year,version,parsed(tx),pages(tx,1),settings(company,'transactions',tx));assert.equal(replay.added,0);assert.equal(replay.duplicates,12);assert.equal(replay.state.version,version);
 const broken=[{...tx[0],transaction_id:'NEW'}, {...tx[1],transaction_id:'BAD',amount:'invalid'}];
 await assert.rejects(records.stage(company,year,version,parsed(broken),pages(broken,1),settings(company,'transactions',broken)),e=>e.message==='IMPORT_VALIDATION_FAILED'&&e.errors[0].row===3);
 assert.equal((await records.inspect(company,year,{company,secret,year})).calculation.transactionCount,12);
 const conflict=[{...tx[0],amount:'7000'}];await assert.rejects(records.stage(company,year,version,parsed(conflict),pages(conflict),settings(company,'transactions',conflict)),/IMPORT_VALIDATION_FAILED/);
 const corrected=[{...tx[0],transaction_id:'C1',amount:'-100',paid_hours:'',correction_ref:'T1'}];
 state=await records.stage(company,year,version,parsed(corrected),pages(corrected),settings(company,'transactions',corrected));assert.equal(state.calculation.rows[0].base_annual,59903);assert.equal(state.calculation.ready,true);
 const many=Array.from({length:2101},(_,i)=>({...tx[0],transaction_id:'PAGE-'+i,amount:'1.00'}));
 state=await records.stage(company,year,state.state.version,parsed(many),pages(many,1000),settings(company,'transactions',many));assert.equal(state.calculation.transactionCount,2114);assert.equal(state.calculation.rows[0].base_annual,62004);
 const laterFailure=many.map((r,i)=>({...r,transaction_id:'FAIL-'+i,...(i===2100?{currency:'USD'}:{})}));
 await assert.rejects(records.stage(company,year,state.state.version,parsed(laterFailure),pages(laterFailure,1000),settings(company,'transactions',laterFailure)),e=>e.message==='IMPORT_VALIDATION_FAILED'&&e.errors.some(x=>x.row===2102));assert.equal((await records.inspect(company,year,{company,secret,year})).calculation.transactionCount,2114);
 assert.equal((await records.inspect(other,year,{company:other,secret,year})).calculation.transactionCount,0);
 await assert.rejects(records.reset(company,year,version,'tester',{company,secret,year}),/VERSION_CONFLICT/);
 state=await records.reset(company,year,state.state.version,'tester',{company,secret,year});assert.equal(state.calculation.transactionCount,0);
 if(db){await records.stage(company,year,state.state.version,parsed(tx),pages(tx),settings(company,'transactions',tx));assert.equal(Number((await db.query('SELECT count(*) FROM payroll_records WHERE company_id=$1',[company])).rows[0].count),12);await db.query('DELETE FROM payroll_ledgers WHERE company_id=$1 AND reporting_year=$2',[company,year]);assert.equal(Number((await db.query('SELECT count(*) FROM payroll_records WHERE company_id=$1',[company])).rows[0].count),0);}
});

test('paged migration preserves an existing JSON ledger and a manual edit beyond the first page is validated',async()=>{
 const store=new MemoryStore(),company=randomUUID(),records=new PayrollRecords(store),tx=monthly();let legacy=addPayrollRecords(emptyLedger(),parsed(hr),settings(company,'hr',hr)).document;legacy=addPayrollRecords(legacy,parsed(tx),settings(company,'transactions',tx)).document;
 await store.savePayrollLedger(company,year,0,legacy,'tester');
 const extra=[{...tx[0],transaction_id:'X1'}, {...tx[0],transaction_id:'X2',amount:'invalid'}];
 const result=await records.stage(company,year,1,parsed(extra),pages(extra,1),settings(company,'transactions',extra,{edits:[{record:2,field:'amount',value:'10.00'}]}));assert.equal(result.calculation.transactionCount,14);assert.equal(result.state.document.storage,'rows-v1');assert.equal(Object.keys(result.state.document.transactions).length,0);
});
