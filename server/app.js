import {payImportLimits} from '../shared/pay-import-limits.js';
import {PayUploads,payUploadRoutes} from './pay-uploads.js';
import {companyBrandRoutes} from './company-brand.js';
import express from 'express';
import {financeRoutes} from './finance.js';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createAccountService } from './account.js';
import { MemoryMailer } from './mailer.js';
import { createEmailPlatform } from './email-platform.js';
import { parseImportInput } from './file-parser.js';
import { payrollRoutes } from './payroll-routes.js';
import { workerRightsRoutes } from './worker-rights.js';
import { payCriteriaRoutes } from './pay-criteria.js';
import { nationalReportRoutes } from './national-reports.js';
import { evidenceRoutes } from './evidence.js';
import { employerControlRoutes, controlState } from './employer-controls.js';
import { lifecycleRoutes } from './data-lifecycle.js';
import { directiveArticles } from '../shared/employer-controls.js';
import { ingestPushRoutes, integrationKeyRoutes, resolveBatch } from './ingest.js';
import { parseDelimited, suggestMapping, mapImportRecord, validateMapping, inspectImport, validateImportContext } from './importer.js';
import { assessQuality, validateFixes, prepareRecords, normalizeMapping } from './data-quality.js';
import { createAssistant, buildAssistantContext, AssistantError } from './ai-assistant.js';
import { marketContext, markets } from './market.js';
import { hashPassword, verifyPassword, establishSession, sessionToken, hashToken } from './auth.js';
import { normalizeEmployee, analyze, reportingSchedule } from './pay.js';
import { providers } from './hris.js';
import { integrationGuides, requiredData } from './integration-guides.js';
import { demoRows } from './demo.js';
import { reportCsv, reportXml, reportPdf, reportText, reportJson, reportXlsx, reportHtml } from './reports.js';
import { assessmentAudiences, assessmentJson, assessmentText, assessmentPdf, assessmentCsv, assessmentXlsx, assessmentXml, assessmentHtml } from './assessment.js';
import { validateWorkflow, readiness } from './workflow.js';
import { billingRoutes, plans, verifyStripeEvent, subscriptionPlan } from './billing.js';
import { regulatory, reportingPlan } from './regulatory.js';
import { MemoryControlStore } from './control-store.js';
import { adminRoutes } from './admin.js';
import { effectivePayment } from './payment-config.js';
import {defaultGoogle,googleForRequest} from './google-config.js';
import {googleRoutes} from './google-auth.js';

export function createApp({ store, demo = false, secret, secure = false, origins = [], billing = {}, control = new MemoryControlStore(), stripeFetch = fetch, googleFetch = fetch, mailer = new MemoryMailer(), emailTransportFactory, accountKey = randomBytes(32), requireOwnerMfa = secure, assistant = createAssistant() }) {
  const app = express();
  const payUploads=new PayUploads({key:accountKey,demo});
  const parseInput=async req=>{const parsed=req.body.file?.uploadId?await payUploads.result(req.session.company.id,req.body.file.uploadId,req.body):await parseImportInput(req.body);if(parsed.paged&&!/^\/api\/payroll\//.test(req.path))throw Error('PAYROLL_TRANSACTION_IMPORT_REQUIRED');return parsed;};
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: secure ? undefined : false }));
  app.use(marketContext);
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false,skip:req=>req.method==='PUT'&&/^\/pay-imports\/[a-f0-9-]+\/chunks\/\d+$/.test(req.path) }));
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
  app.use(['/api/import','/api/payroll','/api/national-report'],express.json({limit:payImportLimits.jsonBytes}));
  app.use(express.json({ limit: '6mb' }));
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ error: 'INVALID_JSON' });
    next();
  });
  app.get('/api/context', async (req, res) => res.json({ market: req.marketContext, demo, googleEnabled:!!googleForRequest((await control.read()).google||defaultGoogle(),req,secure), reportStatus: 'draft', supportedMarkets: Object.values(markets) }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: demo ? 'demo' : 'database' }));
  app.get('/api/regulatory', (req,res)=>res.json(regulatory));
  const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  const emailPlatform=createEmailPlatform({control,fallback:mailer,demo,transportFactory:emailTransportFactory});
  const account = createAccountService({ store, mailer, accountKey, emailPlatform });
  googleRoutes(app,{store,control,secure,authLimit,googleFetch,onNewAccount:(user,origin)=>account.sendEvent(user,'welcome',origin)});
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
  adminRoutes(app,{control,store,billing,demo,secure,stripeFetch,emailPlatform,requireMfa:requireOwnerMfa});
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
  payUploadRoutes(app,payUploads);
  companyBrandRoutes(app,store);
  app.post('/api/auth/logout', async (req, res) => {
    await store.deleteSession(hashToken(sessionToken(req)));
    res.clearCookie('equitensa_session', { path: '/', httpOnly: true, sameSite: 'strict', secure }); res.json({ ok: true });
  });
  app.get('/api/me', async (req, res) => res.json({ company: req.session.company, user: { email: req.session.user.email, role: req.session.user.role, emailVerified: !!req.session.user.email_verified_at, mfaEnabled: !!req.session.user.mfa_enabled }, demo,mailDeliveryMode:await emailPlatform.mode(),verificationDelivery:!req.session.user.email_verified_at?await emailPlatform.verificationStatus(req.session.user.id):null }));
  billingRoutes(app,{store,demo,billing,getBilling:req=>effectivePayment(control,billing,demo,req),stripeFetch});
  financeRoutes(app,{store,demo,accountKey,control});
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
  app.get('/api/integrations', (req, res) => res.json({ providers, csv: { status: 'available' }, guides: integrationGuides, requiredData, push: { status: 'available', endpoint: '/api/ingest/v1/employees', maxRecords: 10000, maxBytes: payImportLimits.fileBytes } }));
  app.get('/api/employer-context', async (req,res) => {
    const snapshot = await store.latestSnapshot(req.session.company.id,yearValue(req.query.year));
    const rows = snapshot?.rows || [];
    res.json({snapshotId:snapshot?.id || null,categories:[...new Set(rows.map(r=>r.worker_category))].sort().map(category=>({category,titles:[...new Set(rows.filter(r=>r.worker_category===category).map(r=>r.job_title))].sort()}))});
  });
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
    try {batch=await resolveBatch(req,store);if(batch&&batch.reporting_year!==year)throw new Error('BATCH_YEAR_MISMATCH');parsed=await parseInput(req);if(parsed.selectionRequired)throw new Error('IMPORT_SELECTION_REQUIRED');validateMapping(req.body.mapping,parsed.headers);}
    catch(error){return res.status(422).json({error:error.message});}
    if(req.body.file && req.body.contextConfirmed!==true)return res.status(422).json({error:'IMPORT_CONFIRMATION_REQUIRED'});
    if(!parsed.rows.length || parsed.rows.length>10000)return res.status(422).json({error:'INVALID_ROW_COUNT'});
    let prepared;
    try {const fixes=validateFixes(req.body.fixes,{headers:parsed.headers,mapping:req.body.mapping,count:parsed.rows.length,headerRow:parsed.headerRow});prepared=prepareRecords(parsed.rows,{headers:parsed.headers,mapping:req.body.mapping,fixes,decimalSeparator:req.body.decimalSeparator??'.',headerRow:parsed.headerRow});}
    catch(error){return res.status(422).json({error:error.message});}
    const records=prepared.records;
    if(!records.length)return res.status(422).json({error:'INVALID_ROW_COUNT'});
    const contextErrors = validateImportContext(parsed.headers,records,{country:req.session.company.country,year}).map(problem=>({...problem,row:prepared.rows[problem.row-2]}));
    if(contextErrors.length)return res.status(422).json({error:'IMPORT_VALIDATION_FAILED',errors:contextErrors});
    const rows=[],errors=[],ids=new Set();
    records.forEach((record,index)=>{
      try {
        const mapped=mapImportRecord(record,req.body.mapping,req.body.decimalSeparator??'.');
        const row=normalizeEmployee(mapped,req.session.company.id,secret);
        if(ids.has(row.anonymized_id))throw new Error('DUPLICATE_EMPLOYEE');
        ids.add(row.anonymized_id);rows.push(row);
      }catch(error){if(errors.length<25)errors.push({row:prepared.rows[index],error:error.message});}
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
    // Counts only, never the corrected values: the audit trail shows that corrections were applied at import.
    if(Object.values(prepared.applied).some(Boolean))await store.audit(req.session.company.id,'import_corrections_applied',{year,snapshot_id:snapshot.id,...prepared.applied});
    res.status(snapshot.replayed?200:201).json({snapshot:{id:snapshot.id,count:rows.length,year},replayed:!!snapshot.replayed});
  });
  // Findings for the file as it would be imported with the chosen mapping, separator and corrections.
  const prepare=(parsed,body)=>{
    const headers=parsed.headers,decimalSeparator=body.decimalSeparator===','?',':'.',mapping=normalizeMapping(body.mapping??suggestMapping(headers).mapping,headers);
    const fixes=validateFixes(body.fixes,{headers,mapping,count:parsed.rows.length,headerRow:parsed.headerRow});
    return {headers,decimalSeparator,mapping,...prepareRecords(parsed.rows,{headers,mapping,fixes,decimalSeparator,headerRow:parsed.headerRow})};
  };
  const qualityOf=(parsed,body)=>{const p=prepare(parsed,body);return {...assessQuality({headers:p.headers,rows:p.rows,records:p.records,mapping:p.mapping,decimalSeparator:p.decimalSeparator,applied:p.applied}),applied:p.applied};};
  const analysisLimit=rateLimit({windowMs:60_000,limit:40,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>req.session?.company?.id??ipKeyGenerator(req.ip)});
  const assistLimit=rateLimit({windowMs:60*60_000,limit:15,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>req.session?.company?.id??ipKeyGenerator(req.ip)});
  const loadForAnalysis=async req=>{await resolveBatch(req,store);const parsed=await parseInput(req);if(parsed.selectionRequired)throw new Error('IMPORT_SELECTION_REQUIRED');return parsed;};
  app.post('/api/import/quality',analysisLimit,async(req,res)=>{
    try {res.json(qualityOf(await loadForAnalysis(req),req.body));}
    catch(error){res.status(422).json({error:error.message});}
  });
  // Optional AI suggestions. Only runs on an explicit request with consent; see ai-assistant.js for what is sent.
  app.post('/api/import/assist',assistLimit,async(req,res)=>{
    if(!assistant.available)return res.status(503).json({error:'AI_NOT_CONFIGURED'});
    if(req.body.consent!==true)return res.status(422).json({error:'AI_CONSENT_REQUIRED'});
    try {
      const parsed=await loadForAnalysis(req),p=prepare(parsed,req.body),context=buildAssistantContext({headers:p.headers,rows:p.records,mapping:p.mapping});
      const result=await assistant.suggest({context,language:req.body.language==='sl'?'sl':'de'});
      await store.audit(req.session.company.id,'ai_assist_used',{year:yearValue(req.body.year),rows:context.rowCount,columns:context.columns.length,categories:context.categories.length,suggested_mapping:result.mapping.length,suggested_groups:result.categories.length,model:result.model});
      res.json({...result,sent:{columns:context.columns.length,categories:context.categories.length,jobTitles:context.jobTitles.length}});
    }catch(error){res.status(error instanceof AssistantError?error.status:422).json({error:error.message});}
  });
  app.post('/api/import/preview',async(req,res)=>{
    try {
      await resolveBatch(req,store);
      const parsed=await parseInput(req),year=yearValue(req.body.year);
      if(parsed.selectionRequired)return res.json({...parsed,count:0});
      const {headers,rows}=parsed,suggested=suggestMapping(headers);
      const saved=await store.importProfile(req.session.company.id,structure(parsed,year,req.session.company.country));
      const mapping=saved?.document.mapping||suggested.mapping;
      const context={...inspectImport(headers,rows,mapping),reportingCountry:req.session.company.country};
      res.json({...parsed,rows:rows.slice(0,30),count:rows.length,...suggested,mapping,savedProfile:saved?{version:saved.version,decimalSeparator:saved.document.decimalSeparator}:null,context,contextErrors:validateImportContext(headers,rows,{country:req.session.company.country,year}),quality:qualityOf(parsed,{mapping,decimalSeparator:saved?.document.decimalSeparator||context.decimalSeparator||'.'}),assistant:{available:assistant.available}});
    }catch(error){res.status(422).json({error:error.message});}
  });
  payrollRoutes(app,{store,secret,yearValue,parseInput,inputPages:async function*(req,parsed){if(req.body.file?.uploadId){yield* payUploads.pages(req.session.company.id,req.body.file.uploadId,req.body);}else {for(let i=0;i<parsed.rows.length;i+=1000)yield parsed.rows.slice(i,i+1000);}}});
  workerRightsRoutes(app,{store,secret,yearValue});
  payCriteriaRoutes(app,{store,yearValue});
  nationalReportRoutes(app,{store,secret,yearValue});
  evidenceRoutes(app,{store,yearValue});
  employerControlRoutes(app,{store,yearValue});
  lifecycleRoutes(app,{store,yearValue,demo});
  integrationKeyRoutes(app,{store});
  app.get('/api/reports/:format', async (req, res) => {
    const format = req.params.format;
    if (!['csv','xml','pdf','txt','xlsx','json','html'].includes(format)) return res.status(400).json({ error: 'INVALID_FORMAT' });
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
      const employeeLimit=(await store.companyDocument(company.id,`bc_${order.id}`))?.employeeLimit ?? ({prepare:250,growth:1000,scale:2500}[order.plan] || plan?.limit);
      if (!plan || snapshot.rows.length>employeeLimit) return res.status(402).json({error:'PLAN_EMPLOYEE_LIMIT',limit:employeeLimit || 0});
      const checks = readiness(snapshot.workflow,analyze(snapshot.rows),snapshot);
      if (!checks.ready) return res.status(409).json({error:'REPORT_INCOMPLETE',missing:checks.missing});
      if (type === 'assessment' && !checks.assessment.ready) return res.status(409).json({error:'ASSESSMENT_INCOMPLETE',missing:checks.assessment.missing});
      snapshot.prepared=true;
    }
    if (audience === 'internal') {
      const controls=await store.companyDocument(company.id,`employer_controls_${year}`);
      snapshot.workflow = {...snapshot.workflow, employerControls:{...controls,state:controlState(controls,snapshot.id),articles:directiveArticles,retentionPolicy:await store.companyDocument(company.id,'data_retention')}};
    }
    const mime = { xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',json:'application/json',csv: 'text/csv', xml: 'application/xml', pdf: 'application/pdf', txt: 'text/plain', html: 'text/html; charset=utf-8' };
    const writers = type==='assessment' ? {xlsx:assessmentXlsx,json:assessmentJson,pdf:assessmentPdf,csv:assessmentCsv,xml:assessmentXml,txt:assessmentText,html:assessmentHtml} : {xlsx:reportXlsx,json:reportJson,pdf:reportPdf,csv:reportCsv,xml:reportXml,txt:reportText,html:reportHtml};
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
