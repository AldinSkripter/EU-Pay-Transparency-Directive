import { plans } from './billing.js';
export const priceKeys=plans.flatMap(p=>['monthly','annual'].map(i=>`${p.id}_${i}`));
export const defaultReturnOrigins={DE:'https://equitensa.de',AT:'https://equitensa.at',SI:'https://equitensa.si'};
export function paymentDefaults(billing,demo) {
  return {mode:demo?'sandbox':billing.secretKey?(billing.secretKey.startsWith('sk_test_')?'stripe_test':'stripe_live'):'disabled',secretKey:billing.secretKey||'',webhookSecret:billing.webhookSecret||'',prices:Object.fromEntries(priceKeys.map(k=>[k,billing.prices?.[k]||''])),returnOrigins:{...defaultReturnOrigins,...(billing.origin?{DE:billing.origin}:{})}};
}
export function paymentView(settings,revision,lastWebhook) {
  return {mode:settings.mode,prices:settings.prices,returnOrigins:settings.returnOrigins,secretKeyConfigured:!!settings.secretKey,webhookSecretConfigured:!!settings.webhookSecret,revision,lastWebhook,verifiedAt:settings.verifiedAt||null,account:settings.account||null};
}
export function paymentDraft(body,current,secure,demo) {
  if(!['disabled','sandbox','stripe_test','stripe_live'].includes(body.mode))throw new Error('INVALID_PAYMENT_SETTINGS');
  if((body.mode==='sandbox' && !demo) || (body.mode==='stripe_live' && (demo || !secure)))throw new Error('PAYMENT_MODE_UNAVAILABLE');
  const draft={...current,mode:body.mode,prices:{},returnOrigins:{}};
  for(const k of ['secretKey','webhookSecret']){
    if(body[k]!==undefined && (typeof body[k]!=='string' || body[k].length>512))throw new Error('INVALID_PAYMENT_SETTINGS');
    if(body[k])draft[k]=body[k].trim();
  }
  for(const key of priceKeys){const v=body.prices?.[key];if(typeof v!=='string' || v.length>120 || (v && !/^price_[A-Za-z0-9]+$/.test(v)))throw new Error('INVALID_PAYMENT_SETTINGS');draft.prices[key]=v;}
  for(const country of ['DE','AT','SI']){
    let url;try{url=new URL(body.returnOrigins?.[country]);}catch{throw new Error('INVALID_RETURN_ORIGIN');}
    if(url.origin!==body.returnOrigins[country] || url.protocol!=='https:' || ![ `equitensa.${country.toLowerCase()}`,`www.equitensa.${country.toLowerCase()}` ].includes(url.hostname))throw new Error('INVALID_RETURN_ORIGIN');
    draft.returnOrigins[country]=url.origin;
  }
  if(draft.mode.startsWith('stripe_')){
    const prefix=draft.mode==='stripe_live'?'sk_live_':'sk_test_';
    if(!draft.secretKey?.startsWith(prefix) || !/^sk_(test|live)_[A-Za-z0-9]+$/.test(draft.secretKey) || !/^whsec_[A-Za-z0-9]+$/.test(draft.webhookSecret||'') || priceKeys.some(k=>!draft.prices[k]))throw new Error('STRIPE_SETTINGS_INCOMPLETE');
    if(new Set(Object.values(draft.prices)).size!==6)throw new Error('DUPLICATE_STRIPE_PRICE');
  }
  return draft;
}
export async function verifyPayment(settings,stripeFetch=fetch) {
  if(!settings.mode.startsWith('stripe_'))return {account:null,verifiedAt:null};
  const get=async path=>{
    let response;try{response=await stripeFetch(`https://api.stripe.com/v1/${path}`,{headers:{Authorization:`Bearer ${settings.secretKey}`},signal:AbortSignal.timeout(15000)});}catch{throw new Error('STRIPE_CONNECTION_FAILED');}
    if(!response.ok)throw new Error('STRIPE_CONNECTION_FAILED');return response.json();
  };
  const account=await get('account');
  const results=await Promise.all(priceKeys.map(async key=>{
    const price=await get(`prices/${encodeURIComponent(settings.prices[key])}`),[planId,interval]=key.split('_'),plan=plans.find(p=>p.id===planId);
    if(price.id!==settings.prices[key] || !price.active || price.currency!=='eur' || price.unit_amount!==plan[interval]*100 || price.type!=='recurring' || price.recurring?.interval!==(interval==='annual'?'year':'month') || price.recurring.interval_count!==1 || price.recurring.usage_type!=='licensed' || price.billing_scheme!=='per_unit' || price.tax_behavior==='inclusive' || price.livemode!==(settings.mode==='stripe_live'))throw new Error('STRIPE_PRICE_MISMATCH');
    return key;
  }));
  if(!account.id || (settings.mode==='stripe_live' && !account.charges_enabled))throw new Error('STRIPE_ACCOUNT_NOT_READY');
  return {account:{id:account.id,name:account.business_profile?.name||account.settings?.dashboard?.display_name||account.id,chargesEnabled:!!account.charges_enabled},verifiedAt:new Date().toISOString(),checkedPrices:results};
}
export async function effectivePayment(control,billing,demo,req) {
  const state=await control.read(),settings=state.settings||paymentDefaults(billing,demo);
  const configured=settings.mode.startsWith('stripe_');
  let origin=settings.returnOrigins[req?.marketContext?.country||'DE'];
  if(req){const host=String(req.get('host')||'').toLowerCase();const url=new URL(origin);if(host===url.host || host===`www.${url.host}` || `www.${host}`===url.host)origin=`https://${host}`;}
  return {...billing,...settings,origin,mode:settings.mode==='sandbox'?'sandbox':configured?'stripe':'unconfigured'};
}
