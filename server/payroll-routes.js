import {parseImportInput} from './file-parser.js';
import {validateImportContext} from './importer.js';
import {emptyLedger,suggestPayrollMapping,ledgerHash} from './payroll-ledger.js';
import {plans} from './billing.js';
import {PayrollRecords} from './payroll-records.js';
import {editPayrollInput,validatePayrollEdits} from './payroll-edits.js';

const contents=document=>{const {finalizedSnapshot,finalizedFingerprint,...data}=document;return data;};
const wrap=handler=>async(req,res,next)=>{try{await handler(req,res);}catch(error){if(/^[A-Z_]+$/.test(error.message))res.status(error.message==='PAYROLL_VERSION_CONFLICT'?409:422).json({error:error.message,...(error.errors?{errors:error.errors,errorCount:error.errorCount}:{})});else next(error);}};
export function payrollRoutes(app,{store,secret,yearValue,parseInput=req=>parseImportInput(req.body),inputPages=async function*(req,parsed){for(let i=0;i<parsed.rows.length;i+=1000)yield parsed.rows.slice(i,i+1000);}}) {
  const records=new PayrollRecords(store);
  const options=(req,year)=>({company:req.session.company.id,secret,year,country:req.session.company.country,actor:req.session.user.id});
  const summary=({state,calculation})=>{
    const document=state.document||emptyLedger();
    const {rows,...result}=calculation;
    return {version:state.version,...result,finalizedSnapshot:document.finalizedSnapshot,changedSinceFinalized:document.finalizedFingerprint!==ledgerHash(contents(document)),methodology:'monthly-ledger-v1; actual annual amounts and declared paid hours; classifications approved per source'};
  };
  const stateFor=async(req,year)=>{
    const state=await store.payrollLedger(req.session.company.id,year);
    if(!Number.isInteger(req.body.version)||req.body.version!==state.version)throw new Error('PAYROLL_VERSION_CONFLICT');
    return {...state,document:state.document||emptyLedger()};
  };
  app.get('/api/payroll',wrap(async(req,res)=>{const year=yearValue(req.query.year);res.json(summary(await records.inspect(req.session.company.id,year,options(req,year))));}));
  app.post('/api/payroll/preview',wrap(async(req,res)=>{
    let parsed=await parseInput(req);const year=yearValue(req.body.year);
    if(parsed.selectionRequired)return res.json({...parsed,count:0});
    validatePayrollEdits(parsed,req.body);
    const contextErrors=[];let offset=0;
    for await(const page of inputPages(req,parsed)){
      const edits=(req.body.edits||[]).filter(e=>e.record>offset&&e.record<=offset+page.length).map(e=>({...e,record:e.record-offset}));
      const checked=editPayrollInput({...parsed,rows:page},{...req.body,edits});
      for(const issue of validateImportContext(parsed.headers,checked.rows,{country:req.session.company.country,year,mode:'transactions'}))if(contextErrors.length<50)contextErrors.push({...issue,row:issue.row?issue.row+offset:issue.row});offset+=page.length;
    }
    const previewEdits=(req.body.edits||[]).filter(e=>e.record<=30);const preview=editPayrollInput({...parsed,rows:parsed.rows.slice(0,30)},{...req.body,edits:previewEdits});
    res.json({...parsed,count:parsed.rowCount??parsed.rows.length,rows:preview.rows,mapping:suggestPayrollMapping(parsed.headers,req.body.kind),contextErrors});
  }));
  app.post('/api/payroll/stage',wrap(async(req,res)=>{
    const year=yearValue(req.body.year),state=await stateFor(req,year);
    if(req.body.contextConfirmed!==true)throw new Error('IMPORT_CONFIRMATION_REQUIRED');
    const parsed=await parseInput(req);if(parsed.selectionRequired)throw Error('IMPORT_SELECTION_REQUIRED');
    const result=await records.stage(req.session.company.id,year,state.version,parsed,inputPages(req,parsed),{...options(req,year),...req.body,company:req.session.company.id,secret,actor:req.session.user.id,year,country:req.session.company.country});
    res.json({...summary(result),added:result.added,duplicates:result.duplicates});
  }));
  app.post('/api/payroll/codes',wrap(async(req,res)=>{
    const year=yearValue(req.body.year),state=await stateFor(req,year);
    res.json(summary(await records.approve(req.session.company.id,year,state.version,req.body.codes,req.session.user.id,options(req,year))));
  }));
  app.post('/api/payroll/reset',wrap(async(req,res)=>{
    const year=yearValue(req.body.year),state=await stateFor(req,year);
    if(req.body.confirmReset!==true)throw new Error('IMPORT_CONFIRMATION_REQUIRED');
    res.json(summary(await records.reset(req.session.company.id,year,state.version,req.session.user.id,options(req,year))));
  }));
  app.post('/api/payroll/finalize',wrap(async(req,res)=>{
    const year=yearValue(req.body.year),state=await stateFor(req,year);
    if(req.body.contextConfirmed!==true)throw new Error('IMPORT_CONFIRMATION_REQUIRED');
    const inspected=await records.inspect(req.session.company.id,year,options(req,year));if(inspected.state.version!==state.version)throw Error('PAYROLL_VERSION_CONFLICT');const calculation=inspected.calculation;
    if(!calculation.ready)return res.status(422).json({error:'PAYROLL_INCOMPLETE',errors:calculation.errors});
    const order=await store.activeOrder(req.session.company.id),plan=plans.find(p=>p.id===order?.plan),limit=plan&&['active','sandbox_active'].includes(order.status)?plan.limit:250;
    if(calculation.rows.length>limit)return res.status(422).json({error:'PLAN_EMPLOYEE_LIMIT',limit});
    const fingerprint=ledgerHash(contents(state.document));
    const latest=await store.latestSnapshot(req.session.company.id,year);
    if(state.document.finalizedFingerprint===fingerprint && latest?.id===state.document.finalizedSnapshot)return res.json({snapshot:{id:latest.id,year,count:calculation.rows.length},replayed:true,...summary(inspected)});
    const profile={mapping:{},confirmed:true,methodology:'monthly-ledger-v1',ledger_hash:fingerprint,codes:calculation.codes};
    const snapshot=await store.saveSnapshot(req.session.company.id,year,calculation.rows,'monthly-ledger',{fingerprint,fileHash:state.document.revisionHash||ledgerHash(Object.values(state.document.transactions).map(t=>t.file_hash).sort()),structureHash:ledgerHash({kind:'monthly-ledger',year,country:req.session.company.country}),profile,actor:req.session.user.id,payroll:{expectedVersion:state.version,document:state.document}});
    res.status(snapshot.replayed?200:201).json({snapshot:{id:snapshot.id,year,count:calculation.rows.length},replayed:!!snapshot.replayed,...summary(await records.inspect(req.session.company.id,year,options(req,year)))});
  }));
}
