import {payrollFields} from './payroll-ledger.js';
// Explicit edits only. Record numbers refer to parsed data rows (1-based), never physical CSV lines.
export function validatePayrollEdits(parsed,{edits=[],kind,mapping}){
 if(!Array.isArray(edits)||edits.length>500)throw Error('INVALID_FIXES');
 const count=parsed.rowCount??parsed.rows.length,seen=new Set();
 for(const edit of edits){
  if(!edit||typeof edit!=='object'||Array.isArray(edit))throw Error('INVALID_FIXES');
  const column=mapping?.[edit.field],key=edit.record+':'+edit.field;
  if(!Number.isInteger(edit.record)||edit.record<1||edit.record>count||!payrollFields[kind]?.includes(edit.field)||!parsed.headers.includes(column)||seen.has(key)||typeof edit.value!=='string'||edit.value.length>2000||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(edit.value))throw Error('INVALID_FIXES');
  seen.add(key);
 }
 return edits;
}
export function editPayrollInput(parsed,settings){
 const edits=validatePayrollEdits({...parsed,rowCount:parsed.rows.length},settings);if(!edits.length)return parsed;const rows=parsed.rows.slice();
 for(const edit of edits)rows[edit.record-1]={...rows[edit.record-1],[settings.mapping[edit.field]]:edit.value};
 return {...parsed,rows};
}
