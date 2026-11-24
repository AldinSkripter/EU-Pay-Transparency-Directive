import test from 'node:test';
import assert from 'node:assert/strict';
import {financePlans, financeQuote} from '../shared/finance-plans.js';
import {plans} from '../shared/plans.js';

test('Finance prices and included seats stay separate from Pay', () => {
  assert.deepEqual(financePlans.map(p => [p.monthlyCents, p.includedSeats]), [[799, 1], [1999, 2], [2999, 3]]);
  assert.ok(financePlans.every(p => !plans.some(pay => pay.id === p.id)));
  assert.throws(() => financeQuote('prepare', 1), /INVALID_FINANCE_QUOTE/);
});
test('quotes charge only extra purchased seats, using exact cents and a 12-month term', () => {
  const q = financeQuote('finance_business', 6);
  assert.equal(q.extraSeats, 4);
  assert.equal(q.monthlyCents, 4795);
  assert.equal(q.minimumTotalCents, 57540);
  assert.equal(q.minimumTermMonths, 12);
  assert.equal(financeQuote('finance_pro', 1).monthlyCents, 2999);
  assert.equal(financeQuote('finance_pro', 3).extraSeats, 0);
  assert.equal(financeQuote('finance_business', 6, 'annual').chargeCents, 57540);
  assert.equal(financeQuote('finance_start', 1, 'annual').chargeCents, 9588);
});
test('invalid seats, intervals and unsafe totals cannot become a quote', () => {
  for (const seats of [0, -1, 1.5, '2', NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => financeQuote('finance_start', seats), /INVALID_FINANCE_QUOTE/);
  }
  assert.throws(() => financeQuote('finance_start', 1, 'weekly'), /INVALID_FINANCE_QUOTE/);
});

test('every plan shows the billing-cycle charge and switching cycles keeps the annual commitment',()=>{
 for(const [i,p] of financePlans.entries()){
  const monthly=financeQuote(p.id,p.includedSeats,'monthly');
  const annual=financeQuote(p.id,p.includedSeats,'annual');
  assert.equal(annual.chargeCents,[9588,23988,35988][i]);
  assert.equal(monthly.chargeCents,p.monthlyCents);
  assert.equal(monthly.minimumTotalCents,annual.minimumTotalCents);
 }
});
