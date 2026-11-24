import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { randomBytes,createHmac } from 'node:crypto';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { verifyAll } from './helpers.js';
import { MemoryControlStore,FileControlStore,runtimeControl } from '../server/control-store.js';
import { addOwner,totp,completeOwnerSetup } from '../server/owner-auth.js';
import { hashToken } from '../server/auth.js';
import { defaultReturnOrigins,priceKeys } from '../server/payment-config.js';
import { plans } from '../server/billing.js';

const password='a-strong-owner-password!';
const settings=()=>({mode:'stripe_test',secretKey:'sk_test_Secret123',webhookSecret:'whsec_Signing123',prices:Object.fromEntries(priceKeys.map((k,i)=>[k,`price_Test${i}`])),returnOrigins:defaultReturnOrigins,revision:0,currentPassword:password});
async function fixture(t,options={}) {
  const store=new MemoryStore(),control=new MemoryControlStore();
  const server=createApp({store,control,demo:true,secret:'b'.repeat(64),...options}).listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  t.after(()=>{server.closeAllConnections();server.close();});
  const request=(path,cookie,body,extra={})=>fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const login=async(email='owner@equitensa.example',pw=password,code)=>{const r=await request('/admin/auth/login',null,{email,password:pw,code});assert.equal(r.status,200,await r.clone().text());return r.headers.get('set-cookie').split(';')[0];};
  const marketRequest=(host,path,cookie,body)=>new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:'/api'+path,method:'POST',headers:{Host:host,Origin:`http://${host}`,Cookie:cookie,'Content-Type':'application/json'}},response=>{
      let raw='';response.on('data',chunk=>raw+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(raw)}));
    });req.on('error',reject);req.end(JSON.stringify(body));
  });
  return {store,control,request,login,marketRequest};
}
test('owner bootstrap is one-time, tenant cookies cannot become owner sessions, and secrets never leave masked views',async t=>{
  const {store,control,request,login}=await fixture(t),token=randomBytes(32).toString('hex');
  await control.mutate(s=>{s.setup={tokenHash:hashToken(token),expiresAt:Date.now()+100000};});
  const customer=await request('/auth/register',null,{email:'customer@example.com',password,companyName:'Customer GmbH',country:'DE',role:'owner'});verifyAll(store);
  const tenantCookie=customer.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/admin/overview',tenantCookie)).status,401);
  assert.equal((await request('/admin/payments',null)).status,401);
  assert.equal((await request('/admin/auth/setup',null,{token:'0'.repeat(64),email:'owner@equitensa.example',password})).status,400);
  const setup=await request('/admin/auth/setup',null,{token,email:'owner@equitensa.example',password});assert.equal(setup.status,201);
  assert.match(setup.headers.get('set-cookie'),/HttpOnly/);assert.match(setup.headers.get('set-cookie'),/Path=\/api\/admin/);assert.match(setup.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal((await request('/admin/auth/setup',null,{token,email:'other@example.com',password})).status,400);
  const cookie=await login();
  assert.equal((await request('/admin/overview',cookie)).status,200);
  assert.equal((await request('/me',cookie)).status,401);
  assert.equal((await request('/admin/owners',cookie,{email:'auditor@example.com',password,role:'auditor',currentPassword:password},{Origin:'https://evil.example'})).status,403);
  const auditor=await addOwner(control,'auditor@example.com',password,'auditor');const auditorCookie=await login(auditor.email);
  assert.equal((await request('/admin/overview',auditorCookie)).status,200);
  assert.equal((await request('/admin/payments',auditorCookie,settings())).status,403);
  const company=[...store.companies.values()][0];
  assert.equal((await request(`/admin/companies/${company.id}/access`,cookie,{suspended:true,reason:'Support access review',currentPassword:'wrong'})).status,403);
  assert.equal((await request(`/admin/companies/${company.id}/access`,cookie,{suspended:true,reason:'Support access review',currentPassword:password})).status,200);
  assert.equal((await request('/analysis',tenantCookie)).status,403);
  assert.equal((await request(`/admin/companies/${company.id}/access`,cookie,{suspended:false,reason:'Resolved',currentPassword:password})).status,200);
  assert.equal((await request('/analysis',tenantCookie)).status,200);
  const owner=(await control.read()).owners.find(o=>o.role==='owner');
  assert.equal((await request(`/admin/owners/${owner.id}/access`,cookie,{enabled:false,currentPassword:password})).status,409);
  assert.equal((await request(`/admin/owners/${auditor.id}/access`,cookie,{enabled:false,currentPassword:password})).status,200);
  assert.equal((await request('/admin/overview',auditorCookie)).status,401);
  const data=await (await request('/admin/companies?q=Customer',cookie)).json();assert.equal(data.total,1);assert.equal(data.companies[0].name,'Customer GmbH');
  const owners=await (await request('/admin/owners',cookie)).text();assert.doesNotMatch(owners,/password_hash|mfaSecret|backupHashes/);
});
test('verified admin settings immediately drive checkout, signed activation, same-market returns and safe key rotation',async t=>{
  let mismatch=false,checkoutBody;const config=settings();
  const stripeFetch=async(url,options)=>{
    assert.match(url,/^https:\/\/api\.stripe\.com\/v1\//);
    if(url.endsWith('/account'))return Response.json({id:'acct_Test',business_profile:{name:'Equitensa Test'},charges_enabled:true});
    if(url.includes('/prices/')){const key=priceKeys.find(k=>url.endsWith(config.prices[k])),[id,period]=key.split('_'),plan=plans.find(p=>p.id===id);return Response.json({id:config.prices[key],active:true,currency:'eur',unit_amount:plan[period]*100+(mismatch?1:0),type:'recurring',recurring:{interval:period==='annual'?'year':'month',interval_count:1,usage_type:'licensed'},billing_scheme:'per_unit',tax_behavior:'exclusive',livemode:false});}
    if(url.endsWith('/checkout/sessions')){checkoutBody=options.body;return Response.json({id:'cs_Test',url:'https://checkout.stripe.com/c/pay/test'});}
    if(url.includes('/subscriptions/'))return Response.json({customer:'cus_Test'});
    if(url.endsWith('/billing_portal/configurations'))return Response.json({id:'bpc_Test'});
    if(url.endsWith('/billing_portal/sessions'))return Response.json({url:'https://billing.stripe.com/p/session/test'});
    throw new Error('Unexpected Stripe operation');
  };
  const {store,control,request,login,marketRequest}=await fixture(t,{stripeFetch});await addOwner(control,'owner@equitensa.example',password);const owner=await login();
  assert.equal((await request('/admin/payments',owner,{...config,returnOrigins:{...defaultReturnOrigins,SI:'https://evil.example'}})).status,400);
  mismatch=true;assert.equal((await request('/admin/payments',owner,config)).status,400);assert.equal((await control.read()).settings,null);mismatch=false;
  assert.equal((await request('/admin/payments/verify',owner,config)).status,200);assert.equal((await control.read()).settings,null);
  const saved=await request('/admin/payments',owner,config);assert.equal(saved.status,200,await saved.clone().text());const view=await saved.json();assert.equal(view.revision,1);assert.equal(view.secretKeyConfigured,true);assert.equal(view.lastWebhook,null);
  assert.doesNotMatch(JSON.stringify(view),/sk_test_|whsec_|Secret123|Signing123/);
  assert.equal((await request('/admin/payments',owner,config)).status,409);
  const registered=await request('/auth/register',null,{email:'buyer@example.com',password,companyName:'Buyer GmbH',country:'AT'});verifyAll(store);const customer=registered.headers.get('set-cookie').split(';')[0];
  const checkout=await marketRequest('equitensa.at','/billing/checkout',customer,{plan:'prepare',interval:'annual',accepted:true,contractVersion:"pay-2026-11-11-12m"});assert.equal(checkout.status,201);
  assert.equal(checkoutBody.get('success_url'),'https://equitensa.at/?checkout=success');
  assert.equal(checkoutBody.get('line_items[0][price]'),config.prices.prepare_annual);
  const order=[...store.orders.values()][0];assert.equal(order.status,'pending');assert.equal(order.mode,'stripe');assert.equal(order.stripe_environment,'test');
  const event={id:'evt_Activated',livemode:false,type:'checkout.session.completed',created:Math.floor(Date.now()/1000),data:{object:{id:'cs_Test',mode:'subscription',payment_status:'paid',subscription:'sub_Test'}}};
  const sendEvent=async(event,secret=config.webhookSecret)=>{const raw=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000),signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');return request('/billing/webhook',null,event,{'stripe-signature':`t=${timestamp},v1=${signature}`});};
  assert.equal((await sendEvent(event,'whsec_Wrong')).status,400);assert.equal(order.status,'pending');
  assert.equal((await sendEvent(event)).status,200);assert.equal(order.status,'active');
  const billingView=await (await request('/billing',customer)).json();assert.equal(billingView.mode,'stripe');assert.equal(billingView.order.status,'active');assert.doesNotMatch(JSON.stringify(billingView),/sk_test_|whsec_/);
  assert.equal((await request('/billing/sandbox-confirm',customer,{orderId:order.id})).status,404);
  assert.equal((await request('/billing/portal',customer,{})).status,200);
  const rotated={...config,revision:1,secretKey:'',webhookSecret:'whsec_NewSigning',confirmRotation:true};assert.equal((await request('/admin/payments',owner,rotated)).status,200);
  const event2={...event,id:'evt_PreviousSecret'};assert.equal((await sendEvent(event2)).status,200);
  assert.equal((await request('/admin/payments',owner,{...rotated,revision:2,mode:'disabled',secretKey:'',webhookSecret:'',confirmRotation:true})).status,200);
  assert.equal((await sendEvent({...event,id:'evt_Disabled',type:'customer.subscription.deleted',data:{object:{id:'sub_Test'}}})).status,200);assert.equal(order.status,'cancelled');
  const serialized=await (await request('/admin/audit',owner)).text();assert.doesNotMatch(serialized,/sk_test_|whsec_|a-strong-owner-password/);
  await request('/admin/payments',owner,{...config,revision:3,confirmRotation:true});
  assert.equal((await request('/admin/payments/retire-tests',owner,{confirm:true,currentPassword:password})).status,200);assert.equal(order.status,'test_retired');
  assert.equal((await sendEvent({...event,id:'evt_LateTest'})).status,200);assert.equal(order.status,'test_retired');
});
test('MFA enrollment, one-use recovery, session revocation and password change protect the owner account',async t=>{
  const {control,request,login}=await fixture(t);await addOwner(control,'owner@equitensa.example',password);let cookie=await login();
  const start=await (await request('/admin/auth/mfa/start',cookie,{currentPassword:password})).json();assert.match(start.secret,/^[A-Z2-7]{32}$/);
  assert.equal((await request('/admin/auth/mfa/confirm',cookie,{code:'abcdef'})).status,400);
  const confirmation=await request('/admin/auth/mfa/confirm',cookie,{code:totp(start.secret)});assert.equal(confirmation.status,200);const backups=(await confirmation.json()).backupCodes;assert.equal(backups.length,8);
  assert.equal((await request('/admin/overview',cookie)).status,401);
  assert.equal((await request('/admin/auth/login',null,{email:'owner@equitensa.example',password})).status,401);
  cookie=await login('owner@equitensa.example',password,backups[0]);
  assert.equal((await request('/admin/auth/login',null,{email:'owner@equitensa.example',password,code:backups[0]})).status,401);
  assert.equal((await request('/admin/auth/password',cookie,{currentPassword:password,password:'the-new-owner-password!'})).status,200);
  assert.equal((await request('/admin/overview',cookie)).status,401);
  await login('owner@equitensa.example','the-new-owner-password!',backups[1]);
  const state=await control.read();assert.equal(state.owners[0].backupHashes.length,6);assert.doesNotMatch(JSON.stringify(state.audit),new RegExp(start.secret));
});
test('encrypted control file persists settings and serializes concurrent writers; corruption fails closed',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'equitensa-control-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'settings.enc'),key=randomBytes(32),store=new FileControlStore(path,key);
  await store.mutate(s=>{s.settings=settings();});
  await Promise.all(Array.from({length:8},()=>new FileControlStore(path,key).mutate(s=>{s.revision++;})));
  assert.equal((await new FileControlStore(path,key).read()).revision,8);
  const ciphertext=await readFile(path,'utf8');assert.doesNotMatch(ciphertext,/Secret123|Signing123|sk_test_|whsec_/);
  await assert.rejects(new FileControlStore(path,randomBytes(32)).read());
  await writeFile(path,ciphertext.slice(0,-1)+(ciphertext.endsWith('0')?'1':'0'));await assert.rejects(store.read());
  await assert.rejects(runtimeControl(new MemoryStore(),true,{}),/ADMIN_ENCRYPTION_KEY_REQUIRED/);
});
test('expired setup cannot bootstrap and production sessions require MFA before platform access',async t=>{
  const control=new MemoryControlStore(),token=randomBytes(32).toString('hex');await control.mutate(s=>{s.setup={tokenHash:hashToken(token),expiresAt:0};});
  await assert.rejects(completeOwnerSetup(control,token,'owner@example.com',password),/INVALID_OWNER_SETUP/);
  const store=new MemoryStore();await addOwner(control,'owner@example.com',password);
  const server=createApp({store,control,secure:true,secret:'b'.repeat(64),origins:['https://equitensa.de']}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(origin+'/api/admin/auth/login',{method:'POST',headers:{Origin:'https://equitensa.de','Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password})});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Secure/);
  const cookie=response.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(origin+'/api/admin/overview',{headers:{Cookie:cookie}})).status,403);
  const me=await (await fetch(origin+'/api/admin/me',{headers:{Cookie:cookie}})).json();assert.equal(me.mfaRequired,true);
});
