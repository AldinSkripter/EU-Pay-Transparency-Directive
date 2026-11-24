// Finance has its own catalogue. These IDs must never grant Pay entitlements.
// Amounts are net EUR cents; real checkout is not enabled by this catalogue.
export const financePricingVersion = 'finance-2026-11-15';
export const financeMinimumTermMonths = 12;
export const financeExtraSeatMonthlyCents = 699;
export const financePlans = Object.freeze([
  Object.freeze({ id: 'finance_start', name: 'Rechnungen', monthlyCents: 799, includedSeats: 1 }),
  Object.freeze({ id: 'finance_business', name: 'Business', monthlyCents: 1999, includedSeats: 2 }),
  Object.freeze({ id: 'finance_pro', name: 'Pro', monthlyCents: 2999, includedSeats: 3 }),
]);

// An unselected demo can explore everything. A selected package is enforced.
export function financeHasFeature(planId, feature) {
  if (!planId) return true;
  const level = financePlans.findIndex(p => p.id === planId);
  if (level < 0) return false;
  return level >= ({bank:1, expenses:1, recurring:2}[feature] ?? 0);
}
export function financeRouteFeature(path, method) {
  if (method !== 'POST') return null; // Retain access to existing records/exports after a downgrade.
  if (/^\/api\/finance\/bank(?:\/|$)/.test(path)) return 'bank';
  if (/^\/api\/finance\/(expenses|receipt-scan|receipt-import)(?:\/|$)/.test(path)) return 'expenses';
  if (/^\/api\/finance\/recurring(?:\/|$)/.test(path)) return 'recurring';
  return null;
}

// paidSeats counts purchased internal seats, including the company owner.
// A restricted external accountant seat is separate and cannot be used as an
// uncharged internal user. Invitations into already purchased seats cost zero.
export function financeQuote(planId, paidSeats, interval = 'monthly') {
  const plan = financePlans.find(p => p.id === planId);
  if (!plan || !Number.isSafeInteger(paidSeats) || paidSeats < 1 || paidSeats > 1000 || (planId === 'finance_start' && paidSeats !== 1) || !['monthly', 'annual'].includes(interval)) {
    throw new Error('INVALID_FINANCE_QUOTE');
  }
  const extraSeats = Math.max(0, paidSeats - plan.includedSeats);
  const extraMonthlyCents = extraSeats * financeExtraSeatMonthlyCents;
  const monthlyCents = plan.monthlyCents + extraMonthlyCents;
  const annualCents = monthlyCents * 12;
  if (!Number.isSafeInteger(annualCents)) throw new Error('INVALID_FINANCE_QUOTE');
  return {
    version: financePricingVersion, product: 'finance', plan: plan.id,
    currency: 'EUR', taxIncluded: false, interval,
    paidSeats: Math.max(paidSeats, plan.includedSeats), includedSeats: plan.includedSeats,
    extraSeats, baseMonthlyCents: plan.monthlyCents, extraMonthlyCents,
    monthlyCents, annualCents, chargeCents: interval === 'annual' ? annualCents : monthlyCents,
    minimumTermMonths: financeMinimumTermMonths, minimumTotalCents: annualCents,
  };
}
