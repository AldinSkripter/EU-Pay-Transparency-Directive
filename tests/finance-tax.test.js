import test from 'node:test';
import assert from 'node:assert/strict';
import {taxProblems,taxNotice,availableTaxTreatments} from '../shared/finance-tax.js';
import {calculateFinance} from '../server/finance.js';

test('foreign tax treatment requires evidence and never silently applies reverse charge or exemption',()=>{
 for(const country of ['DE','AT','SI']){
  const issuer={vatId:{DE:'DE123456789',AT:'ATU12345678',SI:'SI12345678'}[country],taxId:'12345678'};
  const evidence={localVatConfirmed:true,reference:'Reviewed evidence',checkedOn:'2026-11-15',vatVerified:true,generalRuleConfirmed:true,goodsConditionsConfirmed:true,reportingConfirmed:true,transportReference:'Transport record',businessEvidence:'Registry record',smallBusinessConfirmed:true};
  for(const [mode,destination,business,rate] of [['domestic',country,false,'19'],['domestic_vat_foreign','US',false,'19'],['eu_b2b_services','NL',true,'0'],['eu_goods','NL',true,'0'],['export_goods','US',false,'0'],['non_eu_b2b_services','US',true,'0'],['small_business',country,false,'0']]){
   const isPositive=['domestic','domestic_vat_foreign'].includes(mode),actualRate=isPositive?{DE:'19',AT:'20',SI:'22'}[country]:rate;
   const calculation=calculateFinance([{description:'Supply',quantity:'2',unitPrice:'100',rate:actualRate,discountPercent:'10',unit:'h'}],country,mode);
   const d={...calculation,taxTreatment:mode,customer:{country:destination,business,vatId:destination==='NL'?'NL123456789B01':''},issueDate:'2026-11-15',taxEvidence:{...evidence,destinationCountry:destination}};
   assert.equal(d.netCents,18000);assert.equal(d.taxCents,isPositive?{DE:3420,AT:3600,SI:3960}[country]:0);
   assert.deepEqual(taxProblems(d,issuer,country),[],`${country}/${mode}`);
   if(mode!=='domestic')assert.ok(taxProblems({...d,taxEvidence:{}},issuer,country).length,mode);
   if(!isPositive)assert.ok(taxNotice(country,mode).length);
  }
  assert.deepEqual(availableTaxTreatments({country:'NL',business:true},country),['domestic_vat_foreign','eu_b2b_services','eu_goods']);
  const notVerified={taxTreatment:'eu_b2b_services',customer:{country:'NL',business:true,vatId:'DE123456789'},issueDate:'2026-11-15',lines:[{rate:'0'}],taxCents:0,taxEvidence:{...evidence,checkedOn:'2026-11-16'}};
  assert.ok(taxProblems(notVerified,issuer,country).includes('customer.vatId_format'));
  assert.ok(taxProblems(notVerified,issuer,country).includes('vat_verification_evidence'));
  assert.deepEqual(availableTaxTreatments({country:'NL',business:true,publicBody:true},country),[]);
 }
});
