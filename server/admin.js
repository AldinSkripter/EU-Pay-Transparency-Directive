import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, hashToken } from './auth.js';
import { ownerToken, ownerCookie, loginOwner, publicOwner, addOwner, completeOwnerSetup, revokeOwnerSessions, mfaSecret, verifyTotp } from './owner-auth.js';
import { controlAudit } from './control-store.js';
import { paymentDefaults, paymentView, paymentDraft, verifyPayment } from './payment-config.js';
import { plans } from './billing.js';
import { googleAdminRoutes } from './google-config.js';

export function adminRoutes(app,{control,store,billing,demo,secure,stripeFetch,requireMfa=secure}) {
  const router=express.Router();
  const loginLimit=rateLimit({windowMs:15*60_000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
  const checkedOwner=async(req,res,next)=>{
    const state=await control.read(),token=ownerToken(req),session=token?state.sessions[hashToken(token)]:null;
    const owner=session?.expiresAt>Date.now()?state.owners.find(o=>o.id===session.ownerId && o.enabled):null;
    if(!owner)return res.status(401).json({error:'OWNER_AUTH_REQUIRED'});
    req.owner=owner;req.ownerSession=session;next();
  };
  const editable=async(req,res,next)=>{
    if(req.owner.role!=='owner')return res.status(403).json({error:'OWNER_WRITE_REQUIRED'});
    if(typeof req.body.currentPassword!=='string' || req.body.currentPassword.length>128 || !await verifyPassword(req.body.currentPassword,req.owner.password_hash))return res.status(403).json({error:'OWNER_PASSWORD_REQUIRED'});
    next();
  };
  router.get('/auth/status',async(req,res)=>res.json({initialized:(await control.read()).owners.some(o=>o.enabled),demo}));
  router.post('/auth/setup',loginLimit,async(req,res)=>{
    await completeOwnerSetup(control,req.body.token,req.body.email,req.body.password);
    const result=await loginOwner(control,req.body.email,req.body.password);
    res.cookie('equitensa_owner',result.token,ownerCookie(secure));res.status(201).json({owner:result.owner});
  });
  router.post('/auth/login',loginLimit,async(req,res)=>{
    if(typeof req.body.email!=='string' || req.body.email.length>255 || typeof req.body.password!=='string' || req.body.password.length>128 || (req.body.code!==undefined && (typeof req.body.code!=='string' || req.body.code.length>40)))return res.status(400).json({error:'INVALID_OWNER_LOGIN'});
    let result;try{result=await loginOwner(control,req.body.email,req.body.password,req.body.code);}catch(e){if(e.message==='INVALID_OWNER_LOGIN')return res.status(401).json({error:e.message});throw e;}
    const old=ownerToken(req);if(old)await control.mutate(s=>{delete s.sessions[hashToken(old)];});
    res.cookie('equitensa_owner',result.token,ownerCookie(secure));res.json({owner:result.owner});
  });
  router.use(checkedOwner);
  router.get('/me',(req,res)=>res.json({owner:publicOwner(req.owner),mfaRequired:requireMfa&&!req.owner.mfaSecret,demo}));
  router.post('/auth/logout',async(req,res)=>{
    await control.mutate(s=>{delete s.sessions[hashToken(ownerToken(req))];controlAudit(s,req.owner.email,'owner_logout');});
    res.clearCookie('equitensa_owner',ownerCookie(secure));res.json({ok:true});
  });
  router.post('/auth/password',loginLimit,async(req,res)=>{
    if(typeof req.body.currentPassword!=='string' || req.body.currentPassword.length>128 || !await verifyPassword(req.body.currentPassword,req.owner.password_hash))return res.status(403).json({error:'OWNER_PASSWORD_REQUIRED'});
    if(typeof req.body.password!=='string' || req.body.password.length<14 || req.body.password.length>128)return res.status(400).json({error:'INVALID_OWNER'});
    const password_hash=await hashPassword(req.body.password);
    await control.mutate(s=>{const owner=s.owners.find(o=>o.id===req.owner.id);owner.password_hash=password_hash;revokeOwnerSessions(s,owner.id);controlAudit(s,req.owner.email,'owner_password_changed');});
    res.clearCookie('equitensa_owner',ownerCookie(secure));res.json({ok:true});
  });
  router.post('/auth/mfa/start',loginLimit,async(req,res)=>{
    if(typeof req.body.currentPassword!=='string' || req.body.currentPassword.length>128 || !await verifyPassword(req.body.currentPassword,req.owner.password_hash))return res.status(403).json({error:'OWNER_PASSWORD_REQUIRED'});
    if(req.owner.mfaSecret)return res.status(409).json({error:'MFA_ALREADY_ENABLED'});
    const secret=mfaSecret();await control.mutate(s=>{s.owners.find(o=>o.id===req.owner.id).pendingMfa={secret,expiresAt:Date.now()+600_000};});
    res.json({secret,uri:`otpauth://totp/Equitensa:${encodeURIComponent(req.owner.email)}?secret=${secret}&issuer=Equitensa&algorithm=SHA1&digits=6&period=30`});
  });
  router.post('/auth/mfa/confirm',loginLimit,async(req,res)=>{
    const backups=Array.from({length:8},()=>randomBytes(8).toString('hex'));
    await control.mutate(s=>{const owner=s.owners.find(o=>o.id===req.owner.id),pending=owner.pendingMfa;
      const step=pending?.expiresAt>Date.now()?verifyTotp(pending.secret,req.body.code):null;
      if(step===null)throw new Error('INVALID_MFA_CODE');
      owner.mfaSecret=pending.secret;owner.lastMfaStep=step;owner.backupHashes=backups.map(hashToken);delete owner.pendingMfa;
      revokeOwnerSessions(s,owner.id);controlAudit(s,owner.email,'owner_mfa_enabled');
    });res.clearCookie('equitensa_owner',ownerCookie(secure));res.json({backupCodes:backups});
  });
  // By default a production owner must enroll MFA before accessing platform data or changing payments.
  // ADMIN_REQUIRE_MFA=false makes it optional; enrolled owners are still challenged at login.
  router.use((req,res,next)=>requireMfa&&!req.owner.mfaSecret?res.status(403).json({error:'OWNER_MFA_REQUIRED'}):next());
  googleAdminRoutes(router,{control,demo,editable});
  router.get('/overview',async(req,res)=>{
    const [state,overview]=await Promise.all([control.read(),store.adminOverview()]);
    const settings=state.settings||paymentDefaults(billing,demo);
    res.json({...overview,suspendedCount:Object.keys(state.suspended).length,owners:state.owners.filter(o=>o.enabled).length,payments:paymentView(settings,state.revision,state.lastWebhook),plans});
  });
  router.get('/companies',async(req,res)=>{
    const q=String(req.query.q||'').slice(0,200),page=Math.max(1,Math.min(100000,Number(req.query.page)||1));
    if(!Number.isInteger(page))return res.status(400).json({error:'INVALID_PAGE'});
    const result=await store.adminCompanies(q,page),state=await control.read();
    res.json({...result,companies:result.companies.map(c=>({...c,suspension:state.suspended[c.id]||null}))});
  });
  router.post('/companies/:id/access',editable,async(req,res)=>{
    if(!/^[a-f0-9-]{36}$/i.test(req.params.id) || typeof req.body.suspended!=='boolean' || typeof req.body.reason!=='string' || req.body.reason.length>500 || (req.body.suspended && req.body.reason.trim().length<5))return res.status(400).json({error:'INVALID_ACCESS_CHANGE'});
    if(!await store.adminCompanyExists(req.params.id))return res.status(404).json({error:'COMPANY_NOT_FOUND'});
    await control.mutate(s=>{if(req.body.suspended)s.suspended[req.params.id]={reason:req.body.reason.trim(),at:new Date().toISOString(),by:req.owner.email};else delete s.suspended[req.params.id];controlAudit(s,req.owner.email,req.body.suspended?'company_suspended':'company_restored',{companyId:req.params.id,reason:req.body.reason.trim()});});
    res.json({ok:true});
  });
  router.get('/payments',async(req,res)=>{const s=await control.read();res.json(paymentView(s.settings||paymentDefaults(billing,demo),s.revision,s.lastWebhook));});
  router.post('/payments/retire-tests',editable,async(req,res)=>{
    const state=await control.read(),settings=state.settings||paymentDefaults(billing,demo);
    if(settings.mode!=='stripe_test' || req.body.confirm!==true)return res.status(400).json({error:'INVALID_PAYMENT_SETTINGS'});
    const count=await store.retireTestOrders();await control.mutate(s=>controlAudit(s,req.owner.email,'stripe_test_orders_retired',{count}));res.json({count});
  });
  router.post('/payments/verify',editable,async(req,res)=>{
    const s=await control.read(),draft=paymentDraft(req.body,s.settings||paymentDefaults(billing,demo),secure,demo);
    res.json(await verifyPayment(draft,stripeFetch));
  });
  router.post('/payments',editable,async(req,res)=>{
    const s=await control.read();
    if(req.body.revision!==s.revision)return res.status(409).json({error:'SETTINGS_CHANGED'});
    const draft=paymentDraft(req.body,s.settings||paymentDefaults(billing,demo),secure,demo),verified=await verifyPayment(draft,stripeFetch);
    const existing=s.settings||paymentDefaults(billing,demo),overview=await store.adminOverview();
    if(overview.stripeOrders>0 && ((draft.mode!=='disabled' && draft.mode!==(existing.stripeMode||existing.mode)) || (verified.account && existing.account && verified.account.id!==existing.account.id) || (!existing.account && draft.secretKey!==existing.secretKey) || JSON.stringify(existing.prices)!==JSON.stringify(draft.prices)))throw new Error('STRIPE_ACCOUNT_LOCKED');
    const result=await control.mutate(state=>{
      if(req.body.revision!==state.revision)throw new Error('SETTINGS_CHANGED');
      const previous=state.settings||paymentDefaults(billing,demo);
      // Explicit secret rotation keeps the previous signing secret for 24 hours.
      if(previous.mode.startsWith('stripe_') && (previous.mode!==draft.mode || previous.secretKey!==draft.secretKey || previous.webhookSecret!==draft.webhookSecret || JSON.stringify(previous.prices)!==JSON.stringify(draft.prices)) && req.body.confirmRotation!==true)throw new Error('ROTATION_CONFIRMATION_REQUIRED');
      state.settings={...draft,...verified,stripeMode:draft.mode.startsWith('stripe_')?draft.mode:previous.stripeMode||previous.mode,account:verified.account||previous.account||null};state.revision++;
      if(previous.webhookSecret && previous.webhookSecret!==draft.webhookSecret)state.settings.previousWebhooks=[...(previous.previousWebhooks||[]).filter(s=>s.expiresAt>Date.now()),{secret:previous.webhookSecret,expiresAt:Date.now()+86400_000}];
      if(previous.webhookSecret!==draft.webhookSecret || previous.mode!==draft.mode)state.lastWebhook=null;
      controlAudit(state,req.owner.email,'payment_settings_saved',{mode:draft.mode,revision:state.revision,secretKeyChanged:previous.secretKey!==draft.secretKey,webhookSecretChanged:previous.webhookSecret!==draft.webhookSecret});
      return paymentView(state.settings,state.revision,state.lastWebhook);
    });res.json(result);
  });
  router.get('/owners',async(req,res)=>res.json({owners:(await control.read()).owners.map(publicOwner)}));
  router.post('/owners',editable,async(req,res)=>res.status(201).json({owner:await addOwner(control,req.body.email,req.body.password,req.body.role,req.owner.email)}));
  router.post('/owners/:id/access',editable,async(req,res)=>{
    if(typeof req.body.enabled!=='boolean')return res.status(400).json({error:'INVALID_OWNER'});
    await control.mutate(s=>{const owner=s.owners.find(o=>o.id===req.params.id);if(!owner)throw new Error('OWNER_NOT_FOUND');
      if(!req.body.enabled && owner.role==='owner' && owner.enabled && s.owners.filter(o=>o.role==='owner'&&o.enabled).length<=1)throw new Error('LAST_OWNER');
      owner.enabled=req.body.enabled;revokeOwnerSessions(s,owner.id);controlAudit(s,req.owner.email,owner.enabled?'owner_enabled':'owner_disabled',{ownerId:owner.id});
    });res.json({ok:true});
  });
  router.get('/audit',async(req,res)=>{
    const page=Math.max(1,Math.min(100000,Number(req.query.page)||1));if(!Number.isInteger(page))return res.status(400).json({error:'INVALID_PAGE'});
    const events=(await control.read()).audit.slice().reverse();res.json({events:events.slice((page-1)*30,page*30),total:events.length,page});
  });
  router.use((req,res)=>res.status(404).json({error:'NOT_FOUND'}));
  router.use((error,req,res,next)=>{
    const codes=['INVALID_OWNER','EMAIL_EXISTS','INVALID_PAYMENT_SETTINGS','PAYMENT_MODE_UNAVAILABLE','INVALID_RETURN_ORIGIN','STRIPE_SETTINGS_INCOMPLETE','DUPLICATE_STRIPE_PRICE','STRIPE_CONNECTION_FAILED','STRIPE_PRICE_MISMATCH','STRIPE_ACCOUNT_NOT_READY','STRIPE_ACCOUNT_LOCKED','SETTINGS_CHANGED','ROTATION_CONFIRMATION_REQUIRED','INVALID_MFA_CODE','OWNER_NOT_FOUND','LAST_OWNER'];
    if(!codes.includes(error.message) && !['INVALID_OWNER_SETUP','INVALID_GOOGLE_SETTINGS','INVALID_GOOGLE_REDIRECT','GOOGLE_SETTINGS_INCOMPLETE'].includes(error.message))return next(error);
    const status=['SETTINGS_CHANGED','LAST_OWNER','ROTATION_CONFIRMATION_REQUIRED'].includes(error.message)?409:error.message==='STRIPE_CONNECTION_FAILED'?502:400;
    res.status(status).json({error:error.message});
  });app.use('/api/admin',router);
}
