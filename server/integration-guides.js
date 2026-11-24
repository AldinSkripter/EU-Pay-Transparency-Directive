// Guided integration by file or by our push API, per system. Statements here are limited to what is documented or
// certain; where a vendor's own API cannot be confirmed to be open, the guide says so instead of promising it.
// fit: 'file' = export a file and upload it (or send the same data through the push API),
//      'not_suitable' = the system holds no pay data by gender per worker, use the payroll export instead.
import {exportVerification} from './import-evidence.js';
export const requiredData = {
  de: [
    'Eine eindeutige Personalnummer je Beschäftigte/r (wird pseudonymisiert und nicht im Klartext gespeichert)',
    'Geschlecht (männlich / weiblich)',
    'Stellenbezeichnung und Vergleichsgruppe (gleiche oder gleichwertige Arbeit)',
    'Bruttogrundentgelt für das Jahr in EUR, einschließlich 13./14. Gehalt',
    'Variable und ergänzende Bestandteile für das Jahr in EUR (Boni, Zulagen, Sachbezüge); 0 wenn keine',
    'Bezahlte Stunden im Jahr und Wochenarbeitszeit (aus der Abrechnung, nicht aus dem Vertrag geschätzt)',
  ],
  sl: [
    'Enolična šifra zaposlenega (psevdonimizira se in se ne hrani v izvirni obliki)',
    'Spol (moški / ženska)',
    'Naziv delovnega mesta in primerljiva skupina (enako ali enakovredno delo)',
    'Bruto osnovno plačilo za leto v EUR',
    'Variabilne in dopolnilne sestavine za leto v EUR (bonusi, dodatki, ugodnosti v naravi); 0, če jih ni',
    'Plačane ure v letu in tedenski delovni čas (iz obračuna, ne ocenjeno iz pogodbe)',
  ],
};

const fileSteps = (system, extra = {}) => ({
  de: [`Exportieren Sie in ${system} eine Auswertung je Beschäftigte/r für das Berichtsjahr mit den Pflichtangaben (siehe Liste) als CSV oder Excel.`, ...(extra.de || []), 'Laden Sie die Datei bei „Bericht vorbereiten“ hoch. Format und Kodierung werden am Inhalt erkannt; Spalten ordnen Sie in der Vorschau zu.', 'Alternativ senden Sie dieselben Daten über den Equitensa-API-Zugang (z. B. mit Zapier, Make oder einem Skript); die Lieferung prüfen und bestätigen Sie anschließend in der App.'],
  sl: [`V sistemu ${system} izvozite pregled po zaposlenem za leto poročanja z obveznimi podatki (glej seznam) kot CSV ali Excel.`, ...(extra.sl || []), 'Datoteko naložite v razdelku »Pripravite poročilo«. Obliko in kodiranje prepozna samodejno po vsebini; stolpce preslikate v predogledu.', 'Lahko pa iste podatke pošljete prek dostopa API Equitensa (npr. z Zapierjem, Makom ali skriptom); pošiljko nato preverite in potrdite v aplikaciji.'],
});
const entry = (id, name, market, kind, fit, formats, note, steps) => ({ id, name, market, kind, fit, formats, note, verification:exportVerification(id),steps: fit === 'not_suitable' ? { de: [], sl: [] } : steps || fileSteps(name) });

export const integrationGuides = [
  entry('datev', 'DATEV Lohn und Gehalt', 'DE · AT', 'payroll', 'file', ['CSV', 'XLSX'], {
    de: 'DATEV-CSV verwenden meist Semikolon und Windows-1252. Equitensa erkennt DATEV-Kopfzeilen („EXTF“) und lässt die Kodierung wählen. DATEV bietet Programmierschnittstellen über sein Developer Portal an; der Zugang erfolgt über DATEV (Anmeldung und Freischaltung). Eine direkte Verbindung ohne diese Freischaltung ist uns nicht bekannt, deshalb Export oder API-Zugang von Equitensa verwenden.',
    sl: 'DATEV CSV običajno uporablja podpičje in Windows-1252. Equitensa prepozna DATEV glave (»EXTF«) in omogoča izbiro kodiranja. DATEV ponuja programske vmesnike prek svojega portala za razvijalce; dostop poteka prek DATEV (prijava in odobritev). Neposredne povezave brez odobritve ne poznamo, zato uporabite izvoz ali dostop API Equitensa.',
  }, fileSteps('DATEV Lohn und Gehalt', { de: ['Falls Ihre Steuerberatung die Lohnabrechnung führt, fordern Sie die Jahresauswertung dort an.'], sl: ['Če obračun plač vodi računovodski servis, pri njem zahtevajte letni pregled.'] })),
  entry('lexware', 'Lexware Lohn+Gehalt', 'DE', 'payroll', 'file', ['CSV', 'XLSX'], { de: 'Exportieren Sie die Jahresauswertung je Beschäftigte/r als Excel oder CSV.', sl: 'Izvozite letni pregled po zaposlenem kot Excel ali CSV.' }),
  entry('lexoffice', 'Lexware Office', 'DE', 'accounting', 'not_suitable', [], { de: 'Buchhaltungs- und Rechnungssoftware. Sie enthält in der Regel keine Entgelt- und Geschlechtsdaten je Beschäftigte/r und eignet sich nicht als Quelle. Verwenden Sie den Export Ihrer Lohnabrechnung (z. B. Lexware Lohn+Gehalt, DATEV oder Ihre Steuerberatung).', sl: 'Programska oprema za računovodstvo in izdajo računov. Praviloma ne vsebuje podatkov o plačah in spolu po zaposlenem, zato ni primeren vir. Uporabite izvoz iz obračuna plač.' }),
  entry('sevdesk', 'sevDesk', 'DE · AT', 'accounting', 'not_suitable', [], { de: 'Buchhaltungs- und Rechnungssoftware. Sie enthält in der Regel keine Entgelt- und Geschlechtsdaten je Beschäftigte/r und eignet sich nicht als Quelle. Verwenden Sie den Export Ihrer Lohnabrechnung.', sl: 'Programska oprema za računovodstvo in izdajo računov. Praviloma ne vsebuje podatkov o plačah in spolu po zaposlenem. Uporabite izvoz iz obračuna plač.' }),
  entry('personio', 'Personio', 'DE · AT', 'hris', 'file', ['CSV', 'XLSX'], {
    de: 'Nach der Personio-Dokumentation liefert die Mitarbeiter-API keine Gehaltsdaten außer Fixgehalt und Stundenlohn, und keine variable Vergütung. Ein reiner API-Abruf würde den Bericht daher unvollständig machen. Erstellen Sie stattdessen in Personio einen Bericht mit allen Pflichtangaben und exportieren Sie ihn, oder senden Sie die Daten per Equitensa-API.',
    sl: 'Po dokumentaciji Personio API za zaposlene ne vrača podatkov o plačah razen fiksne plače in urne postavke, spremenljivih delov pa sploh ne. Zgolj pridobivanje prek API bi zato poročilo naredilo nepopolno. V Personiu raje ustvarite poročilo z vsemi obveznimi podatki in ga izvozite ali pošljite prek API Equitensa.',
  }, fileSteps('Personio', { de: ['Wählen Sie im Bericht die Spalten: Personalnummer, Geschlecht, Position, Abteilung, Wochenstunden und die Vergütungsfelder. Variable Vergütung und tatsächliche Stunden stammen aus der Lohnabrechnung.'], sl: ['V poročilu izberite stolpce: šifra, spol, delovno mesto, oddelek, tedenske ure in polja plačila. Spremenljivi del in dejanske ure izhajajo iz obračuna plač.'] })),
  entry('hibob', 'HiBob', 'DE · AT', 'hris', 'file', ['CSV', 'XLSX'], { de: 'Exportieren Sie einen Bob-Bericht mit den Pflichtangaben als CSV oder Excel.', sl: 'Izvozite poročilo Bob z obveznimi podatki kot CSV ali Excel.' }),
  entry('sap', 'SAP SuccessFactors', 'Enterprise', 'hris', 'file', ['CSV', 'XLSX', 'XML'], { de: 'Report oder Integration-Center-Export als CSV/XML; für automatische Lieferungen den Equitensa-API-Zugang verwenden.', sl: 'Poročilo ali izvoz Integration Center kot CSV/XML; za samodejne pošiljke uporabite dostop API Equitensa.' }),
  entry('workday', 'Workday', 'Enterprise', 'hris', 'file', ['CSV', 'XLSX'], { de: 'Benutzerdefinierten Bericht als CSV/Excel exportieren; für automatische Lieferungen den Equitensa-API-Zugang verwenden.', sl: 'Izvozite prilagojeno poročilo kot CSV/Excel; za samodejne pošiljke uporabite dostop API Equitensa.' }),
  entry('bmd', 'BMD NTCS', 'AT', 'payroll', 'file', ['CSV', 'XLSX', 'TXT'], { de: 'Export aus der Lohnverrechnung (Listen/Auswertungen) als CSV oder Excel. Textexporte verwenden meist Semikolon; die Kodierung ist oft Windows-1252. 13. und 14. Gehalt in die Jahressumme aufnehmen, ohne doppelt zu zählen.', sl: 'Izvoz iz obračuna plač kot CSV ali Excel. Besedilni izvozi običajno uporabljajo podpičje; kodiranje je pogosto Windows-1252. 13. in 14. plačo vključite v letno vsoto brez dvojnega štetja.' }),
  entry('rzl', 'RZL Lohn', 'AT', 'payroll', 'file', ['CSV', 'XLSX', 'TXT'], { de: 'Jahresauswertung je Beschäftigte/r als CSV oder Excel exportieren. Sonderzahlungen (13./14. Gehalt) in der Jahressumme berücksichtigen.', sl: 'Izvozite letni pregled po zaposlenem kot CSV ali Excel.' }),
  entry('sage', 'Sage (HR / Lohn)', 'DE · AT', 'payroll', 'file', ['CSV', 'XLSX'], { de: 'Auswertung je Beschäftigte/r als CSV oder Excel exportieren.', sl: 'Izvozite pregled po zaposlenem kot CSV ali Excel.' }),
  entry('pantheon', 'PANTHEON', 'SI', 'payroll', 'file', ['XLSX', 'CSV', 'XML', 'TXT'], { de: 'Export der Gehaltsabrechnung als Excel, CSV oder XML. Slowenische Zeichen: bei CSV/TXT meist Windows-1250 wählen.', sl: 'Izvoz obračuna plač kot Excel, CSV ali XML. Pri CSV/TXT običajno izberite kodiranje Windows-1250, da se ohranijo šumniki.' }),
  entry('minimax', 'Minimax', 'SI', 'payroll', 'file', ['XLSX', 'CSV'], { de: 'Export der Gehaltsdaten als Excel oder CSV.', sl: 'Izvoz podatkov o plačah kot Excel ali CSV.' }),
  entry('saop','Saop / iCenter','SI','payroll','file',['XLSX','XLS'],{de:'Analyse der Abrechnungen mit Abrechnungszeilen als Excel exportieren. Alle erforderlichen Felder und Zeiträume prüfen.',sl:'Analizo obračunov z obračunskimi vrsticami izvozite v Excel. Preverite vsa obvezna polja in obdobja.'}),
  entry('vasco','VASCO Plače','SI','payroll','file',['XLSX','XLS'],{de:'Excel-Export für den DU-Bericht dokumentiert. Dieser Teilbericht allein ist kein vollständiger Jahreslohndatensatz. Vollständige Lohn- und HR-Daten ergänzen.',sl:'Dokumentiran je izvoz DU v Excel. Sam ta delni izpis ni popoln letni obračun plač. Dopolnite celotne podatke o plačah in zaposlenih.'}),
  entry('birokrat', 'Birokrat', 'SI', 'payroll', 'file', ['XLSX', 'CSV', 'TXT'], { de: 'Export der Gehaltsdaten als Excel, CSV oder Text. Slowenische Zeichen: meist Windows-1250.', sl: 'Izvoz podatkov o plačah kot Excel, CSV ali besedilo. Šumniki: običajno Windows-1250.' }),
  entry('factorial', 'Factorial', 'EU', 'hris', 'file', ['CSV', 'XLSX'], { de: 'Bericht als CSV oder Excel exportieren.', sl: 'Izvozite poročilo kot CSV ali Excel.' }),
  entry('rexx', 'rexx systems', 'DE', 'hris', 'file', ['CSV', 'XLSX'], { de: 'Bericht als CSV oder Excel exportieren.', sl: 'Izvozite poročilo kot CSV ali Excel.' }),
  entry('payfit', 'PayFit', 'EU', 'payroll', 'file', ['CSV', 'XLSX'], { de: 'Jahresauswertung als CSV oder Excel exportieren.', sl: 'Izvozite letni pregled kot CSV ali Excel.' }),
  entry('other', 'Anderes System · Other', 'DE · AT · SI', 'other', 'file', ['CSV', 'XLSX', 'ODS', 'XML', 'JSON', 'TXT'], { de: 'Unterstützte Tabellenstrukturen lassen sich nach Prüfung zuordnen. Nicht jeder Herstellerexport oder jede Sicherungsdatei ist kompatibel: Dateien werden am Inhalt erkannt (XLSX, XLS, ODS, XML, JSON, CSV, Text mit festen Spaltenbreiten, ZIP).', sl: 'Podprte tabelarične strukture je mogoče po pregledu preslikati. Vsi izvozi ali varnostne kopije ponudnikov niso združljivi: datoteke se prepoznajo po vsebini (XLSX, XLS, ODS, XML, JSON, CSV, besedilo s fiksno širino, ZIP).' }),
];
