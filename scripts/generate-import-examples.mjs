import { mkdir,writeFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

const directory=new URL('../docs/examples/',import.meta.url);await mkdir(directory,{recursive:true});
const canonical=['internal_id','gender','job_title','worker_category','base_annual','bonuses_annual','paid_hours_annual','hours_per_week','reporting_country','currency','reporting_year'];
const localized={
  DE:['Personalnummer','Geschlecht','Tätigkeit','Vergleichsgruppe','Jahresgrundvergütung','Jährliche variable Vergütung','Bezahlte Jahresstunden','Wochenstunden','reporting_country','Währung','Berichtsjahr'],
  AT:['Personalnummer','Geschlecht','Tätigkeit','Vergleichsgruppe','Jahresgrundbezug','Jährliche variable Vergütung','Bezahlte Jahresstunden','Wochenstunden','reporting_country','Währung','Berichtsjahr'],
  SI:['Šifra zaposlenega','Spol','Delovno mesto','Enakovredna kategorija','Letna osnovna bruto plača','Letno variabilno plačilo','Letne plačane ure','Tedenske ure','reporting_country','Valuta','Leto obračuna'],
};
for(const country of ['DE','AT','SI']) {
  const rows=Array.from({length:12},(_,i)=>[String(i+1).padStart(3,'0'),i<6?(country==='SI'?'Ž':'weiblich'):(country==='SI'?'moški':'männlich'),'Engineer','Engineering L3',i<6?60000:64000,2000,2080,40,country,'EUR',2026]);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([localized[country],...rows]),'Payroll');
  await writeFile(new URL(`${country}-synthetic-2026.xlsx`,directory),XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true}));
  if(country==='AT')await writeFile(new URL(`${country}-synthetic-2026.xls`,directory),XLSX.write(book,{type:'buffer',bookType:'xls'}));
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<payroll>\n'+rows.map(values=>'  <employee>'+canonical.map((field,i)=>`<${field}>${values[i]}</${field}>`).join('')+'</employee>').join('\n')+'\n</payroll>\n';
  await writeFile(new URL(`${country}-synthetic-2026.xml`,directory),xml);
}
console.log('Generated synthetic DE/AT/SI XLSX, XML and AT XLS examples in docs/examples.');
