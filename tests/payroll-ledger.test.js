import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLedger,addPayrollRecords,approvePayrollCodes,calculatePayroll,suggestPayrollMapping} from '../server/payroll-ledger.js';

const company='11111111-1111-4111-8111-111111111111',secret='a'.repeat(64),year=2026;
const hrHeaders=['internal_id','gender','job_title','worker_category','hours_per_week','first_month','last_month'];
const txHeaders=['transaction_id','internal_id','period','pay_code','amount','currency','paid_hours','correction_ref'];
const identity=headers=>Object.fromEntries(headers.map(h=>[h,h]));
const parsed=(headers,rows,fileHash='h1')=>({headers,fileHash,rows:rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))});
const options=kind=>({kind,mapping:identity(kind==='hr'?hrHeaders:txHeaders),source:'DATEV',company,secret,year});
const months=(from,to)=>Array.from({length:to-from+1},(_,i)=>`${year}-${String(from+i).padStart(2,'0')}`);
function yearOfPay(id,base,bonus=0,{from=1,to=12,hours=160}={}) {
  const rows=[];
  for(const period of months(from,to)) {
    rows.push([`${id}-${period}-B`,id,period,'1000',base,'EUR',hours,'']);
    if(bonus)rows.push([`${id}-${period}-V`,id,period,'2000',bonus,'EUR','','']);
  }
  return rows;
}
function build({hr,tx}) {
  let doc=emptyLedger();
  const a=addPayrollRecords(doc,parsed(hrHeaders,hr),options('hr'));assert.deepEqual(a.errors,[]);doc=a.document;
  const b=addPayrollRecords(doc,parsed(txHeaders,tx),options('transactions'));assert.deepEqual(b.errors,[]);doc=b.document;
  return doc;
}
const classification={1000:['ordinary','Monthly base salary'],2000:['variable','Monthly bonus']};
const classify=doc=>approvePayrollCodes(doc,[...new Set(Object.values(doc.transactions).map(t=>t.pay_code))].filter(code=>classification[code]).map(code=>({source:'DATEV',code,classification:classification[code][0],reason:classification[code][1]})),'user-1');

test('twelve monthly lines become annual base, variable and paid hours per employee',()=>{
  const doc=classify(build({hr:[['E1','F','Engineer','L3','40','1','12'],['E2','M','Engineer','L3','40','1','12']],tx:[...yearOfPay('E1',5000,250),...yearOfPay('E2',5000)]}));
  const result=calculatePayroll(doc,{company,secret,year});
  assert.deepEqual(result.errors,[]);assert.equal(result.ready,true);
  const woman=result.rows.find(r=>r.gender==='F');
  assert.equal(woman.base_annual,60000);assert.equal(woman.bonuses_annual,3000);assert.equal(woman.paid_hours_annual,1920);
  assert.ok(!JSON.stringify(result).includes('E1'),'source employee IDs are pseudonymised');
});

test('unknown pay codes block approval until classified',()=>{
  const doc=build({hr:[['E1','F','Engineer','L3','40','1','12']],tx:yearOfPay('E1',5000)});
  const result=calculatePayroll(doc,{company,secret,year});
  assert.equal(result.ready,false);
  assert.ok(result.errors.some(e=>e.error==='PAY_CODE_CLASSIFICATION_REQUIRED'&&e.pay_code==='1000'));
  assert.throws(()=>approvePayrollCodes(doc,[{source:'DATEV',code:'9999',classification:'ordinary',reason:'Not in ledger'}],'u'),/UNKNOWN_PAY_CODE/);
  assert.throws(()=>approvePayrollCodes(doc,[{source:'DATEV',code:'1000',classification:'ordinary',reason:'x'}],'u'),/INVALID_PAY_CODES/);
});

test('excluded codes never reach base or variable pay',()=>{
  const doc=approvePayrollCodes(build({hr:[['E1','M','Engineer','L3','40','1','12']],tx:[...yearOfPay('E1',5000),...months(1,12).map(p=>[`T-${p}`,'E1',p,'9000','700','EUR','',''])]}),[{source:'DATEV',code:'1000',classification:'ordinary',reason:'Base salary'},{source:'DATEV',code:'9000',classification:'excluded',reason:'Expense reimbursement'}],'u');
  const row=calculatePayroll(doc,{company,secret,year}).rows[0];
  assert.equal(row.base_annual,60000);assert.equal(row.bonuses_annual,0);
});

test('missing month or hours inside employment blocks the calculation',()=>{
  const doc=classify(build({hr:[['E1','F','Engineer','L3','40','1','12']],tx:yearOfPay('E1',5000,0,{to:11})}));
  const result=calculatePayroll(doc,{company,secret,year});
  assert.ok(result.errors.some(e=>e.error==='MISSING_PAYROLL_PERIOD_OR_HOURS'&&e.period==='2026-12'));
  assert.equal(result.ready,false);
});

test('part-year employment only requires months of employment',()=>{
  const doc=classify(build({hr:[['E1','F','Engineer','L3','40','4','9']],tx:yearOfPay('E1',5000,0,{from:4,to:9})}));
  const result=calculatePayroll(doc,{company,secret,year});
  assert.deepEqual(result.errors,[]);assert.equal(result.rows[0].base_annual,30000);assert.equal(result.rows[0].paid_hours_annual,960);
});

test('payroll outside employment months and unmatched employees are reported',()=>{
  const doc=classify(build({hr:[['E1','F','Engineer','L3','40','4','9']],tx:[...yearOfPay('E1',5000,0,{from:3,to:9}),...yearOfPay('GHOST',100,0,{from:1,to:1})]}));
  const errors=calculatePayroll(doc,{company,secret,year}).errors.map(e=>e.error);
  assert.ok(errors.includes('PAYROLL_OUTSIDE_EMPLOYMENT'));assert.ok(errors.includes('UNMATCHED_PAYROLL_EMPLOYEE'));
});

test('negative lines need a valid same-employee, same-period, same-code correction reference',()=>{
  const hr=[['E1','F','Engineer','L3','40','1','12']];
  let doc=build({hr,tx:yearOfPay('E1',5000)});
  const bad=addPayrollRecords(doc,parsed(txHeaders,[['C1','E1','2026-03','1000','-100','EUR','','']]),options('transactions'));
  assert.equal(bad.errors[0].error,'CORRECTION_REFERENCE_REQUIRED');
  const good=addPayrollRecords(doc,parsed(txHeaders,[['C1','E1','2026-03','1000','-100','EUR','','E1-2026-03-B']]),options('transactions'));
  assert.deepEqual(good.errors,[]);doc=classify(good.document);
  assert.equal(calculatePayroll(doc,{company,secret,year}).rows[0].base_annual,60000-100);
  const wrongMonth=addPayrollRecords(build({hr,tx:yearOfPay('E1',5000)}),parsed(txHeaders,[['C2','E1','2026-04','1000','-100','EUR','','E1-2026-03-B']]),options('transactions'));
  assert.ok(calculatePayroll(classify(wrongMonth.document),{company,secret,year}).errors.some(e=>e.error==='INVALID_CORRECTION_REFERENCE'));
});

test('re-importing identical lines is idempotent and conflicting lines are rejected',()=>{
  const hr=[['E1','F','Engineer','L3','40','1','12']],tx=yearOfPay('E1',5000);
  const doc=build({hr,tx});
  const again=addPayrollRecords(doc,parsed(txHeaders,tx,'h2'),options('transactions'));
  assert.equal(again.added,0);assert.equal(again.duplicates,tx.length);
  const changed=addPayrollRecords(doc,parsed(txHeaders,[['E1-2026-01-B','E1','2026-01','1000','5100','EUR','160','']],'h3'),options('transactions'));
  assert.equal(changed.errors[0].error,'TRANSACTION_CONFLICT');
  const hrChanged=addPayrollRecords(doc,parsed(hrHeaders,[['E1','M','Engineer','L3','40','1','12']]),options('hr'));
  assert.equal(hrChanged.errors[0].error,'CONFLICTING_HR_RECORD');
});

test('periods, currency, decimals and gender fail closed',()=>{
  const bad=(row,expected)=>assert.equal(addPayrollRecords(emptyLedger(),parsed(txHeaders,[row]),options('transactions')).errors[0].error,expected);
  bad(['T1','E1','2025-12','1000','100','EUR','',''],'INVALID_PAYROLL_PERIOD');
  bad(['T1','E1','2026-13','1000','100','EUR','',''],'INVALID_PAYROLL_PERIOD');
  bad(['T1','E1','2026-01','1000','100','USD','',''],'IMPORT_CURRENCY_UNSUPPORTED');
  bad(['T1','E1','2026-01','1000','1,000.00','EUR','',''],'INVALID_AMOUNT');
  bad(['T1','E1','2026-01','1000','100.123','EUR','',''],'INVALID_AMOUNT');
  assert.equal(addPayrollRecords(emptyLedger(),parsed(hrHeaders,[['E1','???','Engineer','L3','40','1','12']]),options('hr')).errors[0].error,'INVALID_GENDER');
  assert.equal(addPayrollRecords(emptyLedger(),parsed(hrHeaders,[['E1','F','Engineer','L3','40','7','3']]),options('hr')).errors[0].error,'INVALID_EMPLOYMENT_MONTHS');
});

test('German and Slovenian headers map unambiguously and decimal comma is honoured',()=>{
  assert.equal(suggestPayrollMapping(['Personalnummer','Geschlecht','Wochenstunden'],'hr').gender,'Geschlecht');
  assert.equal(suggestPayrollMapping(['Šifra zaposlenega','Spol','Tedenske ure'],'hr').gender,'Spol');
  assert.equal(suggestPayrollMapping(['Lohnart','Betrag','Währung'],'transactions').amount,'Betrag');
  const result=addPayrollRecords(emptyLedger(),parsed(txHeaders,[['T1','E1','2026-01','1000','4500,50','EUR','167,5','']]),{...options('transactions'),decimalSeparator:','});
  assert.deepEqual(result.errors,[]);assert.equal(Object.values(result.document.transactions)[0].amount_cents,450050);
});

test('the same transaction ID from different sources does not collide',()=>{
  let doc=addPayrollRecords(emptyLedger(),parsed(txHeaders,[['T1','E1','2026-01','1000','100','EUR','','']]),options('transactions')).document;
  doc=addPayrollRecords(doc,parsed(txHeaders,[['T1','E1','2026-01','1000','999','EUR','','']]),{...options('transactions'),source:'SAP'}).document;
  assert.equal(Object.keys(doc.transactions).length,2);
});
