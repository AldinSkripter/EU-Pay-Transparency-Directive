import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import iconv from 'iconv-lite';
import { parseImportInput } from '../server/file-parser.js';
import { suggestMapping, parseFixedWidth } from '../server/importer.js';
import { makeZip } from './helpers.js';
import { textEncodingIds } from '../shared/import-formats.js';

const headers = ['Personalnummer', 'Geschlecht', 'Tätigkeit', 'Vergleichsgruppe', 'Jahresgrundvergütung', 'Bezahlte Jahresstunden', 'Wochenstunden'];
const people = [['001', 'weiblich', 'Engineer', 'L3', 60000, 2080, 40], ['002', 'männlich', 'Engineer', 'L3', 63000, 2080, 40]];
const parse = (bytes, options = {}) => parseImportInput({ file: { name: 'export.bin', base64: Buffer.from(bytes).toString('base64') }, ...options });
const expectTable = (result, format) => {
  assert.equal(result.format, format);
  assert.deepEqual(result.headers, headers);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].Personalnummer, '001');
  assert.equal(result.rows[1].Jahresgrundvergütung, '63000');
};
const workbook = (rows = [headers, ...people], name = 'Lohn') => { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name); return book; };
const writeBook = (bookType, book = workbook()) => XLSX.write(book, { type: 'buffer', bookType });

test('spreadsheet formats: xlsx, xls, ods, Excel 2003 XML and HTML tables saved as .xls', async () => {
  for (const [bookType, format] of [['xlsx', 'xlsx'], ['biff8', 'xls'], ['ods', 'ods'], ['xlml', 'spreadsheetml'], ['html', 'html']]) {
    expectTable(await parse(writeBook(bookType)), format);
  }
});

test('spreadsheet sheet choice and header row work for every workbook format', async () => {
  const book = workbook([['Lohnliste 2026'], ['Mandant 100'], headers, ...people], 'Liste');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Notiz']]), 'Notizen');
  for (const bookType of ['xlsx', 'ods']) {
    const bytes = writeBook(bookType, book);
    const choice = await parse(bytes);
    assert.equal(choice.selectionRequired, true);
    assert.deepEqual(choice.sheets, ['Liste', 'Notizen']);
    expectTable(await parse(bytes, { sheet: 'Liste', headerRow: 3 }), bookType);
  }
});

test('formulas, links and macros are refused in every workbook format', async () => {
  const book = workbook([headers, ['001', 'weiblich', 'Engineer', 'L3', { t: 'n', v: 2, f: '1+1' }, 2080, 40]]);
  for (const bookType of ['xlsx', 'ods']) await assert.rejects(parse(writeBook(bookType, book)), /WORKBOOK_FORMULA_OR_LINK/, bookType);
  await assert.rejects(parse(writeBook('xlsb')), /XLSB_NOT_SUPPORTED/, 'binary workbooks are refused outright');
  const macro = makeZip([{ name: 'xl/workbook.xml', data: '<workbook/>' }, { name: 'xl/vbaProject.bin', data: 'x' }]);
  await assert.rejects(parse(macro), /UNSAFE_WORKBOOK/);
  const odsMacro = makeZip([{ name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet', method: 0 }, { name: 'content.xml', data: '<x/>' }, { name: 'Basic/Standard/Module1.xml', data: 'Sub X' }]);
  await assert.rejects(parse(odsMacro), /UNSAFE_WORKBOOK/);
});

test('JSON: array of employees, wrapped list, nested objects become dotted columns', async () => {
  const records = people.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
  expectTable(await parse(JSON.stringify(records)), 'json');
  const wrapped = await parse(JSON.stringify({ exportedAt: '2026-11-02', employees: records }));
  expectTable(wrapped, 'json');
  assert.equal(wrapped.recordPath, 'employees');
  const nested = await parse(JSON.stringify({ data: { employees: [{ id: '1', pay: { base: 60000, bonus: null, ok: true } }, { id: '2', pay: { base: 1 } }] } }));
  assert.deepEqual(nested.headers, ['id', 'pay.base', 'pay.bonus', 'pay.ok']);
  assert.deepEqual(nested.rows[0], { id: '1', 'pay.base': '60000', 'pay.bonus': '', 'pay.ok': 'true' });
  assert.equal(nested.rows[1]['pay.bonus'], '');
});

test('JSON: several lists need a choice; nested arrays, prototype keys and broken JSON are refused', async () => {
  const two = JSON.stringify({ employees: [{ a: 1, b: 2 }], departments: [{ a: 1, b: 2 }] });
  const choice = await parse(two);
  assert.equal(choice.selectionRequired, true);
  assert.deepEqual(choice.recordPaths.sort(), ['departments', 'employees']);
  assert.equal((await parse(two, { recordPath: 'departments' })).recordPath, 'departments');
  await assert.rejects(parse(JSON.stringify([{ a: 1, payments: [1, 2] }])), /JSON_NESTED_ARRAY/);
  await assert.rejects(parse('[{"a":1,"__proto__":{"x":1}}]'), /JSON_LIMIT_EXCEEDED|UNSAFE_JSON|INVALID_HEADERS/);
  await assert.rejects(parse('{"employees":[{"a":1}'), /INVALID_JSON/);
  await assert.rejects(parse(JSON.stringify({ meta: 1 })), /JSON_RECORDS_NOT_FOUND/);
});

test('ZIP container: one file is opened directly, several need a choice, safety limits apply', async () => {
  const csv = [headers.join(';'), ...people.map(p => p.join(';'))].join('\r\n');
  const single = await parse(makeZip([{ name: 'lohn.csv', data: csv }, { name: '__MACOSX/._lohn.csv', data: 'x' }]));
  expectTable(single, 'delimited');
  assert.equal(single.container, 'zip');
  assert.equal(single.zipEntry, 'lohn.csv');

  const several = makeZip([{ name: 'a.csv', data: csv }, { name: 'sub/b.json', data: JSON.stringify([{ x: 1, y: 2 }]) }]);
  const choice = await parse(several);
  assert.equal(choice.selectionRequired, true);
  assert.deepEqual(choice.zipEntries, ['a.csv', 'sub/b.json']);
  assert.equal((await parse(several, { zipEntry: 'sub/b.json' })).format, 'json');
  expectTable(await parse(several, { zipEntry: 'a.csv' }), 'delimited');

  const inner = writeBook('xlsx');
  expectTable(await parse(makeZip([{ name: 'Lohn.xlsx', data: inner }])), 'xlsx');
  await assert.rejects(parse(makeZip([{ name: 'inner.zip', data: makeZip([{ name: 'x.csv', data: csv }]) }])), /UNSUPPORTED_FILE_FORMAT/, 'no archives inside archives');
  await assert.rejects(parse(makeZip([{ name: 'lohn.csv', data: csv, flags: 1 }])), /UNSAFE_WORKBOOK/, 'encrypted entry');
  await assert.rejects(parse(makeZip([{ name: 'big.csv', data: Buffer.alloc(9 * 1024 * 1024, 0x41) }])), /PAYLOAD_TOO_LARGE/, 'bigger than the 8 MB limit once unpacked');
  await assert.rejects(parse(makeZip([{ name: 'empty/', data: '' }])), /UNSUPPORTED_FILE_FORMAT/);
});

test('text with title lines above the header: header row option and DATEV EXTF header', async () => {
  const csv = [headers.join(';'), ...people.map(p => p.join(';'))].join('\n');
  const withTitle = `Lohnliste 2026;;;\nMandant 100 "Muster GmbH";;;\n\n${csv}`;
  await assert.rejects(parse(withTitle), /INVALID_CSV/);
  expectTable(await parse(withTitle, { headerRow: 4 }), 'delimited');
  await assert.rejects(parse(withTitle, { headerRow: 99 }), /INVALID_HEADER_ROW/);

  const datev = `"EXTF";700;21;"Gehaltsliste";13;20261102120000;;"RE";"";"";29098;55003;20260101;4;;;"";"";0;0;"";""\n${csv}`;
  const result = await parse(datev);
  expectTable(result, 'datev');
  assert.equal(result.headerRow, 2);
});

test('fixed-width exports (ASC, DAT, LST, PRN) are split on the blank column bands', async () => {
  const line = (...cells) => [6, 12, 17, 4].map((width, i) => String(cells[i]).padEnd(width + 2)).join('').trimEnd();
  const lines = [line('PersNr', 'Geschlecht', 'Tätigkeit', 'Wochenstunden'), line('001', 'weiblich', 'Engineer', '40'), line('002', 'männlich', 'Sachbearbeiter', '38')];
  const result = await parse(lines.join('\r\n'));
  assert.equal(result.format, 'fixed-width');
  assert.deepEqual(result.headers, ['PersNr', 'Geschlecht', 'Tätigkeit', 'Wochenstunden']);
  assert.deepEqual(result.rows[1], { PersNr: '002', Geschlecht: 'männlich', Tätigkeit: 'Sachbearbeiter', Wochenstunden: '38' });
  assert.deepEqual(parseFixedWidth('Job title  Hours\nEngineer   40\nQA         38').headers, ['Job title', 'Hours'], 'a single space inside a header does not split it');
  assert.throws(() => parseFixedWidth('onlyonecolumn\nvalue'), /INVALID_CSV/);
  await assert.rejects(parse('this is just some prose without any structure'), /INVALID_CSV/);
});

test('code pages used by German, Austrian and Slovenian systems decode when chosen and never when guessed', async () => {
  const slovenian = 'Šifra zaposlenega;Spol;Delovno mesto;Letno osnovno plačilo\n001;Ž;Računovodja;41000,50\n002;M;Žičničar;39000';
  for (const encoding of ['windows-1250', 'iso-8859-2', 'ibm852']) {
    const result = await parse(iconv.encode(slovenian, encoding), { encoding });
    assert.deepEqual(result.headers, ['Šifra zaposlenega', 'Spol', 'Delovno mesto', 'Letno osnovno plačilo'], encoding);
    assert.equal(result.rows[1]['Delovno mesto'], 'Žičničar', encoding);
    await assert.rejects(parse(iconv.encode(slovenian, encoding)), /ENCODING_REQUIRED/, encoding + ' without a choice');
  }
  const german = 'Personalnummer;Geschlecht;Tätigkeit;Jahresgrundvergütung\n001;männlich;Fräser (€);60000';
  for (const encoding of ['windows-1252', 'iso-8859-1', 'iso-8859-15', 'ibm850']) {
    const text = encoding === 'iso-8859-1' || encoding === 'ibm850' ? german.replace('(€)', '') : german;
    const result = await parse(iconv.encode(text, encoding), { encoding });
    assert.equal(result.headers[2], 'Tätigkeit', encoding);
    assert.match(result.rows[0].Tätigkeit, /^Fräser/, encoding);
  }
  await assert.rejects(parse('a;b\n1;2', { encoding: 'koi8-r' }), /INVALID_ENCODING/);
  assert.ok(['windows-1250', 'windows-1252', 'iso-8859-2', 'ibm852'].every(e => textEncodingIds.includes(e)));
});

test('delimiters: comma, semicolon, tab, pipe, and UTF-16 with BOM regardless of file extension', async () => {
  for (const delimiter of [',', ';', '\t', '|']) expectTable(await parse([headers.join(delimiter), ...people.map(p => p.join(delimiter))].join('\n')), 'delimited');
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from([headers.join(';'), ...people.map(p => p.join(';'))].join('\n'), 'utf16le')]);
  expectTable(await parse(utf16), 'delimited');
});

test('unknown binary content and unsafe XML are refused', async () => {
  await assert.rejects(parse(Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x81])), /INVALID|ENCODING_REQUIRED|UNSUPPORTED/);
  await assert.rejects(parse('<!DOCTYPE x [<!ENTITY a "b">]><x><y>1</y></x>'), /UNSAFE_XML/);
  await assert.rejects(parse('<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><!DOCTYPE x [<!ENTITY a "b">]></Workbook>'), /UNSAFE_XML/);
});

test('vendor column names of German, Austrian and Slovenian payroll exports are recognised', () => {
  const cases = {
    DATEV: [['Pers.-Nr.', 'internal_id'], ['Geschl.', 'gender'], ['Entgeltgruppe', 'worker_category']],
    BMD_RZL: [['DN-Nr', 'internal_id'], ['Verwendungsgruppe', 'worker_category'], ['Wochenarbeitszeit', 'hours_per_week']],
    Personio: [['Gender', 'gender'], ['Position', 'job_title'], ['Weekly working hours', 'hours_per_week']],
    Pantheon: [['Šifra delavca', 'internal_id'], ['Naziv delovnega mesta', 'job_title'], ['Tedenski delovni čas', 'hours_per_week']],
  };
  for (const [system, columns] of Object.entries(cases)) {
    const { mapping } = suggestMapping(columns.map(([header]) => header));
    for (const [header, field] of columns) assert.equal(mapping[field], header, `${system}: ${header}`);
  }
  // Generic gross amounts stay unmapped: the period and basis must be confirmed by the user.
  assert.equal(suggestMapping(['Bruttogehalt', 'Pers.-Nr.']).mapping.base_annual, undefined);
});
