import test from 'node:test';
import assert from 'node:assert/strict';
import {financeJurisdictions} from '../shared/finance-jurisdictions.js';
test('country configuration describes invoice formats without tax submission features',()=>{
 for(const country of Object.values(financeJurisdictions)){
  assert.equal(country.portal,undefined);
  assert.equal(country.taxForm,undefined);
 }
 assert.match(financeJurisdictions.AT.available,/ebInterface/);
 assert.match(financeJurisdictions.SI.available,/e-SLOG/);
 assert.match(financeJurisdictions.SI.missing,/UJP/);
});
