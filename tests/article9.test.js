import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {analyze} from '../server/pay.js';
import {article9,article9Rows,letters} from '../server/article9.js';
import {reportData,reportText,reportCsv,reportXlsx} from '../server/reports.js';

const person=(i,gender,base,bonus,category='Engineering')=>({anonymized_id:`id${String(i).padStart(3,'0')}`,gender,worker_category:category,base_annual:base,bonuses_annual:bonus,paid_hours_annual:2000,base_hourly:base/2000,variable_hourly:bonus/2000,total_hourly:(base+bonus)/2000});
// 8 women paid 90% of 8 men; every man gets a bonus, only half of the women do.
const rows=[...Array.from({length:8},(_,i)=>person(i,'M',100000,10000)),...Array.from({length:8},(_,i)=>person(100+i,'F',90000,i<4?10000:0))];
const snapshot=(audience,extra={})=>({id:'s1',reporting_year:2026,rows,audience,...extra});

test('all seven Article 9(1) indicators are present with correct values',()=>{
  const items=article9(analyze(rows),{country:'DE',audience:'authority'}),by=Object.fromEntries(items.map(i=>[i.letter,i]));
  assert.deepEqual(items.map(i=>i.letter),letters);
  assert.equal(by.a.values.hourly,Number(((110000/2000-(90000*8+10000*4)/8/2000)/(110000/2000)*100).toFixed(4)));
  assert.equal(by.e.values.male_percent,100);assert.equal(by.e.values.female_percent,50);
  assert.equal(by.f.values.length,4);assert.equal(by.g.values[0].category,'Engineering');
  assert.match(by.c.reference,/Art\. 9\(1\)\(c\)/);
});

test('public audience gets a-f only; g stays with authority, workers and internal',()=>{
  const letterSet=audience=>reportData({name:'X',country:'SI'},snapshot(audience)).article9.map(i=>i.letter).join('');
  assert.equal(letterSet('public'),'abcdef');
  for(const audience of ['authority','workers','internal'])assert.equal(letterSet(audience),'abcdefg');
  assert.equal(reportData({name:'X',country:'SI'},snapshot('public')).groups,undefined);
});

test('titles follow the company country language',()=>{
  const title=country=>article9(analyze(rows),{country}).find(i=>i.letter==='a').title;
  assert.match(title('DE'),/Entgeltgefälle/);assert.match(title('AT'),/Entgeltgefälle/);assert.match(title('SI'),/plačah/);
});

test('every format carries the Article 9 indicators',()=>{
  const company={name:'X',country:'DE'};
  const text=reportText(company,snapshot('internal'));
  for(const letter of letters.slice(0,6))assert.ok(text.includes(`(${letter}) `),`text has (${letter})`);
  assert.match(reportCsv(company,snapshot('internal')),/art9_letter/);
  const book=XLSX.read(reportXlsx(company,snapshot('workers')),{type:'buffer'});
  assert.ok(book.SheetNames.includes('Article 9'));
  const sheet=XLSX.utils.sheet_to_json(book.Sheets['Article 9'],{header:1});
  assert.ok(sheet.some(r=>r[0]==='g'));
  assert.ok(article9Rows(article9(analyze(rows),{country:'DE'})).every(r=>r.length===6));
});

test('public export omits category data in every format',()=>{
  const company={name:'X',country:'SI'},xlsx=XLSX.read(reportXlsx(company,snapshot('public')),{type:'buffer'});
  assert.ok(!xlsx.SheetNames.includes('Categories'));
  assert.ok(!XLSX.utils.sheet_to_json(xlsx.Sheets['Article 9'],{header:1}).some(r=>r[0]==='g'));
  assert.ok(!reportCsv(company,snapshot('public')).includes(',"g",'));
});
