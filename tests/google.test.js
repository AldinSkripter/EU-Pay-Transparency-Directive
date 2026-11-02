import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {MemoryControlStore} from '../server/control-store.js';
import {hashToken,hashPassword} from '../server/auth.js';
import {addOwner} from '../server/owner-auth.js';
import {googleDraft,defaultGoogle} from '../server/google-config.js';

const keys=await generateKeyPair('RS256'),other=await generateKeyPair('RS256');
const jwk={...await exportJWK(keys.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
const clientId='test-client.apps.googleusercontent.com',password='a-strong-account-password!';
async function fixture(t,claims={},wrongKey=false){
  const store=new MemoryStore(),control=new MemoryControlStore();let currentFlow,exchanges=0;
  const googleFetch=async(url,options)=>{
    if(String(url).includes('/certs'))return new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'content-type':'application/json'}});
    assert.equal(String(url),'https://oauth2.googleapis.com/token');exchanges++;
    const params=options.body;assert.equal(params.get('client_secret'),'test-secret');assert.equal(params.get('code_verifier'),currentFlow.verifier);assert.equal(params.get('redirect_uri'),currentFlow.redirectUri);
    const token=await new SignJWT({nonce:currentFlow.nonce,email:'person@example.com',email_verified:true,...claims}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(claims.iss||'https://accounts.google.com').setSubject(claims.sub||'google-person-123').setAudience(claims.aud||clientId).setIssuedAt().setExpirationTime(claims.exp||'5m').sign(wrongKey?other.privateKey:keys.privateKey);
    return new Response(JSON.stringify({id_token:token}),{status:200});
  };
  const server=createApp({store,control,demo:true,secret:'b'.repeat(64),googleFetch}).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  await control.mutate(s=>{s.google={enabled:true,clientId,clientSecret:'test-secret',redirectUris:[`${origin}/api/auth/google/callback`],revision:1};});
  const request=(path,body,cookie)=>fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const start=async(body={intent:'signup',plan:'growth',interval:'monthly',country:'SI'})=>{
    const r=await request('/auth/google/start',body);assert.equal(r.status,200,await r.clone().text());
    const url=new URL((await r.json()).url),state=url.searchParams.get('state');currentFlow=store.authFlows.get(hashToken(state)).document;
    assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('scope'),'openid email profile');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('code_challenge'));assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);
    return {state,cookie:r.headers.get('set-cookie').split(';')[0]};
  };
  const callback=async({state,cookie})=>request(`/auth/google/callback?state=${state}&code=test-code`,undefined,cookie);
  return {store,control,request,start,callback,exchanges:()=>exchanges};
}
test('Google signup verifies identity, collects tenant details, preserves package and has no owner privileges',async t=>{
  const f=await fixture(t);assert.equal((await (await f.request('/context')).json()).googleEnabled,true);
  const auth=await f.start(),callback=await f.callback(auth);assert.equal(callback.headers.get('location'),'/?google=complete');
  const cookie=callback.headers.get('set-cookie').split(';')[0],pending=await (await f.request('/auth/google/pending',undefined,cookie)).json();
  assert.equal(pending.existingAccount,false);assert.equal(pending.plan,'growth');assert.equal(pending.country,'SI');assert.equal(f.store.companies.size,0);
  assert.equal((await f.request('/auth/google/complete',{companyName:''},cookie)).status,400);
  const complete=await f.request('/auth/google/complete',{companyName:'New SI Company',country:'SI',role:'owner',email:'attacker@example.com'},cookie);
  assert.equal(complete.status,200,await complete.clone().text());assert.match(complete.headers.get('set-cookie'),/SameSite=Strict/);
  const session=complete.headers.get('set-cookie').split(';')[0];const me=await (await f.request('/me',undefined,session)).json();
  assert.equal(me.company.country,'SI');assert.equal(me.user.email,'person@example.com');assert.equal(me.user.role,'hr_manager');assert.equal(f.store.companies.size,1);
  assert.equal((await f.request('/admin/authentication',undefined,session)).status,401);
  assert.equal((await f.request('/auth/google/complete',{companyName:'Replay',country:'DE'},cookie)).status,409);
  assert.equal((await f.request('/auth/login',{email:'person@example.com',password:''})).status,401);
  const login=await f.callback(await f.start({intent:'login'}));assert.match(login.headers.get('location'),/google=success&intent=login/);assert.match(login.headers.get('set-cookie'),/equitensa_session=/);assert.equal(f.store.companies.size,1);
});
test('matching Google email requires explicit password proof and links only the existing tenant',async t=>{
  const f=await fixture(t);await f.store.createAccount({id:'company-old',name:'Existing',country:'AT'},{id:'user-old',company_id:'company-old',email:'person@example.com',password_hash:await hashPassword(password),role:'hr_manager'});
  const cb=await f.callback(await f.start()),cookie=cb.headers.get('set-cookie').split(';')[0];assert.equal((await (await f.request('/auth/google/pending',undefined,cookie)).json()).existingAccount,true);
  assert.equal((await f.request('/auth/google/complete',{companyName:'Fake',country:'DE'},cookie)).status,401);assert.equal((await f.request('/auth/google/complete',{link:true,password:'wrong'},cookie)).status,401);
  const linked=await f.request('/auth/google/complete',{link:true,password},cookie);assert.equal(linked.status,200);
  const me=await (await f.request('/me',undefined,linked.headers.get('set-cookie').split(';')[0])).json();assert.equal(me.company.id,'company-old');assert.equal(f.store.companies.size,1);assert.equal((await f.store.findUser('person@example.com')).google_sub,'google-person-123');
});
test('OAuth state is browser bound, single use, short lived and invalidated by config changes',async t=>{
  const f=await fixture(t),auth=await f.start();
  assert.match((await f.callback({...auth,cookie:''})).headers.get('location'),/GOOGLE_FLOW_EXPIRED/);assert.equal(f.exchanges(),0);
  assert.equal((await f.callback(auth)).headers.get('location'),'/?google=complete');assert.match((await f.callback(auth)).headers.get('location'),/GOOGLE_FLOW_EXPIRED/);assert.equal(f.exchanges(),1);
  const expired=await f.start();f.store.authFlows.get(hashToken(expired.state)).expiresAt=0;assert.match((await f.callback(expired)).headers.get('location'),/GOOGLE_FLOW_EXPIRED/);
  const changed=await f.start();await f.control.mutate(s=>s.google.revision++);assert.match((await f.callback(changed)).headers.get('location'),/GOOGLE_FLOW_EXPIRED/);
});
for(const [name,claims,wrong] of [['bad signature',{},true],['wrong audience',{aud:'other-client'},false],['wrong issuer',{iss:'https://evil.example'},false],['wrong nonce',{nonce:'wrong'},false],['unverified email',{email_verified:false},false],['expired token',{exp:1},false],['wrong authorized party',{azp:'other-client'},false]])test(`Google rejects ${name}`,async t=>{
  const f=await fixture(t,claims,wrong);assert.match((await f.callback(await f.start())).headers.get('location'),/GOOGLE_INVALID_IDENTITY/);assert.equal(f.store.users.size,0);
});
test('disabled Google and suspended tenants cannot authenticate; stale completion is blocked',async t=>{
  const f=await fixture(t);const cb=await f.callback(await f.start()),cookie=cb.headers.get('set-cookie').split(';')[0];
  await f.control.mutate(s=>{s.google.enabled=false;s.google.revision++;});
  assert.equal((await f.request('/auth/google/start',{})).status,409);assert.equal((await (await f.request('/context')).json()).googleEnabled,false);
  assert.equal((await f.request('/auth/google/complete',{companyName:'X',country:'DE'},cookie)).status,409);
  await f.control.mutate(s=>s.google.enabled=true);await f.store.createAccount({id:'blocked',name:'Blocked',country:'DE'},{id:'blocked-user',company_id:'blocked',email:'person@example.com',google_sub:'google-person-123',password_hash:null});await f.control.mutate(s=>s.suspended.blocked={reason:'Blocked'});
  assert.match((await f.callback(await f.start())).headers.get('location'),/COMPANY_SUSPENDED/);
});
test('only password-confirmed owners can configure Google, secrets masked and revision conflicts detected',async t=>{
  const f=await fixture(t);await addOwner(f.control,'owner@example.com',password,'owner');await addOwner(f.control,'auditor@example.com',password,'auditor');
  const login=await f.request('/admin/auth/login',{email:'owner@example.com',password}),cookie=login.headers.get('set-cookie').split(';')[0];
  const view=await (await f.request('/admin/authentication',undefined,cookie)).json();assert.equal(view.clientSecretConfigured,true);assert.equal(view.clientSecret,undefined);
  const body={...view,enabled:false,clientSecret:'',currentPassword:password};assert.equal((await f.request('/admin/authentication',{...body,currentPassword:'wrong'},cookie)).status,403);
  const saved=await f.request('/admin/authentication',body,cookie);assert.equal(saved.status,200);assert.equal((await f.control.read()).google.clientSecret,'test-secret');assert.equal(JSON.stringify(await saved.json()).includes('test-secret'),false);
  assert.equal((await f.request('/admin/authentication',body,cookie)).status,409);assert.equal(JSON.stringify((await f.control.read()).audit).includes('test-secret'),false);
  const auditor=await f.request('/admin/auth/login',{email:'auditor@example.com',password});assert.equal((await f.request('/admin/authentication',{...body,revision:2},auditor.headers.get('set-cookie').split(';')[0])).status,403);
});
test('redirect allowlist rejects deceptive domains, unsafe paths and local production callbacks',()=>{
  for(const uri of ['https://equitensa.de.evil.example/api/auth/google/callback','https://equitensa.si/other','https://equitensa.at/api/auth/google/callback?next=https://evil.example','http://equitensa.de/api/auth/google/callback','https://user@equitensa.de/api/auth/google/callback','http://localhost:3000/api/auth/google/callback'])assert.throws(()=>googleDraft({enabled:false,clientId:'',redirectUris:[uri]},defaultGoogle(),false));
});
