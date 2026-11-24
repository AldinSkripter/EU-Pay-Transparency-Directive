import React,{useEffect,useState} from 'react';
import { employerControls, directiveArticles } from '../shared/employer-controls.js';
import { api,Button,Field,TextField,Notice,download,errorText } from './ui';
import DataRetention from './DataRetention';

export default function EmployerControls({L,year,country,onDeleted}) {
  const [data,setData]=useState(null),[document,setDocument]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[dirty,setDirty]=useState(false),[saved,setSaved]=useState(false);
  useEffect(()=>{let live=true;setData(null);setDirty(false);setSaved(false);setError(null);api(`/employer-controls?year=${year}`).then(result=>{if(live){setData(result);setDocument(result.document);}}).catch(e=>{if(live)setError(e);});return()=>{live=false;};},[year]);
  const edit=(id,patch)=>{setDocument(current=>({...current,records:{...current.records,[id]:{...current.records?.[id],...patch}}}));setDirty(true);setSaved(false);};
  const perform=async fn=>{setBusy(true);setError(null);try{await fn();}catch(e){setError(e);}finally{setBusy(false);}};
  const save=async()=>{const result=await api('/employer-controls',{year,document:{...document,snapshotId:data.snapshotId}});setDocument(result.document);setData(current=>({...current,state:result.state}));setDirty(false);setSaved(true);};
  const get=async format=>{if(dirty)await save();const response=await fetch(`/api/employer-controls/${format}?year=${year}`);if(!response.ok)throw new Error((await response.json()).error);download(await response.arrayBuffer(),`equitensa-employer-evidence-${year}.${format}`,response.headers.get('content-type'));};
  const status=value=>({open:L('Offen','Odprto'),recorded:L('Nachweis erfasst – nicht unabhängig geprüft','Dokazilo vneseno – ni neodvisno preverjeno'),not_applicable:L('Nicht anwendbar (mit Begründung)','Se ne uporablja (z utemeljitvijo)')})[value];
  return <>
    <Notice>{L('Der Bericht berechnet Entgeltkennzahlen. Weitere Arbeitgeberpflichten benötigen tatsächliche Umsetzung und Belege. Erfassen Sie Verantwortliche, Prüfdatum, Referenzen und offene Maßnahmen. „Erfasst“ ist keine Bestätigung der Gesetzeskonformität. Keine individuellen Gehälter, Personalnummern oder vertraulichen Beschwerden in Freitext aufnehmen.', 'Poročilo izračuna kazalnike plač. Druge obveznosti delodajalca zahtevajo dejansko izvedbo in dokazila. Vnesite odgovorne osebe, datum pregleda, reference in odprte ukrepe. »Vneseno« ne potrjuje pravne skladnosti. V prosti tekst ne vnašajte posameznih plač, šifer zaposlenih ali zaupnih pritožb.')}</Notice>
    {error&&<Notice tone="error">{errorText(error,L)}</Notice>}
    {saved&&<Notice tone="success">{L('Nachweise gespeichert. Sie erscheinen im internen Bericht und im Arbeitgeberregister.','Dokazila so shranjena. Prikazana so v internem poročilu in evidenci delodajalca.')}</Notice>}
    {!data?<p>{L('Laden …','Nalaganje …')}</p>:<>
      {!data.snapshotId&&<Notice>{L('Importieren Sie zuerst die Jahresdaten, um Nachweise mit einem Datenstand zu verknüpfen.','Najprej uvozite letne podatke, da povežete dokazila s posnetkom.')}</Notice>}
      {data.state.stale&&<Notice tone="error">{L('Der Datenstand hat sich geändert. Alle Nachweise sind veraltet. Prüfen Sie jeden Eintrag und aktualisieren Sie das Prüfdatum vor dem Speichern.','Posnetek se je spremenil. Vsa dokazila so zastarela. Pred shranjevanjem preglejte vsak vnos in posodobite datum pregleda.')}</Notice>}
      <div className="button-row"><Button busy={busy} disabled={!data.snapshotId||!dirty} onClick={()=>perform(save)}>{L('Nachweise speichern','Shrani dokazila')}</Button>{['html','pdf','txt','json'].map(format=><Button secondary busy={busy} key={format} onClick={()=>perform(()=>get(format))}>{format.toUpperCase()}</Button>)}</div>
      {employerControls.map(control=>{const r=document.records?.[control.id]||{};return <section className="panel form-panel" key={control.id}>
        <h3>{L(control.de,control.sl)} · Art. {control.articles.join(', ')}</h3><p>{L(control.deHelp,control.slHelp)}</p>
        <label className="field"><span>{L('Stand','Stanje')}</span><select value={r.status||'open'} onChange={e=>edit(control.id,{status:e.target.value})}>{['open','recorded',...(control.optional?['not_applicable']:[])].map(value=><option key={value} value={value}>{status(value)}</option>)}</select></label>
        <div className="form-grid"><Field label={L('Verantwortliche Person / Funktion','Odgovorna oseba / funkcija')} maxLength={255} value={r.owner||''} onChange={e=>edit(control.id,{owner:e.target.value})}/><Field type="date" max={new Date().toISOString().slice(0,10)} label={L('Geprüft am','Pregledano dne')} value={r.reviewedOn||''} onChange={e=>edit(control.id,{reviewedOn:e.target.value})}/></div>
        <TextField label={L('Tatsächliche Umsetzung, Belegreferenzen / Begründung','Dejanska izvedba, reference dokazil / utemeljitev')} maxLength={3000} value={r.evidence||''} onChange={e=>edit(control.id,{evidence:e.target.value})}/>
        <TextField label={L('Noch erforderliche Maßnahmen','Še potrebni ukrepi')} maxLength={3000} value={r.action||''} onChange={e=>edit(control.id,{action:e.target.value})}/>
        <Field type="date" label={L('Zieltermin offener Maßnahmen','Rok odprtih ukrepov')} value={r.due||''} onChange={e=>edit(control.id,{due:e.target.value})}/>
      </section>;})}
      <Button busy={busy} disabled={!data.snapshotId||!dirty} onClick={()=>perform(save)}>{L('Nachweise speichern','Shrani dokazila')}</Button>
    </>}
    <section className="panel"><h3>{L('Alle 37 Artikel im Überblick','Pregled vseh 37 členov')}</h3><p>{L('Rechtsschutz und Aufgaben staatlicher Stellen werden durch die Software nicht als erledigt bestätigt. Die Artikelübersicht zeigt ihren Bezug zum Produkt.','Program ne potrjuje izvršitve pravnega varstva in nalog državnih organov. Pregled členov prikazuje njihovo povezavo z izdelkom.')}</p><div className="table-scroll"><table><thead><tr><th>Art.</th><th>{L('Inhalt','Vsebina')}</th><th>{L('Zuständigkeit / Art','Izvajalec / vrsta')}</th></tr></thead><tbody>{directiveArticles.map(a=><tr key={a.article}><td>{a.article}</td><td>{L(a.de,a.sl)}</td><td>{({framework:L('Rechtsrahmen','Pravni okvir'),institutional:L('Staat / Institutionen','Država / institucije'),enforcement:L('Rechtsschutz; Mitwirkung des Arbeitgebers','Pravno varstvo; sodelovanje delodajalca'),employer:L('Arbeitgeberpflicht','Obveznost delodajalca')})[a.role]}</td></tr>)}</tbody></table></div></section>
    <DataRetention L={L} year={year} country={country} onDeleted={async()=>{await onDeleted?.();const result=await api(`/employer-controls?year=${year}`);setData(result);setDocument(result.document);setDirty(false);}}/>
  </>;
}
