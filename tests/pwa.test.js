import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
test('PWA manifest contains same-origin module shortcuts and correctly sized PNG icons',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url)));
 assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');
 assert.deepEqual(manifest.shortcuts.map(s=>s.url),['/','/finance']);
 for(const icon of manifest.icons){const bytes=await readFile(new URL('../public'+icon.src,import.meta.url));assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);}
});
test('service worker bypasses API/mutations and caches only the public offline notice',async()=>{
 const handlers={},written=[];let offline=false;
 const notice={offline:true},context={URL,Response,self:{location:{origin:'https://example.com'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>({add:async path=>written.push(path)}),match:async()=>notice,keys:async()=>[],delete:async()=>{}},fetch:async()=>{if(offline)throw Error('offline');return {network:true};}};
 runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 let install;handlers.install({waitUntil:p=>install=p});await install;assert.deepEqual(written,['/offline.html']);
 for(const [path,method,mode] of [['/api/reports/pdf','GET','navigate'],['/api/finance','POST','cors'],['/assets/app.js','GET','cors']]){let intercepted=false;handlers.fetch({request:{url:'https://example.com'+path,method,mode},respondWith:()=>intercepted=true});assert.equal(intercepted,false);}
 let response;const event={request:{url:'https://example.com/finance',method:'GET',mode:'navigate'},respondWith:p=>response=p};handlers.fetch(event);assert.equal((await response).network,true);
 offline=true;handlers.fetch(event);assert.equal(await response,notice);assert.deepEqual(written,['/offline.html']);
});
