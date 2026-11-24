// Explicit supported scope, not a certification of national tax compliance.
export const financeCountries = {
  DE: {name:'Deutschland',locale:'de-DE',standardRate:'19',rates:['19','7'],source:'https://www.gesetze-im-internet.de/ustg_1980/__14.html',rule:'UStG § 14',structured:'XRechnung / ZUGFeRD'},
  AT: {name:'Österreich',locale:'de-AT',standardRate:'20',rates:['20','13','10','4.9'],source:'https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/rechnung.html',rule:'UStG § 11',structured:'ebInterface / Peppol'},
  SI: {name:'Slovenija',locale:'sl-SI',standardRate:'22',rates:['22','9.5','5'],source:'https://spot.gov.si/sl/teme/izdajanje-racunov/',rule:'ZDDV-1, 82. člen',structured:'e-SLOG / EN 16931'},
};
