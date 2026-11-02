// Single source of truth for packages and the EU reporting thresholds. Imported by the server
// (billing, reporting plan) and by the browser (pricing page, size checker), so they cannot drift.

// Net B2B prices in EUR. The annual price is about 24 % below twelve monthly payments.
// Stripe prices must carry exactly these amounts; the owner panel refuses mismatching prices.
export const plans = [
  { id: 'prepare', name: 'Prepare', monthly: 99, annual: 899, limit: 250 },
  { id: 'growth', name: 'Growth', monthly: 199, annual: 1799, limit: 1000 },
  { id: 'scale', name: 'Scale', monthly: 399, annual: 3599, limit: 2500 },
];
export const annualSavingsPercent = plan => Math.round((1 - plan.annual / (plan.monthly * 12)) * 100);

// The smallest package whose employee limit covers the headcount; null above the largest limit.
export const recommendPlan = headcount => Number.isInteger(headcount) && headcount > 0 ? plans.find(plan => headcount <= plan.limit) || null : null;
export const planRange = plan => { const index = plans.indexOf(plan); return { from: index ? plans[index - 1].limit + 1 : 1, to: plan.limit }; };

// Directive (EU) 2023/970, Art. 9: 250+ annually, 150-249 every three years (both first due 7 June 2027
// for 2026), 100-149 every three years (first due 7 June 2031 for 2030). Below 100 there is no Art. 9
// duty. Member States may go further; Arts. 5 and 7 apply to employers of any size.
export function obligation(headcount) {
  if (!Number.isInteger(headcount) || headcount < 1) return null;
  if (headcount >= 250) return { band: '250+', reporting: true, frequencyYears: 1, firstDue: '2027-06-07', referenceYear: 2026 };
  if (headcount >= 150) return { band: '150-249', reporting: true, frequencyYears: 3, firstDue: '2027-06-07', referenceYear: 2026 };
  if (headcount >= 100) return { band: '100-149', reporting: true, frequencyYears: 3, firstDue: '2031-06-07', referenceYear: 2030 };
  return { band: '<100', reporting: false, frequencyYears: null, firstDue: null, referenceYear: null };
}
export function upcomingDeadlines(headcount, count = 3) {
  const duty = obligation(headcount);
  if (!duty?.reporting) return [];
  const firstYear = Number(duty.firstDue.slice(0, 4));
  return Array.from({ length: count }, (_, i) => ({ due: `${firstYear + i * duty.frequencyYears}-06-07`, referenceYear: duty.referenceYear + i * duty.frequencyYears }));
}
