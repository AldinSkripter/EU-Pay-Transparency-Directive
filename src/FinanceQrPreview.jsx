import React,{useEffect,useState} from 'react';
export default function FinanceQrPreview({draft,L}) {
  const [result,setResult]=useState(null),[error,setError]=useState('');
  useEffect(()=>{setResult(null);setError('');const abort=new AbortController();const timer=setTimeout(async()=>{
    try{const r=await fetch('/api/finance/qr-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft),signal:abort.signal});const data=await r.json();if(!r.ok)setError((data.fields||[]).join(', ')||data.error);else setResult(data.qr);}catch(e){if(e.name!=='AbortError')setError('QR');}
  },400);return()=>{clearTimeout(timer);abort.abort();};},[draft]);
  return <section className="fq-preview" aria-live="polite">{result?<><img src={result.image} alt={L('QR-Testvorschau, kein Zahlungsauftrag','Testni QR, ni plačilni nalog')}/><div><strong>{result.format} · TEST</strong><p>{L('Testcode ohne Zahlungsfunktion. Auf echten ausgestellten Rechnungen werden die Zahlungsdaten kodiert.','Testna koda brez plačilne funkcije. Na pravih izdanih računih bodo kodirani podatki za plačilo.')}</p></div></>:<p>{error?L('QR noch nicht verfügbar. Firmendaten, IBAN, Kundenadresse und Betrag prüfen.','QR še ni na voljo. Preverite podatke podjetja, IBAN, naslov stranke in znesek.')+` (${error})`:L('QR wird geprüft …','Preverjanje QR …')}</p>}</section>;
}
