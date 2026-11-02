import React from 'react';
import {Scale,Tag,Layers,ScanSearch,Languages,FileSpreadsheet} from 'lucide-react';

// Honest legal status per market. Dated, because it goes stale: update with docs/EU-COMPLIANCE.md.
export function LegalStatus({L}) {
  const rows=[
    ['DE',L('Gesetz noch nicht beschlossen, kein veröffentlichter Entwurf. Meldeweg und Format sind offen.','Zakon še ni sprejet, objavljenega osnutka ni. Kanal in oblika oddaje sta odprta.')],
    ['AT',L('Entwurf der Sozialministerin in der Regierungsabstimmung, noch nicht beschlossen. Vorgesehen: Bericht ab 100 Beschäftigten.','Osnutek ministrice za delo je v usklajevanju v vladi, še ni sprejet. Predvideno: poročilo od 100 zaposlenih.')],
    ['SI',L('Gesetz in Vorbereitung beim Ministerium, ein Entwurf ist noch nicht veröffentlicht.','Zakon pripravlja ministrstvo, osnutek še ni objavljen.')],
  ];
  return <section className="public-section status-section" id="status"><div className="section-heading"><span className="eyebrow">{L('STAND DER UMSETZUNG · 2. NOVEMBER 2026','STANJE PRENOSA · 2. NOVEMBER 2026')}</span><h2>{L('Wo stehen Deutschland, Österreich und Slowenien?','Kje so Nemčija, Avstrija in Slovenija?')}</h2><p>{L('Die Richtlinie legt fest, was im Bericht stehen muss. Formular und Meldeweg bestimmt jedes Land selbst, und noch hat keines ein Gesetz beschlossen.','Direktiva določa, kaj mora biti v poročilu. Obrazec in kanal oddaje določi vsaka država sama in nobena še ni sprejela zakona.')}</p></div>
    <div className="status-grid">{rows.map(([code,text])=><article key={code}><span className="status-code">{code}</span><p>{text}</p></article>)}</div>
    <p className="status-note"><Scale size={16}/>{L('Bis dahin erstellt Equitensa den Bericht nach der EU-Richtlinie (Art. 9 und 10) und ergänzt den nationalen Meldeweg, sobald er feststeht. Wir versprechen keine „Einreichung“, die es noch nicht gibt.','Do takrat Equitensa pripravi poročilo po direktivi EU (člena 9 in 10) in doda nacionalni kanal oddaje, ko bo znan. Ne obljubljamo »oddaje«, ki še ne obstaja.')}</p></section>;
}

export function WhyEquitensa({L,select}) {
  const items=[
    [Tag,L('Preis sichtbar, kein Verkaufsgespräch','Cena je vidna, brez prodajnega pogovora'),L('Ab €899 im Jahr. Konto anlegen und selbst starten.','Od 899 € na leto. Ustvarite račun in začnite sami.')],
    [Layers,L('Drei Pflichten in einem Werkzeug','Tri obveznosti v enem orodju'),L('Bericht und Entgeltbewertung (Art. 9–10), Auskunftsrecht der Beschäftigten (Art. 7), Gehaltsangaben und Kriterien (Art. 5–6).','Poročilo in ocena plač (čl. 9–10), pravica zaposlenih do informacij (čl. 7), podatki o plači in merila (čl. 5–6).')],
    [ScanSearch,L('Daten prüfen, bevor sie zählen','Preverite podatke, preden štejejo'),L('Automatische Datenprüfung mit Korrekturen per Klick; optional mit KI-Vorschlägen, die Sie einzeln bestätigen.','Samodejni pregled podatkov s popravki z enim klikom; po želji predlogi umetne inteligence, ki jih potrdite posamično.')],
    [Languages,L('Deutsch und Slowenisch','Nemščina in slovenščina'),L('Bericht und Dokumente richten sich nach dem Land Ihrer Gesellschaft.','Poročilo in dokumenti sledijo državi vaše družbe.')],
    [FileSpreadsheet,L('Import aus Ihrem System','Uvoz iz vašega sistema'),L('DATEV, BMD, Pantheon, Personio und andere per Datei oder eigener API; viele Dateiformate und Zeichensätze.','DATEV, BMD, Pantheon, Personio in drugi z datoteko ali lastnim API; številne oblike datotek in kodiranj.')],
  ];
  return <section className="public-section why-section" id="why"><div className="section-heading"><span className="eyebrow">{L('WARUM EQUITENSA','ZAKAJ EQUITENSA')}</span><h2>{L('Für Unternehmen mit 100 bis 2.500 Beschäftigten.','Za podjetja s 100 do 2.500 zaposlenimi.')}</h2><p>{L('Kein Beratungsprojekt, keine Demo-Pflicht: Daten hochladen, prüfen, Bericht vorbereiten.','Brez svetovalnega projekta, brez obveznega demo: naložite podatke, preverite, pripravite poročilo.')}</p></div>
    <div className="why-grid">{items.map(([Icon,title,text])=><article key={title}><span><Icon size={20}/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
    <div className="why-cta"><button className="btn btn-primary" onClick={()=>select('prepare','annual')}>{L('Meinen Bericht vorbereiten','Pripravite moje poročilo')}</button></div></section>;
}
