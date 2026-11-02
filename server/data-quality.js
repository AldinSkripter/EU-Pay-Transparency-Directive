// Data quality assistant for imports. Everything here is deterministic and runs without any external service.
// It does two things: it finds what is wrong or suspicious in the mapped data (assessQuality) and it applies the
// corrections the user chose (validateFixes + prepareRecords). Nothing is changed silently: every correction is an
// explicit entry in `fixes` that the user selected, and the original file is never modified or stored.
import { importFields, foldKey, genderCode } from './importer.js';
import { SMALL_GROUP_MINIMUM } from './pay.js';

export const REQUIRED_FIELDS = ['internal_id', 'gender', 'job_title', 'worker_category', 'base_annual', 'paid_hours_annual', 'hours_per_week'];
const NUMERIC = ['base_annual', 'bonuses_annual', 'paid_hours_annual', 'hours_per_week'];
const MAX_FIX_ENTRIES = 500, MAX_LISTED = 10, FACTORS = [12, 13, 14];

const strict = sep => sep === ',' ? /^\d+(,\d+)?$/ : /^\d+(\.\d+)?$/;
const other = sep => sep === ',' ? '.' : ',';
const text = value => String(value ?? '').trim();
const columnFor = (mapping, headers, field) => mapping ? (headers.includes(mapping[field]) ? mapping[field] : undefined) : (headers.includes(field) ? field : undefined);
const median = values => { const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : NaN; };

export function parseAmount(value, sep = '.') {
  const s = text(value);
  return strict(sep).test(s) ? Number(s.replace(',', '.')) : NaN;
}

// Rewrites "60.000,00 €", "€ 60 000" or "60'000" into the plain format of the chosen decimal separator. Grouping
// marks are only removed where they are unambiguous groups of three digits, so "60.50" is never read as 6050.
export function cleanAmount(value, sep = '.') {
  let s = text(value).replace(/[\s  '’]/g, '').replace(/^(€|eur|euro)|(€|eur|euro)$/gi, '');
  if (sep === ',' && /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
  if (sep === '.' && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  return strict(sep).test(s) ? s : null;
}
const format = (number, sep) => String(Math.round(number * 100) / 100).replace('.', sep);

// ---- fixes ---------------------------------------------------------------------------------------------------

export function validateFixes(fixes, { headers, mapping, count, headerRow }) {
  if (fixes === undefined || fixes === null) return {};
  const bad = () => { throw new Error('INVALID_FIXES'); };
  if (typeof fixes !== 'object' || Array.isArray(fixes)) bad();
  const allowed = ['categoryMap', 'genderMap', 'normalizeNumbers', 'emptyBonusAsZero', 'multiply', 'excludeRows', 'edits'];
  if (Object.keys(fixes).some(k => !allowed.includes(k))) bad();
  const first = (headerRow || 1) + 1, last = first + count - 1, isRow = n => Number.isInteger(n) && n >= first && n <= last;
  const plainMap = (value, ok) => {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) bad();
    const entries = Object.entries(value);
    if (entries.length > MAX_FIX_ENTRIES || entries.some(([k, v]) => !k || k.length > 255 || !ok(v))) bad();
    return new Map(entries);
  };
  const clean = {};
  const categoryMap = plainMap(fixes.categoryMap, v => typeof v === 'string' && v.trim() && v.length <= 255);
  if (categoryMap) clean.categoryMap = categoryMap;
  const genderMap = plainMap(fixes.genderMap, v => ['M', 'F', 'O'].includes(v));
  if (genderMap) clean.genderMap = genderMap;
  for (const flag of ['normalizeNumbers', 'emptyBonusAsZero']) {
    if (fixes[flag] === undefined) continue;
    if (typeof fixes[flag] !== 'boolean') bad();
    clean[flag] = fixes[flag];
  }
  if (fixes.multiply !== undefined) {
    const entries = fixes.multiply && typeof fixes.multiply === 'object' && !Array.isArray(fixes.multiply) ? Object.entries(fixes.multiply) : bad();
    if (entries.some(([field, factor]) => !['base_annual', 'bonuses_annual'].includes(field) || !FACTORS.includes(factor) || !columnFor(mapping, headers, field))) bad();
    clean.multiply = Object.fromEntries(entries);
  }
  if (fixes.excludeRows !== undefined) {
    if (!Array.isArray(fixes.excludeRows) || fixes.excludeRows.length > MAX_FIX_ENTRIES || !fixes.excludeRows.every(isRow)) bad();
    clean.excludeRows = new Set(fixes.excludeRows);
  }
  if (fixes.edits !== undefined) {
    if (!Array.isArray(fixes.edits) || fixes.edits.length > MAX_FIX_ENTRIES) bad();
    for (const e of fixes.edits) if (!e || typeof e !== 'object' || !isRow(e.row) || !importFields.includes(e.field) || typeof e.value !== 'string' || e.value.length > 255 || !columnFor(mapping, headers, e.field)) bad();
    clean.edits = fixes.edits.map(({ row, field, value }) => ({ row, field, value }));
  }
  return clean;
}

// Applies validated fixes to a copy of the parsed records. `rows[i]` is the row number the user sees for
// `records[i]` in the source file, so messages stay correct after rows were excluded.
export function prepareRecords(parsedRows, { headers, mapping, fixes = {}, decimalSeparator = '.', headerRow }) {
  const first = (headerRow || 1) + 1, col = field => columnFor(mapping, headers, field);
  const applied = { edits: 0, categories: 0, genders: 0, numbers: 0, bonusZero: 0, multiplied: 0, excluded: 0 };
  const edits = new Map();
  for (const e of fixes.edits || []) edits.set(`${e.row}:${e.field}`, e.value);
  const records = [], rows = [];
  parsedRows.forEach((source, index) => {
    const row = first + index;
    if (fixes.excludeRows?.has(row)) { applied.excluded++; return; }
    const record = { ...source };
    const set = (field, value) => { record[col(field)] = value; };
    for (const field of importFields) if (edits.has(`${row}:${field}`)) { set(field, edits.get(`${row}:${field}`)); applied.edits++; }
    const category = col('worker_category');
    if (fixes.categoryMap && category && fixes.categoryMap.has(text(record[category]))) { record[category] = fixes.categoryMap.get(text(record[category])); applied.categories++; }
    const gender = col('gender');
    if (fixes.genderMap && gender && !genderCode(record[gender]) && fixes.genderMap.has(text(record[gender]))) { record[gender] = fixes.genderMap.get(text(record[gender])); applied.genders++; }
    if (fixes.emptyBonusAsZero && col('bonuses_annual') && !text(record[col('bonuses_annual')])) { set('bonuses_annual', '0'); applied.bonusZero++; }
    if (fixes.normalizeNumbers) for (const field of NUMERIC) {
      const column = col(field), value = record[column];
      if (!column || typeof value !== 'string' || !text(value) || strict(decimalSeparator).test(value)) continue;
      const cleaned = cleanAmount(value, decimalSeparator);
      if (cleaned !== null) { record[column] = cleaned; applied.numbers++; }
    }
    for (const [field, factor] of Object.entries(fixes.multiply || {})) {
      const value = parseAmount(record[col(field)], decimalSeparator);
      if (Number.isFinite(value)) { set(field, format(value * factor, decimalSeparator)); applied.multiplied++; }
    }
    records.push(record); rows.push(row);
  });
  return { records, rows, applied };
}

// ---- category grouping -----------------------------------------------------------------------------------------

// Only changes that cannot be a different job level count as "the same category": spelling variants that fold to
// the same letters, German/Slovenian feminine endings, and one inserted/dropped letter or a swapped pair of
// letters in a long name. Digits and Roman numerals (Engineer L2 / L3, Developer I / II) and single-letter grades
// (Group A / B) are never merged: whether two jobs are of equal value is a human judgement (Art. 4).
function levelLike(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const da = a.slice(start, a.length - end), db = b.slice(start, b.length - end);
  return [da, db].some(d => /[0-9]/.test(d) || (d.length > 0 && /^[ivx]+$/.test(d)));
}
function sameCategory(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 6) return false;
  if (['in', 'innen', 'ica'].some(suffix => long === short + suffix)) return true;
  if (long.length - short.length === 1) {
    let i = 0;
    while (i < short.length && short[i] === long[i]) i++;
    return long.slice(0, i) + long.slice(i + 1) === short && short.length >= 8 && !levelLike(short, long);
  }
  if (long.length === short.length && short.length >= 8) {
    let i = 0;
    while (a[i] === b[i]) i++;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return false;
}
export function similarCategories(counts) {
  const labels = [...counts.keys()].slice(0, 400), parent = labels.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const keys = labels.map(foldKey);
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (keys[i] && keys[j] && sameCategory(keys[i], keys[j])) parent[find(j)] = find(i);
  const groups = new Map();
  labels.forEach((label, i) => { const root = find(i); groups.set(root, [...(groups.get(root) || []), label]); });
  return [...groups.values()].filter(g => g.length > 1).map(group => {
    const sorted = [...group].sort((a, b) => counts.get(b) - counts.get(a));
    return { to: sorted[0], from: sorted.slice(1), counts: Object.fromEntries(sorted.map(label => [label, counts.get(label)])) };
  });
}

// ---- gender suggestions ------------------------------------------------------------------------------------------

const genderGuesses = { herr: 'M', mann: 'M', maennlich: 'M', mr: 'M', moski: 'M', mosko: 'M', gospod: 'M', frau: 'F', weibl: 'F', ms: 'F', mrs: 'F', zenski: 'F', zensko: 'F', gospa: 'F', d: 'O', x: 'O', divers: 'O', nonbinary: 'O' };
export const genderGuess = value => genderCode(value) ?? genderGuesses[foldKey(text(value))] ?? null;

// ---- assessment --------------------------------------------------------------------------------------------------

export const SENSITIVE_HEADER = /(^|[^a-z])(alter|age|starost|name|vorname|nachname|familienname|geburt|geboren|iban|bic|steuer|sozialversicherung|svnr|svnummer|adresse|anschrift|strasse|stra[sß]e|telefon|handy|e-?mail|religion|konfession|krankheit|behinderung|ime|priimek|rojstv|naslov|davcn|emso|birth|address|phone|tax|ssn|disab)/i;
const TOTAL_ROW = /^(summe|gesamt|insgesamt|total|skupaj|gesamtsumme|durchschnitt|povprecje)\b/i;

// Looks at the unmapped columns' contents when the header gave no clue. Only proposes a column when exactly one fits.
export function suggestColumnsByContent(headers, rows, mapping, sep = '.') {
  const used = new Set(Object.values(mapping || {}));
  const free = headers.filter(h => !used.has(h) && !SENSITIVE_HEADER.test(h));
  const suggestions = [];
  const stats = Object.fromEntries(free.map(h => {
    const values = rows.map(r => text(r[h])).filter(Boolean);
    const numbers = values.map(v => parseAmount(v, sep)).filter(Number.isFinite);
    return [h, { values, distinct: new Set(values), numeric: values.length ? numbers.length / values.length : 0, median: median(numbers) }];
  }));
  const only = (field, fits) => {
    if (mapping?.[field]) return;
    const found = free.filter(h => stats[h].values.length >= Math.max(1, rows.length * 0.9) && fits(stats[h]));
    if (found.length === 1) suggestions.push({ field, column: found[0] });
  };
  only('gender', s => s.distinct.size <= 6 && s.values.every(v => genderGuess(v)));
  only('hours_per_week', s => s.numeric >= 0.95 && s.median >= 3 && s.median <= 60);
  only('paid_hours_annual', s => s.numeric >= 0.95 && s.median >= 150 && s.median <= 3500);
  return suggestions.filter((s, i, all) => all.findIndex(o => o.column === s.column) === i && all.filter(o => o.column === s.column).length === 1);
}

export function assessQuality({ headers, rows: displayRows, records, mapping, decimalSeparator = '.', applied }) {
  const findings = [];
  const add = (severity, code, extra = {}) => findings.push({ severity, code, ...extra });
  const col = field => columnFor(mapping, headers, field);
  const list = indices => indices.slice(0, MAX_LISTED).map(i => displayRows[i]);
  const cells = (indices, field) => indices.slice(0, MAX_LISTED).map(i => ({ row: displayRows[i], value: text(records[i][col(field)]).slice(0, 60) }));
  const n = records.length, all = [...Array(n).keys()];

  const missingFields = REQUIRED_FIELDS.filter(f => !col(f));
  if (missingFields.length) add('error', 'MAPPING_MISSING', { fields: missingFields, suggestions: suggestColumnsByContent(headers, records, mapping, decimalSeparator) });

  const value = (i, field) => text(records[i][col(field)]);
  const amounts = Object.fromEntries(NUMERIC.map(field => [field, col(field) ? all.map(i => parseAmount(value(i, field), decimalSeparator)) : null]));

  // Rows that are not employees at all: totals and fully blank lines.
  const idColumn = col('internal_id');
  const plain = v => text(v).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const notEmployee = all.filter(i => {
    const present = importFields.filter(f => col(f) && value(i, f));
    if (!present.length) return true;
    return ['internal_id', 'job_title', 'worker_category'].some(f => col(f) && TOTAL_ROW.test(plain(value(i, f))));
  });
  if (notEmployee.length) add('error', 'NOT_AN_EMPLOYEE', { count: notEmployee.length, rows: list(notEmployee), fix: { type: 'excludeRows', rows: notEmployee.map(i => displayRows[i]) } });
  const skip = new Set(notEmployee);

  // Required text fields.
  for (const field of ['internal_id', 'gender', 'job_title', 'worker_category']) {
    if (!col(field)) continue;
    const empty = all.filter(i => !skip.has(i) && !value(i, field));
    if (empty.length) add('error', 'MISSING_VALUE', { field, count: empty.length, rows: list(empty), cells: cells(empty, field) });
    const invalid = all.filter(i => !skip.has(i) && value(i, field) && (value(i, field).length > 255 || /[\u0000-\u001f\u007f]/.test(value(i, field))));
    if (invalid.length) add('error', 'TEXT_INVALID', { field, count: invalid.length, rows: list(invalid), cells: cells(invalid, field) });
  }

  // Numbers: unreadable, empty, out of range.
  let numberFixable = false;
  for (const field of NUMERIC) {
    if (!amounts[field]) continue;
    const empty = all.filter(i => !skip.has(i) && !value(i, field));
    if (empty.length) add('error', field === 'bonuses_annual' ? 'BONUS_EMPTY' : 'MISSING_VALUE', { field, count: empty.length, rows: list(empty), cells: cells(empty, field), ...(field === 'bonuses_annual' ? { fix: { type: 'emptyBonusAsZero' } } : {}) });
    const unreadable = all.filter(i => !skip.has(i) && value(i, field) && Number.isNaN(amounts[field][i]));
    if (unreadable.length) {
      const fixable = unreadable.every(i => cleanAmount(value(i, field), decimalSeparator) !== null);
      const alternative = unreadable.every(i => strict(other(decimalSeparator)).test(value(i, field)));
      numberFixable ||= fixable;
      add('error', 'NUMBER_FORMAT', { field, count: unreadable.length, rows: list(unreadable), cells: cells(unreadable, field), ...(fixable ? { fix: { type: 'normalizeNumbers' } } : alternative ? { fix: { type: 'decimalSeparator', value: other(decimalSeparator) } } : {}) });
    }
    const limits = { base_annual: [0, 1e9], bonuses_annual: [0, 1e9], paid_hours_annual: [0.01, 8784], hours_per_week: [0.01, 100] }[field];
    const outside = all.filter(i => !skip.has(i) && Number.isFinite(amounts[field][i]) && (amounts[field][i] < limits[0] || amounts[field][i] > limits[1]));
    if (outside.length) add('error', 'VALUE_OUT_OF_RANGE', { field, count: outside.length, rows: list(outside), cells: cells(outside, field) });
  }

  // Gender labels the importer does not know.
  if (col('gender')) {
    const unknown = new Map();
    for (const i of all) if (!skip.has(i) && value(i, 'gender') && !genderCode(value(i, 'gender'))) unknown.set(value(i, 'gender'), (unknown.get(value(i, 'gender')) || 0) + 1);
    if (unknown.size) add('error', 'GENDER_UNKNOWN', { count: [...unknown.values()].reduce((a, b) => a + b, 0), values: [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, count]) => ({ value: label, count, suggestion: genderGuess(label) })) });
  }

  // Duplicate personnel numbers.
  if (idColumn) {
    const seen = new Map(), identical = [], conflicting = new Set();
    for (const i of all) {
      if (skip.has(i) || !value(i, 'internal_id')) continue;
      const id = value(i, 'internal_id');
      if (!seen.has(id)) { seen.set(id, i); continue; }
      const firstIndex = seen.get(id);
      if (headers.every(h => text(records[i][h]) === text(records[firstIndex][h]))) identical.push(i); else { conflicting.add(i); conflicting.add(firstIndex); }
    }
    if (identical.length) add('error', 'DUPLICATE_IDENTICAL', { count: identical.length, rows: list(identical), fix: { type: 'excludeRows', rows: identical.map(i => displayRows[i]) } });
    if (conflicting.size) add('error', 'DUPLICATE_CONFLICTING', { count: conflicting.size, rows: list([...conflicting].sort((a, b) => a - b)), cells: cells([...conflicting].sort((a, b) => a - b), 'internal_id') });
    const personal = all.filter(i => !skip.has(i) && (/@/.test(value(i, 'internal_id')) || /^\p{L}{2,}[ ,]+\p{L}{2,}/u.test(value(i, 'internal_id'))));
    if (personal.length) add('warning', 'ID_LOOKS_PERSONAL', { count: personal.length, rows: list(personal) });
  }

  // From here on only rows whose numbers are usable.
  const usable = field => all.filter(i => !skip.has(i) && Number.isFinite(amounts[field]?.[i]));
  const base = usable('base_annual'), hoursAnnual = usable('paid_hours_annual'), weekly = usable('hours_per_week');

  // Thousands separators read as decimals ("60.000" under the dot setting).
  const grouped = new RegExp(decimalSeparator === ',' ? '^\\d{1,3}(,\\d{3})+$' : '^\\d{1,3}(\\.\\d{3})+$');
  for (const field of ['base_annual', 'bonuses_annual', 'paid_hours_annual']) {
    if (!amounts[field]) continue;
    const hits = all.filter(i => !skip.has(i) && grouped.test(value(i, field)));
    if (hits.length) add('warning', 'THOUSANDS_AS_DECIMAL', { field, count: hits.length, rows: list(hits), cells: cells(hits, field), fix: { type: 'decimalSeparator', value: other(decimalSeparator) } });
  }

  const outOf = (field, low, high) => usable(field).filter(i => amounts[field][i] < low || amounts[field][i] > high);
  const oddHours = outOf('paid_hours_annual', 100, 3500);
  if (oddHours.length) add('warning', 'HOURS_IMPLAUSIBLE', { field: 'paid_hours_annual', count: oddHours.length, rows: list(oddHours), cells: cells(oddHours, 'paid_hours_annual') });
  const oddWeekly = outOf('hours_per_week', 1, 60);
  if (oddWeekly.length) add('warning', 'HOURS_IMPLAUSIBLE', { field: 'hours_per_week', count: oddWeekly.length, rows: list(oddWeekly), cells: cells(oddWeekly, 'hours_per_week') });
  const mismatch = all.filter(i => !skip.has(i) && Number.isFinite(amounts.paid_hours_annual?.[i]) && Number.isFinite(amounts.hours_per_week?.[i]) && amounts.hours_per_week[i] >= 1 && amounts.paid_hours_annual[i] > 0 && Math.abs(amounts.paid_hours_annual[i] / 52 - amounts.hours_per_week[i]) / amounts.hours_per_week[i] > 0.35);
  if (mismatch.length) add('warning', 'HOURS_MISMATCH', { count: mismatch.length, rows: list(mismatch) });

  // Monthly or hourly amounts instead of annual ones.
  if (base.length >= 3) {
    const typical = median(base.map(i => amounts.base_annual[i]));
    if (typical < 7000) add('warning', 'AMOUNT_NOT_ANNUAL', { field: 'base_annual', typical: Math.round(typical), fix: { type: 'multiply', field: 'base_annual', factors: FACTORS } });
  }
  const hourly = all.filter(i => !skip.has(i) && Number.isFinite(amounts.base_annual?.[i]) && Number.isFinite(amounts.paid_hours_annual?.[i]) && amounts.paid_hours_annual[i] > 0);
  const oddHourly = hourly.filter(i => amounts.base_annual[i] / amounts.paid_hours_annual[i] < 6 || amounts.base_annual[i] / amounts.paid_hours_annual[i] > 400);
  if (oddHourly.length && !findings.some(f => f.code === 'AMOUNT_NOT_ANNUAL' && oddHourly.length === hourly.length)) add('warning', 'HOURLY_IMPLAUSIBLE', { count: oddHourly.length, rows: list(oddHourly), cells: cells(oddHourly, 'base_annual') });

  // Variable pay.
  if (amounts.bonuses_annual) {
    const above = all.filter(i => !skip.has(i) && Number.isFinite(amounts.bonuses_annual[i]) && Number.isFinite(amounts.base_annual?.[i]) && amounts.bonuses_annual[i] > amounts.base_annual[i]);
    if (above.length) add('warning', 'BONUS_EXCEEDS_BASE', { count: above.length, rows: list(above), cells: cells(above, 'bonuses_annual') });
  }
  const bonusValues = amounts.bonuses_annual ? usable('bonuses_annual') : [];
  if (!amounts.bonuses_annual || (bonusValues.length && bonusValues.every(i => amounts.bonuses_annual[i] === 0))) add('warning', 'NO_VARIABLE_PAY');

  // Categories: spelling variants, too coarse, too fine, one-sided.
  if (col('worker_category')) {
    const counts = new Map(), bySex = new Map();
    for (const i of all) {
      if (skip.has(i)) continue;
      const label = value(i, 'worker_category');
      if (!label) continue;
      counts.set(label, (counts.get(label) || 0) + 1);
      const code = genderCode(value(i, 'gender'));
      const entry = bySex.get(label) || { M: 0, F: 0 };
      if (code === 'M' || code === 'F') entry[code]++;
      bySex.set(label, entry);
    }
    const groups = similarCategories(counts);
    if (groups.length) add('warning', 'CATEGORY_SIMILAR', { groups, fix: { type: 'categoryMap' } });
    if (counts.size === 1 && n >= 10) add('warning', 'CATEGORY_SINGLE');
    const singles = [...counts.values()].filter(c => c === 1).length;
    if (counts.size >= 4 && singles / counts.size > 0.5) add('warning', 'CATEGORY_TOO_FINE', { categories: counts.size, singles });
    const oneSided = [...bySex.values()].filter(e => (e.M === 0) !== (e.F === 0)).length;
    const small = [...bySex.values()].filter(e => e.M > 0 && e.F > 0 && Math.min(e.M, e.F) < SMALL_GROUP_MINIMUM).length;
    if (oneSided || small) add('info', 'CATEGORY_GROUP_SIZES', { oneSided, small, minimum: SMALL_GROUP_MINIMUM, categories: counts.size });

    // Pay far away from the category median usually means a typo or a mixed-up unit.
    const outliers = [];
    for (const label of counts.keys()) {
      const members = all.filter(i => !skip.has(i) && value(i, 'worker_category') === label && Number.isFinite(amounts.base_annual?.[i]) && Number.isFinite(amounts.paid_hours_annual?.[i]) && amounts.paid_hours_annual[i] > 0);
      if (members.length < 6) continue;
      const rate = i => (amounts.base_annual[i] + (Number.isFinite(amounts.bonuses_annual?.[i]) ? amounts.bonuses_annual[i] : 0)) / amounts.paid_hours_annual[i], mid = median(members.map(rate));
      for (const i of members) if (mid > 0 && (rate(i) > mid * 3 || rate(i) < mid / 3)) outliers.push(i);
    }
    if (outliers.length) add('warning', 'OUTLIER_PAY', { count: outliers.length, rows: list(outliers.sort((a, b) => a - b)) });
  }

  // Columns that exist in the file but are not part of the report: reassurance for data minimisation.
  const ignored = headers.filter(h => !Object.values(mapping || {}).includes(h) && !importFields.includes(h) && SENSITIVE_HEADER.test(h));
  if (ignored.length) add('info', 'SENSITIVE_COLUMNS_IGNORED', { columns: ignored.slice(0, 12) });

  const count = severity => findings.filter(f => f.severity === severity).length;
  return { summary: { rows: n, errors: count('error'), warnings: count('warning'), info: count('info'), excluded: applied?.excluded || 0, ready: count('error') === 0 && n > 0 }, findings };
}

// Tolerant read of a mapping sent by the browser: keeps only entries that point at a real column.
export const normalizeMapping = (mapping, headers) => Object.fromEntries(importFields.filter(f => typeof mapping?.[f] === "string" && headers.includes(mapping[f])).map(f => [f, mapping[f]]));
