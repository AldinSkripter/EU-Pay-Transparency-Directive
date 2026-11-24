import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import iconv from 'iconv-lite';
import { parseImportInput } from '../server/file-parser.js';

const file=bytes=>({base64:Buffer.from(bytes).toString('base64'),name:'misleading.dat'});
const table=[['internal_id','gender','job_title','worker_category','base_annual','paid_hours_annual','hours_per_week'],['001','F','Engineer','Engineering',60000.5,2080,38.5]];
export function workbookBytes(type='xlsx',multiple=false,formula=false) {
  const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(table);
  if(formula)sheet.E2={t:'n',v:60000,f:'1000*60'};
  XLSX.utils.book_append_sheet(book,sheet,'Payroll');
  if(multiple)XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Notes'],['Not payroll']]),'Notes');
  return XLSX.write(book,{type:'buffer',bookType:type,compression:true});
}
test('real XLSX and legacy XLS content are detected independently of filename',async()=>{
  for(const format of ['xlsx','xls']){
    const result=await parseImportInput({file:file(workbookBytes(format))});
    assert.equal(result.format,format);assert.equal(result.rows[0].internal_id,'001');
    assert.equal(result.rows[0].base_annual,'60000.5');assert.equal(result.fileHash.length,64);
  }
});
test('Excel worksheet selection and non-first header rows are explicit',async()=>{
  const bytes=workbookBytes('xlsx',true);
  const select=await parseImportInput({file:file(bytes)});
  assert.equal(select.selectionRequired,true);assert.deepEqual(select.sheets,['Payroll','Notes']);
  assert.equal((await parseImportInput({file:file(bytes),sheet:'Payroll'})).rows.length,1);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Annual export'],...table]),'Payroll');
  const result=await parseImportInput({file:file(XLSX.write(book,{type:'buffer',bookType:'xlsx'})),headerRow:2});
  assert.equal(result.headerRow,2);assert.equal(result.rows[0].internal_id,'001');
});
test('Excel formulas, macros and excessive worksheet dimensions are rejected',async()=>{
  await assert.rejects(parseImportInput({file:file(workbookBytes('xlsx',false,true))}),/WORKBOOK_FORMULA_OR_LINK/);
  const book=XLSX.utils.book_new();const sheet=XLSX.utils.aoa_to_sheet(table);sheet['!ref']='A1:A1048576';XLSX.utils.book_append_sheet(book,sheet,'Payroll');
  await assert.rejects(parseImportInput({file:file(XLSX.write(book,{type:'buffer',bookType:'xlsx'}))}),/INVALID_ROW_COUNT/);
  book.vbaraw=Buffer.from('test macro payload');
  await assert.rejects(parseImportInput({file:file(XLSX.write(book,{type:'buffer',bookType:'xlsm'}))}),/UNSAFE_WORKBOOK/);
});
test('XML parses namespaced records, attributes and nested fields without collapsing paths',async()=>{
  const xml='<p:payroll xmlns:p="urn:test"><p:employee id="001"><p:gender>F</p:gender><p:pay><p:base>60000</p:base><p:bonus>1000</p:bonus></p:pay></p:employee><p:employee id="002"><p:gender>M</p:gender><p:pay><p:base>61000</p:base><p:bonus>0</p:bonus></p:pay></p:employee></p:payroll>';
  const result=await parseImportInput({file:file(Buffer.from(xml)),recordPath:'p:payroll/p:employee'});
  assert.equal(result.rows.length,2);assert.equal(result.rows[0]['@id'],'001');assert.equal(result.rows[0]['p:pay.p:base'],'60000');
  const selected=await parseImportInput({file:file(Buffer.from(xml))});assert.equal(selected.selectionRequired,true);
});
test('XML rejects XXE, entity definitions, malformed input and excessive nesting',async()=>{
  for(const xml of ['<!DOCTYPE x SYSTEM "file:///etc/passwd"><x/>','<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>'])await assert.rejects(parseImportInput({file:file(Buffer.from(xml))}),/UNSAFE_XML/);
  await assert.rejects(parseImportInput({file:file(Buffer.from('<a><b></a>'))}),/INVALID_XML/);
  await assert.rejects(parseImportInput({file:file(Buffer.from('<a>'.repeat(25)+'</a>'.repeat(25)))}),/XML_LIMIT_EXCEEDED/);
});
test('UTF-16 BOM and explicit CP1250 preserve Slovenian letters without guessing',async()=>{
  const text='Šifra zaposlenega;Spol\n001;Ž';
  const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),iconv.encode(text,'utf-16le')]);
  assert.equal((await parseImportInput({file:file(utf16)})).rows[0].Spol,'Ž');
  const legacy=iconv.encode(text,'windows-1250');
  await assert.rejects(parseImportInput({file:file(legacy)}),/ENCODING_REQUIRED/);
  assert.equal((await parseImportInput({file:file(legacy),encoding:'windows-1250'})).rows[0].Spol,'Ž');
  await assert.rejects(parseImportInput({file:file(legacy),encoding:'invented'}),/INVALID_ENCODING/);
});
test('file limits, invalid base64 and unsupported binary input fail before import',async()=>{
  await assert.rejects(parseImportInput({file:{base64:'%%%'}}),/INVALID_FILE/);
  await assert.rejects(parseImportInput({file:file(Buffer.alloc(20*1024*1024+1))}),/INVALID_FILE|PAYLOAD_TOO_LARGE/);
  await assert.rejects(parseImportInput({file:file(Buffer.from([0,1,2,3]))}),/INVALID_CSV|INVALID_FILE/);
});
