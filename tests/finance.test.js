import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../server/app.js';
import {MemoryStore,PostgresStore} from '../server/store.js';
import {verifyAll} from './helpers.js';
import {calculateFinance,financeInitial,validateFinanceProfile,issuanceProblems,financePdf} from '../server/finance.js';
import {parseFinanceBankCsv} from '../server/finance-bank.js';
import {FinanceFileVault,validateFinanceAttachment} from '../server/finance-files.js';
import {validatorAvailable} from '../server/finance-einvoice.js';
import yauzl from 'yauzl';

const profile=country=>({country,confirmCountry:true,name:'Example '+country,address:'Street 1',postalCode:'1000',city:'Town',iban:'DE89370400440532013000',vatId:{DE:'DE123456789',AT:'ATU12345678',SI:'SI12345678'}[country],accent:'#315eac'});
const contact=country=>({name:'Buyer',address:'Street 2',postalCode:'1000',city:'Town',country,business:true,publicBody:false,vatId:{DE:'DE987654321',AT:'ATU87654321',SI:'SI87654321'}[country]});
const line=(rate='20')=>({description:'Service',quantity:'2.5',unitPrice:'99.99',rate,unit:'h'});
const dates={issueDate:'2026-01-01',serviceDate:'2026-01-01',dueDate:'2026-02-01'};

test('document design validates bounded settings and renders each font and template as a PDF',async()=>{
  for(const template of ['signature','minimal','editorial'])for(const font of ['sans','serif','mono']){
    const issuer=validateFinanceProfile({...profile('AT'),design:{template,font,density:'compact',logoPosition:'left',textColor:'#312540',surfaceColor:'#eee6fa',fontSize:13,pageMargin:60,logoWidth:150,invoiceTitle:'Project invoice',blocks:[{heading:'Welcome',body:'Project scope',position:'intro'},{heading:'Terms',body:'Bank transfer only',position:'closing'}]}},'AT');
    assert.equal(issuer.design.template,template);assert.equal(issuer.design.font,font);
    const calculation=calculateFinance([line()],'AT');
    const pdf=await financePdf({...calculation,...dates,kind:'invoice',status:'draft',customer:contact('AT'),note:'Preview'},issuer,'AT');
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>5000);
  }
  for(const design of [{template:'<script>'},{font:'remote-url'},{textColor:'red'},{surfaceColor:'url(x)'},{density:'anything'},{logoPosition:'free'},{fontSize:30},{pageMargin:-1},{logoWidth:200},{blocks:[{position:'unsafe'}]},{blocks:Array(9).fill({position:'intro'})},{blocks:[{position:'intro',body:'x'.repeat(1201)}]}])assert.throws(()=>validateFinanceProfile({...profile('AT'),design},'AT'),/FINANCE_INVALID_INPUT/);
});

test('exact-cent calculation rounds net lines and grouped VAT, rejects unsafe and unsupported amounts',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(calculateFinance([line()], 'AT')).filter(([k])=>['netCents','taxCents','grossCents'].includes(k))),{netCents:24998,taxCents:5000,grossCents:29998});
  const grouped=calculateFinance([{...line(),quantity:'1',unitPrice:'0.03'},{...line(),quantity:'1',unitPrice:'0.03'}],'AT');
  assert.equal(grouped.taxCents,1);assert.equal(grouped.netCents,6);
  assert.equal(calculateFinance([line('9.5')],'SI').taxCents,2375);
  assert.equal(calculateFinance([line('4.9')],'AT').taxCents,1225);
  assert.equal(calculateFinance([{...line(),quantity:'1,5',unitPrice:'10,50'}],'AT').grossCents,1890);
  for(const quantity of ['0','-1','1e3','1.234,5','0.00001'])assert.throws(()=>calculateFinance([{...line(),quantity}],'AT'));
  assert.throws(()=>calculateFinance([line('0')],'AT'));
  assert.throws(()=>calculateFinance([line('19')],'SI'));
  assert.throws(()=>calculateFinance([{...line(),quantity:'99999999',unitPrice:'99999999'}],'AT'));
});
test('country cannot be changed by a payload; IBAN, logo content and required fields are checked',()=>{
  assert.throws(()=>validateFinanceProfile(profile('AT'),'SI'),/COUNTRY_MISMATCH/);
  assert.throws(()=>validateFinanceProfile({...profile('AT'),confirmCountry:false},'AT'),/COUNTRY_MISMATCH/);
  assert.throws(()=>validateFinanceProfile({...profile('AT'),iban:'DE00370400440532013000'},'AT'),/INVALID_IBAN/);
  assert.throws(()=>validateFinanceProfile({...profile('AT'),logo:'data:image/svg+xml;base64,PHN2Zz4='},'AT'),/INVALID_LOGO/);
  assert.throws(()=>validateFinanceProfile({...profile('AT'),logo:'data:image/png;base64,YWJj'},'AT'),/INVALID_LOGO/);
  const s=financeInitial({name:'Company',country:'AT'});s.profile=validateFinanceProfile(profile('AT'),'AT');s.countryConfirmed=true;
  const d={customer:contact('AT'),grossCents:1000001,...dates,kind:'invoice'};
  assert.deepEqual(issuanceProblems(s,d),[]);
  assert.ok(issuanceProblems(s,{...d,customer:{...d.customer,vatId:''}}).includes('customer.vatId'));
  assert.ok(issuanceProblems(s,{...d,customer:{...d.customer,country:'SI'}}).includes('cross_border_not_supported'));
});
test('receivables API includes partial payments, isolates companies and exports customer balances',async t=>{
  const {call,register}=await fixture(t),cookie=await register('AT'),other=await register('SI');
  let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body)=>{const response=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.ok(response.ok,await response.clone().text());const result=await response.json();s=result.state;return result.result;};
  await save('/settings',profile('AT'));
  const c=await save('/contacts',contact('AT'));
  const d=await save('/documents',{kind:'invoice',contactId:c.id,...dates,lines:[line()]});
  assert.equal((await(await call(cookie,'/finance/receivables')).json()).rows.length,0);
  await save(`/documents/${d.id}/issue`,{confirm:true,taxScopeConfirmed:true});
  await save(`/documents/${d.id}/payment`,{amount:'100.00',paidOn:'2026-02-01'});
  const report=await(await call(cookie,'/finance/receivables')).json();
  assert.equal(report.rows[0].outstandingCents,19998);assert.equal(report.customers[0].contactId,c.id);
  const csv=await call(cookie,'/finance/receivables.csv?contactId='+c.id);assert.equal(csv.status,200);assert.match(await csv.text(),/199\.98/);
  assert.equal((await(await call(other,'/finance/receivables')).json()).rows.length,0);
  assert.equal((await call(other,'/finance/receivables.csv?contactId='+c.id)).status,404);
  assert.equal((await call(null,'/finance/receivables')).status,401);
  assert.equal((await call(cookie,'/finance/receivables.csv?contactId[x]=bad')).status,400);
});
async function fixture(t){
  const store=new MemoryStore(),accountKey=randomBytes(32),server=createApp({store,demo:true,secret:'a'.repeat(64),accountKey}).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});const origin=`http://127.0.0.1:${server.address().port}`;
  const call=(cookie,path,body,headers={})=>fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const register=async country=>{const r=await call(null,'/auth/register',{email:randomUUID()+'@example.com',password:'correct-horse-123',companyName:'Finance '+country,country});assert.equal(r.status,201);verifyAll(store);return r.headers.get('set-cookie').split(';')[0];};
  return {store,call,register,financeVault:new FinanceFileVault({key:accountKey,demo:true})};
}

test('EU service draft API calculates zero VAT and blocks issuance without evidence in all issuer markets',async t=>{
  const {call,register}=await fixture(t);
  for(const country of ['DE','AT','SI']){
    const cookie=await register(country);let state=(await(await call(cookie,'/finance')).json()).state;
    const r=await call(cookie,'/finance/contacts',{...contact('NL'),vatId:'NL123456789B01',revision:state.revision});
    const saved=await r.json();state=saved.state;
    const body={...dates,issueDate:'2026-11-15',serviceDate:'2026-11-01',dueDate:'2026-11-29',kind:'invoice',contactId:saved.result.id,taxTreatment:'eu_b2b_services',lines:[{description:'Consulting',quantity:'2',unitPrice:'100.00',unit:'h',rate:'0'}]};
    const preview=await call(cookie,'/finance/preview',body);assert.equal(preview.status,200);const {document}=await preview.json();assert.equal(document.grossCents,20000);assert.equal(document.taxCents,0);assert.match(document.taxNotice,/Reverse charge/);
    const created=await call(cookie,'/finance/documents',{...body,revision:state.revision});assert.equal(created.status,201);const stored=await created.json();
    const check=await(await call(cookie,`/finance/documents/${stored.result.id}/issue-check`)).json();assert.ok(check.fields.includes('vat_verification_evidence'));assert.ok(check.fields.includes('general_rule_confirmation'));
    assert.equal((await call(cookie,'/finance/preview',{...body,lines:[{...body.lines[0],rate:'19'}]})).status,400);
    assert.equal((await call(cookie,'/finance/preview',{...body,taxTreatment:'arbitrary_tax_exemption'})).status,400);
  }
});

test('recipient-specific tax options, domestic consumers and foreign local VAT are consistently enforced',async t=>{
 const {call,register}=await fixture(t);
 for(const country of ['DE','AT','SI']){
  const cookie=await register(country);let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.ok(r.ok,await r.clone().text());const data=await r.json();s=data.state;return data.result;};
  await save('/settings',profile(country));
  const domestic=await save('/contacts',{...contact(country),business:false,vatId:''});
  const options=await(await call(cookie,'/finance/tax-options?contactId='+domestic.id)).json();assert.deepEqual(options.options.map(o=>o.id),['domestic','small_business']);
  const rate={DE:'19',AT:'20',SI:'22'}[country];
  const d=await save('/documents',{...dates,kind:'invoice',contactId:domestic.id,lines:[line(rate)]});
  const check=await(await call(cookie,`/finance/documents/${d.id}/issue-check`)).json();assert.equal(check.ready,true);
  await save(`/documents/${d.id}/issue`,{confirm:true,taxScopeConfirmed:true});
  const foreign=await save('/contacts',{...contact('US'),business:false,vatId:''});
  const foreignOptions=await(await call(cookie,'/finance/tax-options?contactId='+foreign.id)).json();assert.deepEqual(foreignOptions.options.map(o=>o.id),['domestic_vat_foreign','export_goods']);
  const localDoc=await save('/documents',{...dates,kind:'invoice',contactId:foreign.id,taxTreatment:'domestic_vat_foreign',taxEvidence:{localVatConfirmed:true,reference:'Domestic supply to customer at issuer address'},lines:[line(rate)]});
  assert.equal(localDoc.taxCents,d.taxCents);
  const foreignCheck=await(await call(cookie,`/finance/documents/${localDoc.id}/issue-check`)).json();assert.equal(foreignCheck.ready,true);
  assert.equal((await call(cookie,'/finance/tax-options?contactId=other-company-contact')).status,400);
 }
});

test('foreign contacts can be stored in every issuer market without enabling cross-border issuance',async t=>{
  const {call,register}=await fixture(t);
  for(const country of ['DE','AT','SI']){
    const cookie=await register(country);
    let state=(await(await call(cookie,'/finance')).json()).state;
    for(const recipient of ['NL','US','JP']){
      const r=await call(cookie,'/finance/contacts',{...contact(recipient),vatId:'',revision:state.revision});
      assert.equal(r.status,201);const saved=await r.json();state=saved.state;
      assert.equal(saved.result.country,recipient);
      assert.ok(issuanceProblems({...state,countryConfirmed:true,profile:profile(country)},{...dates,kind:'invoice',grossCents:100,customer:saved.result}).includes('cross_border_not_supported'));
    }
    const invalid=await call(cookie,'/finance/contacts',{...contact('ZZ'),revision:state.revision});
    assert.equal(invalid.status,400);
  }
});

for(const country of ['DE','AT','SI'])test(`${country}: issuance preflight, original bundle, email draft and external delivery are tenant-safe`,{skip:!validatorAvailable()},async t=>{
 const {call,register}=await fixture(t),cookie=await register(country),other=await register(country);
 let s=(await(await call(cookie,'/finance')).json()).state;
 const save=async(path,body)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.ok(r.ok,await r.clone().text());const v=await r.json();s=v.state;return v.result;};
 await save('/settings',{...profile(country),email:'issuer@example.com'});
 const c=await save('/contacts',{...contact(country),email:'buyer@example.com'}),format={DE:'xrechnung',AT:'ebinterface',SI:'eslog'}[country];
 const d=await save('/documents',{kind:'invoice',contactId:c.id,...dates,reference:'ORDER-1',einvoice:{contactName:'Jane',contactPhone:'+49123456789'},lines:[line({DE:'19',AT:'20',SI:'22'}[country])]});
 assert.equal((await call(cookie,`/finance/documents/${d.id}/bundle.zip`)).status,409);
 const check=await(await call(cookie,`/finance/documents/${d.id}/issue-check?format=${format}`)).json();assert.equal(check.ready,true);assert.equal(check.validationPending,true);
 const invalid=await(await call(cookie,`/finance/documents/${d.id}/issue-check?format=invalid`)).json();assert.equal(invalid.ready,false);assert.ok(invalid.fields.includes('format'));
 const issued=await save(`/documents/${d.id}/issue`,{format,confirm:true,taxScopeConfirmed:true});
 const bundle=await call(cookie,`/finance/documents/${d.id}/bundle.zip`);assert.equal(bundle.status,200);const zip=Buffer.from(await bundle.arrayBuffer());assert.ok(zip.includes(Buffer.from('manifest.json')));for(const file of issued.originals)assert.ok(zip.includes(Buffer.from(file.filename)));
 const eml=await call(cookie,`/finance/documents/${d.id}/email-draft`,{});assert.equal(eml.status,200);assert.equal(eml.headers.get('content-type'),'message/rfc822');const body=await eml.text();assert.match(body,/X-Unsent: 1/);assert.match(body,/multipart\/mixed/);assert.match(body,/buyer@example.com/);
 for(const file of issued.originals){const bytes=Buffer.from(await(await call(cookie,`/finance/documents/${d.id}/originals/${file.id}`)).arrayBuffer());assert.ok(body.replace(/\s/g,'').includes(bytes.toString('base64')));}
 assert.equal((await call(cookie,`/finance/documents/${d.id}/email-draft`,{recipient:'a@example.com\r\nBcc: x@example.com'})).status,400);
 assert.equal((await call(cookie,`/finance/documents/${d.id}/email-draft`,{subject:'Invoice\r\nBcc: x@example.com'})).status,400);
 assert.equal((await call(other,`/finance/documents/${d.id}/email-draft`,{})).status,404);
 assert.equal((await call(other,`/finance/documents/${d.id}/bundle.zip`)).status,404);
 let current=(await(await call(cookie,'/finance')).json()).state;assert.equal(current.revision,s.revision);assert.equal(current.documents[0].deliveries,undefined);
 const record={confirm:true,channel:'email',recipient:'buyer@example.com',reference:'Sent from own mail client',sentAt:new Date().toISOString()};
 await save(`/documents/${d.id}/delivery`,record);await save(`/documents/${d.id}/delivery`,record);
 assert.equal(s.documents[0].deliveries.length,1);assert.equal(s.documents[0].deliveries[0].status,'externally_recorded');
 assert.deepEqual(s.documents[0].deliveries[0].files,issued.originals.map(f=>({id:f.id,sha256:f.sha256})));
 assert.equal((await call(cookie,`/finance/documents/${d.id}/delivery`,{...record,sentAt:'2099-01-01',revision:s.revision})).status,400);
});

test('issued originals are immutable, tenant-bound, archived and retry-safe',async t=>{
  const {call,register}=await fixture(t),cookie=await register('AT'),other=await register('SI');
  let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.ok(r.ok,await r.clone().text());const result=await r.json();s=result.state;return result.result;};
  await save('/settings',profile('AT'));const c=await save('/contacts',contact('AT'));
  const d=await save('/documents',{kind:'invoice',contactId:c.id,...dates,lines:[line()]});
  const body={revision:s.revision,confirm:true,taxScopeConfirmed:true},headers={'Idempotency-Key':randomUUID()};
  const issue=await call(cookie,`/finance/documents/${d.id}/issue`,body,headers);assert.equal(issue.status,200);
  const issued=await issue.json();s=issued.state;const file=issued.result.originals[0];assert.equal(file.extension,'pdf');
  const url=`/finance/documents/${d.id}/originals/${file.id}`;
  const bytes=Buffer.from(await(await call(cookie,url)).arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const retry=await call(cookie,`/finance/documents/${d.id}/issue`,body,headers);assert.equal(retry.status,200);assert.equal((await retry.json()).state.revision,s.revision);
  const bodyRetry=await call(cookie,`/finance/documents/${d.id}/issue`,{...body,requestKey:headers['Idempotency-Key']});assert.equal(bodyRetry.status,200);assert.equal((await bodyRetry.json()).result.number,issued.result.number);
  assert.equal((await call(cookie,`/finance/documents/${d.id}/issue`,{...body,confirm:false},headers)).status,409);
  assert.equal((await call(other,url)).status,404);
  await save('/settings',{...profile('AT'),name:'Changed company',accent:'#123456'});
  assert.deepEqual(Buffer.from(await(await call(cookie,`/finance/documents/${d.id}/pdf`)).arrayBuffer()),bytes);
  const duplicate=await save(`/documents/${d.id}/duplicate`,{});assert.equal(duplicate.originals,undefined);
  assert.equal((await call(cookie,`/finance/documents/${d.id}/edit`,{revision:s.revision})).status,409);
  const archive=Buffer.from(await(await call(cookie,'/finance/archive.zip')).arrayBuffer());assert.ok(archive.includes(Buffer.from(file.filename)));
});

test('validated DE issuance saves XML and PDF, while validation failure consumes no number', {skip:!validatorAvailable()},async t=>{
  const {call,register}=await fixture(t),cookie=await register('DE');let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.ok(r.ok,await r.clone().text());const result=await r.json();s=result.state;return result.result;};
  await save('/settings',{...profile('DE'),email:'issuer@example.com'});const c=await save('/contacts',{...contact('DE'),email:'buyer@example.com'});
  const input={kind:'invoice',contactId:c.id,...dates,reference:'ORDER-123',einvoice:{contactName:'Jane',contactPhone:'+49123456789'},lines:[line('19')]};
  const d=await save('/documents',input);
  const before=s.revision;const bad=await call(cookie,`/finance/documents/${d.id}/issue`,{revision:s.revision,confirm:true,taxScopeConfirmed:true,format:'eslog'});assert.equal(bad.status,400);
  s=(await(await call(cookie,'/finance')).json()).state;assert.equal(s.revision,before);assert.deepEqual(s.sequence,{});
  const issued=await save(`/documents/${d.id}/issue`,{confirm:true,taxScopeConfirmed:true,format:'xrechnung'});
  assert.equal(issued.originals.length,2);assert.equal(issued.number,'RE-2026-00001');
  const xml=issued.originals.find(file=>file.extension==='xml');assert.ok(xml);assert.match(xml.validation,/Mustang/);
  const response=await call(cookie,`/finance/documents/${d.id}/originals/${xml.id}`);assert.equal(response.status,200);assert.match(await response.text(),/RE-2026-00001/);
});
test('document QR sharing is explicit, tenant scoped, expiring, frozen and revocable',async t=>{
  const {call,register,store}=await fixture(t),cookie=await register('SI'),other=await register('AT');let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.ok(r.ok,await r.clone().text());const result=await r.json();s=result.state;return result.result;};
  const c=await save('/contacts',contact('SI'));
  const d=await save('/documents',{kind:'invoice',contactId:c.id,...dates,lines:[line('22')]});
  assert.equal((await call(other,`/finance/documents/${d.id}/share`,{revision:0,enabled:true,days:7})).status,404);
  const shared=await save(`/documents/${d.id}/share`,{enabled:true,days:7});
  const response=await fetch(shared.url);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-type'),/pdf/);
  assert.equal((await fetch(shared.url.slice(0,-64)+'0'.repeat(64))).status,404);
  const renewed=await save(`/documents/${d.id}/share`,{enabled:true,days:30});assert.equal((await fetch(shared.url)).status,404);
  await save(`/documents/${d.id}/share`,{enabled:false});assert.equal((await fetch(renewed.url)).status,404);
  const editable=await save(`/documents/${d.id}/share`,{enabled:true,days:7});
  await save(`/documents/${d.id}/edit`,{...d,note:'Changed'});assert.equal((await fetch(editable.url)).status,404);
  const expiring=await save(`/documents/${d.id}/share`,{enabled:true,days:7});
  const company=(await(await call(cookie,'/me')).json()).company;
  await store.mutateFinance(company.id,financeInitial(company),state=>{state.documents[0].share.expiresAt='2000-01-01T00:00:00Z';return {};});
  assert.equal((await fetch(expiring.url)).status,404);
});
test('company design library and invoice custom fields persist without altering saved snapshots',async t=>{
  const {call,register}=await fixture(t),cookie=await register('SI'),other=await register('AT');let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.ok(r.ok,await r.clone().text());const result=await r.json();s=result.state;return result.result;};
  const style=await save('/designs',{name:'Consulting',appearance:{accent:'#123456',design:{titleSize:32,tableStyle:'contrast',titleAlign:'right'}}});
  assert.equal((await call(other,`/finance/designs/${style.id}/remove`,{revision:0})).status,404);
  assert.equal((await call(cookie,`/finance/designs/${style.id}/remove`,{revision:0})).status,409);
  const c=await save('/contacts',contact('SI'));
  const d=await save('/documents',{kind:'invoice',contactId:c.id,...dates,reference:'PO-42',appearance:style.appearance,lines:[{...line('22'),quantity:'1',unitPrice:'100',discountPercent:'10'}]});
  assert.equal(d.reference,'PO-42');assert.equal(d.netCents,9000);assert.equal(d.taxCents,1980);
  await save('/designs/'+style.id+'/remove',{});
  const loaded=(await(await call(cookie,'/finance')).json()).state;
  assert.equal(loaded.designs.length,0);assert.equal(loaded.documents[0].appearance.design.titleSize,32);
  assert.equal(loaded.documents[0].reference,'PO-42');
});
test('offer tracking protects sent content, requires acceptance for conversion and isolates tenants',async t=>{
  const {call,register}=await fixture(t),cookie=await register('AT'),other=await register('SI');let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body,status=200)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.equal(r.status,status,await r.clone().text());const result=await r.json();if(result.state)s=result.state;return result.result;};
  const c=await save('/contacts',contact('AT'),201),body={kind:'offer',contactId:c.id,...dates,lines:[line()]},d=await save('/documents',body,201);
  const tracking={status:'sent',validUntil:'2099-01-01',note:'External delivery recorded'};
  assert.equal((await call(other,`/finance/documents/${d.id}/offer-status`,{...tracking,revision:0})).status,404);
  await save(`/documents/${d.id}/offer-status`,tracking);
  assert.equal((await call(cookie,`/finance/documents/${d.id}/offer-status`,{status:'accepted',note:'',revision:0})).status,409);
  await save(`/documents/${d.id}/edit`,body,409);
  await save(`/documents/${d.id}/convert`,{},409);
  await save(`/documents/${d.id}/offer-status`,{status:'accepted',note:'Customer acceptance recorded'});
  const converted=await save(`/documents/${d.id}/convert`,{},201);assert.equal(converted.offerTracking,undefined);assert.equal(converted.sourceOfferId,d.id);
  await save(`/documents/${d.id}/offer-status`,{status:'prepared',note:''},409);
  await save(`/documents/${d.id}/convert`,{},409);
});
test('catalog, contact corrections, copied drafts, expense categories and safe CSV exports stay company-scoped',async t=>{
  const {call,register}=await fixture(t),cookie=await register('AT'),other=await register('AT');let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body,status=200)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.equal(r.status,status,await r.clone().text());const result=await r.json();if(result.state)s=result.state;return result.result;};
  await save('/settings',profile('AT'));
  const p=await save('/products',{sku:'CONSULT',name:'Consulting',unit:'h',unitPrice:'120,00',rate:'20'},201);assert.equal(p.unitPrice,'120.00');
  await save('/products',{sku:'consult',name:'Duplicate',unit:'h',unitPrice:'20',rate:'20'},409);
  await save('/products',{sku:'bad',name:'Invalid rate',unit:'h',unitPrice:'20',rate:'22'},400);
  assert.equal((await call(other,`/finance/products/${p.id}`,{...p,revision:0})).status,404);
  const c=await save('/contacts',contact('AT'),201),d=await save('/documents',{kind:'invoice',contactId:c.id,...dates,lines:[{description:p.name,quantity:'1',unit:p.unit,unitPrice:p.unitPrice,rate:p.rate}]},201);
  await save(`/products/${p.id}`,{...p,unitPrice:'200.00',archived:true});assert.equal(s.products[0].archived,true);assert.equal(s.documents[0].grossCents,14400);
  await save(`/contacts/${c.id}`,{...c,name:'Updated buyer'});assert.equal(s.documents[0].customer.name,c.name);
  assert.equal((await call(other,`/finance/contacts/${c.id}`,{...c,revision:0})).status,404);
  const duplicate=await save(`/documents/${d.id}/duplicate`,{},201);assert.notEqual(duplicate.id,d.id);assert.equal(duplicate.status,'draft');assert.equal(duplicate.number,null);assert.deepEqual(duplicate.payments,[]);assert.equal(duplicate.customer.name,'Updated buyer');assert.equal(duplicate.grossCents,d.grossCents);assert.equal(duplicate.issueDate,new Date().toISOString().slice(0,10));assert.ok(duplicate.dueDate>duplicate.issueDate);
  assert.equal((await call(other,`/finance/documents/${d.id}/duplicate`,{revision:0})).status,404);
  const expense=await save('/expenses',{supplier:'=HYPERLINK("bad")',reference:'EXP1',incurredOn:'2026-01-01',amount:'12.50',category:'software',note:'first'},201);
  await save(`/expenses/${expense.id}`,{supplier:expense.supplier,reference:'EXP1',incurredOn:expense.incurredOn,amount:'15.00',category:'office',note:'corrected'});assert.equal(s.expenses[0].amountCents,1500);assert.equal(s.expenses[0].category,'office');
  assert.equal((await call(other,`/finance/expenses/${expense.id}`,{revision:0})).status,404);
  const csv=await call(cookie,'/finance/export.csv?kind=expenses&year=2026');assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/text\/csv/);const content=await csv.text();assert.ok(content.includes("'"+'=HYPERLINK'));assert.ok(content.includes('15.00'));assert.ok(content.includes('office'));
  const previous=await(await call(cookie,'/finance/export.csv?kind=expenses&year=2025')).text();assert.equal(previous.split('\r\n').length,1);
  for(const kind of ['documents','payments','contacts','products'])assert.equal((await call(cookie,'/finance/export.csv?kind='+kind)).status,200);
  assert.equal((await call(cookie,'/finance/export.csv?kind=unknown')).status,400);
  assert.equal((await call(cookie,'/finance/export.csv?year=2026x')).status,400);
  assert.equal((await(await call(other,'/finance/export.csv?kind=products')).text()).split('\r\n').length,1);
});
test('recurring periods keep calendar anchors, pause and run idempotently; reminder downloads use current balances without sending',async t=>{
  const {call,register}=await fixture(t),cookie=await register('AT'),other=await register('AT');let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body,status=200)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.equal(r.status,status,await r.clone().text());const result=await r.json();if(result.state)s=result.state;return result.result;};
  await save('/settings',profile('AT'));const c=await save('/contacts',{...contact('AT'),email:'buyer@example.com'},201);
  const d=await save('/documents',{kind:'invoice',contactId:c.id,...dates,reference:'CONTRACT-2026',einvoice:{contactName:'Billing contact',contactPhone:'+4312345678'},lines:[line()]},201);
  assert.equal((await call(cookie,`/finance/documents/${d.id}/reminder.eml`)).status,409);
  await save(`/documents/${d.id}/issue`,{confirm:true,taxScopeConfirmed:true});
  await save(`/documents/${d.id}/payment`,{amount:'10.00',paidOn:'2026-01-02'});
  const reminder=await call(cookie,`/finance/documents/${d.id}/reminder.eml`);assert.equal(reminder.status,200);const eml=await reminder.text();assert.ok(eml.includes('To: buyer@example.com'));assert.ok(eml.includes('X-Unsent: 1'));const message=Buffer.from(eml.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString('utf8');assert.ok(message.includes('nicht versendet'));assert.ok(message.includes('289,98'));assert.equal((await call(other,`/finance/documents/${d.id}/reminder.eml`)).status,404);
  const recurring=await save('/recurring',{documentId:d.id,startDate:'2026-01-31',interval:1,paymentDays:14,autoOnOpen:false},201);
  assert.equal((await save('/recurring/run',{autoOnly:true})).generated.length,0);
  const run=await save('/recurring/run',{});assert.ok(run.generated.length>=3);const generated=s.documents.filter(d=>d.recurringId===recurring.id);
  assert.deepEqual(generated.slice(0,3).map(d=>d.issueDate),['2026-01-31','2026-02-28','2026-03-31']);
  assert.equal(new Set(generated.map(d=>d.recurringPeriod)).size,generated.length);assert.ok(generated.every(d=>d.status==='draft'&&d.number===null&&d.payments.length===0));
  assert.ok(generated.every(item=>item.reference===d.reference&&item.einvoice.contactName===d.einvoice.contactName&&item.einvoice.contactPhone===d.einvoice.contactPhone));
  assert.equal((await save('/recurring/run',{})).generated.length,0);
  await save(`/recurring/${recurring.id}/toggle`,{});assert.equal(s.recurring[0].paused,true);await save(`/recurring/${recurring.id}/toggle`,{});assert.equal(s.recurring[0].paused,false);
  assert.equal((await call(other,`/finance/recurring/${recurring.id}/toggle`,{revision:0})).status,404);
  await save('/recurring',{documentId:d.id,startDate:'2026-01-01',interval:2,paymentDays:14},400);
  await save('/recurring',{documentId:d.id,startDate:'2026-01-01',interval:1,paymentDays:91},400);
  const final=s.documents.find(doc=>doc.id===d.id);await save(`/documents/${d.id}/payment`,{amount:((final.grossCents-1000)/100).toFixed(2),paidOn:'2026-01-03'});
  assert.equal((await call(cookie,`/finance/documents/${d.id}/reminder.eml`)).status,409);
});
test('bank CSV imports are exact, deduplicated, atomic and reconciled only after confirmation without over-allocation',async t=>{
  const {call,register}=await fixture(t),cookie=await register('AT'),other=await register('AT');let s=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body,status=200)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.equal(r.status,status,await r.clone().text());const result=await r.json();if(result.state)s=result.state;return result.result;};
  const body={account:'EUR-1',delimiter:';',mapping:{externalId:'ID',bookedOn:'Date',amount:'Amount',description:'Description'},csv:'ID;Date;Amount;Description\nTX1;2026-01-02;150,00;Invoice payment\nTX2;2026-01-02;-42.80;Software'};
  const parsed=parseFinanceBankCsv(body);assert.deepEqual(parsed.map(t=>t.amountCents),[15000,-4280]);assert.equal(parsed[0].currency,'EUR');
  for(const csv of ['ID;Date;Amount;Description\nX;2026-02-31;10;Invalid','ID;Date;Amount;Description\nX;2026-01-01;1,000.00;Invalid','ID;Date;Amount;Description\n;2026-01-01;10;Missing ID'])assert.throws(()=>parseFinanceBankCsv({...body,csv}),/INVALID_BANK_CSV/);
  assert.throws(()=>parseFinanceBankCsv({...body,csv:body.csv+'\nTX1;2026-01-02;20;Conflicting'}),/INVALID_BANK_CSV/);
  const preview=await call(cookie,'/finance/bank/preview',body);assert.equal(preview.status,200);assert.equal((await(await call(cookie,'/finance')).json()).state.revision,s.revision);
  assert.deepEqual(await save('/bank/import',body,201),{imported:2,skipped:0});assert.deepEqual(await save('/bank/import',body,201),{imported:0,skipped:2});
  await save('/bank/import',{...body,csv:'ID;Date;Amount;Description\nNEW;2026-01-02;10;First\nTX1;2026-01-02;200;Changed'},409);
  assert.equal((await(await call(cookie,'/finance')).json()).state.bankTransactions.length,2);
  await save('/settings',profile('AT'));const c=await save('/contacts',contact('AT'),201),d=await save('/documents',{kind:'invoice',contactId:c.id,...dates,lines:[line()]},201);await save(`/documents/${d.id}/issue`,{confirm:true,taxScopeConfirmed:true});
  const id=s.bankTransactions[0].id;
  await save(`/bank/${id}/allocate`,{documentId:d.id,amount:'10.00',confirm:false},400);
  await save(`/bank/${id}/allocate`,{documentId:d.id,amount:'151.00',confirm:true},400);
  await save(`/bank/${id}/allocate`,{documentId:d.id,amount:'100.00',confirm:true});await save(`/bank/${id}/allocate`,{documentId:d.id,amount:'50.00',confirm:true});
  assert.equal(s.documents.find(x=>x.id===d.id).payments.reduce((n,p)=>n+p.amountCents,0),15000);
  await save(`/bank/${id}/allocate`,{documentId:d.id,amount:'0.01',confirm:true},400);
  await save(`/bank/${s.bankTransactions[1].id}/allocate`,{documentId:d.id,amount:'10.00',confirm:true},400);
  assert.equal((await call(other,`/finance/bank/${id}/allocate`,{revision:0,documentId:d.id,amount:'10.00',confirm:true})).status,404);
  assert.equal((await(await call(other,'/finance')).json()).state.bankTransactions,undefined);
});
test('e-invoice API uses company country, validates before download and does not issue or persist drafts',{skip:!validatorAvailable()},async t=>{
  const {call,register}=await fixture(t),cookie=await register('DE'),other=await register('SI');let state=(await(await call(cookie,'/finance')).json()).state;
  const save=async(path,body)=>{const r=await call(cookie,'/finance'+path,{...body,revision:state.revision});assert.ok(r.ok);const j=await r.json();state=j.state;return j.result;};
  await save('/settings',{...profile('DE'),email:'seller@example.com'});const c=await save('/contacts',{...contact('DE'),email:'buyer@example.com'});
  const body={kind:'invoice',contactId:c.id,...dates,lines:[line('19')],reference:'ORDER-1',einvoice:{contactName:'Test Person',contactPhone:'+4912345678'},format:'xrechnung'};
  assert.equal((await call(cookie,'/finance/einvoice-preview',{...body,format:'ubl',country:'SI'})).status,400);
  assert.equal((await call(other,'/finance/einvoice-preview',body)).status,400);
  const response=await call(cookie,'/finance/einvoice-preview',body);assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('x-equitensa-document-status'),'test-draft');assert.match(await response.text(),/TEST-PREVIEW/);
  assert.equal((await(await call(cookie,'/finance')).json()).state.documents.length,0);
});
for(const [country,format,wrong,rate] of [['AT','ebinterface','eslog','20'],['SI','eslog','ebinterface','22']])test(`${country} national export API is country-bound and returns reviewed-import-compatible XML`,{skip:!validatorAvailable(),timeout:60000},async t=>{
 const {call,register}=await fixture(t),cookie=await register(country);let state=(await(await call(cookie,'/finance')).json()).state;
 const save=async(path,body)=>{const r=await call(cookie,'/finance'+path,{...body,revision:state.revision});assert.ok(r.ok,await r.clone().text());const j=await r.json();state=j.state;return j.result;};
 await save('/settings',{...profile(country),email:'seller@example.com'});
 const c=await save('/contacts',{...contact(country),email:'buyer@example.com',vatId:country==='AT'?'ATU12345678':'SI12345678'});
 const body={kind:'invoice',contactId:c.id,...dates,lines:[line(rate)],reference:'ORDER-1',format};
 const capabilities=await(await call(cookie,'/finance/einvoice-capabilities')).json();assert.ok(capabilities.formats.includes(format));
 assert.equal((await call(cookie,'/finance/einvoice-preview',{...body,format:wrong})).status,400);
 const r=await call(cookie,'/finance/einvoice-preview',body);assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('x-equitensa-validation'),'EN16931-core-and-national-XSD');
 assert.match(await r.text(),country==='AT'?/schema\/6p1\//:/urn:eslog:2.00/);
 assert.equal((await(await call(cookie,'/finance')).json()).state.documents.length,0);
});

test('reviewed receipt import is atomic, rejects duplicates and isolates originals',async t=>{
  const {call,register,financeVault}=await fixture(t),cookie=await register('SI'),other=await register('AT');
  const attachment={filename:'sample.pdf',data:Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF').toString('base64')};
  const body={revision:0,supplier:'Example',reference:'R-42',incurredOn:'2026-01-01',amount:'122.00',reviewed:true,attachment};
  assert.equal((await call(cookie,'/finance/receipt-import',{...body,reviewed:false})).status,400);
  assert.equal((await call(cookie,'/finance/receipt-import',{...body,amount:'bad'})).status,400);
  assert.equal((await(await call(cookie,'/finance')).json()).state.expenses.length,0);
  const response=await call(cookie,'/finance/receipt-import',body);assert.equal(response.status,201);const saved=await response.json();
  const file=saved.state.attachments[0],me=await(await call(cookie,'/me')).json();t.after(()=>financeVault.discard(me.company.id,file.id));
  assert.equal(file.expenseId,saved.result.id);assert.equal(saved.result.amountCents,12200);
  assert.equal((await call(other,'/finance/attachments/'+file.id)).status,404);
  assert.equal((await call(cookie,'/finance/receipt-import',{...body,revision:saved.state.revision,reference:'R-43'})).status,409);
  assert.equal((await call(cookie,'/finance/receipt-import',body)).status,409);
  assert.equal((await(await call(cookie,'/finance')).json()).state.expenses.length,1);
  assert.equal((await call(cookie,'/finance/receipt-scan',attachment)).status,400);
});
test('original expense files retain exact bytes and digest, reject invalid content and cannot cross company boundaries',async t=>{
  const {call,register,financeVault}=await fixture(t),cookie=await register('AT'),other=await register('AT');let s=(await(await call(cookie,'/finance')).json()).state;
  const expenseResponse=await call(cookie,'/finance/expenses',{revision:s.revision,supplier:'Vendor',reference:'RECEIPT-1',incurredOn:'2026-01-01',amount:'12.50'});const created=await expenseResponse.json();s=created.state;const expense=created.result;
  const bytes=Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF'),body={revision:s.revision,filename:'original.pdf',data:bytes.toString('base64')};
  const upload=await call(cookie,`/finance/expenses/${expense.id}/attachments`,body);assert.equal(upload.status,201);const result=await upload.json();s=result.state;
  const me=await(await call(cookie,'/me')).json();t.after(()=>financeVault.discard(me.company.id,result.result.id));
  assert.equal(result.result.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(result.result.size,bytes.length);
  const download=await call(cookie,`/finance/attachments/${result.result.id}`);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);assert.match(download.headers.get('content-disposition'),/attachment/);assert.equal(download.headers.get('cache-control'),'no-store');
  assert.equal((await call(other,`/finance/attachments/${result.result.id}`)).status,404);
  assert.equal((await call(other,`/finance/expenses/${expense.id}/attachments`,{...body,revision:0})).status,404);
  assert.equal((await call(cookie,`/finance/expenses/${expense.id}/attachments`,{...body,revision:s.revision,data:Buffer.from('<svg/>').toString('base64')})).status,400);
  assert.equal((await call(cookie,`/finance/expenses/${expense.id}/attachments`,{...body,revision:0})).status,409);
  const archive=await call(cookie,'/finance/archive.zip');assert.equal(archive.status,200);
  const zipBytes=Buffer.from(await archive.arrayBuffer());
  const extracted=await new Promise((resolve,reject)=>{yauzl.fromBuffer(zipBytes,{lazyEntries:true},(error,zip)=>{if(error)return reject(error);const files=new Map();zip.on('error',reject);zip.on('end',()=>resolve(files));zip.on('entry',entry=>zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const parts=[];stream.on('data',chunk=>parts.push(chunk));stream.on('error',reject);stream.on('end',()=>{files.set(entry.fileName,Buffer.concat(parts));zip.readEntry();});}));zip.readEntry();});});
  assert.equal(extracted.size,2);assert.deepEqual([...extracted].find(([name])=>name.startsWith('receipts/'))[1],bytes);assert.equal(JSON.parse(extracted.get('finance-data.json').toString()).attachments[0].sha256,result.result.sha256);
  assert.throws(()=>validateFinanceAttachment({filename:'fake.png',data:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')}),/INVALID_ATTACHMENT/);
  assert.throws(()=>validateFinanceAttachment({filename:'large.pdf',data:Buffer.alloc(2000001).toString('base64')}),/INVALID_ATTACHMENT/);
});
test('file vault encrypts originals, authenticates contents and rejects untrusted path IDs',async()=>{
  const companyId=randomUUID(),vault=new FinanceFileVault({key:randomBytes(32),demo:true}),attachment=validateFinanceAttachment({filename:'vault.pdf',data:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}),file=await vault.put(companyId,attachment);
  try{const raw=await readFile(vault.path(companyId,file.id));assert.ok(!raw.includes(attachment.bytes));assert.deepEqual(await vault.get(companyId,file),attachment.bytes);assert.throws(()=>vault.path('../escape',file.id),/INVALID_FILE_ID/);await assert.rejects(()=>vault.get(companyId,{...file,sha256:'0'.repeat(64)}),/CORRUPTED/);}finally{await vault.discard(companyId,file.id);}
});
for(const country of ['DE','AT','SI'])test(`${country}: isolated settings, draft/PDF, country gates, atomic numbering and payments`,async t=>{
  const {call,register}=await fixture(t),cookie=await register(country),other=await register(country);
  assert.equal((await call(null,'/finance')).status,401);
  let s=(await (await call(cookie,'/finance')).json()).state;
  const save=async(path,body,status=200)=>{const r=await call(cookie,'/finance'+path,{...body,revision:s.revision});assert.equal(r.status,status,await r.clone().text());const data=await r.json();if(data.state)s=data.state;return data;};
  await save('/settings',{...profile(country),design:{template:'editorial',font:'serif',textColor:'#312540',surfaceColor:'#eee6fa',density:'compact',logoPosition:'left'}});
  assert.equal(s.profile.design.template,'editorial');
  assert.equal((await (await call(cookie,'/finance')).json()).state.profile.design.font,'serif');
  assert.equal((await call(cookie,'/finance/settings',{...profile(country),revision:0})).status,409);
  const c=(await save('/contacts',contact(country),201)).result;
  const offer=(await save('/documents',{kind:'offer',contactId:c.id,...dates,lines:[line({DE:'19',AT:'20',SI:'22'}[country])]},201)).result;
  const converted=(await save(`/documents/${offer.id}/convert`,{},201)).result;assert.equal(converted.kind,'invoice');assert.equal(converted.sourceOfferId,offer.id);
  await save(`/documents/${offer.id}/convert`,{},409);
  await save(`/documents/${converted.id}/edit`,{kind:'invoice',contactId:c.id,...dates,lines:[{...line({DE:'19',AT:'20',SI:'22'}[country]),description:'Revised'}]});
  assert.equal(s.documents.find(doc=>doc.id===converted.id).lines[0].description,'Revised');
  const d=(await save('/documents',{kind:'invoice',contactId:c.id,...dates,lines:[line({DE:'19',AT:'20',SI:'22'}[country])],appearance:{accent:'#b54158',design:{template:'minimal',font:'mono',blocks:[{heading:'Project terms',body:'Payment by bank transfer',position:'closing'}]}}},201)).result;
  assert.equal(d.netCents,24998);
  assert.equal(d.appearance.design.template,'minimal');assert.equal(s.profile.design.template,'editorial');
  assert.equal(d.appearance.design.blocks[0].heading,'Project terms');
  const revisionBeforePreview=s.revision,preview=await call(cookie,'/finance/preview',{kind:'invoice',contactId:c.id,...dates,lines:[line({DE:'19',AT:'20',SI:'22'}[country])]});
  assert.equal(preview.status,200);assert.equal((await preview.json()).document.grossCents,d.grossCents);
  const afterPreview=(await (await call(cookie,'/finance')).json()).state;assert.equal(afterPreview.revision,revisionBeforePreview);assert.equal(afterPreview.documents.length,s.documents.length);
  assert.equal((await call(other,'/finance/preview',{kind:'invoice',contactId:c.id,...dates,lines:[line('20')]})).status,400);
  const pdf=await call(cookie,`/finance/documents/${d.id}/pdf`);assert.equal(pdf.status,200);assert.ok((await pdf.text()).startsWith('%PDF'));
  assert.equal((await call(other,`/finance/documents/${d.id}/pdf`)).status,404);
  assert.equal((await (await call(other,'/finance')).json()).state.documents.length,0);
  await save('/demo-subscription',{plan:'finance_business',paidSeats:6,interval:'monthly',accepted:true});assert.equal(s.subscription.monthlyCents,4795);
  assert.equal((await call(cookie,'/finance/recurring/run',{revision:s.revision})).status,403);
  await save('/demo-subscription',{plan:'finance_start',paidSeats:1,interval:'annual',accepted:true});
  assert.equal(s.subscription.chargeCents,9588);
  for(const endpoint of ['/bank/preview','/bank/import','/expenses','/receipt-scan','/receipt-import','/recurring/run']){
    const denied=await call(cookie,'/finance'+endpoint,{revision:s.revision});
    assert.equal(denied.status,403,endpoint);assert.equal((await denied.json()).error,'FINANCE_PLAN_UPGRADE_REQUIRED');
  }
  assert.equal((await call(cookie,`/finance/documents/${d.id}/pdf`)).status,200);
  await save('/demo-subscription',{plan:'finance_start',paidSeats:2,interval:'monthly',accepted:true},400);
  await save('/demo-subscription',{plan:'finance_pro',paidSeats:3,interval:'monthly',accepted:true});
  assert.equal((await call(cookie,'/finance/recurring/run',{revision:s.revision})).status,200);
  s=(await (await call(cookie,'/finance')).json()).state;
  assert.equal((await (await call(cookie,'/billing')).json()).order,null);
  if(country==='DE'){
    const blocked=await save(`/documents/${d.id}/issue`,{confirm:true,taxScopeConfirmed:true},422);
    assert.ok(blocked.fields.includes('structured_einvoice_not_yet_validated'));return;
  }
  const issued=(await save(`/documents/${d.id}/issue`,{confirm:true,taxScopeConfirmed:true})).result;assert.equal(issued.number,'RE-2026-00001');
  await save('/settings',{...profile(country),name:'Changed branding'});assert.equal(s.documents.find(doc=>doc.id===d.id).issuer.name,'Example '+country);
  assert.equal(s.documents.find(doc=>doc.id===d.id).issuer.design.template,'minimal');
  assert.equal(s.documents.find(doc=>doc.id===d.id).issuer.accent,'#b54158');
  assert.equal(s.profile.design.template,'signature');
  await save(`/documents/${d.id}/issue`,{confirm:true,taxScopeConfirmed:true},409);
  await save(`/documents/${d.id}/payment`,{amount:'10.00',paidOn:'2026-01-02',reference:'bank'});assert.equal(s.documents.find(doc=>doc.id===d.id).payments[0].amountCents,1000);
  await save(`/documents/${d.id}/edit`,{kind:'invoice',contactId:c.id,...dates,lines:[line(country==='SI'?'22':'20')]},409);
  await save(`/documents/${d.id}/payment`,{amount:'99999.00',paidOn:'2026-01-02'},400);
  await save('/expenses',{supplier:'Vendor',reference:'INV-1',incurredOn:'2026-01-01',amount:'12.50'},201);
  await save('/expenses',{supplier:'Vendor',reference:'INV-1',incurredOn:'2026-01-01',amount:'12.50'},409);
  await save('/documents',{kind:'invoice',contactId:c.id,...dates,issueDate:'2026-99-01',lines:[line(country==='SI'?'22':'20')]},400);
  const result=await Promise.all([1,2].map(()=>call(cookie,'/finance/expenses',{revision:s.revision,supplier:'Race',reference:'same',incurredOn:'2026-01-01',amount:'1.00'})));
  assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
  assert.equal((await call(cookie,'/finance/settings',{...profile(country),revision:s.revision},{Origin:'https://evil.test'})).status,403);
});

test('PostgreSQL Finance changes persist and rollback atomically in the existing company document table',async t=>{
  const db=new PGlite();t.after(()=>db.close());const store=new PostgresStore('postgresql://unused');await store.pool.end();
  const query=async(sql,params)=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length};};store.pool={query,connect:async()=>({query,release(){}})};
  for(const name of ['001_initial','009_company_documents'])await db.exec(await readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8'));
  const company={id:randomUUID(),name:'Persistent',country:'SI'};await db.query('INSERT INTO companies(id,name,country) VALUES($1,$2,$3)',[company.id,company.name,company.country]);
  const initial=financeInitial(company);
  await store.mutateFinance(company.id,initial,s=>{s.profile.name='Saved';s.revision++;return s;});
  assert.equal((await store.companyDocument(company.id,'finance_v1')).profile.name,'Saved');
  await assert.rejects(store.mutateFinance(company.id,initial,s=>{s.profile.name='Must rollback';throw Error('test');}),/test/);
  assert.equal((await store.companyDocument(company.id,'finance_v1')).profile.name,'Saved');
  assert.equal((await store.companyDocument(company.id,'finance_v1')).revision,1);
});

test('existing HR sessions do not enable production Finance before independent permissions and billing',async t=>{
  const store=new MemoryStore(),server=createApp({store,demo:false,secret:'a'.repeat(64),origins:['http://localhost:3000']}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const registered=await fetch(origin+'/api/auth/register',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({companyName:'HR only',country:'AT',email:'hr-only@example.test',password:'correct-horse-123'})});
  assert.equal(registered.status,201);verifyAll(store);const cookie=registered.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(origin+'/api/finance',{headers:{Cookie:cookie}})).status,503);
  assert.equal((await fetch(origin+'/api/billing',{headers:{Cookie:cookie}})).status,200);
});

