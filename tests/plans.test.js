import test from 'node:test';
import assert from 'node:assert/strict';
import {plans,recommendPlan,planRange,annualSavingsPercent,obligation,upcomingDeadlines} from '../shared/plans.js';
import {reportingSchedule} from '../server/pay.js';
import {reportingPlan} from '../server/regulatory.js';

test('package prices: cheapest annual is 899 and every annual price beats twelve months by about a quarter',()=>{
  assert.deepEqual(plans.map(p=>[p.id,p.monthly,p.annual,p.limit]),[['prepare',99,899,250],['growth',199,1799,1000],['scale',399,3599,2500]]);
  for(const plan of plans){const saving=annualSavingsPercent(plan);assert.ok(saving>=24&&saving<=25,`${plan.id} saves ${saving}%`);assert.ok(plan.annual<plan.monthly*12);}
  assert.ok(plans.every((p,i)=>!i||(p.monthly>plans[i-1].monthly&&p.annual>plans[i-1].annual&&p.limit>plans[i-1].limit)));
});

test('size recommendation picks the smallest package that covers the headcount',()=>{
  const pick=n=>recommendPlan(n)?.id??null;
  assert.deepEqual([1,99,250].map(pick),['prepare','prepare','prepare']);
  assert.deepEqual([251,1000].map(pick),['growth','growth']);
  assert.deepEqual([1001,2500].map(pick),['scale','scale']);
  assert.deepEqual([2501,0,-5,1.5,NaN].map(pick),[null,null,null,null,null]);
  assert.deepEqual(plans.map(p=>planRange(p)),[{from:1,to:250},{from:251,to:1000},{from:1001,to:2500}]);
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
