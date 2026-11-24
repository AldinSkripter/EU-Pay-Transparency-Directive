import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PayUploads} from '../server/pay-uploads.js';
import {payImportLimits as limits} from '../shared/pay-import-limits.js';
import {makeZip} from './helpers.js';
import {emptyLedger,addPayrollRecords,approvePayrollCodes,calculatePayroll} from '../server/payroll-ledger.js';
import {readPayRowPages} from '../server/pay-row-pages.js';

const checksum=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'eq-pay-upload-')),key=randomBytes(32),uploads=new PayUploads({key,root}),company=randomUUID();t.after(async()=>{clearInterval(uploads.sweeper);for(const w of uploads.running.values())await w?.terminate();await rm(root,{recursive:true,force:true});});return {root,key,uploads,company};}
async function send(uploads,company,bytes,name='payroll.csv'){
 const job=await uploads.create(company,{name,size:bytes.length});for(let offset=0,index=0;offset<bytes.length;offset+=limits.chunkBytes,index++){const b=bytes.subarray(offset,offset+limits.chunkBytes);await uploads.chunk(company,job.id,index,b,checksum(b));}return job.id;
}
async function finish(uploads,company,id,options={}){await uploads.process(company,id,options);for(let i=0;i<30000;i++){const m=await uploads.load(company,id);if(!['processing','queued'].includes(m.status))return m;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out');}

test('encrypted uploads are tenant-bound, resumable, checksum checked and retries cannot change committed chunks',async t=>{
 const {uploads,company,root,key}=await fixture(t),bytes=Buffer.from('id;title\n001;Engineer'),job=await uploads.create(company,{name:'payroll.csv',size:bytes.length});
 await assert.rejects(uploads.chunk(company,job.id,0,bytes,'0'.repeat(64)),/CHECKSUM/);
 await uploads.chunk(company,job.id,0,bytes,checksum(bytes));await uploads.chunk(company,job.id,0,bytes,checksum(bytes));
 await assert.rejects(uploads.chunk(company,job.id,0,Buffer.alloc(bytes.length),checksum(Buffer.alloc(bytes.length))),/CONFLICT/);
 await assert.rejects(uploads.load(randomUUID(),job.id),/NOT_FOUND/);
 assert.ok(!(await readFile(join(root,company,job.id,'0.enc'))).includes(Buffer.from('Engineer')));
 const reopened=new PayUploads({key,root});t.after(()=>clearInterval(reopened.sweeper));assert.equal((await reopened.load(company,job.id)).uploadedBytes,bytes.length);
 const done=await finish(reopened,company,job.id);assert.equal(done.status,'ready',JSON.stringify(done));assert.equal((await reopened.result(company,job.id,{})).rows[0].title,'Engineer');
 await uploads.remove(company,job.id);await assert.rejects(uploads.load(company,job.id),/NOT_FOUND/);
});

test('large CSV streams without truncation; malformed final row blocks the whole job',async t=>{
 const {uploads,company}=await fixture(t),csv='id;title\n001;Engineer\n'+' '.repeat(21*1024*1024)+'\n';
 const id=await send(uploads,company,Buffer.from(csv));const completed=await finish(uploads,company,id);assert.equal(completed.status,'ready',JSON.stringify(completed));
 assert.equal((await uploads.result(company,id,{})).rows.length,1);
 const invalid=await send(uploads,company,Buffer.from(csv+'002;Bad;Unexpected\n'));
 const result=await finish(uploads,company,invalid);assert.equal(result.status,'needs_review');assert.equal(result.error,'INVALID_CSV');await assert.rejects(uploads.result(company,invalid,{}),/INVALID_CSV/);
});

test('large JSON and XML discover record paths, preserve rows, reject unsafe entities and nested arrays',async t=>{
 const {uploads,company}=await fixture(t),padding=' '.repeat(21*1024*1024);
 for(const [name,body] of [['payroll.json',padding+'{"employees":[{"id":"001","title":"Engineer"},{"id":"002","title":"HR"}]}'],['payroll.xml','<employees>'+padding+'<employee><id>001</id><title>Engineer</title></employee><employee><id>002</id><title>HR</title></employee></employees>']]){
  const id=await send(uploads,company,Buffer.from(body),name);const result=await finish(uploads,company,id);assert.equal(result.status,'ready',JSON.stringify(result));assert.equal((await uploads.result(company,id,{})).rows.length,2);await uploads.remove(company,id);
 }
 const id=await send(uploads,company,Buffer.from(padding+'[{"id":"001","title":["nested"]}]'),'bad.json');const result=await finish(uploads,company,id);assert.equal(result.status,'needs_review');assert.equal(result.error,'JSON_NESTED_ARRAY');
});

test('ZIP archives require explicit file selection and every selected row is processed',async t=>{
 const {uploads,company}=await fixture(t),id=await send(uploads,company,makeZip([{name:'a.csv',data:'id;name\n1;Alice'},{name:'b.csv',data:'id;name\n2;Bob'}]),'payroll.zip');
 assert.equal((await finish(uploads,company,id)).status,'needs_selection');const options={zipEntry:'b.csv'};assert.equal((await finish(uploads,company,id,options)).status,'ready');assert.equal((await uploads.result(company,id,options)).rows[0].name,'Bob');
});

test('one GiB is an enforced upload boundary; incomplete uploads cannot start processing',async t=>{
 const {uploads,company}=await fixture(t);await assert.rejects(uploads.create(company,{name:'file.csv',size:limits.uploadBytes+1}),/SIZE/);
 const job=await uploads.create(company,{name:'file.csv',size:limits.uploadBytes});await assert.rejects(uploads.process(company,job.id,{}),/INCOMPLETE/);
});

test('reprocessing never overwrites pages already selected by another import; tampered pages fail authentication',async t=>{
 const {uploads,company,root}=await fixture(t),id=await send(uploads,company,Buffer.from('id;title\n1;Engineer\n2;Manager')),options={kind:'transactions'};
 assert.equal((await finish(uploads,company,id,options)).status,'ready');const first=await uploads.result(company,id,options),dir=join(root,company,id);
 const nextOptions={kind:'transactions',headerRow:2};assert.equal((await finish(uploads,company,id,nextOptions)).status,'ready');const second=await uploads.result(company,id,nextOptions);assert.notEqual(first.rowGeneration,second.rowGeneration);assert.equal(second.rowCount,1);
 const old=[];for await(const page of readPayRowPages({...first,dir,key:uploads.key,companyId:company,id}))old.push(...page);assert.equal(old.length,2);assert.equal(old[1].title,'Manager');
 const name=join(dir,`rows-${first.rowGeneration}-0.enc`),bytes=await readFile(name);bytes[20]^=1;await writeFile(name,bytes);
 await assert.rejects(async()=>{for await(const page of readPayRowPages({...first,dir,key:uploads.key,companyId:company,id})){}},/IMPORT_UPLOAD_CORRUPTED/);
});

test('240,000 yearly transaction rows are preserved, including the final employee/month',async t=>{
 const {uploads,company}=await fixture(t),parts=['transaction_id;internal_id;period;pay_code;amount;currency;paid_hours\n'];
 for(let employee=1;employee<=1000;employee++)for(let month=1;month<=12;month++)for(let code=1;code<=20;code++)parts.push(`${employee}-${month}-${code};${employee};2026-${String(month).padStart(2,'0')};${code};100.00;EUR;${code===1?'160.00':'0'}\n`);
 const id=await send(uploads,company,Buffer.from(parts.join(''))),options={kind:'transactions'},done=await finish(uploads,company,id,options);
 assert.equal(done.status,'ready',JSON.stringify(done));const result=await uploads.result(company,id,options);assert.equal(result.rowCount,240000);const allRows=[];for await(const page of uploads.pages(company,id,options))allRows.push(...page);assert.equal(allRows.length,240000);assert.equal(allRows.at(-1).transaction_id,'1000-12-20');result.rows=allRows;
 const secret='s'.repeat(64),hrRows=Array.from({length:1000},(_,i)=>({internal_id:String(i+1),gender:i%2?'M':'F',job_title:'Engineer',worker_category:'Engineering',hours_per_week:'40'})),hrHeaders=Object.keys(hrRows[0]);
 const settings={secret,company,year:2026,source:'payroll'},identity=headers=>Object.fromEntries(headers.map(h=>[h,h]));
 const hr=addPayrollRecords(emptyLedger(),{headers:hrHeaders,rows:hrRows,fileHash:'hr'},{...settings,kind:'hr',mapping:identity(hrHeaders)});assert.deepEqual(hr.errors,[]);
 const staged=addPayrollRecords(hr.document,result,{...settings,kind:'transactions',mapping:identity(result.headers)});assert.deepEqual(staged.errors,[]);assert.equal(staged.added,240000);
 const classified=approvePayrollCodes(staged.document,Array.from({length:20},(_,i)=>({source:'payroll',code:String(i+1),classification:'ordinary',reason:'Confirmed synthetic base-pay code'})),'tester');
 const calculation=calculatePayroll(classified,settings);assert.equal(calculation.ready,true);assert.equal(calculation.rows.length,1000);assert.equal(calculation.rows[999].base_annual,24000);assert.equal(calculation.rows[999].paid_hours_annual,1920);
});

test('exactly one GiB is uploaded, authenticated, streamed and fully counted', {skip:process.env.PAY_IMPORT_GB_TEST!=='1',timeout:600000},async t=>{
 const {uploads,company}=await fixture(t),job=await uploads.create(company,{name:'one-gib.csv',size:limits.uploadBytes}),hash=createHash('sha256');
 const header=Buffer.from('id;title\n');let blocks=[],index=0;
 for(let row=0;row<1024;row++){
  const line=Buffer.alloc(1024*1024-(row===0?header.length:0),32),value=Buffer.from(`${row};Engineer`);value.copy(line);line[line.length-1]=10;
  blocks.push(row===0?Buffer.concat([header,line]):line);
  if(blocks.length===4){const chunk=Buffer.concat(blocks);hash.update(chunk);await uploads.chunk(company,job.id,index++,chunk,checksum(chunk));blocks=[];}
 }
 const done=await finish(uploads,company,job.id);assert.equal(done.status,'ready',JSON.stringify(done));assert.equal(done.uploadedBytes,limits.uploadBytes);assert.equal(done.fileHash,hash.digest('hex'));
 const result=await uploads.result(company,job.id,{});assert.equal(result.rows.length,1024);assert.equal(result.rows.at(-1).id,'1023');
});

test('file-backed XLSX and ODS stream large archives and reject formulas rather than trusting cached values',async t=>{
 const {uploads,company}=await fixture(t),padding={name:'padding.dat',data:Buffer.alloc(21*1024*1024),method:0};
 const sheet=formula=>`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>title</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>001</t></is></c><c r="B2" t="inlineStr"><is><t>Engineer</t></is>${formula?'<f>1+1</f>':''}</c></row></sheetData></worksheet>`;
 const entries=formula=>[
  {name:'xl/workbook.xml',data:'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Payroll" sheetId="1" r:id="rId1"/></sheets></workbook>'},
  {name:'xl/_rels/workbook.xml.rels',data:'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'},
  {name:'xl/worksheets/sheet1.xml',data:sheet(formula)},padding];
 const id=await send(uploads,company,makeZip(entries(false)),'payroll.xlsx');const result=await finish(uploads,company,id);assert.equal(result.status,'ready',JSON.stringify(result));assert.equal((await uploads.result(company,id,{})).rows[0].title,'Engineer');await uploads.remove(company,id);
 const bad=await send(uploads,company,makeZip(entries(true)),'formula.xlsx');assert.equal((await finish(uploads,company,bad)).error,'WORKBOOK_FORMULA_OR_LINK');await uploads.remove(company,bad);
 const content='<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Payroll"><table:table-row><table:table-cell><text:p>id</text:p></table:table-cell><table:table-cell><text:p>title</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>001</text:p></table:table-cell><table:table-cell><text:p>Engineer</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>';
 const ods=await send(uploads,company,makeZip([{name:'mimetype',data:'application/vnd.oasis.opendocument.spreadsheet'},{name:'content.xml',data:content},padding]),'payroll.ods');const r=await finish(uploads,company,ods);assert.equal(r.status,'ready',JSON.stringify(r));assert.equal((await uploads.result(company,ods,{})).rows[0].title,'Engineer');
});
