import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
export { plans } from '../shared/plans.js';
import { plans } from '../shared/plans.js';
export function subscriptionPlan(subscription, prices = {}) {
  const items=subscription?.items?.data;
  if (!Array.isArray(items) || items.length!==1 || items[0].quantity!==1) return null;
  const price=items[0].price?.id;
  const matches=plans.flatMap(plan=>['monthly','annual'].map(interval=>({plan:plan.id,interval,key:`${plan.id}_${interval}`}))).filter(p=>price && prices[p.key]===price);
  if (matches.length!==1) return null;
  return {plan:matches[0].plan,interval:matches[0].interval};
}
export function verifyStripeEvent(raw, signature, secret, now = Date.now()) {
  const fields = String(signature || '').split(',').map(s=>s.split('='));
  const timestamp = fields.find(([k])=>k==='t')?.[1];
  if (!secret || !timestamp || Math.abs(now/1000-Number(timestamp)) > 300) throw new Error('INVALID_SIGNATURE');
  const expected=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest();
  const valid=fields.filter(([k])=>k==='v1').some(([,v])=> { const b=Buffer.from(v || '', 'hex'); return b.length===expected.length && timingSafeEqual(b,expected); });
  if (!valid) throw new Error('INVALID_SIGNATURE');
  return JSON.parse(raw.toString());
}
export function billingRoutes(app, {store,demo,billing,getBilling=async()=>({...billing,mode:demo?'sandbox':'stripe'}),stripeFetch=fetch}) {
  app.get('/api/billing',async(req,res)=>{const billing=await getBilling(req);res.json({plans,mode:billing.mode==='sandbox'?'sandbox':billing.mode==='stripe'&&billing.secretKey&&billing.webhookSecret&&billing.origin?'stripe':'unconfigured',order:await store.activeOrder(req.session.company.id)});});
  app.post('/api/billing/checkout',async(req,res)=> {
    const billing=await getBilling(req),sandbox=demo&&billing.mode==='sandbox';
    const plan=plans.find(p=>p.id===req.body.plan), interval=req.body.interval;
    if (!plan || !['monthly','annual'].includes(interval) || req.body.accepted !== true) return res.status(400).json({error:'INVALID_ORDER'});
    const existing=await store.activeOrder(req.session.company.id);
    if (existing?.mode==='stripe' && !['cancelled','canceled','incomplete_expired'].includes(existing.status)) return res.status(409).json({error:'SUBSCRIPTION_ALREADY_EXISTS'});
    if (!sandbox && (billing.mode!=='stripe' || !billing.secretKey || !billing.webhookSecret || !billing.origin || !billing.prices?.[`${plan.id}_${interval}`])) return res.status(503).json({error:'BILLING_NOT_CONFIGURED'});
    const order={id:randomUUID(),company_id:req.session.company.id,plan:plan.id,mode:sandbox?'sandbox':'stripe',stripe_environment:sandbox?null:billing.secretKey.startsWith('sk_test_')?'test':'live',status:'pending',interval};
    await store.createOrder(order);
    if (sandbox) return res.status(201).json({order, mode:'sandbox'});
    const body=new URLSearchParams({mode:'subscription','line_items[0][price]':billing.prices[`${plan.id}_${interval}`],'line_items[0][quantity]':'1',client_reference_id:order.id,customer_email:req.session.user.email,success_url:`${billing.origin}/?checkout=success`,cancel_url:`${billing.origin}/?checkout=cancelled`,'automatic_tax[enabled]':'true','billing_address_collection':'required','tax_id_collection[enabled]':'true'});
    const response=await stripeFetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${billing.secretKey}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':order.id},body,signal:AbortSignal.timeout(15000)});
    const session=await response.json();
    if (!response.ok) return res.status(502).json({error:'CHECKOUT_UNAVAILABLE'});
    await store.linkOrder(order.id,session.id);
    res.status(201).json({url:session.url,mode:'stripe'});
  });
  app.post('/api/billing/sandbox-confirm',async(req,res)=> {
    if (!demo || (await getBilling(req)).mode!=='sandbox') return res.status(404).json({error:'NOT_FOUND'});
    if (!/^[a-f0-9-]{36}$/i.test(req.body.orderId || '')) return res.status(400).json({error:'INVALID_ORDER'});
    const order=await store.order(req.body.orderId);
    if(!order || order.company_id!==req.session.company.id || order.mode!=='sandbox')return res.status(400).json({error:'INVALID_ORDER'});
    const activated=await store.applyBillingEvent(`sandbox:${req.body.orderId}`,{orderId:req.body.orderId,companyId:req.session.company.id,status:'sandbox_active'});
    if (!activated) return res.status(400).json({error:'INVALID_ORDER'});
    res.json({ok:true});
  });
  app.post('/api/billing/portal',async(req,res)=> {
    const billing=await getBilling(req);
    const order=await store.activeOrder(req.session.company.id);
    if (!order || order.mode!=='stripe' || !order.provider_subscription || !billing.secretKey || !billing.origin) return res.status(400).json({error:'NO_PAID_SUBSCRIPTION'});
    const subscriptionResponse=await stripeFetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(order.provider_subscription)}`,{headers:{Authorization:`Bearer ${billing.secretKey}`},signal:AbortSignal.timeout(15000)});
    const subscription=await subscriptionResponse.json();
    if (!subscriptionResponse.ok || !subscription.customer) return res.status(502).json({error:'BILLING_UNAVAILABLE'});
    const response=await stripeFetch('https://api.stripe.com/v1/billing_portal/sessions',{method:'POST',headers:{Authorization:`Bearer ${billing.secretKey}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({customer:subscription.customer,return_url:billing.origin}),signal:AbortSignal.timeout(15000)});
    const portal=await response.json();
    if (!response.ok) return res.status(502).json({error:'BILLING_UNAVAILABLE'});
    res.json({url:portal.url});
  });
}
