import { parse } from 'csv-parse/sync';

export const importFields = ['internal_id','gender','job_title','worker_category','job_category_kv','base_annual','bonuses_annual','paid_hours_annual','hours_per_week'];
const aliases = {
  internal_id: ['Personalnummer','Employee ID','Šifra zaposlenega','Personal-Nr','Personalnummer/in','Matična številka zaposlenega','Pers.-Nr.','Personalnr','Mitarbeiternummer','PNR','DN-Nr','Dienstnehmernummer','Mitarbeiter-ID','Šifra delavca','Številka zaposlenega','Evidenčna številka'],
  gender: ['Geschlecht','Spol','Sex','Gender','Geschl.','Spol zaposlenega','Geschlecht (m/w/d)'],
  job_title: ['Tätigkeit','Job title','Delovno mesto','Berufsbezeichnung','Position','Stelle','Funktion','Stellenbezeichnung','Beschäftigung','Naziv delovnega mesta','Poklic','Funkcija'],
  worker_category: ['Worker category','Enakovredna kategorija','Vergleichsgruppe','Entgeltgruppe','Verwendungsgruppe','Gehaltsgruppe','Tarifgruppe','Job family','Plačilni razred','Tarifni razred','Kategorija zaposlenih'],
  job_category_kv: ['KV-Stufe','Stopnja KP','KV-Einstufung','Kollektivvertrag Stufe','Tarifstufe','Verwendungsgruppenjahr'],
  // Only explicitly annual amounts: generic Bruttogehalt/Bruto plača are ambiguous.
  base_annual: ['Jahresgrundvergütung','Annual base pay','Letno osnovno plačilo','Jahresgrundbezug','Letna osnovna bruto plača','Jahresgrundgehalt','Grundgehalt jährlich','Basic annual salary','Letna osnovna plača','Letna osnovna bruto plača zaposlenega'],
  bonuses_annual: ['Jährliche variable Vergütung','Annual variable pay','Letno variabilno plačilo','Jahresvariable Vergütung','Variable Vergütung jährlich','Jahresbonus','Letni bonusi','Letni variabilni del plače'],
  paid_hours_annual: ['Bezahlte Jahresstunden','Annual paid hours','Letne plačane ure','Jahresarbeitsstunden','Bezahlte Stunden jährlich','Letne ure','Letno število plačanih ur'],
  hours_per_week: ['Wochenstunden','Weekly hours','Tedenske ure','Wochenarbeitszeit','Wöchentliche Arbeitszeit','Weekly working hours','Tedenski delovni čas','Delovni čas na teden','Wochenarbeitsstunden'],
};
const key = value => value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const foldKey = key;
const localHeader = header => header.split('.').at(-1).replace(/^@/,'').split(':').at(-1);
const matchesHeader = (header,alias) => key(header)===key(alias) || key(localHeader(header))===key(alias);

export function parseDelimited(text) {
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 4 * 1024 * 1024 || /[\u0000-\u0008\u000e-\u001f]/.test(text)) throw new Error('INVALID_CSV');
  const candidates = [];
  for (const delimiter of [',',';','\t','|']) {
    try {
      const table = parse(text, { delimiter, skip_empty_lines:true, bom:true, trim:true, max_record_size:20000, to:10002 });
      const headers = table[0];
      if (!headers || headers.length < 2 || headers.some(h => !h || h.length > 255) || new Set(headers).size !== headers.length || headers.some(h => ['__proto__','constructor','prototype'].includes(h))) continue;
      if (table.length < 2 || table.length > 10001) continue;
      candidates.push({delimiter,headers,rows:table.slice(1).map(values => Object.fromEntries(headers.map((h,i)=>[h,values[i]])))});
    } catch { /* Try the next separator; never relax column counts. */ }
  }
  if (candidates.length !== 1) throw new Error('INVALID_CSV');
  return candidates[0];
}

// Older ASC / DAT / LST / PRN exports align columns with spaces. Column boundaries are the vertical bands
// that stay blank in every line; header names come from the first line. The preview shows the result and
// the user confirms the mapping, so a wrong split is visible before anything is imported.
export function parseFixedWidth(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 4 * 1024 * 1024 || /[\u0000-\u0008\u000e-\u001f]/.test(text)) throw new Error('INVALID_CSV');
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).filter(line => line.trim());
  if (lines.length < 2 || lines.length > 10001) throw new Error('INVALID_CSV');
  const width = Math.max(...lines.map(line => line.length));
  if (width > 1000) throw new Error('INVALID_CSV');
  const occupied = Array(width).fill(false);
  for (const line of lines) for (let i = 0; i < line.length; i++) if (line[i] !== ' ') occupied[i] = true;
  const bands = gap => {
    const out = [];
    let start = -1, last = -1;
    for (let i = 0; i < width; i++) {
      if (occupied[i]) { if (start < 0) start = i; last = i; }
      else if (start >= 0 && i - last >= gap) { out.push([start, last + 1]); start = -1; }
    }
    if (start >= 0) out.push([start, last + 1]);
    return out;
  };
  // Two blank positions first so that "Job title" stays one column; fall back to one for tightly packed files.
  for (const gap of [2, 1]) {
    const columns = bands(gap);
    if (columns.length < 2 || columns.length > 200) continue;
    const headers = columns.map(([from, to]) => lines[0].slice(from, to).trim());
    if (headers.some(h => !h || h.length > 255 || ['__proto__', 'constructor', 'prototype'].includes(h)) || new Set(headers).size !== headers.length) continue;
    const rows = lines.slice(1).map(line => Object.fromEntries(headers.map((h, i) => [h, line.slice(columns[i][0], columns[i][1]).trim()])));
    return { delimiter: null, headers, rows, columns };
  }
  throw new Error('INVALID_CSV');
}

export function suggestMapping(headers) {
  const mapping = {}, suggestions = [];
  for (const field of importFields) {
    const matches = headers.filter(h => [field,...(aliases[field] || [])].some(a => matchesHeader(h,a)));
    if (matches.length === 1) {
      mapping[field] = matches[0];
      suggestions.push({field,column:matches[0],confidence:matches[0] === field ? 'exact' : 'dictionary',requires_confirmation:true});
    }
  }
  return {mapping,suggestions,unmapped:headers.filter(h=>!Object.values(mapping).includes(h))};
}

const genders = {m:'M',male:'M',mannlich:'M',moski:'M',f:'F',w:'F',female:'F',weiblich:'F',z:'F',zenska:'F',o:'O',other:'O',divers:'O',drugo:'O'};
export const genderCode = value => genders[key(String(value ?? '').trim())];

export function mapImportRecord(record, mapping, decimalSeparator = '.') {
  if (!['.',','].includes(decimalSeparator)) throw new Error('INVALID_DECIMAL_SEPARATOR');
  const mapped = Object.fromEntries(importFields.map(field => [field,record[mapping ? mapping[field] : field]]));
  mapped.gender = genderCode(mapped.gender) ?? mapped.gender;
  for (const field of ['base_annual','bonuses_annual','paid_hours_annual','hours_per_week']) {
    const value = mapped[field];
    if (value === undefined && field === 'bonuses_annual') continue;
    // Grouping separators, exponents and currency suffixes require correction.
    const pattern = decimalSeparator === ',' ? /^\d+(,\d+)?$/ : /^\d+(\.\d+)?$/;
    if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`INVALID_${field.toUpperCase()}`);
    mapped[field] = value.replace(',','.');
  }
  return mapped;
}

const contextAliases = {
  country:['country','country_code','reporting_country','Land','Ländercode','Država','Država poročanja'],
  currency:['currency','currency_code','Währung','Valuta'],
  year:['reporting_year','payroll_year','Berichtsjahr','Abrechnungsjahr','Leto poročanja','Leto obračuna'],
  period:['period','payroll_period','Abrechnungsperiode','Obračunsko obdobje'],
  pay_code:['pay_code','Lohnart','Wage type','Vrsta obračuna','Šifra obračuna'],
};
const countries = {de:'DE',deu:'DE',germany:'DE',deutschland:'DE',nemcija:'DE',at:'AT',aut:'AT',austria:'AT',osterreich:'AT',avstrija:'AT',si:'SI',svn:'SI',slovenia:'SI',slovenija:'SI',slowenien:'SI'};
const numericFields = ['base_annual','bonuses_annual','paid_hours_annual','hours_per_week'];

// File language is only a hint. Jurisdiction always comes from the authenticated tenant.
export function inspectImport(headers, rows, mapping = suggestMapping(headers).mapping) {
  const languages = new Set();
  const sl = ['šifra zaposlenega','spol','delovno mesto','letno osnovno plačilo','letne plačane ure','tedenske ure'];
  const de = ['personalnummer','geschlecht','tätigkeit','jahresgrundvergütung','bezahlte jahresstunden','wochenstunden','jahresgrundbezug'];
  for (const header of headers) {
    if (sl.some(h=>matchesHeader(header,h))) languages.add('sl');
    if (de.some(h=>matchesHeader(header,h))) languages.add('de');
  }
  const columns = Object.fromEntries(Object.entries(contextAliases).map(([field,names])=>[field,headers.filter(h=>names.some(n=>matchesHeader(h,n)))]));
  const values = field => [...new Set(rows.flatMap(row=>columns[field].map(column=>String(row[column] ?? '').trim())).filter(Boolean))];
  const rawCountries = values('country');
  const decimalMarks = new Set();
  for (const row of rows) for (const field of numericFields) {
    const value = row[mapping[field]];
    if (typeof value !== 'string') continue;
    if (/^\d+,\d+$/.test(value)) decimalMarks.add(',');
    else if (/^\d+\.\d+$/.test(value)) decimalMarks.add('.');
    else if (/[.,]/.test(value)) decimalMarks.add('ambiguous');
  }
  const decimalSeparator = decimalMarks.size === 1 && !decimalMarks.has('ambiguous') ? [...decimalMarks][0] : null;
  const warnings = [];
  if (!columns.year.length && !columns.period.length) warnings.push('REPORTING_PERIOD_NOT_IN_FILE');
  if (!columns.currency.length) warnings.push('CURRENCY_NOT_IN_FILE');
  if (decimalMarks.size > 1 || decimalMarks.has('ambiguous')) warnings.push('AMBIGUOUS_DECIMAL_FORMAT');
  if (headers.some(h=>['bruttogehalt','bruttobezug','bruto placa','bruto znesek','gross pay'].some(a=>matchesHeader(h,a)))) warnings.push('PAY_BASIS_REQUIRES_REVIEW');
  return {languages:[...languages],countries:rawCountries.map(c=>countries[key(c)] ?? c),currencies:values('currency').map(c=>c.toUpperCase()),years:values('year'),periods:values('period'),decimalSeparator,warnings,columns};
}

export function validateImportContext(headers, rows, {country,year,mode='annual'}) {
  const context = inspectImport(headers, rows);
  const problems = [];
  rows.forEach((record,index)=> {
    for (const [field,columns] of Object.entries(context.columns)) for (const column of columns) {
      const value = String(record[column] ?? '').trim();
      let error;
      if (field === 'country' && countries[key(value)] !== country) error = 'IMPORT_COUNTRY_MISMATCH';
      if (field === 'currency' && value.toUpperCase() !== 'EUR') error = 'IMPORT_CURRENCY_UNSUPPORTED';
      if (field === 'year' && value !== String(year)) error = 'IMPORT_YEAR_MISMATCH';
      // This importer handles annual summaries only; monthly rows must not be summed implicitly.
      if (mode==='annual' && field === 'period' && value !== String(year)) error = 'IMPORT_ANNUAL_PERIOD_REQUIRED';
      if (mode==='annual' && field === 'pay_code' && value) error = 'PAY_CODE_CLASSIFICATION_REQUIRED';
      if (error && problems.length < 25) problems.push({row:index+2,column,error});
    }
  });
  return problems;
}

export function validateMapping(mapping, headers) {
  if (mapping === undefined) return;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('INVALID_MAPPING');
  const selected = [];
  for (const field of importFields) {
    const column = mapping[field];
    if (!column && ['job_category_kv','bonuses_annual'].includes(field)) continue;
    if (typeof column !== 'string' || !headers.includes(column) || selected.includes(column)) throw new Error('INVALID_MAPPING');
    selected.push(column);
  }
}
