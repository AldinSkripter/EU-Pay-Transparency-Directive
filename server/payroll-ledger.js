import {createHmac,createHash} from 'node:crypto';
import {normalizeEmployee} from './pay.js';

export const payrollFields={
  hr:['internal_id','gender','job_title','worker_category','hours_per_week','first_month','last_month'],
  transactions:['transaction_id','internal_id','period','pay_code','amount','currency','paid_hours','correction_ref'],
};
const aliases={internal_id:['Employee ID','Personalnummer','Šifra zaposlenega'],gender:['Geschlecht','Spol','Sex'],job_title:['Tätigkeit','Delovno mesto','Job title'],worker_category:['Vergleichsgruppe','Enakovredna kategorija'],hours_per_week:['Wochenstunden','Tedenske ure'],first_month:['Eintrittsmonat','Prvi mesec'],last_month:['Austrittsmonat','Zadnji mesec'],transaction_id:['Transaction ID','Buchungsnummer','Šifra transakcije'],period:['Abrechnungsperiode','Obračunsko obdobje'],pay_code:['Lohnart','Vrsta obračuna','Šifra obračuna'],amount:['Betrag','Znesek','Amount'],currency:['Währung','Valuta'],paid_hours:['Bezahlte Stunden','Plačane ure'],correction_ref:['Korrekturreferenz','Popravek reference']};
const canonical=value=>String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const ledgerHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const emptyLedger=()=>({employees:{},transactions:{},codes:{},finalizedSnapshot:null});
export function suggestPayrollMapping(headers,kind) {
  if(!payrollFields[kind])throw new Error('INVALID_PAYROLL_KIND');
  return Object.fromEntries(payrollFields[kind].flatMap(field=>{
    const matches=headers.filter(h=>[field,...(aliases[field]||[])].some(a=>canonical(a)===canonical(h.split('.').at(-1).replace(/^@/,'').split(':').at(-1))));
    return matches.length===1?[[field,matches[0]]]:[];
  }));
}
const identifier=value=>{const v=String(value??'').trim();if(!v||v.length>255||/[\u0000-\u001f\u007f]/.test(v))throw new Error('INVALID_IDENTIFIER');return v;};
const pseudonym=(secret,company,id)=>createHmac('sha256',secret).update(`${company}:${identifier(id)}`).digest('hex');
const txKey=(secret,company,source,id)=>pseudonym(secret,company,`tx:${source}:${identifier(id)}`);
function decimal(value,separator,field,signed=false) {
  if(!['.',','].includes(separator))throw new Error('INVALID_DECIMAL_SEPARATOR');
  const text=String(value??'').trim(),pattern=separator===','?(signed?/^-?\d+(,\d{1,2})?$/:/^\d+(,\d{1,2})?$/):(signed?/^-?\d+(\.\d{1,2})?$/:/^\d+(\.\d{1,2})?$/);
  if(!pattern.test(text))throw new Error(`INVALID_${field}`);
  const result=Math.round(Number(text.replace(',','.'))*100);
  if(!Number.isSafeInteger(result)||Math.abs(result)>1e11)throw new Error(`INVALID_${field}`);
  return result;
}
function mappedRecord(row,mapping,kind,headers) {
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw new Error('INVALID_MAPPING');
  const used=new Set();
  return Object.fromEntries(payrollFields[kind].map(field=>{
    const column=mapping[field];
    if(column && (!headers.includes(column)||used.has(column)))throw new Error('INVALID_MAPPING');
    if(column)used.add(column);
    return [field,column?row[column]:undefined];
  }));
}
export function addPayrollRecords(document,parsed,{kind,mapping,source,company,secret,year,decimalSeparator='.'}) {
  if(!payrollFields[kind])throw new Error('INVALID_PAYROLL_KIND');
  if(kind==='transactions' && (typeof source!=='string'||!/^[\p{L}\p{N} ._-]{1,80}$/u.test(source)))throw new Error('INVALID_PAYROLL_SOURCE');
  const next=structuredClone(document),errors=[];let added=0,duplicates=0;
  parsed.rows.forEach((record,index)=>{
    try {
      const row=mappedRecord(record,mapping,kind,parsed.headers),employee=pseudonym(secret,company,row.internal_id);
      if(kind==='hr') {
        const first=Number(row.first_month??1),last=Number(row.last_month??12);
        if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last>12||last<first)throw new Error('INVALID_EMPLOYMENT_MONTHS');
        const weekly=decimal(row.hours_per_week,decimalSeparator,'HOURS')/100;
        // Reuse strict gender/title/category validation without retaining the source employee ID.
        const genderAliases={w:'F',weiblich:'F',female:'F',z:'F',zenska:'F',moski:'M',mannlich:'M',male:'M',divers:'O',drugo:'O'};
        const gender=genderAliases[canonical(row.gender)]||String(row.gender??'').toUpperCase();
        const normalized=normalizeEmployee({internal_id:row.internal_id,gender,job_title:row.job_title,worker_category:row.worker_category,base_annual:0,paid_hours_annual:1,hours_per_week:weekly},company,secret);
        const entry={key:employee,gender:normalized.gender,job_title:normalized.job_title,worker_category:normalized.worker_category,hours_per_week:weekly,first_month:first,last_month:last,source_hash:parsed.fileHash,source_row:index+2};
        if(next.employees[employee] && ledgerHash({...entry,source_hash:null,source_row:null})!==ledgerHash({...next.employees[employee],source_hash:null,source_row:null}))throw new Error('CONFLICTING_HR_RECORD');
        if(next.employees[employee])duplicates++;else {next.employees[employee]=entry;added++;}
      } else {
        const period=String(row.period??'').trim();
        if(!new RegExp(`^${year}-(0[1-9]|1[0-2])$`).test(period))throw new Error('INVALID_PAYROLL_PERIOD');
        if(String(row.currency??'').trim().toUpperCase()!=='EUR')throw new Error('IMPORT_CURRENCY_UNSUPPORTED');
        const payCode=identifier(row.pay_code),key=txKey(secret,company,source,row.transaction_id);
        const amount=decimal(row.amount,decimalSeparator,'AMOUNT',true);
        const hours=row.paid_hours===undefined||row.paid_hours===''?0:decimal(row.paid_hours,decimalSeparator,'HOURS');
        if(hours>74400)throw new Error('INVALID_HOURS');
        const correction=row.correction_ref?txKey(secret,company,source,row.correction_ref):null;
        if(amount<0&&!correction)throw new Error('CORRECTION_REFERENCE_REQUIRED');
        const entry={key,employee,period,pay_code:payCode,source,amount_cents:amount,hours_cents:hours,currency:'EUR',correction_ref:correction};
        const existing=next.transactions[key];
        if(existing && ledgerHash(entry)!==ledgerHash(Object.fromEntries(Object.keys(entry).map(k=>[k,existing[k]]))))throw new Error('TRANSACTION_CONFLICT');
        if(existing)duplicates++;else {next.transactions[key]={...entry,file_hash:parsed.fileHash,row:index+2};added++;}
      }
    }catch(error){if(errors.length<50)errors.push({row:index+2,error:error.message});}
  });
  if(Object.keys(next.employees).length>10000)errors.push({error:'PAYROLL_CAPACITY_LIMIT'});
  return {document:next,errors,added,duplicates};
}
export function approvePayrollCodes(document,definitions,actor) {
  if(!Array.isArray(definitions)||!definitions.length||definitions.length>200)throw new Error('INVALID_PAY_CODES');
  const next=structuredClone(document);
  for(const item of definitions) {
    if(!['ordinary','variable','excluded'].includes(item.classification)||typeof item.reason!=='string'||item.reason.trim().length<5||item.reason.length>2000)throw new Error('INVALID_PAY_CODES');
    const source=identifier(item.source),code=identifier(item.code),key=JSON.stringify([source,code]);
    if(!Object.values(next.transactions).some(t=>t.source===source&&t.pay_code===code))throw new Error('UNKNOWN_PAY_CODE');
    next.codes[key]={source,code,classification:item.classification,reason:item.reason.trim(),approved_by:actor,approved_at:new Date().toISOString()};
  }
  return next;
}
export function calculatePayroll(document,{company,secret,year}) {
  const errors=[],rows=[],transactions=Object.values(document.transactions),employees=Object.values(document.employees);
  const codePairs=new Map(transactions.map(tx=>[JSON.stringify([tx.source,tx.pay_code]),{source:tx.source,code:tx.pay_code}]));
  const codes=[...codePairs].map(([key,pair])=>({...pair,...document.codes[key],classification:document.codes[key]?.classification||'unknown'}));
  if(!employees.length)errors.push({error:'HR_DATA_REQUIRED'});
  for(const code of codes)if(code.classification==='unknown')errors.push({error:'PAY_CODE_CLASSIFICATION_REQUIRED',source:code.source,pay_code:code.code});
  const grouped=new Map();
  for(const tx of transactions) {
    if(!document.employees[tx.employee])errors.push({error:'UNMATCHED_PAYROLL_EMPLOYEE',employee:tx.employee.slice(0,12),row:tx.row});
    if(tx.correction_ref){const original=document.transactions[tx.correction_ref];if(!original||original.correction_ref||original.employee!==tx.employee||original.period!==tx.period||original.pay_code!==tx.pay_code||original.key===tx.key)errors.push({error:'INVALID_CORRECTION_REFERENCE',row:tx.row});}
    const list=grouped.get(tx.employee)||[];list.push(tx);grouped.set(tx.employee,list);
  }
  for(const employee of employees) {
    const entries=grouped.get(employee.key)||[],periodHours=new Map(),months=new Set();let base=0,variable=0;
    for(const tx of entries) {
      const month=Number(tx.period.slice(-2));months.add(month);
      if(month<employee.first_month||month>employee.last_month)errors.push({error:'PAYROLL_OUTSIDE_EMPLOYMENT',employee:employee.key.slice(0,12),period:tx.period});
      const classification=document.codes[JSON.stringify([tx.source,tx.pay_code])]?.classification;
      if(classification==='ordinary')base+=tx.amount_cents;
      if(classification==='variable')variable+=tx.amount_cents;
      if(tx.hours_cents){if(periodHours.has(tx.period)&&periodHours.get(tx.period)!==tx.hours_cents)errors.push({error:'CONFLICTING_PERIOD_HOURS',employee:employee.key.slice(0,12),period:tx.period});else periodHours.set(tx.period,tx.hours_cents);}
    }
    for(let month=employee.first_month;month<=employee.last_month;month++)if(!months.has(month)||!periodHours.has(`${year}-${String(month).padStart(2,'0')}`))errors.push({error:'MISSING_PAYROLL_PERIOD_OR_HOURS',employee:employee.key.slice(0,12),period:`${year}-${String(month).padStart(2,'0')}`});
    try {
      const normalized=normalizeEmployee({internal_id:employee.key,gender:employee.gender,job_title:employee.job_title,worker_category:employee.worker_category,base_annual:base/100,bonuses_annual:variable/100,paid_hours_annual:[...periodHours.values()].reduce((a,b)=>a+b,0)/100,hours_per_week:employee.hours_per_week},company,secret);
      rows.push({...normalized,anonymized_id:employee.key});
    }catch(error){errors.push({error:error.message,employee:employee.key.slice(0,12)});}
  }
  return {rows,codes,errors:errors.slice(0,100),errorCount:errors.length,employeeCount:employees.length,transactionCount:transactions.length,ready:errors.length===0&&rows.length>0};
}
