import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, suggestMapping, mapImportRecord, validateMapping, inspectImport, validateImportContext } from '../server/importer.js';

test('detects four delimiters with BOM, quoted delimiters and multiline values', () => {
  for (const delimiter of [',',';','\t','|']) {
    const parsed = parseDelimited(`\ufeffid${delimiter}title\r\n001${delimiter}"Engineer${delimiter}\nLevel 2"`);
    assert.equal(parsed.delimiter,delimiter);
    assert.equal(parsed.rows[0].id,'001');
    assert.equal(parsed.rows[0].title,`Engineer${delimiter}\nLevel 2`);
  }
});
test('rejects malformed records, duplicate headers, binary content and oversized input', () => {
  for (const text of ['id,id\n1,2','id,title\n1,2,3','id,title\n1,\u0000','id,title\n"bad','id,title\n'+ 'x'.repeat(4*1024*1024)]) assert.throws(()=>parseDelimited(text));
  assert.throws(()=>parseDelimited('id,title\n'+Array(10001).fill('1,Engineer').join('\n')));
});
test('multilingual mapping only proposes unambiguous annual fields', () => {
  const result = suggestMapping(['Personalnummer','Spol','Delovno mesto','Annual base pay','Bruttogehalt','Bruto plača','Lohnart']);
  assert.equal(result.mapping.internal_id,'Personalnummer');
  assert.equal(result.mapping.gender,'Spol');
  assert.equal(result.mapping.base_annual,'Annual base pay');
  assert.deepEqual(result.unmapped,['Bruttogehalt','Bruto plača','Lohnart']);
  assert.ok(result.suggestions.every(s=>s.requires_confirmation));
  assert.equal(suggestMapping(['internal_id','Employee ID']).mapping.internal_id,undefined);
});
test('decimal convention is explicit and grouping, exponents and mixed conventions fail closed', () => {
  const row = {base_annual:'60000,50',bonuses_annual:'0',paid_hours_annual:'2080',hours_per_week:'38,5'};
  assert.equal(mapImportRecord(row,undefined,',').base_annual,'60000.50');
  assert.throws(()=>mapImportRecord(row));
  for (const value of ['60.000,50','60,000.50','1e5','0x10','60000 EUR','']) assert.throws(()=>mapImportRecord({...row,base_annual:value},undefined,','));
  assert.throws(()=>mapImportRecord(row,undefined,'auto'));
});
test('mapping rejects reused columns and missing required fields', () => {
  assert.throws(()=>validateMapping({},['id']));
  assert.throws(()=>validateMapping([],['id']));
  const mapping=Object.fromEntries(['internal_id','gender','job_title','worker_category','base_annual','paid_hours_annual','hours_per_week'].map(f=>[f,f]));
  assert.doesNotThrow(()=>validateMapping(mapping,Object.keys(mapping)));
  assert.throws(()=>validateMapping({...mapping,gender:'internal_id'},Object.keys(mapping)));
});

test('language hints never determine country and decimal conventions are inspected across all rows', () => {
  const headers=['Šifra zaposlenega','Spol','Letna osnovna bruto plača','Država','Valuta','Leto obračuna'];
  const rows=[{'Šifra zaposlenega':'1',Spol:'Ž','Letna osnovna bruto plača':'60000,50','Država':'Slovenija',Valuta:'EUR','Leto obračuna':'2026'}];
  const context=inspectImport(headers,rows);
  assert.deepEqual(context.languages,['sl']);
  assert.deepEqual(context.countries,['SI']);
  assert.equal(context.decimalSeparator,',');
  assert.deepEqual(validateImportContext(headers,rows,{country:'SI',year:2026}),[]);
  assert.equal(validateImportContext(headers,rows,{country:'DE',year:2026})[0].error,'IMPORT_COUNTRY_MISMATCH');
  assert.equal(validateImportContext(headers,rows,{country:'SI',year:2027})[0].error,'IMPORT_YEAR_MISMATCH');
  assert.ok(inspectImport(headers,[...rows,{...rows[0],'Letna osnovna bruto plača':'60000.50'}]).warnings.includes('AMBIGUOUS_DECIMAL_FORMAT'));
});

test('explicit invalid currency, missing metadata values and monthly periods block annual imports', () => {
  for (const [column,value,code] of [['Währung','USD','IMPORT_CURRENCY_UNSUPPORTED'],['currency','','IMPORT_CURRENCY_UNSUPPORTED'],['period','2026-01','IMPORT_ANNUAL_PERIOD_REQUIRED'],['reporting_year','2025','IMPORT_YEAR_MISMATCH'],['Land','unknown','IMPORT_COUNTRY_MISMATCH']]) {
    assert.equal(validateImportContext([column],[{[column]:value}],{country:'AT',year:2026})[0].error,code);
  }
  const context=inspectImport(['id','Bruttobezug'],[{id:'1',Bruttobezug:'5000'}]);
  assert.ok(context.warnings.includes('PAY_BASIS_REQUIRES_REVIEW'));
  assert.ok(context.warnings.includes('REPORTING_PERIOD_NOT_IN_FILE'));
  assert.ok(context.warnings.includes('CURRENCY_NOT_IN_FILE'));
});

test('authorized German and Slovenian gender labels normalize without guessing from identity', () => {
  const row={base_annual:'60000',paid_hours_annual:'2080',hours_per_week:'40'};
  for (const gender of ['Ž','ženska','weiblich','W','Female']) assert.equal(mapImportRecord({...row,gender}).gender,'F');
  for (const gender of ['moški','männlich','M','Male']) assert.equal(mapImportRecord({...row,gender}).gender,'M');
  assert.equal(mapImportRecord({...row,gender:'unknown'}).gender,'unknown');
});

test('XML namespace and nested paths preserve field ambiguity and enforce contextual metadata',()=>{
  assert.equal(suggestMapping(['p:gender']).mapping.gender,'p:gender');
  assert.equal(suggestMapping(['hr.gender','payroll.gender']).mapping.gender,undefined);
  assert.equal(suggestMapping(['pay.base_annual']).mapping.base_annual,'pay.base_annual');
  assert.equal(validateImportContext(['p:reporting_country'],[{'p:reporting_country':'SI'}],{country:'DE',year:2026})[0].error,'IMPORT_COUNTRY_MISMATCH');
  assert.equal(validateImportContext(['@currency'],[{'@currency':'USD'}],{country:'SI',year:2026})[0].error,'IMPORT_CURRENCY_UNSUPPORTED');
  assert.equal(validateImportContext(['Lohnart'],[{Lohnart:'1000'}],{country:'AT',year:2026})[0].error,'PAY_CODE_CLASSIFICATION_REQUIRED');
});
