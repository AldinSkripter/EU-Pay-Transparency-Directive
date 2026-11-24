import {parse} from 'csv-parse/sync';
import {createHash} from 'node:crypto';

const fail=()=>{throw Object.assign(new Error('FINANCE_INVALID_BANK_CSV'),{status:400});};
export function parseFinanceBankCsv(body){
  const {csv,delimiter=';',mapping,account}=body;
  if(typeof csv!=='string'||csv.length>1000000||![';',',','\t'].includes(delimiter)||typeof account!=='string'||!account.trim()||account.length>80||!mapping)fail();
  let records;try{records=parse(csv,{columns:true,bom:true,delimiter,skip_empty_lines:true,max_record_size:10000,to:501});}catch{fail();}
  if(!records.length||records.length>500)fail();
  const keys=['externalId','bookedOn','amount','description'];if(keys.some(k=>typeof mapping[k]!=='string'||!Object.hasOwn(records[0],mapping[k])))fail();
  const rows=records.map(record=>{
    const externalId=String(record[mapping.externalId]).trim(),bookedOn=String(record[mapping.bookedOn]).trim(),raw=String(record[mapping.amount]).trim(),description=String(record[mapping.description]).trim();
    if(!externalId||externalId.length>120||description.length>1000||!/^\d{4}-\d{2}-\d{2}$/.test(bookedOn))fail();
    const d=new Date(bookedOn+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==bookedOn||bookedOn>new Date().toISOString().slice(0,10))fail();
    const match=/^([+-]?)(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(raw);if(!match)fail();
    const amountCents=(Number(match[2])*100+Number((match[3]||'').padEnd(2,'0')))*(match[1]==='-'?-1:1);if(!amountCents)fail();
    const bankAccount=account.trim(),id=createHash('sha256').update(bankAccount+'\0'+externalId).digest('hex');return {id,externalId,bankAccount,bookedOn,amountCents,description,currency:'EUR'};
  });
  const unique=new Map();for(const row of rows){const old=unique.get(row.id);if(old&&JSON.stringify(old)!==JSON.stringify(row))fail();unique.set(row.id,row);}
  return [...unique.values()];
}
