import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('handoff core routes exist and all schema references resolve',async()=>{
 const spec=JSON.parse(await readFile(new URL('../docs/app-dev/openapi.json',import.meta.url)));
 const inventory=JSON.parse(await readFile(new URL('../docs/app-dev/routes.json',import.meta.url)));
 for(const [path,methods] of Object.entries(spec.paths))for(const [method,operation] of Object.entries(methods)){
  const route=inventory.routes.find(r=>r.method===method.toUpperCase()&&r.path.replace('/api','').replace(/:([a-zA-Z]+)/g,'{$1}')===path);assert.ok(route,`${method} ${path}`);
  const source=await readFile(new URL('../'+route.source,import.meta.url),'utf8');assert.ok(source.includes(`app.${method}('${route.path}'`));
  if(method==='post')assert.ok(operation.parameters.some(p=>p.name==='Origin'&&p.required));
 }
 const walk=value=>{if(!value||typeof value!=='object')return;if(value.$ref){assert.ok(value.$ref.startsWith('#/components/schemas/'));assert.ok(spec.components.schemas[value.$ref.split('/').at(-1)]);}for(const child of Object.values(value))walk(child);};walk(spec);
 assert.equal(spec.components.securitySchemes.webSession.in,'cookie');assert.equal(Object.keys(spec.paths).some(p=>p.startsWith('/oauth')),false);
});
