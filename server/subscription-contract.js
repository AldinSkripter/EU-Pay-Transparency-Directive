import { contractVersion, minimumTermMonths } from '../shared/plans.js';
export const contractKey = id => `bc_${id}`;
export function createContract(plan, interval, userId, now = new Date()) {
  return {version:contractVersion,minimumMonths:minimumTermMonths,acceptedAt:now.toISOString(),acceptedBy:userId,plan:plan.id,interval,currency:'EUR',netCharge:plan[interval],minimumNetTotal:plan.monthly*12,employeeLimit:plan.limit,renewal:interval==='annual'?'annual':'monthly',startedAt:null,cancelAt:null};
}
export function anniversary(start) {
  const d=new Date(start),day=d.getUTCDate();
  if(!Number.isFinite(d.getTime()))throw new Error('INVALID_CONTRACT_START');
  d.setUTCDate(1);d.setUTCFullYear(d.getUTCFullYear()+1);
  d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));
  return d;
}
export function cancellationDate(contract, subscription, now = Date.now()) {
  if(!contract || contract.minimumMonths!==12)throw new Error('CONTRACT_NOT_AVAILABLE');
  const start=subscription?.start_date ? new Date(subscription.start_date*1000) : contract.startedAt ? new Date(contract.startedAt) : null;
  const period=subscription?.items?.data?.[0]?.current_period_end ?? subscription?.current_period_end;
  if(!start || !Number.isFinite(start.getTime()) || (subscription && !Number.isSafeInteger(period)))throw new Error('CONTRACT_DATES_UNAVAILABLE');
  const minimum=anniversary(start).getTime();
  if(subscription)return new Date(Math.max(minimum,period*1000,now));
  if(now<minimum)return new Date(minimum);
  const next=new Date(start),months=contract.interval==='annual'?12:1;
  // Simulation only: advance anchored periods with end-of-month clamping.
  let offset=0;
  while(next.getTime()<=now){offset+=months;next.setTime(start.getTime());const day=next.getUTCDate();next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+offset);next.setUTCDate(Math.min(day,new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate()));}
  return next;
}
