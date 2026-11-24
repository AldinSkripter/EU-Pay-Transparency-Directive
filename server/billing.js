import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
export { plans } from '../shared/plans.js';
import { plans } from '../shared/plans.js';
import { contractVersion } from '../shared/plans.js';
import { contractKey, createContract, cancellationDate } from './subscription-contract.js';
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
  app.get('/api/billing',async(req,res)=>{const billing=await getBilling(req),order=await store.activeOrder(req.session.company.id);const contract=order?await store.companyDocument(req.session.company.id,contractKey(order.id)):null;res.json({plans,contractVersion,mode:billing.mode==='sandbox'?'sandbox':billing.mode==='stripe'&&billing.secretKey&&billing.webhookSecret&&billing.origin?'stripe':'unconfigured',order:order?{...order,contract}:null});});
  app.post('/api/billing/checkout',async(req,res)=> {
    const billing=await getBilling(req),sandbox=demo&&billing.mode==='sandbox';
    const plan=plans.find(p=>p.id===req.body.plan), interval=req.body.interval;
    if (!plan || !['monthly','annual'].includes(interval) || req.body.accepted !== true) return res.status(400).json({error:'INVALID_ORDER'});
    if(req.body.contractVersion!==contractVersion)return res.status(400).json({error:'CONTRACT_ACCEPTANCE_REQUIRED'});
    const existing=await store.activeOrder(req.session.company.id);
    if (existing?.mode==='stripe' && !['cancelled','canceled','incomplete_expired'].includes(existing.status)) return res.status(409).json({error:'SUBSCRIPTION_ALREADY_EXISTS'});
    if (!sandbox && (billing.mode!=='stripe' || !billing.secretKey || !billing.webhookSecret || !billing.origin || !billing.prices?.[`${plan.id}_${interval}`])) return res.status(503).json({error:'BILLING_NOT_CONFIGURED'});
    if(!sandbox){
      const priceId=billing.prices[`${plan.id}_${interval}`];
      const response=await stripeFetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`,{headers:{Authorization:`Bearer ${billing.secretKey}`},signal:AbortSignal.timeout(15000)});
      const price=await response.json();
      if(!response.ok||price.id!==priceId||!price.active||price.currency!=='eur'||price.unit_amount!==plan[interval]*100||price.type!=='recurring'||price.recurring?.interval!==(interval==='annual'?'year':'month')||price.recurring?.interval_count!==1||price.recurring?.usage_type!=='licensed'||price.billing_scheme!=='per_unit'||price.tax_behavior==='inclusive'||price.livemode!==billing.secretKey.startsWith('sk_live_'))return res.status(503).json({error:'STRIPE_PRICE_MISMATCH'});
    }
    const order={id:randomUUID(),company_id:req.session.company.id,plan:plan.id,mode:sandbox?'sandbox':'stripe',stripe_environment:sandbox?null:billing.secretKey.startsWith('sk_test_')?'test':'live',status:'pending',interval};
    await store.createOrder(order);
    const contract=createContract(plan,interval,req.session.user.id);
    await store.saveCompanyDocument(order.company_id,contractKey(order.id),contract);
    await store.audit(order.company_id,'subscription_contract_accepted',{order_id:order.id,...contract});
    if (sandbox) return res.status(201).json({order, mode:'sandbox'});
    const body=new URLSearchParams({mode:'subscription','line_items[0][price]':billing.prices[`${plan.id}_${interval}`],'line_items[0][quantity]':'1',client_reference_id:order.id,customer_email:req.session.user.email,success_url:`${billing.origin}/?checkout=success`,cancel_url:`${billing.origin}/?checkout=cancelled`,'automatic_tax[enabled]':'true','billing_address_collection':'required','tax_id_collection[enabled]':'true'});
    body.set('subscription_data[metadata][contract_version]',contractVersion);
    body.set('subscription_data[metadata][minimum_months]','12');
    body.set('subscription_data[metadata][order_id]',order.id);
    body.set('custom_text[submit][message]',`Minimum term: 12 months. ${interval==='monthly'?'12 monthly payments':'Annual payment'}; minimum total EUR ${contract.minimumNetTotal} excluding VAT. Cancellation effective no earlier than the end of the minimum term; then at the end of the billing period.`);
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
    const contract=await store.companyDocument(order.company_id,contractKey(order.id));
    if(contract&&!contract.startedAt)await store.saveCompanyDocument(order.company_id,contractKey(order.id),{...contract,startedAt:new Date().toISOString()});
    res.json({ok:true});
  });
  app.post('/api/billing/portal',async(req,res)=> {
    const billing=await getBilling(req);
    const order=await store.activeOrder(req.session.company.id);
    if (!order || order.mode!=='stripe' || !order.provider_subscription || !billing.secretKey || !billing.origin) return res.status(400).json({error:'NO_PAID_SUBSCRIPTION'});
    const subscriptionResponse=await stripeFetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(order.provider_subscription)}`,{headers:{Authorization:`Bearer ${billing.secretKey}`},signal:AbortSignal.timeout(15000)});
    const subscription=await subscriptionResponse.json();
    if (!subscriptionResponse.ok || !subscription.customer) return res.status(502).json({error:'BILLING_UNAVAILABLE'});
    const contract=await store.companyDocument(order.company_id,contractKey(order.id));
    let configuration;
    if(contract){
      const configured=await stripeFetch('https://api.stripe.com/v1/billing_portal/configurations',{method:'POST',headers:{Authorization:`Bearer ${billing.secretKey}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({'features[invoice_history][enabled]':'true','features[payment_method_update][enabled]':'true','features[subscription_cancel][enabled]':'false','features[subscription_update][enabled]':'false'}),signal:AbortSignal.timeout(15000)});
      const config=await configured.json();if(!configured.ok||!config.id)return res.status(502).json({error:'BILLING_UNAVAILABLE'});configuration=config.id;
    }
    const response=await stripeFetch('https://api.stripe.com/v1/billing_portal/sessions',{method:'POST',headers:{Authorization:`Bearer ${billing.secretKey}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({customer:subscription.customer,return_url:billing.origin,...(configuration?{configuration}:{})}),signal:AbortSignal.timeout(15000)});
    const portal=await response.json();
    if (!response.ok) return res.status(502).json({error:'BILLING_UNAVAILABLE'});
    res.json({url:portal.url});
  });
  const cancel = async (req,res,commit) => {
    const config=await getBilling(req),companyId=req.session.company.id,order=await store.activeOrder(companyId);
    if(!order||!['active','sandbox_active','past_due'].includes(order.status))return res.status(400).json({error:'NO_PAID_SUBSCRIPTION'});
    const key=contractKey(order.id),contract=await store.companyDocument(companyId,key);
    if(!contract)return res.status(409).json({error:'CONTRACT_NOT_AVAILABLE'});
    if(commit && (req.body.confirm!==true || req.body.orderId!==order.id))return res.status(400).json({error:'INVALID_ORDER'});
    let subscription;
    if(order.mode==='stripe'){
      if(!config.secretKey||!order.provider_subscription)return res.status(503).json({error:'BILLING_NOT_CONFIGURED'});
      const response=await stripeFetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(order.provider_subscription)}`,{headers:{Authorization:`Bearer ${config.secretKey}`},signal:AbortSignal.timeout(15000)});
      subscription=await response.json();if(!response.ok||subscription.id!==order.provider_subscription)return res.status(502).json({error:'BILLING_UNAVAILABLE'});
    }else if(!demo||config.mode!=='sandbox')return res.status(400).json({error:'INVALID_ORDER'});
    let at;
    try{at=contract.cancelAt?new Date(contract.cancelAt):cancellationDate(contract,subscription);}catch{return res.status(409).json({error:'CONTRACT_DATES_UNAVAILABLE'});}
    if(commit&&!contract.cancelAt){
      if(subscription){
        const response=await stripeFetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(order.provider_subscription)}`,{method:'POST',headers:{Authorization:`Bearer ${config.secretKey}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`cancel-${order.id}`},body:new URLSearchParams({cancel_at:String(Math.floor(at.getTime()/1000))}),signal:AbortSignal.timeout(15000)});
        const result=await response.json();if(!response.ok||result.cancel_at!==Math.floor(at.getTime()/1000))return res.status(502).json({error:'BILLING_UNAVAILABLE'});
      }
      await store.saveCompanyDocument(companyId,key,{...contract,cancelAt:at.toISOString(),cancellationRequestedAt:new Date().toISOString()});
      await store.audit(companyId,'subscription_cancellation_scheduled',{order_id:order.id,cancel_at:at.toISOString(),user_id:req.session.user.id});
    }
    return res.json({orderId:order.id,cancelAt:at.toISOString(),minimumMonths:12,scheduled:commit||!!contract.cancelAt,mode:order.mode});
  };
  app.get('/api/billing/cancellation',async(req,res)=>cancel(req,res,false));
  app.post('/api/billing/cancellation',async(req,res)=>cancel(req,res,true));
}
