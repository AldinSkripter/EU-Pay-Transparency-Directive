import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createAccountService } from './account.js';
import { MemoryMailer } from './mailer.js';
import { parseImportInput } from './file-parser.js';
import { payrollRoutes } from './payroll-routes.js';
import { workerRightsRoutes } from './worker-rights.js';
import { payCriteriaRoutes } from './pay-criteria.js';
import { ingestPushRoutes, integrationKeyRoutes, resolveBatch } from './ingest.js';
import { parseDelimited, suggestMapping, mapImportRecord, validateMapping, inspectImport, validateImportContext } from './importer.js';
import { marketContext, markets } from './market.js';
import { hashPassword, verifyPassword, establishSession, sessionToken, hashToken } from './auth.js';
import { normalizeEmployee, analyze, reportingSchedule } from './pay.js';
import { providers } from './hris.js';
import { integrationGuides, requiredData } from './integration-guides.js';
import { demoRows } from './demo.js';
import { reportCsv, reportXml, reportPdf, reportText, reportJson, reportXlsx } from './reports.js';
import { assessmentAudiences, assessmentJson, assessmentText, assessmentPdf, assessmentCsv, assessmentXlsx, assessmentXml } from './assessment.js';
import { validateWorkflow, readiness } from './workflow.js';
import { billingRoutes, plans, verifyStripeEvent, subscriptionPlan } from './billing.js';
import { regulatory, reportingPlan } from './regulatory.js';
import { MemoryControlStore } from './control-store.js';
import { adminRoutes } from './admin.js';
import { effectivePayment } from './payment-config.js';
import {defaultGoogle,googleForRequest} from './google-config.js';
import {googleRoutes} from './google-auth.js';

export function createApp({ store, demo = false, secret, secure = false, origins = [], billing = {}, control = new MemoryControlStore(), stripeFetch = fetch, googleFetch = fetch, mailer = new MemoryMailer(), accountKey = randomBytes(32), requireOwnerMfa = secure }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: secure ? undefined : false }));
  app.use(marketContext);
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }));
  // Provider webhooks are authenticated by the signature over the raw body.
  app.post('/api/billing/webhook',express.raw({type:'application/json',limit:'1mb'}),async(req,res)=> {
    const currentBilling=await effectivePayment(control,billing,demo,req);
    let event;
    const secrets=[currentBilling.webhookSecret,...(currentBilling.previousWebhooks||[]).filter(s=>s.expiresAt>Date.now()).map(s=>s.secret)];
    for(const secret of secrets){try{event=verifyStripeEvent(req.body,req.get('stripe-signature'),secret);break;}catch{}}
    if(!event || !event.id || !event.data?.object)return res.status(400).json({error:'INVALID_SIGNATURE'});
    if(typeof event.livemode==='boolean' && event.livemode!==currentBilling.secretKey?.startsWith('sk_live_'))return res.status(400).json({error:'STRIPE_ENVIRONMENT_MISMATCH'});
    const object=event.data?.object;
    let update;
    if (event.type==='checkout.session.completed' && object?.payment_status==='paid' && object.mode==='subscription' && object.subscription) update={session:object.id,subscription:object.subscription,status:'active',created:event.created};
    if (event.type==='customer.subscription.updated') {
      const entitlement=subscriptionPlan(object,currentBilling.prices);
      update={subscription:object.id,status:entitlement ? object.status : 'price_unverified',created:event.created,...entitlement};
    }
    if (event.type==='customer.subscription.deleted') update={subscription:object.id,status:'cancelled',created:event.created};
    if (update && !await store.applyBillingEvent(event.id,update)) return res.status(409).json({error:'ORDER_NOT_LINKED'});
    await control.mutate(s=>{s.lastWebhook={at:new Date().toISOString(),eventId:event.id,type:event.type};});
    res.json({received:true});
  });
  // Machine-to-machine delivery: authenticated by a company API key, so no cookie/Origin rules apply.
  ingestPushRoutes(app, { store, control });
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const allowed = demo ? [ `http://${req.get('host')}`, ...origins ] : origins;
      if (!origin || !allowed.includes(origin)) return res.status(403).json({ error: 'INVALID_ORIGIN' });
      if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'INVALID_ORIGIN' });
    }
    next();
  });
  app.use(express.json({ limit: '6mb' }));
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ error: 'INVALID_JSON' });
    next();
  });
  app.get('/api/context', async (req, res) => res.json({ market: req.marketContext, demo, googleEnabled:!!googleForRequest((await control.read()).google||defaultGoogle(),req,secure), reportStatus: 'draft', supportedMarkets: Object.values(markets) }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: demo ? 'demo' : 'database' }));
  app.get('/api/regulatory', (req,res)=>res.json(regulatory));
  const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  const account = createAccountService({ store, mailer, accountKey });
  googleRoutes(app,{store,control,secure,authLimit,googleFetch});
  account.publicRoutes(app, authLimit);
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const { email, password, companyName } = req.body;
    if (typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 12 || password.length > 128 || typeof companyName !== 'string' || !companyName.trim() || companyName.length > 255) return res.status(400).json({ error: 'INVALID_REGISTRATION' });
    // The reporting jurisdiction is chosen explicitly. The domain only picks the display language,
    // so a Slovenian company on equitensa.de still gets Slovenian rules and reports.
    const country = req.body.country;
    if (!markets[country]) return res.status(400).json({error:'INVALID_COUNTRY'});
    const company = { id: randomUUID(), name: companyName.trim(), country };
    const user = { id: randomUUID(), company_id: company.id, email: email.trim().toLowerCase(), password_hash: await hashPassword(password), role: 'hr_manager', email_verified_at: null };
    await store.createAccount(company, user);
    await account.sendToken(user, 'verify', country, req.get('origin'));
    await establishSession(store, res, user.id, secure);
    res.status(201).json({ company });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 128) return res.status(400).json({ error: 'INVALID_LOGIN' });
    const user = await store.findUser(email.toLowerCase());
    // Scrypt runs for unknown users too, limiting account enumeration via timing.
    const encoded = user?.password_hash || '00000000000000000000000000000000:' + '00'.repeat(64);
    if (!await verifyPassword(password, encoded) || !user) return res.status(401).json({ error: 'INVALID_LOGIN' });
    if (user.mfa_secret_enc) {
      if (!req.body.code) return res.status(401).json({ error: 'MFA_REQUIRED' });
      if (!await account.consumeMfa(user, req.body.code)) return res.status(401).json({ error: 'INVALID_MFA_CODE' });
    }
    await establishSession(store, res, user.id, secure); res.json({ ok: true });
  });
  app.post('/api/demo', authLimit, async (req, res) => {
    if (!demo) return res.status(404).json({ error: 'NOT_FOUND' });
    const country = req.body.country || req.marketContext.country;
    if (!markets[country]) return res.status(400).json({ error: 'INVALID_COUNTRY' });
    const company = { id: randomUUID(), name: 'Acme Europe', country };
    const user = { id: randomUUID(), company_id: company.id, email: `${randomUUID()}@demo.invalid`, role: 'hr_manager', password_hash: '', email_verified_at: new Date() };
    await store.createAccount(company, user);
    await store.saveSnapshot(company.id, 2026, demoRows(company.id, secret), 'synthetic-demo');
    const oldToken = sessionToken(req); if (oldToken) await store.deleteSession(hashToken(oldToken));
    await establishSession(store, res, user.id, secure); res.json({ company });
  });
  adminRoutes(app,{control,store,billing,demo,secure,stripeFetch,requireMfa:requireOwnerMfa});
  app.use('/api', async (req, res, next) => {
    const token = sessionToken(req);
    const session = token ? await store.session(hashToken(token)) : null;
    if (!session) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    // The authenticated tenant determines data jurisdiction; the host chooses the
    // public market/language only. A user-controlled company_id is never accepted.
    req.session = session; next();
  });
  app.use('/api',async(req,res,next)=>{
    if(req.path==='/auth/logout')return next();
    if((await control.read()).suspended[req.session.company.id])return res.status(403).json({error:'COMPANY_SUSPENDED'});
    next();
  });
  // Unverified accounts may only reach the screens needed to verify (and sign out).
  const unverifiedPaths = ['/me', '/auth/logout', '/auth/resend-verification', '/auth/security'];
  app.use('/api', (req, res, next) => {
    if (!req.session.user.email_verified_at && !unverifiedPaths.includes(req.path)) return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED' });
    next();
  });
  account.sessionRoutes(app, authLimit);
  app.post('/api/auth/logout', async (req, res) => {
    await store.deleteSession(hashToken(sessionToken(req)));
    res.clearCookie('equitensa_session', { path: '/', httpOnly: true, sameSite: 'strict', secure }); res.json({ ok: true });
  });
  app.get('/api/me', (req, res) => res.json({ company: req.session.company, user: { email: req.session.user.email, role: req.session.user.role, emailVerified: !!req.session.user.email_verified_at, mfaEnabled: !!req.session.user.mfa_enabled }, demo }));
  billingRoutes(app,{store,demo,billing,getBilling:req=>effectivePayment(control,billing,demo,req),stripeFetch});
  function yearValue(value) {
    const year = Number(value ?? 2026);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('INVALID_YEAR');
    return year;
  }
  app.get('/api/analysis', async (req, res) => {
    const year = yearValue(req.query.year), snapshot = await store.latestSnapshot(req.session.company.id, year);
    const analysis = analyze(snapshot?.rows || []);
    res.json({ company: req.session.company, year, snapshot: snapshot ? { id: snapshot.id, source: snapshot.source, created_at: snapshot.created_at } : null, analysis, schedule: reportingSchedule(analysis.count), scheduleBasis: 'EU_DIRECTIVE_MINIMUM_NATIONAL_RULES_UNVERIFIED' });
  });
  app.get('/api/integrations', (req, res) => res.json({ providers, csv: { status: 'available' }, guides: integrationGuides, requiredData, push: { status: 'available', endpoint: '/api/ingest/v1/employees', maxRecords: 10000, maxBytes: 4194304 } }));
  app.get('/api/workflow',async(req,res)=> {
    const year=yearValue(req.query.year),snapshot=await store.latestSnapshot(req.session.company.id,year), workflow=await store.getWorkflow(req.session.company.id,year);
    res.json({workflow,readiness:readiness(workflow,analyze(snapshot?.rows || []),snapshot)});
  });
  app.get('/api/reporting-plan',async(req,res)=> {
    const year=yearValue(req.query.year);
    const [workflow,snapshot]=await Promise.all([store.getWorkflow(req.session.company.id,year),store.latestSnapshot(req.session.company.id,year)]);
    const audience=req.query.audience || 'internal';
    if (!regulatory.recipients.some(r=>r.id===audience)) return res.status(400).json({error:'INVALID_AUDIENCE'});
    res.json(reportingPlan(req.session.company.country,year,snapshot && workflow.snapshotId===snapshot.id ? workflow.profile?.headcount : null,audience));
  });
  app.post('/api/workflow',async(req,res)=> {
    const year=yearValue(req.body.year),snapshot=await store.latestSnapshot(req.session.company.id,year);
    let workflow;
    try { workflow=validateWorkflow(req.body.workflow,snapshot,await store.getWorkflow(req.session.company.id,year)); } catch(e) { return res.status(409).json({error:e.message}); }
    await store.saveWorkflow(req.session.company.id,year,workflow);
    await store.audit(req.session.company.id,'workflow_saved',{year,snapshot_id:snapshot.id});
    res.json({workflow,readiness:readiness(workflow,analyze(snapshot.rows),snapshot)});
  });
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const structure = (parsed,year,country) => digest({format:parsed.format,headers:parsed.headers,sheet:parsed.sheet||null,path:parsed.recordPath||null,year,country});
  app.get('/api/import/history',async(req,res)=>res.json({batches:await store.importHistory(req.session.company.id,yearValue(req.query.year))}));
  app.post('/api/import', async (req, res) => {
    const year = yearValue(req.body.year);
    let parsed,batch=null;
    try {batch=await resolveBatch(req,store);if(batch&&batch.reporting_year!==year)throw new Error('BATCH_YEAR_MISMATCH');parsed=await parseImportInput(req.body);if(parsed.selectionRequired)throw new Error('IMPORT_SELECTION_REQUIRED');validateMapping(req.body.mapping,parsed.headers);}
    catch(error){return res.status(422).json({error:error.message});}
    if(req.body.file && req.body.contextConfirmed!==true)return res.status(422).json({error:'IMPORT_CONFIRMATION_REQUIRED'});
    const records=parsed.rows;
    if(!records.length || records.length>10000)return res.status(422).json({error:'INVALID_ROW_COUNT'});
    const contextErrors = validateImportContext(parsed.headers,records,{country:req.session.company.country,year});
    if(contextErrors.length)return res.status(422).json({error:'IMPORT_VALIDATION_FAILED',errors:contextErrors});
    const rows=[],errors=[],ids=new Set();
    records.forEach((record,index)=>{
      try {
        const mapped=mapImportRecord(record,req.body.mapping,req.body.decimalSeparator??'.');
        const row=normalizeEmployee(mapped,req.session.company.id,secret);
        if(ids.has(row.anonymized_id))throw new Error('DUPLICATE_EMPLOYEE');
        ids.add(row.anonymized_id);rows.push(row);
      }catch(error){if(errors.length<25)errors.push({row:index+(parsed.headerRow||1)+1,error:error.message});}
    });
    if(errors.length)return res.status(422).json({error:'IMPORT_VALIDATION_FAILED',errors});
    const order=await store.activeOrder(req.session.company.id),plan=plans.find(p=>p.id===order?.plan);
    const limit=plan && ['active','sandbox_active'].includes(order.status)?plan.limit:250;
    if(rows.length>limit)return res.status(422).json({error:'PLAN_EMPLOYEE_LIMIT',limit});
    const mapping=Object.fromEntries(['internal_id','gender','job_title','worker_category','job_category_kv','base_annual','bonuses_annual','paid_hours_annual','hours_per_week'].map(field=>[field,req.body.mapping?req.body.mapping[field]||'':parsed.headers.includes(field)?field:'']));
    const profile={mapping,decimalSeparator:req.body.decimalSeparator??'.',encoding:parsed.encoding||null,confirmed:true};
    const fingerprint=digest({rows,profile,version:'annual-v1',year,country:req.session.company.country});
    const snapshot=await store.saveSnapshot(req.session.company.id,year,rows,parsed.format,{fingerprint,fileHash:parsed.fileHash,structureHash:structure(parsed,year,req.session.company.country),profile,actor:req.session.user.id});
    if(batch)await store.closeIngestBatch(req.session.company.id,batch.id,'imported');
    res.status(snapshot.replayed?200:201).json({snapshot:{id:snapshot.id,count:rows.length,year},replayed:!!snapshot.replayed});
  });
  app.post('/api/import/preview',async(req,res)=>{
    try {
      await resolveBatch(req,store);
      const parsed=await parseImportInput(req.body),year=yearValue(req.body.year);
      if(parsed.selectionRequired)return res.json({...parsed,count:0});
      const {headers,rows}=parsed,suggested=suggestMapping(headers);
      const saved=await store.importProfile(req.session.company.id,structure(parsed,year,req.session.company.country));
      const mapping=saved?.document.mapping||suggested.mapping;
      res.json({...parsed,rows:rows.slice(0,30),count:rows.length,...suggested,mapping,savedProfile:saved?{version:saved.version,decimalSeparator:saved.document.decimalSeparator}:null,context:{...inspectImport(headers,rows,mapping),reportingCountry:req.session.company.country},contextErrors:validateImportContext(headers,rows,{country:req.session.company.country,year})});
    }catch(error){res.status(422).json({error:error.message});}
  });
  payrollRoutes(app,{store,secret,yearValue});
  workerRightsRoutes(app,{store,secret,yearValue});
  payCriteriaRoutes(app,{store,yearValue});
  integrationKeyRoutes(app,{store});
  app.get('/api/reports/:format', async (req, res) => {
    const format = req.params.format;
    if (!['csv','xml','pdf','txt','xlsx','json'].includes(format)) return res.status(400).json({ error: 'INVALID_FORMAT' });
    const year = yearValue(req.query.year), company = req.session.company;
    const storedSnapshot = await store.latestSnapshot(company.id, year);
    if (!storedSnapshot) return res.status(404).json({ error: 'NO_DATA' });
    // Export metadata belongs to this request, never to the immutable payroll snapshot.
    const snapshot = {...storedSnapshot,prepared:false};
    const audience=req.query.audience || 'internal';
    if (!regulatory.recipients.some(r=>r.id===audience)) return res.status(400).json({error:'INVALID_AUDIENCE'});
    snapshot.audience=audience;
    const type=req.query.type==='assessment'?'assessment':'report';
    if (type==='assessment' && !assessmentAudiences.includes(audience)) return res.status(400).json({error:'INVALID_AUDIENCE'});
    // Art. 9(9) and Art. 29(3)(c): the previous four years stay available (not in the public summary).
    snapshot.history=[];
    if (audience!=='public') for (let back=1;back<=4 && year-back>=2000;back++) {const previous=await store.latestSnapshot(company.id,year-back);if(previous)snapshot.history.push({year:year-back,rows:previous.rows});}
    snapshot.workflow=await store.getWorkflow(company.id,year);
    if (snapshot.workflow.snapshotId !== snapshot.id) snapshot.workflow={};
    if (req.query.prepared === 'true') {
      const order=await store.activeOrder(company.id);
      if (!order || !['active','sandbox_active'].includes(order.status)) return res.status(402).json({error:'SUBSCRIPTION_REQUIRED'});
      const plan=plans.find(p=>p.id===order.plan);
      if (!plan || snapshot.rows.length>plan.limit) return res.status(402).json({error:'PLAN_EMPLOYEE_LIMIT',limit:plan?.limit || 0});
      if (!readiness(snapshot.workflow,analyze(snapshot.rows),snapshot).ready) return res.status(409).json({error:'REPORT_INCOMPLETE'});
      snapshot.prepared=true;
    }
    const mime = { xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',json:'application/json',csv: 'text/csv', xml: 'application/xml', pdf: 'application/pdf', txt: 'text/plain' };
    const writers = type==='assessment' ? {xlsx:assessmentXlsx,json:assessmentJson,pdf:assessmentPdf,csv:assessmentCsv,xml:assessmentXml,txt:assessmentText} : {xlsx:reportXlsx,json:reportJson,pdf:reportPdf,csv:reportCsv,xml:reportXml,txt:reportText};
    const output = await writers[format](company,snapshot);
    await store.audit(company.id, snapshot.prepared?'prepared_report_exported':'draft_exported', { format, audience, type, snapshot_id: snapshot.id, rules_version:regulatory.version, workflow:snapshot.workflow, user_id:req.session.user.id });
    res.setHeader('X-Report-Status', snapshot.prepared?'PREPARED_INTERNAL_UNVERIFIED':'DRAFT_UNVERIFIED');
    res.setHeader('X-Report-Rules',regulatory.version);
    res.setHeader('X-Report-Recipient',audience);
    res.setHeader('Content-Disposition', `attachment; filename="equitensa-${company.country}-${year}-${audience}${type==='assessment'?'-assessment':''}-${snapshot.prepared?'prepared':'draft'}.${format}"`);
    res.type(mime[format]).send(output);
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const known = ['EMAIL_EXISTS','INVALID_YEAR','MFA_LOCKED'];
    const status = error.message === 'MFA_LOCKED' ? 429 : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : known.includes(error.message) ? 400 : 500;
    if (status === 500) console.error('Request failed:', error.code || error.name);
    res.status(status).json({ error: status === 500 ? 'INTERNAL_ERROR' : error.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : error.type === 'entity.parse.failed' ? 'INVALID_JSON' : error.message });
  });
  return app;
}
