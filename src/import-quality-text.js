// German and Slovenian wording for the findings of server/data-quality.js. The server sends codes and numbers;
// the wording lives here, like the other import messages.
export function describeFinding(f, L, label) {
  const field = f.field ? label(f.field) : '';
  const n = f.count;
  switch (f.code) {
    case 'MAPPING_MISSING': return L(`Pflichtfelder ohne Spalte: ${f.fields.map(label).join(', ')}. Ordnen Sie sie oben zu.`, `Obvezna polja brez stolpca: ${f.fields.map(label).join(', ')}. Povežite jih zgoraj.`);
    case 'NOT_AN_EMPLOYEE': return L(`${n} Zeilen sind keine Beschäftigten (Summenzeile oder leere Zeile).`, `${n} vrstic ni zaposlenih (vrstica z vsoto ali prazna vrstica).`);
    case 'MISSING_VALUE': return L(`${field}: ${n} Zeilen ohne Wert.`, `${field}: ${n} vrstic brez vrednosti.`);
    case 'TEXT_INVALID': return L(`${field}: ${n} Werte sind länger als 255 Zeichen oder enthalten Steuerzeichen.`, `${field}: ${n} vrednosti je daljših od 255 znakov ali vsebuje kontrolne znake.`);
    case 'BONUS_EMPTY': return L(`Variable Vergütung: ${n} leere Felder. Leer ist nicht dasselbe wie 0; bestätigen Sie, dass hier wirklich nichts gezahlt wurde.`, `Variabilno plačilo: ${n} praznih polj. Prazno ni isto kot 0; potrdite, da ni bilo izplačano ničesar.`);
    case 'NUMBER_FORMAT': return L(`${field}: ${n} Werte sind keine lesbare Zahl (z. B. mit Währungszeichen, Leerzeichen oder anderem Dezimaltrennzeichen).`, `${field}: ${n} vrednosti ni berljivo število (npr. z znakom valute, presledkom ali drugim decimalnim ločilom).`);
    case 'VALUE_OUT_OF_RANGE': return L(`${field}: ${n} Werte liegen außerhalb des zulässigen Bereichs.`, `${field}: ${n} vrednosti je zunaj dovoljenega območja.`);
    case 'GENDER_UNKNOWN': return L(`${n} Zeilen mit unbekannter Geschlechtsangabe. Ordnen Sie jeder Angabe männlich, weiblich oder divers zu; Equitensa errät das nicht.`, `${n} vrstic z neznanim podatkom o spolu. Vsakemu podatku določite moški, ženska ali drugo; Equitensa tega ne ugiba.`);
    case 'DUPLICATE_IDENTICAL': return L(`${n} Zeilen sind exakte Duplikate einer anderen Zeile.`, `${n} vrstic je popolnih dvojnikov druge vrstice.`);
    case 'DUPLICATE_CONFLICTING': return L(`${n} Zeilen teilen eine Personalnummer, enthalten aber unterschiedliche Daten. Zwei Verträge derselben Person fassen Sie in einer Zeile zusammen; bei zwei Personen vergeben Sie eindeutige Nummern.`, `${n} vrstic ima isto šifro, a različne podatke. Dve pogodbi iste osebe združite v eno vrstico; pri dveh osebah določite enolični šifri.`);
    case 'ID_LOOKS_PERSONAL': return L(`${n} Personalnummern sehen nach Namen oder E-Mail-Adressen aus. Für den Bericht reicht eine Nummer; Namen werden nicht gebraucht.`, `${n} šifer zaposlenih je videti kot imena ali e-naslovi. Za poročilo zadošča šifra; imen ne potrebujemo.`);
    case 'THOUSANDS_AS_DECIMAL': return L(`${field}: ${n} Werte wie „60.000“ wurden mit dem aktuellen Dezimaltrennzeichen als 60 gelesen. Vermutlich ist der Punkt ein Tausendertrenner.`, `${field}: ${n} vrednosti, kot je »60.000«, je bilo z trenutnim decimalnim ločilom prebranih kot 60. Pika je verjetno ločilo tisočic.`);
    case 'HOURS_IMPLAUSIBLE': return L(`${field}: ${n} unplausible Werte. Prüfen Sie die Einheit (Stunden, nicht Tage oder Monate).`, `${field}: ${n} neverjetnih vrednosti. Preverite enoto (ure, ne dnevi ali meseci).`);
    case 'HOURS_MISMATCH': return L(`${n} Zeilen: Die bezahlten Jahresstunden passen nicht zu Wochenstunden × 52 (Abweichung über 35 %). Prüfen Sie Teilzeit und die Stunden aus der Abrechnung.`, `${n} vrstic: plačane letne ure ne ustrezajo tedenskim uram × 52 (odstopanje nad 35 %). Preverite krajši delovni čas in ure iz obračuna.`);
    case 'AMOUNT_NOT_ANNUAL': return L(`Die Grundvergütung liegt typischerweise bei ${f.typical.toLocaleString('de-DE')} €. Das sieht nach Monatsbeträgen aus; verlangt sind Jahresbeträge.`, `Osnovno plačilo je običajno ${f.typical.toLocaleString('sl-SI')} €. To je videti kot mesečni znesek; zahtevani so letni zneski.`);
    case 'HOURLY_IMPLAUSIBLE': return L(`${n} Zeilen: Grundvergütung geteilt durch bezahlte Stunden ergibt unter 6 € oder über 400 € je Stunde.`, `${n} vrstic: osnovno plačilo, deljeno s plačanimi urami, daje manj kot 6 € ali več kot 400 € na uro.`);
    case 'BONUS_EXCEEDS_BASE': return L(`${n} Zeilen: variable Vergütung höher als die Grundvergütung. Stimmt das, oder sind Spalten vertauscht?`, `${n} vrstic: variabilno plačilo je višje od osnovnega. Ali drži, ali so stolpci zamenjani?`);
    case 'NO_VARIABLE_PAY': return L('Keine variable Vergütung in den Daten. Falls es Boni, Zulagen oder Sachbezüge gibt, fehlen sie; der Bericht muss sie je Gruppe ausweisen (Art. 9).', 'V podatkih ni variabilnega plačila. Če obstajajo bonusi, dodatki ali ugodnosti, manjkajo; poročilo jih mora prikazati po skupinah (člen 9).');
    case 'CATEGORY_SIMILAR': return L('Ähnliche Kategorien erkannt. Meinen sie dieselbe gleiche oder gleichwertige Arbeit, führen Sie sie zusammen: sonst werden Gruppen künstlich klein und Lohnlücken verschwinden.', 'Zaznane so podobne kategorije. Če pomenijo isto enako ali enakovredno delo, jih združite: sicer so skupine umetno majhne in razlike v plačah izginejo.');
    case 'CATEGORY_SINGLE': return L('Alle Beschäftigten stehen in einer Kategorie. Ein Vergleich nach gleicher oder gleichwertiger Arbeit (Art. 4) ist so nicht möglich.', 'Vsi zaposleni so v isti kategoriji. Primerjava po enakem ali enakovrednem delu (člen 4) tako ni mogoča.');
    case 'CATEGORY_TOO_FINE': return L(`${f.singles} von ${f.categories} Kategorien haben nur eine Person. So feine Kategorien machen einen Vergleich unmöglich.`, `${f.singles} od ${f.categories} kategorij ima samo eno osebo. Tako drobne kategorije onemogočajo primerjavo.`);
    case 'CATEGORY_GROUP_SIZES': return L(`${f.oneSided} Kategorien enthalten nur ein Geschlecht (kein Vergleich möglich), ${f.small} haben weniger als ${f.minimum} Personen eines Geschlechts; für Beschäftigte und Öffentlichkeit werden sie geschützt.`, `${f.oneSided} kategorij vsebuje samo en spol (primerjava ni mogoča), ${f.small} jih ima manj kot ${f.minimum} oseb enega spola; za zaposlene in javnost so zaščitene.`);
    case 'OUTLIER_PAY': return L(`${n} Zeilen weichen stark vom Median ihrer Kategorie ab (mehr als das Dreifache oder weniger als ein Drittel). Tippfehler oder falsche Einheit?`, `${n} vrstic močno odstopa od mediane svoje kategorije (več kot trikrat ali manj kot tretjina). Tipkarska napaka ali napačna enota?`);
    case 'SENSITIVE_COLUMNS_IGNORED': return L(`Nicht verwendete Spalten (${f.columns.join(', ')}) werden nicht übernommen und nicht gespeichert.`, `Neuporabljeni stolpci (${f.columns.join(', ')}) se ne prevzamejo in ne shranijo.`);
    default: return f.code;
  }
}

export const genderLabels = L => ({ M: L('männlich', 'moški'), F: L('weiblich', 'ženska'), O: L('divers', 'drugo') });

export const assistantErrors = L => ({
  AI_NOT_CONFIGURED: L('Der KI-Assistent ist nicht eingerichtet.', 'Pomočnik z umetno inteligenco ni nastavljen.'),
  AI_CONSENT_REQUIRED: L('Bitte zuerst zustimmen.', 'Najprej potrdite soglasje.'),
  AI_BUSY: L('Der KI-Dienst ist ausgelastet. Bitte in einer Minute erneut versuchen.', 'Storitev umetne inteligence je zasedena. Poskusite znova čez minuto.'),
  AI_UNREACHABLE: L('Der KI-Dienst ist nicht erreichbar. Die automatischen Prüfungen funktionieren weiterhin.', 'Storitev umetne inteligence ni dosegljiva. Samodejni pregledi še delujejo.'),
  AI_REFUSED: L('Der KI-Dienst hat die Anfrage abgelehnt. Die automatischen Prüfungen funktionieren weiterhin.', 'Storitev umetne inteligence je zahtevo zavrnila. Samodejni pregledi še delujejo.'),
  AI_TRUNCATED: L('Die Antwort war zu lang. Bitte erneut versuchen.', 'Odgovor je bil predolg. Poskusite znova.'),
  AI_FAILED: L('Der KI-Assistent konnte keinen Vorschlag liefern. Die automatischen Prüfungen funktionieren weiterhin.', 'Pomočnik z umetno inteligenco ni mogel podati predloga. Samodejni pregledi še delujejo.'),
  INVALID_FIXES: L('Eine Korrektur passt nicht zur Datei. Bitte zurücksetzen und erneut wählen.', 'Popravek ne ustreza datoteki. Ponastavite in izberite znova.'),
});
