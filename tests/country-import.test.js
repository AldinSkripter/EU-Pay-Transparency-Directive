import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { verifyAll } from './helpers.js';

test('DE AT SI imports retain tenant jurisdiction, normalize localized data and reject conflicting file metadata',async t=>{
  const browserOrigin='http://localhost:3000';
  const store=new MemoryStore();
  const server=createApp({store,demo:false,secret:'c'.repeat(64),origins:[browserOrigin]}).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const request=(path,cookie,body)=>fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:browserOrigin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const cookies={};
  for(const country of ['DE','AT','SI']){
    const registered=await request('/auth/register',null,{email:`${country}@example.com`,password:'correct-horse-123',companyName:`Company ${country}`,country});
    assert.equal(registered.status,201);verifyAll(store);
    cookies[country]=registered.headers.get('set-cookie').split(';')[0];
    const headers=country==='SI'?'Šifra zaposlenega;Spol;Delovno mesto;Enakovredna kategorija;Letna osnovna bruto plača;Letne plačane ure;Tedenske ure':'Personalnummer;Geschlecht;Tätigkeit;Vergleichsgruppe;Jahresgrundbezug;Bezahlte Jahresstunden;Wochenstunden';
    const csv=`${headers};reporting_country;currency;reporting_year\n001;${country==='SI'?'Ž':'weiblich'};Engineer;Engineering;60000,50;2080;38,5;${country};EUR;2026`;
    const preview=await (await request('/import/preview',cookies[country],{csv,year:2026})).json();
    assert.equal(preview.context.reportingCountry,country);
    assert.equal(preview.context.decimalSeparator,',');
    assert.deepEqual(preview.contextErrors,[]);
    assert.equal((await request('/import',cookies[country],{csv,year:2026,mapping:preview.mapping,decimalSeparator:','})).status,201);
    const result=await (await request('/analysis?year=2026',cookies[country])).json();
    assert.equal(result.company.country,country);
    assert.equal(result.analysis.count,1);
    assert.equal(result.analysis.female_count,1);
    for(const [replacement,error] of [[`;${country};USD;2026`,'IMPORT_CURRENCY_UNSUPPORTED'],[`;${country};EUR;2025`,'IMPORT_YEAR_MISMATCH'],[`;${country==='SI'?'DE':'SI'};EUR;2026`,'IMPORT_COUNTRY_MISMATCH']]){
      const invalid=await request('/import',cookies[country],{csv:csv.replace(`;${country};EUR;2026`,replacement),year:2026,mapping:preview.mapping,decimalSeparator:','});
      assert.equal(invalid.status,422);
      assert.equal((await invalid.json()).errors[0].error,error);
      assert.equal((await (await request('/analysis?year=2026',cookies[country])).json()).snapshot.id,result.snapshot.id);
    }
  }
  // A Slovenian-language file is valid for a DE tenant when it explicitly reports DE data.
  const csv='Šifra zaposlenega;Spol;Delovno mesto;Enakovredna kategorija;Letna osnovna bruto plača;Letne plačane ure;Tedenske ure;reporting_country\n002;Ž;Engineer;Engineering;61000,50;2080;40;DE';
  const preview=await (await request('/import/preview',cookies.DE,{csv,year:2026})).json();
  assert.deepEqual(preview.context.languages,['sl']);
  assert.equal(preview.context.reportingCountry,'DE');
  assert.equal((await request('/import',cookies.DE,{csv,year:2026,mapping:preview.mapping,decimalSeparator:','})).status,201);
  assert.equal((await (await request('/analysis?year=2026',cookies.SI)).json()).analysis.count,1);
});
