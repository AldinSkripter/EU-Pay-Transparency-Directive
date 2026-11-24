import React from 'react';
import {Scale,Tag,Layers,ScanSearch,Languages,FileSpreadsheet} from 'lucide-react';

// Honest legal status per market. Dated, because it goes stale: update with docs/EU-COMPLIANCE.md.
export function LegalStatus({L}) {
  const rows=[
    ['DE',L('EU-Bericht auf Deutsch. Zusätzlich: Bericht nach §§ 21–22 EntgTranspG mit bestätigten Angaben zu Maßnahmen und durchschnittlichen Beschäftigtenzahlen.','Poročilo EU v nemščini. Dodatno: poročilo po §§ 21–22 EntgTranspG s potrjenimi podatki o ukrepih in povprečnem številu zaposlenih.'),'https://www.gesetze-im-internet.de/entgtranspg/__21.html'],
    ['AT',L('EU-Bericht auf Deutsch. Zusätzlich: Einkommensbericht nach § 11a GlBG mit geprüften Zusatzdaten zur Hochrechnung und Verwendungsgruppen.','Poročilo EU v nemščini. Dodatno: poročilo o dohodkih po § 11a GlBG s preverjenimi podatki za preračun in razvrstitev.'),'https://www.ris.bka.gv.at/eli/bgbl/i/2004/66/P11a/NOR40126105'],
    ['SI',L('EU-Bericht auf Slowenisch. Eine amtliche nationale Vorlage und ein neuer Meldeweg sind in Equitensa noch nicht bestätigt.','Poročilo EU v slovenščini. Uradna nacionalna predloga in nova pot oddaje v Equitensi še nista potrjeni.'),'https://www.gov.si/zbirke/projekti-in-programi/projekt-pay-day/'],
  ];
  return <section className="public-section status-section" id="status"><div className="section-heading"><span className="eyebrow">{L('BERICHTSUMFANG · 3. NOVEMBER 2026','OBSEG POROČIL · 3. NOVEMBER 2026')}</span><h2>{L('Ihr Bericht folgt dem Land Ihrer Firma.','Poročilo sledi državi vašega podjetja.')}</h2><p>{L('EU-Kennzahlen und bestehende nationale Berichte haben unterschiedliche Inhalte. Equitensa trennt diese Dokumente und fragt benötigte Zusatzangaben ab.','Kazalniki EU in obstoječa nacionalna poročila imajo različno vsebino. Equitensa loči te dokumente in zahteva potrebne dodatne podatke.')}</p></div>
    <div className="status-grid">{rows.map(([code,text,source])=><article key={code}><span className="status-code">{code}</span><p>{text}</p><a href={source} target="_blank" rel="noreferrer">{L('Quelle','Vir')} ↗</a></article>)}</div>
    <p className="status-note"><Scale size={16}/>{L('Sie prüfen und laden die Dokumente herunter. Anwendungsbereich, nationale Aktualisierungen und vollständige Eingangsdaten sind vor Verwendung zu prüfen. Die Software übermittelt keine Berichte.','Dokumente preverite in prenesete sami. Pred uporabo preverite področje uporabe, nacionalne spremembe in popolnost vhodnih podatkov. Programska oprema poročil ne pošilja.')}</p></section>;
}

export function WhyEquitensa({L,select}) {
  const items=[
    [Tag,L('Preis sichtbar, kein Verkaufsgespräch','Cena je vidna, brez prodajnega pogovora'),L('Ab €1.428 im Jahr. Konto anlegen und selbst starten.','Od 1.428 € na leto. Ustvarite račun in začnite sami.')],
    [Layers,L('Drei Pflichten in einem Werkzeug','Tri obveznosti v enem orodju'),L('Bericht und Entgeltbewertung (Art. 9–10), Auskunftsrecht der Beschäftigten (Art. 7), Gehaltsangaben und Kriterien (Art. 5–6).','Poročilo in ocena plač (čl. 9–10), pravica zaposlenih do informacij (čl. 7), podatki o plači in merila (čl. 5–6).')],
    [ScanSearch,L('Daten prüfen, bevor sie zählen','Preverite podatke, preden štejejo'),L('Automatische Datenprüfung mit Korrekturen per Klick; optional mit KI-Vorschlägen, die Sie einzeln bestätigen.','Samodejni pregled podatkov s popravki z enim klikom; po želji predlogi umetne inteligence, ki jih potrdite posamično.')],
    [Languages,L('Deutsch und Slowenisch','Nemščina in slovenščina'),L('Bericht und Dokumente richten sich nach dem Land Ihrer Gesellschaft.','Poročilo in dokumenti sledijo državi vaše družbe.')],
    [FileSpreadsheet,L('Import aus Ihrem System','Uvoz iz vašega sistema'),L('DATEV, BMD, Pantheon, Personio und andere per Datei oder eigener API; viele Dateiformate und Zeichensätze.','DATEV, BMD, Pantheon, Personio in drugi z datoteko ali lastnim API; številne oblike datotek in kodiranj.')],
  ];
  return <section className="public-section why-section" id="why"><div className="section-heading"><span className="eyebrow">{L('WARUM EQUITENSA','ZAKAJ EQUITENSA')}</span><h2>{L('Für Unternehmen mit 100 bis 2.500 Beschäftigten.','Za podjetja s 100 do 2.500 zaposlenimi.')}</h2><p>{L('Kein Beratungsprojekt, keine Demo-Pflicht: Daten hochladen, prüfen, Bericht vorbereiten.','Brez svetovalnega projekta, brez obveznega demo: naložite podatke, preverite, pripravite poročilo.')}</p></div>
    <div className="why-grid">{items.map(([Icon,title,text])=><article key={title}><span><Icon size={20}/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
    <div className="why-cta"><button className="btn btn-primary" onClick={()=>select('prepare','annual')}>{L('Meinen Bericht vorbereiten','Pripravite moje poročilo')}</button></div></section>;
}
