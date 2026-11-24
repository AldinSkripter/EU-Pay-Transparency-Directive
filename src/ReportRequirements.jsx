import React from 'react';
import { Notice } from './ui';

export default function ReportRequirements({ L, missing = [], onGo }) {
  if (!missing.length) return null;
  const labels = {
    payroll:L('Jahresdaten importieren','Uvozite letne podatke'),
    currentSnapshot:L('Aktuellen Datenstand prüfen und speichern','Preverite in shranite trenutne podatke'),
    legalName:L('Rechtlichen Unternehmensnamen ergänzen','Dopolnite pravno ime podjetja'),
    headcount:L('Beschäftigtenzahl prüfen; sie darf nicht kleiner als der Datenbestand sein','Preverite število zaposlenih; ne sme biti manjše od podatkov'),
    payrollComplete:L('Alle Entgeltbestandteile und bezahlten Stunden prüfen und bestätigen','Preverite in potrdite vse sestavine plačila in plačane ure'),
    criteriaAgreement:L('Vereinbarung der Kriterien oder fehlende Vertretung dokumentieren','Dokumentirajte dogovor o merilih ali odsotnost predstavnikov'),
    evaluation:L('Bewertungsmethode und Nachweise vervollständigen','Dopolnite metodologijo vrednotenja in dokazila'),
    classification:L('Alle vier Vergleichskriterien beschreiben','Opišite vsa štiri primerjalna merila'),
    explanation:L('Entgeltunterschied mit Belegen erklären, auch unter 5 %','Pojasnite razliko v plači z dokazili, tudi pod 5 %'),
    measures:L('Für nicht gerechtfertigte Unterschiede Maßnahme, Verantwortliche und Termin ergänzen','Za neutemeljene razlike dodajte ukrep, odgovorno osebo in rok'),
    manager:L('Verantwortliche Person der Unternehmensleitung angeben','Navedite odgovorno osebo vodstva'),
    representatives:L('Vertretung und Konsultation oder begründeten Ersatzprozess beschreiben','Opišite predstavnike in posvetovanje ali utemeljen nadomestni postopek'),
    confirmation:L('Richtigkeit durch die Unternehmensleitung bestätigen','Vodstvo mora potrditi pravilnost'),
    consultation:L('Konsultation und Zugang zur Methodik bestätigen','Potrdite posvetovanje in dostop do metodologije'),
  };
  const details={methodology:L('Methode','Metoda'),reference:L('Belegreferenz','Referenca dokazila'),assessedBy:L('Bewertende Person','Ocenjevalec'),assessedOn:L('Bewertungsdatum','Datum vrednotenja'),genderNeutralConfirmed:L('Geschlechtsneutrale Anwendung bestätigen','Potrdite spolno nevtralno uporabo'),weights:L('Gewichte auf 100 % abstimmen','Uskladite uteži na 100 %')};
  return <Notice tone="error"><strong>{L('Diese Angaben fehlen im gespeicherten Bericht:','V shranjenem poročilu manjkajo ti podatki:')}</strong><ul>{missing.map((item,index)=><li key={`${item.step}-${item.field}-${item.category || index}`}>
    <button className="text-button" type="button" onClick={()=>onGo(item.step)}>{labels[item.field] || item.field}{item.category ? ` · ${item.field==='evaluation' ? details[item.category] || item.category : item.category}` : ''}</button> <small>Art. {item.article}</small>
  </li>)}</ul></Notice>;
}
