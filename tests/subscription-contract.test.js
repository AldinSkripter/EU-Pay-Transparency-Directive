import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {plans,contractVersion} from '../shared/plans.js';
import {billingRoutes} from '../server/billing.js';
import {MemoryStore} from '../server/store.js';
import {createContract,anniversary,cancellationDate,contractKey} from '../server/subscription-contract.js';

test('minimum term uses calendar anniversaries, then the billing period, for both payment frequencies',()=>{
  assert.equal(anniversary('2024-02-29T15:30:00Z').toISOString(),'2025-02-28T15:30:00.000Z');
  for(const interval of ['monthly','annual']){
    const c={...createContract(plans[1],interval,'user'),startedAt:'2026-11-11T12:00:00Z'};
    assert.equal(c.minimumNetTotal,2988);assert.equal(c.netCharge,interval==='monthly'?249:2988);
    assert.equal(cancellationDate(c,null,Date.parse('2026-12-01')).toISOString(),'2027-11-11T12:00:00.000Z');
    const sub={start_date:Date.parse(c.startedAt)/1000,current_period_end:Date.parse('2028-01-11T12:00:00Z')/1000};
    assert.equal(cancellationDate(c,sub,Date.parse('2027-12-20')).toISOString(),'2028-01-11T12:00:00.000Z');
    assert.throws(()=>cancellationDate(c,{start_date:sub.start_date}),/DATES_UNAVAILABLE/);
  }
});

async function fixture(t,stripe=false){
  const store=new MemoryStore(),app=express();app.use(express.json());
  app.use((req,res,next)=>{req.session={company:{id:'company'},user:{id:'user',email:'buyer@example.com'}};next();});
  const calls=[];
  billingRoutes(app,{store,demo:true,getBilling:async()=>stripe?{mode:'stripe',secretKey:'sk_test_Test',webhookSecret:'whsec_Test',origin:'https://equitensa.de',prices:{prepare_monthly:'price_Test'}}:{mode:'sandbox'},stripeFetch:async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/prices/'))return Response.json({id:'price_Test',active:true,currency:'eur',unit_amount:9900,type:'recurring',recurring:{interval:'month',interval_count:1,usage_type:'licensed'},billing_scheme:'per_unit',tax_behavior:'exclusive',livemode:false});
    const start=Date.parse('2026-11-11T12:00:00Z')/1000;
    if(options.method==='POST')return Response.json({cancel_at:Number(options.body.get('cancel_at'))});
    return Response.json({id:'sub_Test',start_date:start,current_period_end:start+30*86400});
  }});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const request=(path,body)=>fetch(`http://127.0.0.1:${server.address().port}/api/billing${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {store,request,calls};
}

test('checkout records consent and frozen prices, cancellation preserves access until the minimum term ends',async t=>{
  const {store,request}=await fixture(t),body={plan:'growth',interval:'monthly',accepted:true};
  assert.equal((await request('/checkout',body)).status,400);
  const response=await request('/checkout',{...body,contractVersion});assert.equal(response.status,201);
  const {order}=await response.json();assert.equal((await request('/sandbox-confirm',{orderId:order.id})).status,200);
  let view=await (await request('')).json();assert.equal(view.order.contract.minimumNetTotal,2988);assert.equal(view.order.contract.employeeLimit,999);
  const started=view.order.contract.startedAt;
  await request('/sandbox-confirm',{orderId:order.id});view=await (await request('')).json();assert.equal(view.order.contract.startedAt,started);
  const preview=await (await request('/cancellation')).json();assert.equal(preview.cancelAt,anniversary(started).toISOString());assert.equal(preview.scheduled,false);
  assert.equal((await request('/cancellation',{confirm:true,orderId:'other'})).status,400);
  assert.equal((await request('/cancellation',{confirm:true,orderId:order.id})).status,200);
  assert.equal((await (await request('')).json()).order.status,'sandbox_active');
  assert.equal((await (await request('/cancellation')).json()).scheduled,true);
  const c=await store.companyDocument('company',contractKey(order.id));await store.saveCompanyDocument('company',contractKey(order.id),{...c,cancelAt:'2000-01-01T00:00:00Z'});
  assert.equal((await store.activeOrder('company')).status,'cancelled');
});

test('Stripe checkout refuses stale lower prices before creating an order',async t=>{
  const {request,store,calls}=await fixture(t,true);
  assert.equal((await request('/checkout',{plan:'prepare',interval:'monthly',accepted:true,contractVersion})).status,503);
  assert.equal(store.orders.size,0);assert.equal(calls.length,1);
});

test('Stripe cancellation schedules the anniversary instead of stopping the next monthly payment',async t=>{
  const {request,store,calls}=await fixture(t,true),order={id:'test-order',company_id:'company',mode:'stripe',plan:'prepare',interval:'monthly',status:'active',provider_subscription:'sub_Test'};
  await store.createOrder(order);await store.saveCompanyDocument('company',contractKey(order.id),createContract(plans[0],'monthly','user'));
  const r=await request('/cancellation',{confirm:true,orderId:order.id});assert.equal(r.status,200);
  assert.equal((await r.json()).cancelAt,'2027-11-11T12:00:00.000Z');
  assert.equal(calls[1].options.body.get('cancel_at'),String(Date.parse('2027-11-11T12:00:00Z')/1000));
  assert.equal((await store.activeOrder('company')).status,'active');
});
