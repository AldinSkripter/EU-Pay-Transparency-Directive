import {parseImportInput} from './file-parser.js';
import {validateImportContext} from './importer.js';
import {emptyLedger,suggestPayrollMapping,addPayrollRecords,approvePayrollCodes,calculatePayroll,ledgerHash} from './payroll-ledger.js';
import {plans} from './billing.js';

const contents=document=>{const {finalizedSnapshot,finalizedFingerprint,...data}=document;return data;};
const wrap=handler=>async(req,res,next)=>{try{await handler(req,res);}catch(error){if(/^[A-Z_]+$/.test(error.message))res.status(error.message==='PAYROLL_VERSION_CONFLICT'?409:422).json({error:error.message});else next(error);}};
export function payrollRoutes(app,{store,secret,yearValue}) {
  const options=(req,year)=>({company:req.session.company.id,secret,year});
  const summary=(state,req,year)=>{
    const document=state.document||emptyLedger(),calculation=calculatePayroll(document,options(req,year));
    const {rows,...result}=calculation;
    return {version:state.version,...result,finalizedSnapshot:document.finalizedSnapshot,changedSinceFinalized:document.finalizedFingerprint!==ledgerHash(contents(document)),methodology:'monthly-ledger-v1; actual annual amounts and declared paid hours; classifications approved per source'};
  };
  const stateFor=async(req,year)=>{
    const state=await store.payrollLedger(req.session.company.id,year);
    if(!Number.isInteger(req.body.version)||req.body.version!==state.version)throw new Error('PAYROLL_VERSION_CONFLICT');
    return {...state,document:state.document||emptyLedger()};
  };
  app.get('/api/payroll',wrap(async(req,res)=>{const year=yearValue(req.query.year);res.json(summary(await store.payrollLedger(req.session.company.id,year),req,year));}));
  app.post('/api/payroll/preview',wrap(async(req,res)=>{
    const parsed=await parseImportInput(req.body),year=yearValue(req.body.year);
    if(parsed.selectionRequired)return res.json({...parsed,count:0});
    res.json({...parsed,count:parsed.rows.length,rows:parsed.rows.slice(0,30),mapping:suggestPayrollMapping(parsed.headers,req.body.kind),contextErrors:validateImportContext(parsed.headers,parsed.rows,{country:req.session.company.country,year,mode:'transactions'})});
  }));
  app.post('/api/payroll/stage',wrap(async(req,res)=>{
    const year=yearValue(req.body.year),state=await stateFor(req,year);
    if(req.body.contextConfirmed!==true)throw new Error('IMPORT_CONFIRMATION_REQUIRED');
    const parsed=await parseImportInput(req.body);if(parsed.selectionRequired)throw new Error('IMPORT_SELECTION_REQUIRED');
    const contextErrors=validateImportContext(parsed.headers,parsed.rows,{country:req.session.company.country,year,mode:'transactions'});
    if(contextErrors.length)return res.status(422).json({error:'IMPORT_VALIDATION_FAILED',errors:contextErrors});
    const added=addPayrollRecords(state.document,parsed,{...options(req,year),kind:req.body.kind,mapping:req.body.mapping,source:req.body.source,decimalSeparator:req.body.decimalSeparator??'.'});
    if(added.errors.length)return res.status(422).json({error:'IMPORT_VALIDATION_FAILED',errors:added.errors});
    const next=added.added?await store.savePayrollLedger(req.session.company.id,year,state.version,added.document,req.session.user.id):state;
    res.json({...summary(next,req,year),added:added.added,duplicates:added.duplicates});
  }));
  app.post('/api/payroll/codes',wrap(async(req,res)=>{
    const year=yearValue(req.body.year),state=await stateFor(req,year);
    const document=approvePayrollCodes(state.document,req.body.codes,req.session.user.id);
    const next=await store.savePayrollLedger(req.session.company.id,year,state.version,document,req.session.user.id,'pay_codes_approved');res.json(summary(next,req,year));
  }));
  app.post('/api/payroll/reset',wrap(async(req,res)=>{
    const year=yearValue(req.body.year),state=await stateFor(req,year);
    if(req.body.confirmReset!==true)throw new Error('IMPORT_CONFIRMATION_REQUIRED');
    const next=await store.savePayrollLedger(req.session.company.id,year,state.version,emptyLedger(),req.session.user.id,'payroll_draft_reset');res.json(summary(next,req,year));
  }));
  app.post('/api/payroll/finalize',wrap(async(req,res)=>{
    const year=yearValue(req.body.year),state=await stateFor(req,year);
    if(req.body.contextConfirmed!==true)throw new Error('IMPORT_CONFIRMATION_REQUIRED');
    const calculation=calculatePayroll(state.document,options(req,year));
    if(!calculation.ready)return res.status(422).json({error:'PAYROLL_INCOMPLETE',errors:calculation.errors});
    const order=await store.activeOrder(req.session.company.id),plan=plans.find(p=>p.id===order?.plan),limit=plan&&['active','sandbox_active'].includes(order.status)?plan.limit:250;
    if(calculation.rows.length>limit)return res.status(422).json({error:'PLAN_EMPLOYEE_LIMIT',limit});
    const fingerprint=ledgerHash(contents(state.document));
    const latest=await store.latestSnapshot(req.session.company.id,year);
    if(state.document.finalizedFingerprint===fingerprint && latest?.id===state.document.finalizedSnapshot)return res.json({snapshot:{id:latest.id,year,count:calculation.rows.length},replayed:true,...summary(state,req,year)});
    const profile={mapping:{},confirmed:true,methodology:'monthly-ledger-v1',ledger_hash:fingerprint,codes:calculation.codes};
    const snapshot=await store.saveSnapshot(req.session.company.id,year,calculation.rows,'monthly-ledger',{fingerprint,fileHash:ledgerHash(Object.values(state.document.transactions).map(t=>t.file_hash).sort()),structureHash:ledgerHash({kind:'monthly-ledger',year,country:req.session.company.country}),profile,actor:req.session.user.id,payroll:{expectedVersion:state.version,document:state.document}});
    res.status(snapshot.replayed?200:201).json({snapshot:{id:snapshot.id,year,count:calculation.rows.length},replayed:!!snapshot.replayed,...summary(await store.payrollLedger(req.session.company.id,year),req,year)});
  }));
}
