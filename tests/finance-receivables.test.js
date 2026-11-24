import test from 'node:test';
import assert from 'node:assert/strict';
import {financeReceivables,receivablesCsv} from '../shared/finance-receivables.js';
const invoice=(id,dueDate,extra={})=>({id,kind:'invoice',status:'issued',contactId:'c1',customer:{name:'Buyer'},number:'RE-'+id,issueDate:'2026-01-01',dueDate,grossCents:12000,payments:[],...extra});
test('aging respects exact boundaries, partial payments, invoice status and upcoming dates',()=>{
  const dates=['2026-11-15','2026-11-14','2026-10-16','2026-10-15','2026-09-16','2026-09-15','2026-08-17','2026-08-16','2026-11-22','2026-11-23'];
  const docs=dates.map((date,i)=>invoice(String(i),date));
  docs[1].payments=[{paidOn:'2026-11-14',amountCents:2000}];
  docs.push(invoice('draft','2026-01-01',{status:'draft'}),invoice('offer','2026-01-01',{kind:'offer'}),invoice('paid','2026-01-01',{payments:[{paidOn:'2026-11-01',amountCents:12000}]}));
  const r=financeReceivables(docs,'2026-11-15');
  assert.equal(r.rows.length,10);assert.equal(r.outstandingCents,118000);assert.equal(r.overdueCents,82000);assert.equal(r.dueSoonCents,24000);
  assert.deepEqual(r.buckets,{current:36000,'1-30':22000,'31-60':24000,'61-90':24000,'90+':12000});
  assert.equal(r.customers[0].outstandingCents,118000);assert.equal(r.customers[0].count,10);
});
test('customers group by identity rather than name, dates use UTC calendar days',()=>{
  const r=financeReceivables([invoice('a','2026-03-29'),invoice('b','2026-03-30',{contactId:'c2'})],'2026-03-30');
  assert.equal(r.customers.length,2);assert.equal(r.rows[0].daysOverdue,1);assert.equal(r.rows[1].daysOverdue,0);
  assert.throws(()=>financeReceivables([],'2026-02-30'),/INVALID_DATE/);
});
test('CSV quotes embedded delimiters/newlines, neutralizes formulas and filters by customer',()=>{
  const r=financeReceivables([invoice('a','2026-01-01',{customer:{name:'=SUM(1;2)\n"name"'}}),invoice('b','2026-01-01',{contactId:'c2'})],'2026-11-15');
  const csv=receivablesCsv(r,'c1');assert.ok(csv.includes("'=SUM"));assert.ok(csv.includes('""name""'));assert.ok(csv.includes('120.00'));assert.ok(!csv.includes('RE-b'));
  assert.equal(receivablesCsv(r,'none').split('\r\n').length,1);
});
