import React, { useState } from 'react';
import { api, Button, CheckField, Notice, errorText } from './ui';

export default function SubscriptionContract({ L, order }) {
  const [preview,setPreview]=useState(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  const c=order?.contract;
  if(!c)return null;
  const run=async fn=>{setBusy(true);setError(null);try{await fn();}catch(e){setError(e);}finally{setBusy(false);}};
  const date=iso=>new Date(iso).toLocaleString(L('de-DE','sl-SI'));
  return <section className="panel">
    <h3>{L('Vertrag & Kündigung','Pogodba in odpoved')}</h3>
    <p>{L('Mindestlaufzeit: 12 Monate ab Beginn der bezahlten Laufzeit.','Najmanjše trajanje: 12 mesecev od začetka plačanega obdobja.')}</p>
    <p>{L('Vereinbarter Preis netto','Dogovorjena cena brez DDV')}: €{c.netCharge.toLocaleString('de-DE')} / {c.interval==='monthly'?L('Monat','mesec'):L('Jahr','leto')} · {L('Mindestgesamtpreis','Najmanjša skupna cena')}: €{c.minimumNetTotal.toLocaleString('de-DE')}</p>
    <p>{L('Reguläre Kündigung zum Ende der Mindestlaufzeit, danach zum Ende des jeweiligen Abrechnungszeitraums. Gesetzliche Sonderkündigungsrechte bleiben unberührt.','Redna odpoved ob koncu najmanjšega trajanja, nato ob koncu obračunskega obdobja. Zakonske pravice do izredne odpovedi ostanejo nespremenjene.')}</p>
    {error&&<Notice tone="error">{errorText(error,L)}</Notice>}
    {c.cancelAt||preview?.scheduled ? <Notice tone="success">{L('Kündigung vorgemerkt zum','Odpoved je načrtovana za')} {date(c.cancelAt||preview.cancelAt)}. {L('Bis dahin läuft die vereinbarte Abrechnung weiter.','Do takrat se dogovorjeno obračunavanje nadaljuje.')}</Notice> : <>
      <Button secondary busy={busy} onClick={()=>run(async()=>{setPreview(await api('/billing/cancellation'));setConfirmed(false);})}>{L('Kündigungstermin prüfen','Preverite datum odpovedi')}</Button>
      {preview&&<><p>{L('Frühestmögliches reguläres Vertragsende','Najzgodnejši redni konec pogodbe')}: <strong>{date(preview.cancelAt)}</strong></p><CheckField checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}>{L('Ich möchte zum angezeigten Termin kündigen. Bis dahin bleiben Zahlungen fällig.','Želim odpovedati na prikazani datum. Do takrat plačila ostanejo zapadla.')}</CheckField><Button busy={busy} disabled={!confirmed} onClick={()=>run(async()=>setPreview(await api('/billing/cancellation',{confirm:true,orderId:order.id})))}>{L('Kündigung verbindlich vormerken','Potrdite načrtovano odpoved')}</Button></>}
    </>}
  </section>;
}
