import React,{useRef,useState} from 'react';
import {ScanLine,Upload,CheckCircle2} from 'lucide-react';
import {api} from './ui';
import './receipt-capture.css';

export default function FinanceReceiptCapture({L,onImport,busy}) {
  const input=useRef(null),[file,setFile]=useState(null),[preview,setPreview]=useState(''),[result,setResult]=useState(null),[entry,setEntry]=useState({}),[scanning,setScanning]=useState(false),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false);
  const choose=async event=>{
    const chosen=event.target.files?.[0];event.target.value='';if(!chosen)return;
    setError('');setResult(null);setReviewed(false);setFile(null);setPreview('');
    if(chosen.size>2000000||! /\.(png|jpe?g|pdf|xml)$/i.test(chosen.name)){setError(L('PNG, JPEG, PDF oder Rechnungs-XML bis 2 MB auswählen.','Izberite PNG, JPEG, PDF ali XML računa do 2 MB.'));return;}
    try{
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>resolve(reader.result);reader.readAsDataURL(chosen);});
      const attachment={filename:chosen.name,data:dataUrl.split(',')[1]};setFile(attachment);setPreview(/^image\//.test(chosen.type)?dataUrl:'');
      setEntry({supplier:'',reference:'',amount:'',incurredOn:'',category:'other',note:''});
      setScanning(true);
      const recognized=await api('/finance/receipt-scan',attachment);setResult(recognized);setEntry(recognized.suggestions);
    }catch{setResult({text:'',manual:true});setError(L('Erkennung nicht verfügbar. Sie können den Beleg manuell prüfen und erfassen.','Prepoznavanje ni na voljo. Dokument lahko preverite in vnesete ročno.'));}
    finally{setScanning(false);}
  };
  return <section className="fr-capture"><header><span className="fr-icon"><ScanLine size={24}/></span><div><span className="fs-kicker">RECEIPT INBOX</span><h3>{L('Ihre Dokumente. Ein klarer Eingang.','Vaši dokumenti. Enoten prejem.')}</h3><p>{L('PDF, Bild oder Rechnungs-XML hochladen → prüfen → speichern.','Naložite PDF, sliko ali XML računa → preverite → shranite.')}</p></div><input ref={input} type="file" hidden accept=".png,.jpg,.jpeg,.pdf,.xml,image/png,image/jpeg,application/pdf,application/xml,text/xml" onChange={choose}/><button disabled={scanning||busy} onClick={()=>input.current.click()}><Upload size={16}/>{L('Beleg auswählen','Izberi dokument')}</button></header>
    <p className="fr-hint">{L('PDF mit Text oder Scan (bis 5 Seiten), PNG/JPEG, XRechnung-/UBL-/CII-XML und ZUGFeRD-PDF. Datenübernahme mit Prüfung, keine automatische Buchung.','PDF z besedilom ali skenom (do 5 strani), PNG/JPEG, XML XRechnung/UBL/CII in PDF ZUGFeRD. Prevzem s preverjanjem, brez samodejnega knjiženja.')}</p>
    {scanning&&<p role="status">{L('Text wird erkannt … bitte bis zu einer Minute warten.','Prepoznavanje besedila … počakajte do ene minute.')}</p>}{error&&<p role="alert">{error}</p>}
    {file&&result&&<form className="fr-review" onSubmit={async e=>{e.preventDefault();if(await onImport({...entry,attachment:file,reviewed})){setFile(null);setResult(null);setPreview('');}}}><aside>{preview?<img src={preview} alt={L('Originalbeleg zur Kontrolle','Izvirni dokument za preverjanje')}/>:<a download={file.filename} href={`data:application/octet-stream;base64,${file.data}`}>{file.filename} ↓</a>}<details><summary>{L('Erkannten Text anzeigen','Prikaži prepoznano besedilo')}</summary><pre>{result.text||L('Kein Text erkannt. Angaben aus dem Original übernehmen.','Besedilo ni prepoznano. Prepišite podatke iz izvirnika.')}</pre></details></aside><div><h4>{L('Prüfen und ergänzen','Preverite in dopolnite')}</h4>{result.format&&<p className="fr-format">{result.format} · {L('Daten gelesen, rechtliche Gültigkeit nicht bestätigt','Podatki prebrani, pravna veljavnost ni potrjena')}</p>}<p>{L('Auch ausgefüllte Felder können falsch sein. Währung EUR und alle Werte am Original prüfen.','Tudi izpolnjena polja so lahko napačna. Na izvirniku preverite valuto EUR in vse vrednosti.')}</p>{[['supplier',L('Lieferant','Dobavitelj'),'text'],['reference',L('Belegnummer','Številka dokumenta'),'text'],['incurredOn',L('Belegdatum','Datum dokumenta'),'date'],['amount',L('Bruttobetrag EUR','Bruto znesek EUR'),'text']].map(([key,label,type])=><label className="field" key={key}><span>{label}</span><input required type={type} value={entry[key]||''} maxLength={255} onChange={e=>setEntry(v=>({...v,[key]:e.target.value}))}/></label>)}<label className="fr-confirm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>{L('Original und EUR-Betrag geprüft.','Preveril/-a sem izvirnik in znesek v EUR.')}</label><button disabled={!reviewed||busy} type="submit"><CheckCircle2 size={16}/>{L('Geprüft speichern','Shrani preverjeno')}</button><button type="button" disabled={busy} onClick={()=>{setFile(null);setResult(null);setPreview('');}}>{L('Verwerfen','Zavrzi')}</button></div></form>}
  </section>;
}
