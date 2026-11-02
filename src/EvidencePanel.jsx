import React,{useState} from 'react';
import {FileCheck2,Download} from 'lucide-react';
import {Button,Notice,download,errorText} from './ui';

// Art. 18(2): a dated record of what the company has actually done under Arts. 4-10.
export default function EvidencePanel({L,year}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(null);
  const get=async format=>{setBusy(true);setError(null);try{const response=await fetch(`/api/evidence/${format}?year=${year}`);if(!response.ok){const e=await response.json();throw Object.assign(new Error(e.error),e);}download(await response.arrayBuffer(),`equitensa-evidence-${year}.${format}`,response.headers.get('content-type'));}catch(e){setError(e);}finally{setBusy(false);}};
  return <section className="panel"><div className="panel-title"><div><span className="eyebrow">ART. 18(2)</span><h3>{L('Nachweis der Umsetzung','Dokazilo o izvajanju')}</h3></div><FileCheck2 size={22}/></div>
    <p>{L('Wer die Pflichten aus den Artikeln 5, 6, 7, 9 und 10 nicht umsetzt, muss im Streitfall beweisen, dass keine Entgeltdiskriminierung vorlag. Diese Übersicht zeigt, was Sie in Equitensa erfasst haben: Kriterien, Entgeltspannen, jährliche Information, Anfragen, Bericht, Bestätigung und Bewertung.','Kdor ne izvaja obveznosti iz členov 5, 6, 7, 9 in 10, mora v sporu dokazati, da ni bilo diskriminacije pri plačilu. Pregled prikazuje, kaj ste vnesli v Equitensa: merila, razpone plač, letno obveščanje, zahteve, poročilo, potrditev in oceno.')}</p>
    {error&&<Notice tone="error">{errorText(error,L)}</Notice>}
    <div className="button-row">{[['html',L('Barrierefrei (HTML)','Dostopno (HTML)')],['pdf','PDF'],['txt',L('Text','Besedilo')]].map(([format,label])=><Button secondary key={format} busy={busy} onClick={()=>get(format)}><Download size={15}/>{label}</Button>)}</div></section>;
}
