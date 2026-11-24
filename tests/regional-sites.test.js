import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {regionalSites,regionalUrl} from '../shared/regional-sites.js';

// Node fetch overrides Host; use HTTP directly to exercise virtual hosts.
function fetch(url,options={}) {
  return new Promise((resolve,reject)=>{
    const req=request(url,options,res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);
      res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(body),headers:{get:key=>Array.isArray(res.headers[key])?res.headers[key][0]:res.headers[key]}}));
    });
    req.on('error',reject);req.end(options.body);
  });
}

test('regional links preserve only the public module and never authentication parameters',()=>{
  for(const country of ['DE','AT','SI']) {
    assert.equal(regionalUrl(country,'/finance'),regionalSites[country].origin+'/finance');
    assert.equal(regionalUrl(country,'/?reset=secret'),regionalSites[country].origin+'/');
    assert.equal(regionalUrl(country,'/admin'),regionalSites[country].origin+'/');
  }
  assert.throws(()=>regionalUrl('FR'),/INVALID_COUNTRY/);
});

test('all regional hosts expose the correct public market without changing an authenticated company',async t=>{
  const app=createApp({store:new MemoryStore(),demo:true,secret:'regional-test-secret'});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const [country,locale] of [['DE','de-DE'],['AT','de-AT'],['SI','sl-SI']]) {
    const host=`equitensa.${country.toLowerCase()}`;
    for(const alias of [host,`www.${host}`]) {
      const response=await fetch(base+'/api/context',{headers:{host:alias}});
      assert.equal(response.status,200);
      assert.equal((await response.json()).market.locale,locale);
    }
  }
  const response=await fetch(base+'/api/demo',{method:'POST',headers:{host:'equitensa.si',origin:'http://equitensa.si','content-type':'application/json'},body:JSON.stringify({country:'AT'})});
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const me=await fetch(base+'/api/me',{headers:{host:'equitensa.si',cookie}});
  assert.equal((await me.json()).company.country,'AT');
  assert.equal((await fetch(base+'/api/context',{headers:{host:'equitensa.si.attacker.test'}})).status,421);
});
