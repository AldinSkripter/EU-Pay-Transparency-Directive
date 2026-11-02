import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { verifyStripeEvent, subscriptionPlan } from '../server/billing.js';
import { readiness, validateWorkflow } from '../server/workflow.js';
import { reportingPlan } from '../server/regulatory.js';

test('self service purchase, mapped import, approvals, audience exports and snapshot invalidation',async t=> {
  const store=new MemoryStore(),server=createApp({store,demo:true,secret:'b'.repeat(64)}).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const request=(path,cookie,body)=>fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const register=async(email)=>{const r=await request('/auth/register',null,{companyName:'Test GmbH',email,password:'twelve-characters!',country:'AT'});assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0];};
  const a=await register('a@selfservice.example'),b=await register('b@selfservice.example');
  const headers='Id,Sex,Title,Category,Annual,Bonus,Hours,Weekly';
  const csv=headers+'\n'+Array.from({length:12},(_,i)=>`${i+1},${i<6?'M':'F'},Engineer,Equal work,${i<6?60000:54000},3000,2080,40`).join('\n');
  const mapping={internal_id:'Id',gender:'Sex',job_title:'Title',worker_category:'Category',base_annual:'Annual',bonuses_annual:'Bonus',paid_hours_annual:'Hours',hours_per_week:'Weekly'};
  const preview=await (await request('/import/preview',a,{csv})).json();assert.equal(preview.count,12);assert.equal(preview.rows.length,12);
  assert.equal((await request('/import',a,{csv,mapping,year:2026})).status,201);
  const analysis=await (await request('/analysis',a)).json();assert.equal(analysis.analysis.review_count,1);
  assert.equal((await request('/reports/pdf?prepared=true',a)).status,402);
  const checkout=await request('/billing/checkout',a,{plan:'prepare',interval:'annual',accepted:true});assert.equal(checkout.status,201);
  const order=(await checkout.json()).order;
  assert.equal((await request('/billing/sandbox-confirm',b,{orderId:order.id})).status,400);
  assert.equal((await request('/billing/sandbox-confirm',a,{orderId:order.id})).status,200);
  assert.equal((await request('/billing/sandbox-confirm',a,{orderId:order.id})).status,200);
  assert.equal((await request('/reports/pdf?prepared=true',a)).status,409);
  const workflow={snapshotId:analysis.snapshot.id,profile:{legalName:'Test GmbH',headcount:180,payrollComplete:true},classification:{'Equal work':{skills:'Degree and competence evidence',effort:'Mental effort evidence',responsibility:'System risk',conditions:'Same work environment'}},reviews:{'Equal work':{explanation:'Differences reviewed; pay correction needed',action:'Salary adjustment',owner:'HR lead',due:'2027-06-01',justified:false}},approval:{manager:'Managing director',representatives:'Methodology discussed with works council 2027-01-10',confirmed:true,consulted:true}};
  const saved=await request('/workflow',a,{workflow,year:2026});assert.equal(saved.status,200);assert.equal((await saved.json()).readiness.ready,true);
  const route=await (await request('/reporting-plan?year=2026&audience=authority',a)).json();
  assert.equal(route.euMinimum.dueForReferenceYear,'2027-06-07');assert.equal(route.recipient.indicators,'a-g');
  assert.equal(route.national.authority,null);assert.equal(route.delivery.officialSubmissionAvailable,false);
  assert.deepEqual((await (await request('/workflow',b)).json()).workflow,{});
  const internal=await (await request('/reports/txt?prepared=true&audience=internal',a)).text();assert.match(internal,/Salary adjustment/);
  const publicReport=await (await request('/reports/txt?prepared=true&audience=public',a)).text();assert.doesNotMatch(publicReport,/Equal work|Salary adjustment|Managing director/);
  const authority=await (await request('/reports/xml?prepared=true&audience=authority',a)).text();assert.match(authority,/<Category name="Equal work"/);assert.doesNotMatch(authority,/Salary adjustment/);
  const draft=await request('/reports/xml?audience=internal',a);
  assert.equal(draft.headers.get('x-report-status'),'DRAFT_UNVERIFIED');
  assert.match(await draft.text(),/status="DRAFT_UNVERIFIED"/);
  const storedSnapshot=await store.latestSnapshot((await (await request('/me',a)).json()).company.id,2026);
  assert.equal(storedSnapshot.prepared,undefined);assert.equal(storedSnapshot.audience,undefined);assert.equal(storedSnapshot.workflow,undefined);
  const changed=structuredClone(workflow);changed.classification['Equal work'].skills='Changed criteria';
  const modified=await (await request('/workflow',a,{workflow:changed,year:2026})).json();assert.equal(modified.workflow.approval.confirmed,false);assert.equal(modified.readiness.ready,false);
  assert.equal((await request('/reports/txt?audience=unknown',a)).status,400);
  assert.equal((await request('/import',a,{csv:csv.replaceAll('60000','61000'),mapping,year:2026})).status,201);
  assert.equal((await request('/reports/pdf?prepared=true',a)).status,409);
  assert.equal((await (await request('/reporting-plan?year=2026',a)).json()).headcountConfirmed,false);
  assert.equal((await request('/workflow',a,{workflow,year:2026})).status,409);
  assert.equal((await request('/billing/checkout',a,{plan:'prepare',interval:'annual',accepted:false})).status,400);
});

test('reporting plan ties reference year, headcount and recipient to verified EU rules',()=> {
  for(const country of ['DE','AT','SI']){
    const plan=reportingPlan(country,2026,180,'authority');
    assert.equal(plan.euMinimum.dueForReferenceYear,'2027-06-07');assert.equal(plan.national.status,'NATIONAL_CHANNEL_UNVERIFIED');assert.equal(plan.delivery.receipt,null);
  }
  assert.equal(reportingPlan('DE',2027,180).euMinimum.dueForReferenceYear,null);
  assert.equal(reportingPlan('DE',2029,180).euMinimum.dueForReferenceYear,'2030-06-07');
  assert.equal(reportingPlan('SI',2030,120,'workers').euMinimum.dueForReferenceYear,'2031-06-07');
  assert.equal(reportingPlan('AT',2027,260).euMinimum.dueForReferenceYear,'2028-06-07');
  assert.equal(reportingPlan('AT',2026,null).headcountConfirmed,false);
  assert.equal(reportingPlan('AT',2026,99).euMinimum.firstDue,null);
  assert.equal(reportingPlan('AT',2026,180,'public').recipient.indicators,'a-f');
});

test('subscription plan changes follow configured prices and reject unknown entitlements',async()=> {
  const prices={prepare_monthly:'price_prepare',growth_annual:'price_growth'};
  const subscription={items:{data:[{quantity:1,price:{id:'price_growth'}}]}};
  assert.deepEqual(subscriptionPlan(subscription,prices),{plan:'growth',interval:'annual'});
  assert.equal(subscriptionPlan(subscription,{}),null);
  assert.equal(subscriptionPlan({items:{data:[{quantity:2,price:{id:'price_growth'}}]}},prices),null);
  const store=new MemoryStore();await store.createOrder({id:'order',company_id:'a',plan:'prepare',interval:'monthly',status:'pending'});await store.linkOrder('order','cs_1');
  await store.applyBillingEvent('paid',{session:'cs_1',subscription:'sub_1',status:'active',created:10});
  await store.applyBillingEvent('upgrade',{subscription:'sub_1',status:'active',created:20,...subscriptionPlan(subscription,prices)});
  assert.equal((await store.activeOrder('a')).plan,'growth');assert.equal((await store.activeOrder('a')).interval,'annual');
  await store.applyBillingEvent('stale',{subscription:'sub_1',status:'active',plan:'prepare',interval:'monthly',created:15});
  assert.equal((await store.activeOrder('a')).plan,'growth');
  await store.applyBillingEvent('unknown',{subscription:'sub_1',status:'price_unverified',created:30});
  assert.equal((await store.activeOrder('a')).status,'price_unverified');
});

test('Stripe signature, replay window, idempotency and out-of-order lifecycle events',async()=> {
  const raw=Buffer.from(JSON.stringify({id:'evt_checkout',created:100,type:'checkout.session.completed',data:{object:{id:'cs_1'}}}));
  const now=Date.now(),timestamp=Math.floor(now/1000),secret='test-webhook-secret';
  const digest=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest('hex');
  const signature=`t=${timestamp},v1=${digest}`;
  assert.equal(verifyStripeEvent(raw,signature,secret,now).id,'evt_checkout');
  assert.throws(()=>verifyStripeEvent(Buffer.from('modified'),signature,secret,now));
  assert.throws(()=>verifyStripeEvent(raw,signature,secret,now+301000));
  const store=new MemoryStore();await store.createOrder({id:'order',company_id:'a',plan:'prepare',mode:'stripe',status:'pending'});await store.linkOrder('order','cs_1');
  assert.equal(await store.applyBillingEvent('evt_paid',{session:'cs_1',subscription:'sub_1',status:'active',created:100}),true);
  await store.applyBillingEvent('evt_cancel',{subscription:'sub_1',status:'cancelled',created:300});
  await store.applyBillingEvent('evt_old',{subscription:'sub_1',status:'active',created:200});
  await store.applyBillingEvent('evt_paid',{session:'cs_1',status:'active',created:400});
  assert.equal((await store.activeOrder('a')).status,'cancelled');assert.equal(await store.activeOrder('b'),null);
});

test('joint assessment combines the gap, justification, actual submission and six months',()=> {
  const analysis={count:180,groups:[{category:'A',review_required:true}]},snapshot={id:'s'};
  const w={snapshotId:'s',profile:{},classification:{},reviews:{A:{justified:false,remedied:false}},approval:{},reportingDate:'2020-01-01'};
  assert.equal(readiness(w,analysis,snapshot).assessments[0].jointAssessmentRequired,true);
  w.reviews.A.justified=true;assert.equal(readiness(w,analysis,snapshot).assessments[0].jointAssessmentRequired,false);
  w.reviews.A.justified=false;w.reviews.A.remedied=true;assert.equal(readiness(w,analysis,snapshot).assessments[0].jointAssessmentRequired,false);
  w.reviews.A.remedied=false;w.reportingDate='';assert.equal(readiness(w,analysis,snapshot).assessments[0].jointAssessmentRequired,false);
  w.reportingDate='2020-01-01';w.profile.headcount=99;assert.equal(readiness(w,analysis,snapshot).assessments[0].jointAssessmentRequired,false);
  w.profile.headcount=120;assert.equal(readiness(w,analysis,snapshot).assessments[0].jointAssessmentRequired,false);
  w.profile.headcount=180;w.snapshotId='old';assert.equal(readiness(w,analysis,snapshot).assessments[0].jointAssessmentRequired,false);
  w.snapshotId='s';w.reportingDate='2020-08-31';assert.equal(readiness(w,analysis,snapshot).assessments[0].deadline,'2021-02-28');
  const invalid=validateWorkflow({...w,reportingDate:'2026-02-30',reviews:{A:{due:'2026-02-30'}}},{...snapshot,rows:[{worker_category:'A'}]});
  assert.equal(invalid.reportingDate,'');assert.equal(invalid.reviews.A.due,'');
});
