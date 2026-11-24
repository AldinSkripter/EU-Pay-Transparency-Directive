// Product capabilities, separate from formats accepted by national recipients.
export const financeJurisdictions = {
  DE: {name:'Deutschland', formats:'XRechnung / ZUGFeRD', available:'XRechnung 3.0 XML · ZUGFeRD EN16931 PDF', missing:'E-Rechnungsversand', source:'https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html'},
  AT: {name:'Österreich', formats:'ebInterface / UBL', available:'ebInterface 6.1 XML · UBL 2.1 XML', missing:'e-Rechnung.gv.at / Peppol', source:'https://www.erechnung.gv.at/erb/de_DE/tec_formats'},
  SI: {name:'Slovenija', formats:'e-SLOG / UBL / CII', available:'e-SLOG 2.0 XML · UBL 2.1 XML', missing:'UJP / Peppol', source:'https://www.gov.si/teme/izmenjava-e-racunov-s-proracunskimi-uporabniki/'},
};

