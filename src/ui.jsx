import React from 'react';
import {preparePayFile} from './pay-upload';
import { ChartNoAxesCombined, ArrowRight, Check, LoaderCircle } from 'lucide-react';
export async function api(path, body) {
  if(body?.file?.uploadId&&/^\/(import(?:\/|$)|payroll\/(?:preview|stage))/.test(path))await preparePayFile(body);
  const response=await fetch(`/api${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error),data);
  return data;
}
export function Logo({onClick}) { return <button className="logo" onClick={onClick} aria-label="Equitensa"><span className="logo-icon"><ChartNoAxesCombined size={23}/></span>Equitensa</button>; }
export function Button({children,onClick,secondary=false,busy=false,...props}) { return <button className={`btn ${secondary?'btn-secondary':'btn-primary'}`} onClick={onClick} {...props} disabled={busy || props.disabled}>{busy?<LoaderCircle className="spin" size={17}/>:null}{children}</button>; }
export function ArrowButton({children,...props}) { return <Button {...props}>{children}<ArrowRight size={17}/></Button>; }
export function Tag({children,tone=''}) { return <span className={`tag ${tone}`}>{children}</span>; }
export function Field({label,hint,...props}) { return <label className="field"><span>{label}</span><input {...props}/>{hint && <small>{hint}</small>}</label>; }
export function TextField({label,...props}) { return <label className="field"><span>{label}</span><textarea rows={3} {...props}/></label>; }
export function CheckField({children,...props}) { return <label className="check-field"><input type="checkbox" {...props}/><span>{children}</span></label>; }
export function Notice({children,tone='info'}) { return <div className={`notice ${tone}`} role={tone==='error'?'alert':'status'}>{children}</div>; }
export function Tick({children}) { return <div className="tick"><Check size={16}/><span>{children}</span></div>; }
export function percent(n) { return n===null || n===undefined?'—':`${n.toLocaleString('de-DE',{maximumFractionDigits:2})} %`; }
export function download(content,name,type='text/csv;charset=utf-8') { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
export {plans,annualSavingsPercent,recommendPlan,planRange,obligation,upcomingDeadlines} from '../shared/plans.js';
export const template='internal_id,gender,job_title,worker_category,job_category_kv,base_annual,bonuses_annual,paid_hours_annual,hours_per_week\n001,F,Engineer,Engineering L3,,60000,3000,2080,40\n002,M,Engineer,Engineering L3,,63000,3000,2080,40\n';
export const errorText=(error,L)=> {
  if(error.message==='CONTRACT_ACCEPTANCE_REQUIRED')return L('Bitte die Vertragsbedingungen mit 12 Monaten Mindestlaufzeit bestätigen.','Potrdite pogodbene pogoje z najmanj 12 meseci trajanja.');
  if(['CONTRACT_NOT_AVAILABLE','CONTRACT_DATES_UNAVAILABLE'].includes(error.message))return L('Der Kündigungstermin ist noch nicht verfügbar. Bitte den Support kontaktieren.','Datum odpovedi še ni na voljo. Obrnite se na podporo.');
  if(error.message==='STRIPE_PRICE_MISMATCH')return L('Die Zahlungsanbindung muss auf die aktuellen Preise aktualisiert werden. Bitte den Support kontaktieren.','Plačilno povezavo je treba posodobiti na trenutne cene. Obrnite se na podporo.');
  if (error.message === 'EMAIL_DELIVERY_FAILED') return L('Die E-Mail konnte nicht versendet werden. Bitte später erneut versuchen oder den Support kontaktieren.', 'E-pošte ni bilo mogoče poslati. Poskusite pozneje ali se obrnite na podporo.');
  if (['RETENTION_POLICY_REQUIRED','INVALID_HOLD'].includes(error.message)) return L('Aufbewahrungsrichtlinie vollständig ausfüllen: Zweck, Rechtsgrundlage, Monate, Verantwortliche, Prüfdatum und Backup-Verfahren. Sperren benötigen Jahr und Grund.', 'Izpolnite politiko hrambe: namen, pravna podlaga, meseci, odgovorna oseba, datum pregleda in postopek kopij. Zadržanja zahtevajo leto in razlog.');
  if (error.message === 'LEGAL_HOLD_ACTIVE') return L('Eine gespeicherte Aufbewahrungssperre verhindert die Löschung.', 'Shranjeno zadržanje zaradi obveznosti hrambe preprečuje brisanje.');
  if (error.message === 'RETENTION_NOT_DUE') return L('Die gespeicherte Aufbewahrungsfrist ist noch nicht abgelaufen. Eine vorzeitige Löschung benötigt eine begründete, gesondert geprüfte Ausnahme.', 'Shranjeni rok hrambe še ni potekel. Predčasno brisanje zahteva utemeljeno, posebej pregledano izjemo.');
  if (error.message === 'DELETION_PREVIEW_CHANGED') return L('Daten oder Richtlinie haben sich seit der Vorschau geändert. Bitte neu laden und erneut prüfen.', 'Podatki ali politika so se od predogleda spremenili. Ponovno naložite in preglejte.');
  if (['INVALID_CONFIRMATION','INVALID_RECEIPT'].includes(error.message)) return L('Bestätigung oder Löschbeleg unvollständig. Bitte Angaben prüfen.', 'Potrditev ali dokazilo brisanja ni popolno. Preverite vnose.');
  if (['CONTROL_EVIDENCE_REQUIRED','INVALID_CONTROL'].includes(error.message)) return L('Für erfasste Nachweise sind verantwortliche Person, gültiges Prüfdatum und Belege erforderlich. Nur öffentliche Aufträge können mit Begründung als nicht anwendbar markiert werden.', 'Za vnesena dokazila so potrebni odgovorna oseba, veljaven datum pregleda in dokazila. Le javna naročila lahko z utemeljitvijo označite kot neuporabna.');
  if (error.message === 'REMEDIATION_PROOF_REQUIRED') return L('Für „behoben“ fehlen gültige Umsetzungs- und Wirksamkeitsnachweise zum aktuellen Datenstand. Bitte die Belege ergänzen oder die Markierung entfernen.', 'Za oznako »odpravljeno« manjkajo veljavna dokazila o izvedbi in učinkovitosti za trenutni posnetek. Dopolnite dokazila ali odstranite oznako.');
  const importMessages = {
    HR_DATA_REQUIRED:L('Noch keine HR-Stammdaten vorhanden. Zuerst die Beschäftigten mit Personalnummer, Geschlecht, Tätigkeit und Kategorie importieren.','Podatki o zaposlenih še niso uvoženi. Najprej uvozite zaposlene s šifro, spolom, delovnim mestom in kategorijo.'),
    MISSING_PAYROLL_PERIOD_OR_HOURS:L('Für einen Beschäftigungsmonat fehlen Buchungen oder bezahlte Stunden. Monatsdaten ergänzen.','Za mesec zaposlitve manjkajo transakcije ali plačane ure. Dopolnite mesečne podatke.'),
    PAY_CODE_CLASSIFICATION_REQUIRED:L('Entgeltart noch nicht bestätigt. Als Grundvergütung, variabel oder mit Begründung ausgeschlossen zuordnen.','Obračunska šifra še ni potrjena. Razvrstite jo kot osnovno, variabilno ali z obrazložitvijo izključeno plačilo.'),
    UNMATCHED_PAYROLL_EMPLOYEE:L('Die Personalnummer aus der Abrechnung hat keinen passenden HR-Datensatz. Zuordnung oder HR-Datei prüfen.','Šifra zaposlenega v obračunu nima ustreznega kadrovskega zapisa. Preverite preslikavo ali kadrovsko datoteko.'),
    CONFLICTING_PERIOD_HOURS:L('Für denselben Beschäftigten und Monat wurden unterschiedliche bezahlte Stunden geliefert. Originaldaten prüfen und korrigieren.','Za istega zaposlenega in mesec so navedene različne plačane ure. Preverite in popravite izvirne podatke.'),
    INVALID_CORRECTION_REFERENCE:L('Korrektur passt nicht zur Originalbuchung: Person, Monat, Entgeltart und Referenz prüfen.','Popravek ne ustreza izvirni transakciji: preverite zaposlenega, mesec, šifro in referenco.'),
    PAYROLL_OUTSIDE_EMPLOYMENT:L('Eine Buchung liegt außerhalb der angegebenen Beschäftigungsmonate. Beschäftigungszeitraum und Abrechnung prüfen.','Transakcija je zunaj navedenih mesecev zaposlitve. Preverite obdobje zaposlitve in obračun.'),
    PAYROLL_TRANSACTION_IMPORT_REQUIRED:L('Diese Datei enthält monatliche Buchungen. Bitte unter „HR & Monatsabrechnungen“ prüfen und übernehmen.','Datoteka vsebuje mesečne transakcije. Preverite in prevzemite jih v razdelku »HR in mesečni obračuni«.'),
    IMPORT_UPLOAD_CORRUPTED:L('Die gespeicherten Daten konnten nicht vollständig geprüft werden. Keine Teilübernahme: Upload löschen und die Originaldatei erneut hochladen.','Shranjeni podatki niso prestali celotnega preverjanja. Brez delnega prevzema: izbrišite nalaganje in ponovno naložite izvirno datoteko.'),
    IMPORT_UPLOAD_EXPIRED:L('Der temporäre Upload ist nach 24 Stunden abgelaufen. Bitte die Datei erneut auswählen.','Začasno nalaganje je po 24 urah poteklo. Ponovno izberite datoteko.'),
    PAYROLL_VERSION_CONFLICT:L('Der Arbeitsstand wurde inzwischen geändert. Neu laden und die Übernahme erneut prüfen.','Delovni podatki so se medtem spremenili. Ponovno naložite in preverite prevzem.'),
    PAYROLL_TOTAL_OVERFLOW:L('Die Summe kann nicht mehr centgenau berechnet werden. Beträge und Dezimalformat prüfen; keine Freigabe möglich.','Vsote ni več mogoče natančno izračunati v centih. Preverite zneske in decimalno obliko; potrditev ni mogoča.'),
    PAYROLL_EMPLOYEE_CAPACITY:L('Dieser Arbeitsbereich unterstützt höchstens 10.000 Beschäftigte; der gebuchte Tarif kann darunter liegen. Support für größere Bestände kontaktieren.','Ta delovni prostor podpira največ 10.000 zaposlenih; zakupljeni paket lahko določa manj. Za večje zbirke se obrnite na podporo.'),
    PAYROLL_CODE_CAPACITY:L('Zu viele unterschiedliche Entgeltarten. Zuordnung prüfen oder den Support kontaktieren.','Preveč različnih obračunskih šifer. Preverite preslikavo ali se obrnite na podporo.'),
    IMPORT_UPLOAD_SIZE:L('Maximal 1 GB pro Upload. Bitte eine kleinere Datei oder mehrere Monatsdateien verwenden.','Največ 1 GB na datoteko. Uporabite manjšo datoteko ali več mesečnih datotek.'),
    IMPORT_UPLOAD_QUOTA:L('Temporärer Speicher belegt. Alte Uploads löschen oder später erneut versuchen (maximal 2 GB pro Firma).','Začasni prostor je zaseden. Izbrišite stare datoteke ali poskusite pozneje (največ 2 GB na podjetje).'),
    IMPORT_STORAGE_FULL:L('Nicht genügend Serverspeicher. Keine Daten übernommen; bitte Support kontaktieren.','Na strežniku ni dovolj prostora. Podatki niso bili prevzeti; obrnite se na podporo.'),
    IMPORT_CHUNK_CONFLICT:L('Datei stimmt nicht mit dem begonnenen Upload überein. Upload löschen und Datei neu auswählen.','Datoteka se ne ujema z začetim nalaganjem. Izbrišite nalaganje in ponovno izberite datoteko.'),
    IMPORT_UPLOAD_NOT_FOUND:L('Upload wurde gelöscht oder ist abgelaufen. Datei erneut auswählen.','Nalaganje je izbrisano ali poteklo. Ponovno izberite datoteko.'),
    IMPORT_JOB_INTERRUPTED:L('Verarbeitung unterbrochen. Vorschau erneut starten; Daten wurden nicht übernommen.','Obdelava je bila prekinjena. Ponovno zaženite predogled; podatki niso bili prevzeti.'),
    IMPORT_RESULT_TOO_LARGE:L('Die entpackten Tabellendaten überschreiten 128 MB. Bitte in Monatsdateien aufteilen. Keine Zeilen übernommen.','Razpakirani tabelarični podatki presegajo 128 MB. Razdelite jih po mesecih. Nobena vrstica ni bila prevzeta.'),
    LARGE_FORMAT_NEEDS_CONVERSION:L('Große Altformate bitte als CSV oder XLSX mit reinen Werten exportieren.','Velike datoteke starejših oblik izvozite kot CSV ali XLSX samo z vrednostmi.'),
    IMPORT_DELIMITER_REQUIRED:L('Trennzeichen nicht eindeutig. Bitte als CSV mit einheitlichem Semikolon exportieren.','Ločilo ni enolično. Izvozite CSV z enotnim podpičjem.'),
    IMPORT_CONFIRMATION_REQUIRED:L('Bitte die Zuordnung und den Jahresbezug bestätigen.','Potrdite preslikavo in letno obdobje.'),
    IMPORT_SELECTION_REQUIRED:L('Bitte Arbeitsblatt oder XML-Datensatzpfad auswählen.','Izberite delovni list ali pot do zapisov XML.'),
    IMPORT_BUSY:L('Die Importverarbeitung ist ausgelastet. Bitte kurz warten und erneut versuchen.','Obdelava uvozov je zasedena. Počakajte in poskusite znova.'),
    IMPORT_TIMEOUT:L('Verarbeitung abgebrochen: Zeitlimit erreicht. Datei prüfen oder verkleinern.','Obdelava je dosegla časovno omejitev. Preverite ali zmanjšajte datoteko.'),
    ENCODING_REQUIRED:L('Textkodierung auswählen, z. B. Windows-1250 für ältere slowenische Exporte.','Izberite kodiranje, npr. Windows-1250 za starejše slovenske izvoze.'),
    INVALID_FILE:L('Datei ist beschädigt oder hat eine nicht unterstützte Struktur.','Datoteka je poškodovana ali ima nepodprto strukturo.'),
    UNSUPPORTED_FILE_FORMAT:L('Diese Dateistruktur wird nicht unterstützt. Bitte XLSX oder CSV exportieren.','Ta struktura datoteke ni podprta. Izvozite XLSX ali CSV.'),
    WORKBOOK_FORMULA_OR_LINK:L('Excel enthält Formeln oder externe Links. Bitte nur Werte exportieren.','Excel vsebuje formule ali zunanje povezave. Izvozite samo vrednosti.'),
    UNSAFE_WORKBOOK:L('Excel-Datei wegen Makros, eingebetteten Inhalten oder Sicherheitslimits abgelehnt.','Excelova datoteka je zavrnjena zaradi makrov, vdelane vsebine ali varnostnih omejitev.'),
    UNSAFE_XML:L('XML mit DTD oder Entitäten ist nicht zulässig.','XML z DTD ali entitetami ni dovoljen.'),
    INVALID_XML:L('XML ist nicht korrekt aufgebaut. Bitte Export prüfen.','XML ni pravilno sestavljen. Preverite izvoz.'),
    XML_RECORDS_NOT_FOUND:L('Keine eindeutigen Datensätze im XML gefunden.','V XML ni bilo mogoče najti ustreznih zapisov.'),
    XML_LIMIT_EXCEEDED:L('XML überschreitet die erlaubte Tiefe oder Anzahl Elemente.','XML presega dovoljeno globino ali število elementov.'),
    INVALID_HEADERS:L('Spaltenüberschriften müssen eindeutig und ausgefüllt sein.','Naslovi stolpcev morajo biti enolični in izpolnjeni.'),
    INVALID_ROW_COUNT:L('Zeilenlimit: Jahres-/HR-Daten 10.000; monatliche Transaktionen werden blockweise verarbeitet (CSV/JSON/XML/XLSX/ODS). Keine Teilübernahme.','Omejitev: letni/HR podatki 10.000; mesečne transakcije se obdelujejo po blokih (CSV/JSON/XML/XLSX/ODS). Brez delnega prevzema.'),
    INVALID_COLUMNS:L('Ungültige Spaltenstruktur oder mehr als 200 Spalten.','Neveljavna struktura ali več kot 200 stolpcev.'),
    IMPORT_COUNTRY_MISMATCH:L('Das Land in der Datei stimmt nicht mit dem Berichtsland der Firma überein.','Država v datoteki se ne ujema z državo poročanja podjetja.'),
    IMPORT_CURRENCY_UNSUPPORTED:L('Die Datei muss durchgehend EUR enthalten. Es erfolgt keine automatische Umrechnung.','Datoteka mora vsebovati EUR v vseh vrsticah. Samodejne pretvorbe ni.'),
    IMPORT_YEAR_MISMATCH:L('Das Jahr in der Datei stimmt nicht mit dem gewählten Berichtsjahr überein.','Leto v datoteki se ne ujema z izbranim letom poročanja.'),
    IMPORT_ANNUAL_PERIOD_REQUIRED:L('Dieser Import erwartet Jahresdaten. Monatliche Perioden zuerst kontrolliert zusammenfassen.','Ta uvoz pričakuje letne podatke. Mesečna obdobja najprej nadzorovano združite.'),
    XLSB_NOT_SUPPORTED:L('Excel-Binärformat (.xlsb) wird nicht akzeptiert. Bitte als .xlsx speichern oder als CSV exportieren.','Dvojiška oblika Excel (.xlsb) ni podprta. Shranite kot .xlsx ali izvozite CSV.'),
    JSON_NESTED_ARRAY:L('Die JSON-Datei enthält Listen innerhalb eines Datensatzes. Bitte flach exportieren (ein Objekt je Person).','Datoteka JSON vsebuje sezname znotraj zapisa. Izvozite ploščato (en objekt na osebo).'),
    JSON_RECORDS_NOT_FOUND:L('Keine Liste von Personen in der JSON-Datei gefunden.','V datoteki JSON ni najdenega seznama oseb.'),
    JSON_LIMIT_EXCEEDED:L('Die JSON-Struktur ist zu tief oder zu groß.','Struktura JSON je pregloboka ali prevelika.'),
    UNSAFE_JSON:L('Die JSON-Datei enthält unzulässige Feldnamen.','Datoteka JSON vsebuje nedovoljena imena polj.'),
    INVALID_JSON:L('Die JSON-Datei ist fehlerhaft.','Datoteka JSON je napačna.'),
    INVALID_HEADER_ROW:L('Die Überschriftenzeile liegt außerhalb der Datei. Bitte die Zeilennummer prüfen.','Vrstica z naslovi je zunaj datoteke. Preverite številko vrstice.'),
    INVALID_CSV:L('Die Datei konnte nicht als Tabelle gelesen werden. Prüfen Sie Trennzeichen, Überschriftenzeile und Kodierung.','Datoteke ni bilo mogoče prebrati kot tabele. Preverite ločilo, vrstico z naslovi in kodiranje.'),
    INVALID_ENCODING:L('Diese Textkodierung wird nicht unterstützt.','To kodiranje besedila ni podprto.'),
    PAYLOAD_TOO_LARGE:L('Die Datei ist zu groß (Grenze 20 MB je Datei; Archive maximal 64 MB entpackt).','Datoteka je prevelika (omejitev 20 MB na datoteko; arhivi do 64 MB po razpakiranju).'),
    UTF8_REQUIRED:L('Bitte die Datei als UTF-8 exportieren.','Izvozite datoteko v kodiranju UTF-8.'),
    INVALID_FIXES:L('Eine Korrektur passt nicht zur Datei. Bitte zurücksetzen und erneut wählen.','Popravek ne ustreza datoteki. Ponastavite in izberite znova.'),
    INVALID_MAPPING:L('Jedes Pflichtfeld einer eigenen vorhandenen Spalte zuordnen.','Vsako obvezno polje povežite z lastnim obstoječim stolpcem.'),
  };
  if (importMessages[error.message]) return importMessages[error.message];
  if (error.message === 'NATIONAL_DATA_INCOMPLETE') return L('Nationale Zusatzangaben fehlen oder sind ungültig. Prüfen Sie Pflichtfelder, Bestätigungen und bei CSV jede Personalnummer, Entgeltsumme und Beschäftigungsanteile. Bei neuen Jahresdaten erneut bestätigen.', 'Nacionalni dodatni podatki manjkajo ali niso veljavni. Preverite obvezna polja, potrditve, šifre zaposlenih, vsote plač in deleže zaposlitve. Po spremembi letnih podatkov potrdite znova.');
  if (error.message === 'NATIONAL_TEMPLATE_UNVERIFIED') return L('Für dieses Land ist keine bestätigte nationale Vorlage hinterlegt. Der EU-Bericht ist separat verfügbar.', 'Za to državo ni potrjene nacionalne predloge. Poročilo EU je na voljo ločeno.');
  if (error.message === 'INVALID_ASSESSMENT_INPUT') return L('Rückkehrangaben prüfen: ganze Personenzahlen, höchstens die Beschäftigtenzahl je Geschlecht; Begünstigte dürfen relevante Rückkehrende nicht überschreiten.', 'Preverite podatke o vrnitvah: cela števila oseb, največ število zaposlenih po spolu; prejemnikov izboljšanja ne sme biti več kot upravičenih povratnikov.');
  if (error.message === 'ASSESSMENT_INCOMPLETE') return L('Pflichtangaben aus Artikel 10 fehlen. Bitte Gründe, Maßnahmen, Rückkehranteile, frühere Maßnahmen und Zusammenarbeit im Schritt „Erklären & handeln“ vervollständigen.', 'Manjkajo obvezni podatki iz člena 10. V koraku »Pojasnila in ukrepi« dopolnite razloge, ukrepe, deleže po vrnitvi, prejšnje ukrepe in sodelovanje.');
  if(error.message==='COMPANY_SUSPENDED')return L('Der Zugang Ihrer Firma ist vorübergehend gesperrt. Bitte kontaktieren Sie Equitensa.','Dostop vašega podjetja je začasno blokiran. Obrnite se na Equitensa.');
  if(error.message==='SUBSCRIPTION_ALREADY_EXISTS')return L('Sie haben bereits eine Stripe-Bestellung. Verwalten Sie Ihr Paket unter „Paket & Abrechnung“.','Naročilo Stripe že obstaja. Paket upravljajte v razdelku »Paket in plačila«.');
  const accountMessages={
    EMPLOYEE_NOT_FOUND:L('Zu dieser Personalnummer gibt es im gewählten Datenstand keine Person.','Za to šifro v izbranem podatkovnem posnetku ni osebe.'),
    REQUEST_NOT_FOUND:L('Diese Anfrage wurde nicht gefunden.','Te zahteve ni mogoče najti.'),
    INVALID_REQUEST:L('Bitte die Angaben prüfen: Datum nicht in der Zukunft, Pflichtfelder ausgefüllt, keine Sonderzeichen.','Preverite podatke: datum ne sme biti v prihodnosti, izpolnite obvezna polja, brez posebnih znakov.'),
    NO_DATA:L('Für dieses Jahr gibt es noch keinen Datenstand. Bitte zuerst Daten importieren.','Za to leto še ni podatkovnega posnetka. Najprej uvozite podatke.'),
    EMAIL_NOT_VERIFIED:L('Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.','Najprej potrdite svoj e-poštni naslov.'),
    MFA_REQUIRED:L('Bitte den Code Ihrer Authenticator-App eingeben.','Vnesite kodo iz aplikacije za preverjanje.'),
    INVALID_MFA_CODE:L('Der Code ist ungültig oder bereits verwendet.','Koda ni veljavna ali je že uporabljena.'),
    MFA_LOCKED:L('Zu viele falsche Codes. Bitte in 15 Minuten erneut versuchen.','Preveč napačnih kod. Poskusite znova čez 15 minut.'),
    INVALID_TOKEN:L('Der Link ist ungültig oder abgelaufen. Bitte einen neuen anfordern.','Povezava ni veljavna ali je potekla. Zahtevajte novo.'),
    INVALID_PASSWORD:L('Das Passwort muss mindestens 12 Zeichen lang sein.','Geslo mora imeti vsaj 12 znakov.'),
    INVALID_EMAIL:L('Bitte eine gültige E-Mail-Adresse eingeben.','Vnesite veljaven e-poštni naslov.'),
    INVALID_COUNTRY:L('Bitte das Land der Firma wählen.','Izberite državo podjetja.'),
    MFA_ALREADY_ENABLED:L('Die Zwei-Faktor-Anmeldung ist bereits aktiv.','Dvostopenjska prijava je že vklopljena.'),
    MFA_SETUP_REQUIRED:L('Bitte die Einrichtung neu starten.','Znova začnite nastavitev.'),
    MFA_NOT_ENABLED:L('Die Zwei-Faktor-Anmeldung ist nicht aktiv.','Dvostopenjska prijava ni vklopljena.'),
  };
  const messages={...accountMessages,GOOGLE_UNAVAILABLE:L('Google-Anmeldung ist auf dieser Domain noch nicht verfügbar.','Prijava z Googlom na tej domeni še ni na voljo.'),GOOGLE_CANCELLED:L('Google-Anmeldung wurde abgebrochen. Sie können es erneut versuchen.','Prijava z Googlom je preklicana. Poskusite znova.'),GOOGLE_FLOW_EXPIRED:L('Die Google-Anmeldung ist abgelaufen. Bitte neu starten.','Prijava z Googlom je potekla. Začnite znova.'),GOOGLE_INVALID_IDENTITY:L('Google-Anmeldung konnte nicht bestätigt werden. Bitte erneut versuchen.','Prijave z Googlom ni bilo mogoče potrditi. Poskusite znova.'),GOOGLE_LINK_PASSWORD_REQUIRED:L('Bestätigen Sie das Passwort Ihres bestehenden Kontos und die Verbindung.','Potrdite geslo obstoječega računa in povezavo.'),GOOGLE_IDENTITY_EXISTS:L('Dieses Google-Konto ist bereits verbunden. Bitte mit dem verknüpften Konto anmelden.','Ta Google račun je že povezan. Prijavite se s povezanim računom.'),INVALID_LOGIN:L('E-Mail oder Passwort stimmt nicht.','E-pošta ali geslo ni pravilno.'),INVALID_REGISTRATION:L('Bitte gültige Angaben und ein Passwort mit mindestens 12 Zeichen verwenden.','Vnesite veljavne podatke in geslo z vsaj 12 znaki.'),EMAIL_EXISTS:L('Diese E-Mail ist bereits registriert. Bitte anmelden.','Ta e-pošta je že registrirana. Prijavite se.'),INVALID_CSV:L('CSV nicht lesbar. Prüfen Sie Kommas, Spalten und Anführungszeichen.','CSV ni berljiv. Preverite vejice, stolpce in narekovaje.'),SNAPSHOT_CHANGED:L('Der Datenstand hat sich geändert. Bitte die aktuelle Version erneut prüfen.','Podatki so se spremenili. Ponovno preverite trenutno različico.'),SUBSCRIPTION_REQUIRED:L('Für das vorbereitete Berichtspaket benötigen Sie einen aktiven Tarif.','Za pripravljen paket poročil potrebujete aktiven paket.'),BILLING_NOT_CONFIGURED:L('Zahlungen sind noch nicht freigeschaltet. Ihr Arbeitsstand bleibt gespeichert.','Plačila še niso omogočena. Vaše delo ostane shranjeno.'),PLAN_EMPLOYEE_LIMIT:L(`Ihr Tarif unterstützt bis zu ${error.limit} Beschäftigte. Wählen Sie einen größeren Tarif.`,`Vaš paket podpira do ${error.limit} zaposlenih. Izberite večji paket.`),REPORT_INCOMPLETE:L('Bitte zuerst alle Prüfschritte abschließen.','Najprej zaključite vse korake preverjanja.'),IMPORT_VALIDATION_FAILED:L('Import gestoppt: Bitte die angezeigten Zeilen korrigieren. Ihr bisheriger Datenstand bleibt erhalten.','Uvoz ustavljen: popravite prikazane vrstice. Prejšnji podatki ostanejo shranjeni.')};
  return messages[error.message] || L('Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.','Dejanja ni mogoče zaključiti. Poskusite znova.');
};
