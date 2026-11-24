export function offerStage(document,today=new Date().toISOString().slice(0,10)){
  const status=document.offerTracking?.status||'prepared';
  return status==='sent'&&document.offerTracking.validUntil<today?'expired':status;
}
export function updateOfferTracking(document,body,actor,now=new Date().toISOString()){
  const fail=()=>{throw Object.assign(new Error('FINANCE_OFFER_TRANSITION'),{status:409});};
  if(document.kind!=='offer')fail();
  const status=document.offerTracking?.status||'prepared',next=body.status,today=now.slice(0,10);
  if(!({prepared:['sent'],sent:['accepted','rejected','prepared'],accepted:['prepared'],rejected:['prepared']}[status]||[]).includes(next))fail();
  if(typeof body.note!=='string'||body.note.length>1000)fail();
  let validUntil=document.offerTracking?.validUntil||null;
  if(next==='sent'){
    validUntil=body.validUntil;
    if(typeof validUntil!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)||!Number.isFinite(Date.parse(validUntil+'T00:00:00Z'))||new Date(validUntil+'T00:00:00Z').toISOString().slice(0,10)!==validUntil||validUntil<today)fail();
  }
  if(next==='accepted'&&validUntil<today)fail();
  const history=document.offerTracking?.history||[];
  if(history.length>=100)fail();
  // Internal record only: this does not send a document or verify customer consent.
  document.offerTracking={status:next,validUntil,history:[...history,{from:status,to:next,at:now,actor,note:body.note.trim()}]};
  return document;
}
