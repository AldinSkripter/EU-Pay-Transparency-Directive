import React from 'react';
import {Check,FileCheck2} from 'lucide-react';
import {financeJurisdictions} from '../shared/finance-jurisdictions';

export default function FinancePlanCountry({country,L}) {
 const j=financeJurisdictions[country];
 if(!j)return null;
 const formats=country==='DE'?['XRechnung 3.0 · XML','ZUGFeRD EN16931 · PDF + XML']:country==='AT'?['ebInterface 6.1 · XML','UBL 2.1 · XML']:['e-SLOG 2.0 · XML','UBL 2.1 · XML'];
 const official={
  DE:L('BMF: XRechnung und ZUGFeRD ab 2.0.1; MINIMUM und BASIC-WL ausgenommen.','BMF: XRechnung in ZUGFeRD od 2.0.1; profila MINIMUM in BASIC-WL sta izključena.'),
  AT:L('e-Rechnung.gv.at: ebInterface 4.3 / 5.0 / 6.0 / 6.1 und UBL 2.1 für die Rechnungseinbringung.','e-Rechnung.gv.at: ebInterface 4.3 / 5.0 / 6.0 / 6.1 in UBL 2.1 za oddajo računov.'),
  SI:L('UJP: e-SLOG 2.0, UBL 2.1 und CEFACT 100 für Rechnungen an öffentliche Einrichtungen.','UJP: e-SLOG 2.0, UBL 2.1 in CEFACT 100 za račune proračunskim uporabnikom.'),
 };
 return <div className="fs-country-included">
  <span className="fs-country-included-label"><FileCheck2 size={16}/>{country} · {j.name}</span>
  <small className="fs-official-formats">{official[country]}<span>{L('Quellenstand: 15.11.2026','Viri preverjeni: 15. 11. 2026')}</span></small>
  <strong>{L('E-Rechnungen im Paket','E-računi v paketu')}</strong>
  <ul>{formats.map(format=><li key={format}><Check size={14}/>{format}</li>)}</ul>
  <span className="fs-format-stage">{L('Validierter Testexport','Preverjen testni izvoz')}</span>
  <small>{L('Inland, EU-Lieferung/Leistung, Export und Kleinunternehmen nach Steuerfall. Produktive Ausstellung und Versand noch nicht freigegeben.','Domaci racuni, EU dobave/storitve, izvoz in mali zavezanci po davcni obravnavi. Produkcijska izdaja in pošiljanje še nista omogočena.')}</small>
  {country!=='DE'&&<small>{country==='AT'?L('Behördenzustellung noch nicht verbunden.','Dostava organom še ni povezana.'):L('UJP-Zustellung noch nicht verbunden.','Dostava prek UJP še ni povezana.')}</small>}
 </div>;
}
