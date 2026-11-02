import React from 'react';
import { ChartNoAxesCombined, ArrowRight, Check, LoaderCircle } from 'lucide-react';
export async function api(path, body) {
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
  const importMessages = {
    PAY_CODE_CLASSIFICATION_REQUIRED:L('Diese Datei enthält Entgeltarten. Zuerst klassifizierte Jahresgrund- und variable Beträge exportieren. Der Transaktionsimport ist noch nicht verfügbar.','Datoteka vsebuje obračunske šifre. Najprej izvozite razvrščene letne osnovne in variabilne zneske. Transakcijski uvoz še ni na voljo.'),
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
    INVALID_ROW_COUNT:L('Bitte zwischen 1 und 10.000 Datensätzen importieren.','Uvozite od 1 do 10.000 zapisov.'),
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
    PAYLOAD_TOO_LARGE:L('Die Datei ist zu groß (Grenze 4 MB, in ZIP-Archiven 8 MB entpackt).','Datoteka je prevelika (omejitev 4 MB, v arhivu ZIP 8 MB po razpakiranju).'),
    UTF8_REQUIRED:L('Bitte die Datei als UTF-8 exportieren.','Izvozite datoteko v kodiranju UTF-8.'),
    INVALID_FIXES:L('Eine Korrektur passt nicht zur Datei. Bitte zurücksetzen und erneut wählen.','Popravek ne ustreza datoteki. Ponastavite in izberite znova.'),
    INVALID_MAPPING:L('Jedes Pflichtfeld einer eigenen vorhandenen Spalte zuordnen.','Vsako obvezno polje povežite z lastnim obstoječim stolpcem.'),
  };
  if (importMessages[error.message]) return importMessages[error.message];
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
