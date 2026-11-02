import test from 'node:test';
import assert from 'node:assert/strict';
import { reportXml,csvCell } from '../server/reports.js';
test('XML escapes free text and CSV neutralizes spreadsheet formulas', () => {
  const xml=reportXml({name:'A & B <C>',country:'SI'},{id:'test',reporting_year:2026,rows:[]});
  assert.match(xml,/A &amp; B &lt;C&gt;/); assert.match(xml,/status="DRAFT_UNVERIFIED"/);
  assert.equal(csvCell('=IMPORTXML("url")'),'"\'=IMPORTXML(""url"")"');
  assert.equal(csvCell('  @SUM(A1)'),'"\'  @SUM(A1)"');
  assert.equal(csvCell('normal'),'"normal"');
});
