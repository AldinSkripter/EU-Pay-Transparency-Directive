// Import formats and text encodings, shared by the server parser and the upload screens.
// The parser decides by file content, never by extension, so these lists only drive the file picker.
export const textEncodings = [
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'utf-16le', label: 'UTF-16 LE' },
  { id: 'utf-16be', label: 'UTF-16 BE' },
  { id: 'windows-1252', label: 'Windows-1252 (DE / AT, DATEV, SAP)' },
  { id: 'windows-1250', label: 'Windows-1250 (SI, Pantheon, Birokrat)' },
  { id: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)' },
  { id: 'iso-8859-15', label: 'ISO-8859-15 (Latin-9, €)' },
  { id: 'iso-8859-2', label: 'ISO-8859-2 (Latin-2, SI)' },
  { id: 'ibm850', label: 'DOS 850 (Western Europe)' },
  { id: 'ibm852', label: 'DOS 852 (Central Europe, SI)' },
];
export const textEncodingIds = textEncodings.map(encoding => encoding.id);

// Spreadsheets: xlsx, xls, ods, Excel 2003 XML, HTML tables saved as .xls (xlsb is refused: formulas cannot be verified)
// Text: csv, txt, tsv and every other delimited or fixed-width extension HR systems use
// Structured: xml, json. Container: zip holding any of the above (one level).
export const acceptedExtensions = ['.xlsx', '.xls', '.ods', '.xml', '.json', '.csv', '.txt', '.tsv', '.tab', '.psv', '.asc', '.dat', '.exp', '.lst', '.prn', '.html', '.htm', '.zip'];
export const acceptAttribute = acceptedExtensions.join(',');
export const formatSummary = 'XLSX, XLS, ODS, XML, JSON, CSV, TXT/TSV/ASC/DAT/LST/PRN, HTML, ZIP';
