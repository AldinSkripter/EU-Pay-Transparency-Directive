export const agingBuckets=['current','1-30','31-60','61-90','90+'];
const day=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('FINANCE_INVALID_DATE');
  const time=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw new Error('FINANCE_INVALID_DATE');
  return time/86400000;
};
// Current ledger snapshot, not a historical accounting reconstruction.
export function financeReceivables(documents,asOf=new Date().toISOString().slice(0,10)){
  const today=day(asOf),buckets=Object.fromEntries(agingBuckets.map(key=>[key,0])),customers=new Map();
  const rows=documents.filter(d=>d.kind==='invoice'&&d.status==='issued'&&day(d.issueDate)<=today).flatMap(d=>{
    const paidCents=d.payments.filter(p=>day(p.paidOn)<=today).reduce((sum,p)=>sum+p.amountCents,0);
    const outstandingCents=Math.max(0,d.grossCents-paidCents);
    if(!outstandingCents)return [];
    const daysOverdue=Math.max(0,today-day(d.dueDate));
    const bucket=daysOverdue===0?'current':daysOverdue<=30?'1-30':daysOverdue<=60?'31-60':daysOverdue<=90?'61-90':'90+';
    const row={id:d.id,contactId:d.contactId,customerName:d.customer.name,number:d.number,issueDate:d.issueDate,dueDate:d.dueDate,grossCents:d.grossCents,paidCents,outstandingCents,daysOverdue,bucket};
    buckets[bucket]+=outstandingCents;
    const customer=customers.get(d.contactId)||{contactId:d.contactId,name:d.customer.name,count:0,outstandingCents:0,overdueCents:0};
    customer.count++;customer.outstandingCents+=outstandingCents;if(daysOverdue)customer.overdueCents+=outstandingCents;
    customers.set(d.contactId,customer);return [row];
  }).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id));
  return {asOf,currency:'EUR',rows,buckets,customers:[...customers.values()].sort((a,b)=>b.outstandingCents-a.outstandingCents),outstandingCents:rows.reduce((s,r)=>s+r.outstandingCents,0),overdueCents:rows.filter(r=>r.daysOverdue>0).reduce((s,r)=>s+r.outstandingCents,0),dueSoonCents:rows.filter(r=>day(r.dueDate)>=today&&day(r.dueDate)<=today+7).reduce((s,r)=>s+r.outstandingCents,0)};
}
export function receivablesCsv(report,contactId){
  const cell=value=>'"'+String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['as_of','customer','invoice','issued','due','gross_eur','paid_eur','open_eur','days_overdue','aging_bucket'],...report.rows.filter(r=>!contactId||r.contactId===contactId).map(r=>[report.asOf,r.customerName,r.number,r.issueDate,r.dueDate,(r.grossCents/100).toFixed(2),(r.paidCents/100).toFixed(2),(r.outstandingCents/100).toFixed(2),r.daysOverdue,r.bucket])];
  return '\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
