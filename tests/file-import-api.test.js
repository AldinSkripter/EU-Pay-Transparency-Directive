import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import * as XLSX from 'xlsx';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { verifyAll } from './helpers.js';

test('file upload to preview, remembered mapping, idempotent import, tenant history and XLSX/JSON reports',async t=>{
  const store=new MemoryStore(),browserOrigin='http://localhost:3000';
  const server=createApp({store,secret:'a'.repeat(64),origins:[browserOrigin]}).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=(path,cookie,body)=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:browserOrigin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const cookies={};
  for(const country of ['DE','AT','SI']){
    const r=await request('/auth/register',null,{email:`file-${country}@example.test`,password:'correct-horse-123',companyName:`${country} Test`,country});assert.equal(r.status,201);verifyAll(store);cookies[country]=r.headers.get('set-cookie').split(';')[0];
    const headers=['local_key','gender','job_title','worker_category','base_annual','paid_hours_annual','hours_per_week','reporting_country','currency','reporting_year'];
    const data=Array.from({length:12},(_,i)=>[String(i).padStart(3,'0'),i<6?'F':'M','Engineer','=PRIVATE CATEGORY',i<6?60000:65000,2080,40,country,'EUR',2026]);
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,...data]),'Payroll');
    const format=country==='DE'?'xls':country==='AT'?'xlsx':'xml';
    const bytes=format==='xml'?Buffer.from('<payroll>'+data.map(values=>'<employee>'+headers.map((h,i)=>`<${h}>${values[i]}</${h}>`).join('')+'</employee>').join('')+'</payroll>'):XLSX.write(book,{type:'buffer',bookType:format});
    const input={file:{name:'unknown.dat',base64:bytes.toString('base64')},year:2026};
    const preview=await (await request('/import/preview',cookies[country],input)).json();
    assert.equal(preview.format,format);assert.equal(preview.count,12);assert.equal(preview.savedProfile,null);
    const mapping={...preview.mapping,internal_id:'local_key'};
    assert.equal((await request('/import',cookies[country],{...input,mapping})).status,422);
    const imported=await request('/import',cookies[country],{...input,mapping,contextConfirmed:true});assert.equal(imported.status,201);
    const first=await imported.json();
    const replay=await request('/import',cookies[country],{...input,mapping,contextConfirmed:true});assert.equal(replay.status,200);
    assert.equal((await replay.json()).snapshot.id,first.snapshot.id);
    const remembered=await (await request('/import/preview',cookies[country],input)).json();
    assert.equal(remembered.mapping.internal_id,'local_key');assert.equal(remembered.savedProfile.version,1);
    const history=await (await request('/import/history?year=2026',cookies[country])).json();assert.equal(history.batches.length,1);assert.equal(history.batches[0].format,format);
    const jsonResponse=await request('/reports/json?year=2026&audience=public',cookies[country]);assert.equal(jsonResponse.status,200);
    const report=await jsonResponse.json();assert.equal(report.company.country,country);assert.equal(report.summary.count,12);assert.equal(report.groups,undefined);assert.equal(report.review,undefined);assert.equal(report.officialSubmission,false);
    const xlsxResponse=await request('/reports/xlsx?year=2026&audience=internal',cookies[country]);assert.equal(xlsxResponse.status,200);
    const exported=XLSX.read(Buffer.from(await xlsxResponse.arrayBuffer()),{type:'buffer'});
    assert.ok(exported.SheetNames.includes('Categories'));assert.ok(exported.SheetNames.includes('Quartiles'));
    const cells=Object.values(exported.Sheets.Categories);const category=cells.find(c=>c.v==='=PRIVATE CATEGORY');assert.equal(category.t,'s');assert.equal(category.f,undefined);
    const publicXlsx=await request('/reports/xlsx?year=2026&audience=public',cookies[country]);assert.equal(XLSX.read(Buffer.from(await publicXlsx.arrayBuffer()),{type:'buffer'}).SheetNames.includes('Categories'),false);
    const badInput={...input,file:{...input.file,base64:Buffer.from('<!DOCTYPE x SYSTEM "file:///etc/passwd"><x/>').toString('base64')}};
    assert.equal((await request('/import',cookies[country],{...badInput,mapping,contextConfirmed:true})).status,422);
    assert.equal((await (await request('/analysis?year=2026',cookies[country])).json()).snapshot.id,first.snapshot.id);
  }
  const before=await (await request('/import/history?year=2026',cookies.SI)).json();assert.equal(before.batches.length,1);assert.equal(before.batches[0].format,'xml');
  const otherYear=await (await request('/import/history?year=2027',cookies.SI)).json();assert.equal(otherYear.batches.length,0);
});
