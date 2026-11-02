import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
const origin = 'http://localhost:3000';
const csv = 'internal_id,gender,job_title,worker_category,base_annual,bonuses_annual,paid_hours_annual,hours_per_week\n1,M,Engineer,Engineering L3,60000,2000,2080,40\n2,F,Engineer,Engineering L3,62000,1000,2080,40';
test('authenticated import and export maintain tenant isolation and atomic snapshots', async t => {
  const store = new MemoryStore();
  const app = createApp({ store, demo:false,secret:'a'.repeat(64),origins:[origin] });
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path,{body,cookie,headers={}}={}) => fetch(base+path,{ method:body===undefined?'GET':'POST',headers:{ Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers },...(body===undefined?{}:{body:JSON.stringify(body)}) });
  const register = async email => {
    const response = await request('/auth/register',{body:{email,password:'correct-horse-123',companyName:'Acme'}});
    assert.equal(response.status,201);
    return response.headers.get('set-cookie').split(';')[0];
  };
  const cookieA = await register('a@example.com'), cookieB = await register('b@example.com');
  assert.equal((await request('/analysis')).status,401);
  assert.equal((await request('/import',{cookie:cookieA,body:{year:2026,csv},headers:{Origin:'https://evil.example'}})).status,403);
  const imported = await request('/import',{cookie:cookieA,body:{year:2026,csv}}); assert.equal(imported.status,201);
  const before = await (await request('/analysis?year=2026',{cookie:cookieA})).json();
  assert.equal(before.analysis.count,2); assert.equal(before.analysis.mean_gap,null);
  const tenantB = await (await request('/analysis?year=2026',{cookie:cookieB})).json();
  assert.equal(tenantB.analysis.count,0); assert.equal(tenantB.snapshot,null);
  assert.equal((await request('/reports/xml?year=2026',{cookie:cookieB})).status,404);
  const invalid = await request('/import',{cookie:cookieA,body:{year:2026,csv:csv+'\n1,F,Engineer,Engineering L3,1,0,2080,40'}});
  assert.equal(invalid.status,422);
  const after = await (await request('/analysis?year=2026',{cookie:cookieA})).json();
  assert.equal(before.snapshot.id,after.snapshot.id);
  const localized = 'Personalnummer;Spol;Delovno mesto;Vergleichsgruppe;Annual base pay;Annual paid hours;Weekly hours\n003;F;Engineer;Engineering L3;60000,50;2080;38,5';
  const preview = await (await request('/import/preview',{cookie:cookieA,body:{csv:localized}})).json();
  assert.equal(preview.delimiter,';');
  assert.equal(preview.mapping.base_annual,'Annual base pay');
  assert.equal((await request('/import',{cookie:cookieA,body:{year:2026,csv:localized,mapping:preview.mapping,decimalSeparator:','}})).status,201);
  const localizedResult = await (await request('/analysis?year=2026',{cookie:cookieA})).json();
  assert.equal(localizedResult.analysis.count,1);
  assert.equal((await request('/import',{cookie:cookieA,body:{year:2026,csv:localized,mapping:preview.mapping,decimalSeparator:'.'}})).status,422);
  const preserved = await (await request('/analysis?year=2026',{cookie:cookieA})).json();
  assert.equal(preserved.snapshot.id,localizedResult.snapshot.id);
  assert.equal((await request('/analysis?year=nope',{cookie:cookieA})).status,400);
  // Native HTTP is intentional: fetch/Undici normalizes the Host header.
  const hostRequest = (host, path, cookie) => new Promise((resolve,reject) => {
    const req=httpRequest({ hostname:'127.0.0.1',port:server.address().port,path:'/api'+path,headers:{Host:host,...(cookie?{Cookie:cookie}:{})} },response => {
      let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(body)}));
    });req.on('error',reject);req.end();
  });
  const alternateHost = (await hostRequest('localhost.si','/analysis',cookieA)).body;
  assert.equal(alternateHost.company.country,'DE');
  assert.equal((await hostRequest('localhost.si.evil.com','/context')).status,421);
  for (const format of ['pdf','csv','xml','txt']) {
    const response = await request(`/reports/${format}`,{cookie:cookieA});
    assert.equal(response.status,200); assert.equal(response.headers.get('x-report-status'),'DRAFT_UNVERIFIED');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (format==='pdf') assert.equal(bytes.subarray(0,4).toString(),'%PDF');
    if (format==='xml') assert.match(bytes.toString(),/urn:equitensa:internal:draft:v1/);
  }
  await request('/auth/logout',{cookie:cookieA,body:{}});
  assert.equal((await request('/analysis',{cookie:cookieA})).status,401);
});
test('demo browser sessions each have their own company and data', async t => {
  const app = createApp({store:new MemoryStore(),demo:true,secret:'a'.repeat(64)});
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const port=server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/demo`,{method:'POST',headers:{Origin:`http://127.0.0.1:${port}`,'Content-Type':'application/json'},body:JSON.stringify({country:'SI'})});
  assert.equal(response.status,200);
  const company = (await response.json()).company; assert.equal(company.country,'SI');
  const second = await fetch(`http://127.0.0.1:${port}/api/demo`,{method:'POST',headers:{Origin:`http://127.0.0.1:${port}`,'Content-Type':'application/json'},body:JSON.stringify({country:'SI'})});
  assert.notEqual((await second.json()).company.id,company.id);
});
