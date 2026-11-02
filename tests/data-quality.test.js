import test from 'node:test';
import assert from 'node:assert/strict';
import { assessQuality, prepareRecords, validateFixes, cleanAmount, parseAmount, similarCategories, genderGuess, suggestColumnsByContent } from '../server/data-quality.js';

const headers = ['internal_id', 'gender', 'job_title', 'worker_category', 'base_annual', 'bonuses_annual', 'paid_hours_annual', 'hours_per_week'];
const mapping = Object.fromEntries(headers.map(h => [h, h]));
const rec = (id, gender, category, base, extra = {}) => ({ internal_id: id, gender, job_title: 'Staff', worker_category: category, base_annual: String(base), bonuses_annual: '1000', paid_hours_annual: '2000', hours_per_week: '40', ...extra });
const good = () => [...Array.from({ length: 6 }, (_, i) => rec(`M${i}`, 'M', 'Team', 50000 + i)), ...Array.from({ length: 6 }, (_, i) => rec(`F${i}`, 'F', 'Team', 49000 + i))];
const assess = (records, options = {}) => {
  const fixes = validateFixes(options.fixes, { headers, mapping, count: records.length });
  const prepared = prepareRecords(records, { headers, mapping, fixes, decimalSeparator: options.decimalSeparator || '.' });
  return assessQuality({ headers, rows: prepared.rows, records: prepared.records, mapping, decimalSeparator: options.decimalSeparator || '.', applied: prepared.applied });
};
const codes = result => result.findings.map(f => f.code);
const find = (result, code) => result.findings.find(f => f.code === code);

test('clean data is ready, with no errors', () => {
  const result = assess(good());
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.ready, true);
  assert.equal(result.summary.rows, 12);
});

test('amount cleaning only removes unambiguous grouping and never reads 60.50 as 6050', () => {
  assert.equal(cleanAmount('60.000,00 €', ','), '60000,00');
  assert.equal(cleanAmount('€ 60 000', '.'), '60000');
  assert.equal(cleanAmount('60 000', '.'), '60000');
  assert.equal(cleanAmount("60'000", '.'), '60000');
  assert.equal(cleanAmount('60,000.50', '.'), '60000.50');
  assert.equal(cleanAmount('60.50', ','), null, 'a dot that is not a group of three stays unreadable under the comma setting');
  assert.equal(cleanAmount('1.2.3', ','), null);
  assert.equal(cleanAmount('abc', '.'), null);
  assert.ok(Number.isNaN(parseAmount('60.000,00', ',')));
  assert.equal(parseAmount('60000,5', ','), 60000.5);
});

test('unreadable numbers: the finding points to the rows and offers the right correction', () => {
  const rows = good();
  rows[2].base_annual = '55.000,00 €';
  rows[3].base_annual = '52 000';
  const result = assess(rows);
  const finding = find(result, 'NUMBER_FORMAT');
  assert.equal(finding.field, 'base_annual');
  assert.equal(finding.count, 2);
  assert.deepEqual(finding.rows, [4, 5], 'row numbers are the file rows: header is row 1');
  assert.equal(finding.fix, undefined, 'under the dot setting "55.000,00 €" cannot be cleaned without guessing');
  assert.deepEqual(find(assess(rows, { decimalSeparator: ',' }), 'NUMBER_FORMAT').fix, { type: 'normalizeNumbers' }, 'with the comma setting both values are readable after cleaning');
  assert.equal(result.summary.ready, false);
});

test('normalizing numbers makes the data importable and the finding disappears', () => {
  const rows = good();
  rows[2].base_annual = '55 000';
  rows[3].base_annual = '€ 52,000';
  const result = assess(rows, { fixes: { normalizeNumbers: true } });
  assert.equal(codes(result).includes('NUMBER_FORMAT'), false);
  assert.equal(result.summary.errors, 0);
});

test('a decimal-comma file read with the dot setting is detected and the switch is offered', () => {
  const rows = good().map(r => ({ ...r, base_annual: '50000,50', bonuses_annual: '1000,00' }));
  const finding = find(assess(rows), 'NUMBER_FORMAT');
  assert.deepEqual(finding.fix, { type: 'decimalSeparator', value: ',' });
  assert.equal(assess(rows, { decimalSeparator: ',' }).summary.errors, 0);
});

test('thousands separators read as decimals are flagged before they silently become tiny amounts', () => {
  const rows = good().map(r => ({ ...r, base_annual: '50.000', paid_hours_annual: '2.080' }));
  const result = assess(rows);
  const finding = result.findings.filter(f => f.code === 'THOUSANDS_AS_DECIMAL');
  assert.deepEqual(finding.map(f => f.field), ['base_annual', 'paid_hours_annual']);
  assert.deepEqual(finding[0].fix, { type: 'decimalSeparator', value: ',' });
  assert.equal(result.summary.errors, 0, 'it is a warning: the numbers are readable, the meaning is doubtful');
});

test('monthly amounts instead of annual ones are recognised and can be multiplied after the user chooses a factor', () => {
  const rows = good().map(r => ({ ...r, base_annual: '4000', bonuses_annual: '0' }));
  const finding = find(assess(rows), 'AMOUNT_NOT_ANNUAL');
  assert.deepEqual(finding.fix.factors, [12, 13, 14]);
  const fixed = assess(rows, { fixes: { multiply: { base_annual: 14 } } });
  assert.equal(codes(fixed).includes('AMOUNT_NOT_ANNUAL'), false);
  assert.equal(prepareRecords(rows, { headers, mapping, fixes: { multiply: { base_annual: 14 } } }).records[0].base_annual, '56000');
  assert.equal(prepareRecords([{ ...rows[0], base_annual: '4000,50' }], { headers, mapping, decimalSeparator: ',', fixes: { multiply: { base_annual: 12 } } }).records[0].base_annual, '48006');
});

test('empty required values, empty variable pay and out-of-range values', () => {
  const rows = good();
  rows[0].gender = ''; rows[1].job_title = ''; rows[2].bonuses_annual = ''; rows[3].paid_hours_annual = '9000'; rows[4].hours_per_week = '0';
  const result = assess(rows);
  assert.deepEqual(result.findings.filter(f => f.code === 'MISSING_VALUE').map(f => f.field).sort(), ['gender', 'job_title']);
  assert.deepEqual(find(result, 'BONUS_EMPTY').fix, { type: 'emptyBonusAsZero' });
  assert.deepEqual(result.findings.filter(f => f.code === 'VALUE_OUT_OF_RANGE').map(f => f.field).sort(), ['hours_per_week', 'paid_hours_annual']);
  assert.equal(assess(rows, { fixes: { emptyBonusAsZero: true } }).findings.some(f => f.code === 'BONUS_EMPTY'), false);
});

test('unknown gender labels get a suggestion but are never decided silently', () => {
  const rows = good();
  rows[0].gender = 'Herr'; rows[1].gender = 'Frau'; rows[2].gender = 'Frau'; rows[3].gender = '?';
  const finding = find(assess(rows), 'GENDER_UNKNOWN');
  assert.deepEqual(finding.values, [{ value: 'Frau', count: 2, suggestion: 'F' }, { value: 'Herr', count: 1, suggestion: 'M' }, { value: '?', count: 1, suggestion: null }]);
  assert.equal(genderGuess('weiblich'), 'F');
  assert.equal(genderGuess('Männlich'), 'M');
  assert.equal(genderGuess('1'), null, 'numeric codes mean different things in different systems');
  const fixed = assess(rows, { fixes: { genderMap: { Frau: 'F', Herr: 'M', '?': 'O' } } });
  assert.equal(codes(fixed).includes('GENDER_UNKNOWN'), false);
});

test('duplicates: identical rows can be dropped, conflicting ones need a decision', () => {
  const rows = good();
  rows.push({ ...rows[0] });
  rows.push({ ...rows[1], base_annual: '99999' });
  const result = assess(rows);
  const identical = find(result, 'DUPLICATE_IDENTICAL'), conflicting = find(result, 'DUPLICATE_CONFLICTING');
  assert.deepEqual(identical.fix, { type: 'excludeRows', rows: [14] });
  assert.equal(conflicting.count, 2);
  assert.deepEqual(conflicting.rows, [3, 15]);
  const after = assess(rows, { fixes: { excludeRows: [14] } });
  assert.equal(after.summary.excluded, 1);
  assert.equal(codes(after).includes('DUPLICATE_IDENTICAL'), false);
});

test('total lines and blank rows are not employees', () => {
  const rows = [...good(), rec('Summe', 'M', 'Team', 600000), rec('', '', '', '', { job_title: '', bonuses_annual: '', paid_hours_annual: '', hours_per_week: '' })];
  rows[13].base_annual = '';
  const finding = find(assess(rows), 'NOT_AN_EMPLOYEE');
  assert.equal(finding.count, 2);
  assert.deepEqual(finding.fix.rows, [14, 15]);
  assert.equal(assess(rows, { fixes: { excludeRows: [14, 15] } }).summary.errors, 0);
});

test('implausible hours, bonus above base, no variable pay, personal ids', () => {
  const rows = good();
  rows[0].paid_hours_annual = '50'; rows[1].hours_per_week = '80'; rows[2].bonuses_annual = '90000'; rows[3].internal_id = 'anna.muster@firma.de'; rows[4].internal_id = 'Anna Muster';
  const result = assess(rows);
  assert.deepEqual(result.findings.filter(f => f.code === 'HOURS_IMPLAUSIBLE').map(f => f.field).sort(), ['hours_per_week', 'paid_hours_annual']);
  assert.equal(find(result, 'BONUS_EXCEEDS_BASE').count, 1);
  assert.equal(find(result, 'ID_LOOKS_PERSONAL').count, 2);
  const noBonus = assess(good().map(r => ({ ...r, bonuses_annual: '0' })));
  assert.ok(find(noBonus, 'NO_VARIABLE_PAY'), 'all-zero variable pay is a question the user should answer, not an error');
  assert.equal(noBonus.summary.errors, 0);
  const mismatch = assess(good().map((r, i) => i === 0 ? { ...r, hours_per_week: '20' } : r));
  assert.equal(find(mismatch, 'HOURS_MISMATCH').count, 1);
});

test('pay far from the category median is flagged only where there are enough people to compare', () => {
  const rows = good();
  rows[0].base_annual = '500000';
  assert.deepEqual(find(assess(rows), 'OUTLIER_PAY').rows, [2]);
  assert.equal(codes(assess(rows.slice(0, 5))).includes('OUTLIER_PAY'), false);
});

test('categories: spelling variants merge, levels and grades never do', () => {
  const counts = new Map([['Sachbearbeiter', 8], ['sachbearbeiter ', 2], ['Sachbearbeiter/in', 1], ['Sachbearbeiterin', 3], ['Engineer L2', 5], ['Engineer L3', 5], ['Developer I', 4], ['Developer II', 4], ['Entgeltgruppe 5', 3], ['Entgeltgruppe 6', 3], ['Gruppe A', 2], ['Gruppe B', 2], ['Projektmanagement', 6], ['Projektmanagment', 1]]);
  const groups = similarCategories(counts);
  const flat = groups.map(g => [g.to, ...g.from].sort());
  assert.deepEqual(flat.find(g => g.includes('Sachbearbeiter')).sort(), ['Sachbearbeiter', 'Sachbearbeiter/in', 'Sachbearbeiterin', 'sachbearbeiter '].sort());
  assert.ok(flat.some(g => g.includes('Projektmanagement') && g.includes('Projektmanagment')), 'a dropped letter in a long name');
  for (const pair of [['Engineer L2', 'Engineer L3'], ['Developer I', 'Developer II'], ['Entgeltgruppe 5', 'Entgeltgruppe 6'], ['Gruppe A', 'Gruppe B']]) assert.equal(flat.some(g => g.includes(pair[0]) && g.includes(pair[1])), false, `${pair} must stay separate`);
  assert.equal(groups.find(g => g.to === 'Sachbearbeiter').counts['Sachbearbeiter'], 8);
  const result = assess(good().map((r, i) => i === 0 ? { ...r, worker_category: 'team ' } : r.internal_id === 'M1' ? { ...r, worker_category: 'TEAM' } : r));
  assert.ok(find(result, 'CATEGORY_SIMILAR'));
  const merged = prepareRecords(good().map((r, i) => i === 0 ? { ...r, worker_category: 'team ' } : r), { headers, mapping, fixes: validateFixes({ categoryMap: { 'team': 'Team' } }, { headers, mapping, count: 12 }) });
  assert.equal(merged.records[0].worker_category, 'Team', 'labels are matched the way the finding lists them: trimmed');
  assert.equal(merged.applied.categories, 1);
});

test('category structure: one category for everyone, too many single-person categories, one-sided and small groups', () => {
  assert.ok(find(assess(good()), 'CATEGORY_GROUP_SIZES') === undefined, '6 women and 6 men: nothing to say');
  assert.ok(find(assess(good().slice(0, 4).concat(good().slice(6, 8))), 'CATEGORY_GROUP_SIZES'), 'fewer than five of a sex');
  const single = assess(Array.from({ length: 12 }, (_, i) => rec(`X${i}`, i % 2 ? 'M' : 'F', 'Alle', 50000)));
  assert.ok(find(single, 'CATEGORY_SINGLE'));
  const fine = assess(Array.from({ length: 8 }, (_, i) => rec(`Y${i}`, i % 2 ? 'M' : 'F', `Bereich ${String.fromCharCode(97 + i)}${i * 7}`, 50000)));
  assert.equal(find(fine, 'CATEGORY_TOO_FINE').singles, 8);
});

test('columns that look personal and are not used are reported as ignored, not stored', () => {
  const result = assessQuality({ headers: [...headers, 'Nachname', 'IBAN', 'Geburtsdatum', 'Kostenstelle'], rows: [2], records: [{ ...rec('1', 'M', 'Team', 50000), Nachname: 'X', IBAN: 'Y', Geburtsdatum: 'Z', Kostenstelle: '1' }], mapping });
  assert.deepEqual(find(result, 'SENSITIVE_COLUMNS_IGNORED').columns, ['Nachname', 'IBAN', 'Geburtsdatum']);
});

test('required fields without a column: content-based suggestions only when exactly one column fits', () => {
  const heads = ['Nr', 'Merkmal X', 'Stunden pro Woche', 'Anstellung', 'Alter'];
  const rows = Array.from({ length: 10 }, (_, i) => ({ Nr: `${1000 + i}`, 'Merkmal X': i % 2 ? 'w' : 'm', 'Stunden pro Woche': i % 3 ? '40' : '20', Anstellung: 'Vollzeit', Alter: `${30 + i}` }));
  const partial = { internal_id: 'Nr' };
  const suggestions = suggestColumnsByContent(heads, rows, partial);
  assert.deepEqual(suggestions.map(s => s.field).sort(), ['gender', 'hours_per_week'].sort());
  assert.equal(suggestions.find(s => s.field === 'gender').column, 'Merkmal X');
  assert.equal(suggestions.find(s => s.field === 'hours_per_week').column, 'Stunden pro Woche', 'age 30-39 sits in the same range but its header marks it as personal');
  const result = assessQuality({ headers: heads, rows: rows.map((_, i) => i + 2), records: rows, mapping: partial });
  const missing = find(result, 'MAPPING_MISSING');
  assert.ok(missing.fields.includes('gender') && missing.suggestions.length === 2);
});

test('fixes are validated: unknown keys, bad rows, bad factors, unmapped fields', () => {
  const ok = fixes => validateFixes(fixes, { headers, mapping, count: 12 });
  for (const bad of [[], 'x', { drop: true }, { normalizeNumbers: 'yes' }, { excludeRows: [1] }, { excludeRows: [14] }, { excludeRows: ['2'] }, { multiply: { base_annual: 7 } }, { multiply: { hours_per_week: 12 } }, { genderMap: { Frau: 'X' } }, { genderMap: [] }, { categoryMap: { a: '' } }, { edits: [{ row: 2, field: 'nope', value: '1' }] }, { edits: [{ row: 99, field: 'gender', value: 'M' }] }, { edits: [{ row: 2, field: 'gender', value: 5 }] }, { excludeRows: Array.from({ length: 501 }, () => 2) }]) assert.throws(() => ok(bad), /INVALID_FIXES/, JSON.stringify(bad).slice(0, 60));
  assert.deepEqual(ok(undefined), {});
  assert.throws(() => validateFixes({ edits: [{ row: 2, field: 'gender', value: 'M' }] }, { headers, mapping: { internal_id: 'internal_id' }, count: 12 }), /INVALID_FIXES/, 'cannot edit a field that has no column');
  const parsed = ok(JSON.parse('{"genderMap":{"__proto__":"M"},"excludeRows":[2,3]}'));
  assert.equal(parsed.genderMap.get('__proto__'), 'M');
  assert.equal(({}).polluted, undefined);
  assert.deepEqual([...parsed.excludeRows], [2, 3]);
});

test('manual edits and exclusions keep row numbers pointing at the source file', () => {
  const rows = good();
  rows[5].gender = 'unbekannt';
  const prepared = prepareRecords(rows, { headers, mapping, fixes: validateFixes({ edits: [{ row: 7, field: 'gender', value: 'M' }], excludeRows: [2] }, { headers, mapping, count: 12 }) });
  assert.equal(prepared.records.length, 11);
  assert.equal(prepared.rows[0], 3);
  assert.deepEqual(prepared.applied, { edits: 1, categories: 0, genders: 0, numbers: 0, bonusZero: 0, multiplied: 0, excluded: 1 });
  assert.equal(prepared.records.find((_, i) => prepared.rows[i] === 7).gender, 'M');
  assert.equal(rows[5].gender, 'unbekannt', 'the parsed input is not mutated');
  const withHeaderRow = prepareRecords(rows, { headers, mapping, headerRow: 3, fixes: validateFixes({ excludeRows: [4] }, { headers, mapping, count: 12, headerRow: 3 }) });
  assert.equal(withHeaderRow.rows[0], 5, 'with the header in row 3 the first data row is row 4, and it was excluded');
});
