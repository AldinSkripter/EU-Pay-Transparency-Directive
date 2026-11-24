import test from 'node:test';
import assert from 'node:assert/strict';
import {offerStage,updateOfferTracking} from '../shared/finance-offers.js';
test('offer workflow tracks actor and notes, expires after validity, rejects invalid transitions',()=>{
  const d={kind:'offer'},now='2026-11-15T12:00:00Z';
  assert.throws(()=>updateOfferTracking(d,{status:'accepted',note:''},'a',now),/TRANSITION/);
  for(const validUntil of ['2026-02-30','2026-11-14','invalid'])assert.throws(()=>updateOfferTracking(d,{status:'sent',validUntil,note:''},'a',now),/TRANSITION/);
  updateOfferTracking(d,{status:'sent',validUntil:'2026-11-16',note:'External email'},'a',now);
  assert.equal(offerStage(d,'2026-11-16'),'sent');assert.equal(offerStage(d,'2026-11-17'),'expired');
  assert.throws(()=>updateOfferTracking(d,{status:'accepted',note:''},'b','2026-11-17T12:00:00Z'),/TRANSITION/);
  updateOfferTracking(d,{status:'accepted',note:'Customer response'},'b',now);
  assert.equal(d.offerTracking.history.length,2);assert.equal(d.offerTracking.history[1].actor,'b');
  updateOfferTracking(d,{status:'prepared',note:'Revision requested'},'a',now);assert.equal(offerStage(d),'prepared');
  assert.throws(()=>updateOfferTracking({kind:'invoice'},{status:'sent',validUntil:'2026-11-16',note:''},'a',now),/TRANSITION/);
});
