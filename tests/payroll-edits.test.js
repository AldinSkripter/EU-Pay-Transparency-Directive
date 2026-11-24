import test from 'node:test';
import assert from 'node:assert/strict';
import {editPayrollInput} from '../server/payroll-edits.js';
import {addPayrollRecords,emptyLedger} from '../server/payroll-ledger.js';

test('manual payroll edits preserve the source and every row, and still undergo strict validation',()=>{
 const headers=['transaction_id','internal_id','period','pay_code','amount','currency'],mapping=Object.fromEntries(headers.map(h=>[h,h]));
 const source={headers,fileHash:'source',rows:[{transaction_id:'1',internal_id:'E1',period:'2026-01',pay_code:'1000',amount:'invalid',currency:'EUR'}]},options={kind:'transactions',mapping,source:'Payroll',company:'company',secret:'s'.repeat(64),year:2026};
 const fixed=editPayrollInput(source,{...options,edits:[{record:1,field:'amount',value:'100.25'}]});
 assert.equal(source.rows[0].amount,'invalid');assert.equal(fixed.rows.length,1);assert.equal(fixed.fileHash,'source');
 assert.deepEqual(addPayrollRecords(emptyLedger(),fixed,options).errors,[]);
 const invalid=editPayrollInput(source,{...options,edits:[{record:1,field:'amount',value:'1e9'}]});assert.equal(addPayrollRecords(emptyLedger(),invalid,options).errors[0].error,'INVALID_AMOUNT');
 for(const edits of [[{record:0,field:'amount',value:'1'}],[{record:2,field:'amount',value:'1'}],[{record:1,field:'__proto__',value:'x'}],[{record:1,field:'amount',value:1}],[{record:1,field:'amount',value:'1'},{record:1,field:'amount',value:'2'}]])assert.throws(()=>editPayrollInput(source,{...options,edits}),/INVALID_FIXES/);
});
