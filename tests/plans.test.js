import test from 'node:test';
import assert from 'node:assert/strict';
import {plans,recommendPlan,planRange,annualSavingsPercent,obligation,upcomingDeadlines} from '../shared/plans.js';
import {reportingSchedule} from '../server/pay.js';
import {reportingPlan} from '../server/regulatory.js';

test('package prices: new prices use the same annual total for monthly and annual billing',()=>{
  assert.deepEqual(plans.map(p=>[p.id,p.monthly,p.annual,p.limit]),[['prepare',119,1428,249],['growth',249,2988,999],['scale',499,5988,2500]]);
  for(const plan of plans){const saving=annualSavingsPercent(plan);assert.equal(saving,0);assert.equal(plan.annual,plan.monthly*12);}
  assert.ok(plans.every((p,i)=>!i||(p.monthly>plans[i-1].monthly&&p.annual>plans[i-1].annual&&p.limit>plans[i-1].limit)));
});

test('size recommendation picks the smallest package that covers the headcount',()=>{
  const pick=n=>recommendPlan(n)?.id??null;
  assert.deepEqual([1,99,249].map(pick),['prepare','prepare','prepare']);
  assert.deepEqual([250,999].map(pick),['growth','growth']);
  assert.deepEqual([1000,2500].map(pick),['scale','scale']);
  assert.deepEqual([2501,0,-5,1.5,NaN].map(pick),[null,null,null,null,null]);
  assert.deepEqual(plans.map(p=>planRange(p)),[{from:1,to:249},{from:250,to:999},{from:1000,to:2500}]);
});

test('Directive 2023/970 Art. 9(2)-(5) thresholds and first deadlines',()=>{
  assert.deepEqual(obligation(250),{band:'250+',reporting:true,frequencyYears:1,firstDue:'2027-06-07',referenceYear:2026});
  assert.deepEqual(obligation(249),{band:'150-249',reporting:true,frequencyYears:3,firstDue:'2027-06-07',referenceYear:2026});
  assert.equal(obligation(150).band,'150-249');
  assert.deepEqual(obligation(149),{band:'100-149',reporting:true,frequencyYears:3,firstDue:'2031-06-07',referenceYear:2030});
  assert.equal(obligation(100).band,'100-149');
  assert.deepEqual(obligation(99),{band:'<100',reporting:false,frequencyYears:null,firstDue:null,referenceYear:null});
  assert.equal(obligation(0),null);assert.equal(obligation(12.5),null);
});

test('upcoming deadlines follow the reporting rhythm',()=>{
  assert.deepEqual(upcomingDeadlines(300,3),[{due:'2027-06-07',referenceYear:2026},{due:'2028-06-07',referenceYear:2027},{due:'2029-06-07',referenceYear:2028}]);
  assert.deepEqual(upcomingDeadlines(200,3).map(d=>d.due),['2027-06-07','2030-06-07','2033-06-07']);
  assert.deepEqual(upcomingDeadlines(120,2),[{due:'2031-06-07',referenceYear:2030},{due:'2034-06-07',referenceYear:2033}]);
  assert.deepEqual(upcomingDeadlines(50),[]);
});

test('server reporting schedule and plan use the same rules as the pricing page',()=>{
  assert.deepEqual(reportingSchedule(180),{first_due:'2027-06-07',frequency_years:3,reference_year:2026});
  assert.deepEqual(reportingSchedule(60),{first_due:null,frequency_years:null,reference_year:null});
  assert.equal(reportingPlan('SI',2026,300,'authority').euMinimum.dueForReferenceYear,'2027-06-07');
  assert.equal(reportingPlan('SI',2027,300,'authority').euMinimum.dueForReferenceYear,'2028-06-07');
  assert.equal(reportingPlan('DE',2027,180,'authority').euMinimum.dueForReferenceYear,null,'150-249 report every third year');
  assert.equal(reportingPlan('AT',2029,180,'authority').euMinimum.dueForReferenceYear,'2030-06-07');
  assert.equal(reportingPlan('AT',2030,120,'authority').euMinimum.dueForReferenceYear,'2031-06-07');
  assert.equal(reportingPlan('AT',2026,80,'authority').euMinimum.firstDue,null);
});
