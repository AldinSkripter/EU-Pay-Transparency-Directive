import React,{useEffect,useState} from 'react';
import {Download,ArrowRight,CalendarClock,FileText} from 'lucide-react';
import {api,Button,Field,TextField,Notice,Tag,errorText,download} from './ui';

const today=()=>new Date().toISOString().slice(0,10);
const toneOf={overdue:'amber',due_soon:'amber',open:'',answered:'mint'};

export default function WorkerRights({L,me,year}) {
  const lang=L('de','sl'),locale=lang==='sl'?'sl-SI':'de-DE';
  const date=iso=>iso?new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'—';
  const money=n=>n===null||n===undefined?'—':n.toLocaleString(locale,{style:'currency',currency:'EUR'});
  const [data,setData]=useState(null),[notice,setNotice]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState('');
  const [open,setOpen]=useState(null),[preview,setPreview]=useState(null);
  const noticeYear=new Date().getUTCFullYear();
  const load=()=>Promise.all([api('/requests'),api(`/rights-notice?year=${noticeYear}`)]).then(([r,n])=>{setData(r);setNotice(n.notice);}).catch(setError);
  useEffect(()=>{load();},[]);
  const run=async fn=>{setBusy(true);setError(null);setMessage('');try{await fn();}catch(e){setError(e);}finally{setBusy(false);}};
  const form=handler=>e=>{e.preventDefault();const target=e.currentTarget,body=Object.fromEntries(new FormData(target));run(async()=>{await handler(body);target.reset?.();});};
  const fetchFile=async(path,body,name,type)=>{const response=await fetch(`/api${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok){const e=await response.json();throw Object.assign(new Error(e.error),e);}download(await response.arrayBuffer(),name,type);};
  const channels={worker:L('Beschäftigte/r','Zaposleni'),representative:L('Arbeitnehmervertretung','Predstavniki delavcev'),equality_body:L('Gleichbehandlungsstelle','Organ za enakost'),labour_inspectorate:L('Arbeitsaufsicht','Inšpektorat za delo')};
  const kinds={information:L('Auskunft über Entgelt (Art. 7 Abs. 1)','Informacija o plači (člen 7(1))'),clarification:L('Zusätzliche Klarstellung (Art. 7 Abs. 2, Art. 9 Abs. 10)','Dodatna pojasnila (člen 7(2), člen 9(10))')};
  const states={overdue:L('Überfällig','Zamujeno'),due_soon:L('Bald fällig','Kmalu zapade'),open:L('Offen','Odprto'),answered:L('Beantwortet','Odgovorjeno')};
  if(!data)return <p className="muted">{error?errorText(error,L):L('Wird geladen …','Nalaganje …')}</p>;
  const s=data.summary;
  return <div className="rights-page">
    {error&&<Notice tone="error">{errorText(error,L)}</Notice>}{message&&<Notice>{message}</Notice>}
    <Notice>{L('Artikel 7 gilt für Arbeitgeber jeder Größe: Beschäftigte können ihr individuelles Entgelt und die durchschnittlichen Entgelte nach Geschlecht für gleiche oder gleichwertige Arbeit erfragen. Antwort schriftlich und spätestens nach zwei Monaten; einmal jährlich ist auf dieses Recht hinzuweisen.','Člen 7 velja za delodajalce vseh velikosti: zaposleni lahko zahtevajo svojo plačo in povprečne plače po spolu za enako ali enakovredno delo. Odgovor pisno in najpozneje v dveh mesecih; na to pravico je treba opozoriti enkrat letno.')}</Notice>
    <div className="payroll-summary">{[[s.open,L('Offene Anfragen','Odprte zahteve')],[s.dueSoon,L('Bald fällig','Kmalu zapade')],[s.overdue,L('Überfällig','Zamujene')],[s.answered,L('Beantwortet','Odgovorjene')]].map(([n,label])=><div className="panel" key={label}><strong>{n}</strong><span>{label}</span></div>)}</div>

    <section className="panel"><div className="panel-title"><div><span className="eyebrow">ART. 7(3)</span><h3>{L('Jährlicher Hinweis an alle Beschäftigten','Letno obvestilo vsem zaposlenim')} · {noticeYear}</h3></div><Tag tone={notice?'mint':'amber'}>{notice?`${L('Mitgeteilt am','Sporočeno')} ${date(notice.sent_on)}`:L('Noch offen','Še odprto')}</Tag></div>
      <p>{L('Erstellen Sie den Hinweistext, versenden Sie ihn an alle Beschäftigten und tragen Sie das Datum ein.','Pripravite besedilo obvestila, ga pošljite vsem zaposlenim in vpišite datum.')}</p>
      <form onSubmit={form(async body=>{setNotice((await api('/rights-notice',{year:noticeYear,sentOn:body.sentOn,contact:body.contact})).notice);setMessage(L('Versand dokumentiert.','Pošiljanje je dokumentirano.'));})}>
        <div className="form-grid"><Field label={L('Kontakt für Anfragen (E-Mail oder Stelle)','Kontakt za zahteve (e-pošta ali služba)')} name="contact" defaultValue={notice?.contact||''} required maxLength={255}/><Field label={L('Versandt am','Poslano dne')} name="sentOn" type="date" defaultValue={notice?.sent_on||today()} max={today()} required/></div>
        <div className="button-row">
          <Button secondary type="button" busy={busy} onClick={e=>{const f=e.currentTarget.closest('form'),contact=f.contact.value;if(!contact){f.reportValidity();return;}run(()=>fetchFile('/rights-notice/document',{year:noticeYear,contact,format:'pdf'},`equitensa-notice-${noticeYear}.pdf`,'application/pdf'));}}><Download size={15}/>{L('Hinweis als PDF','Obvestilo kot PDF')}</Button>
          <Button secondary type="button" busy={busy} onClick={e=>{const f=e.currentTarget.closest('form'),contact=f.contact.value;if(!contact){f.reportValidity();return;}run(()=>fetchFile('/rights-notice/document',{year:noticeYear,contact,format:'html'},`equitensa-notice-${noticeYear}.html`,'text/html'));}}><Download size={15}/>{L('Hinweis barrierefrei (HTML)','Obvestilo, dostopno (HTML)')}</Button>
          <Button type="submit" busy={busy}>{L('Versand eintragen','Vpiši pošiljanje')}</Button>
        </div></form></section>

    <section className="panel"><div className="panel-title"><div><span className="eyebrow">ART. 7(1)–(4)</span><h3>{L('Anfrage erfassen','Vpis zahteve')}</h3></div><CalendarClock size={22}/></div>
      <form onSubmit={form(async body=>{await api('/requests',body);setMessage(L('Anfrage erfasst. Die Frist beträgt zwei Monate.','Zahteva je vpisana. Rok je dva meseca.'));await load();})}>
        <div className="form-grid"><Field label={L('Eingegangen am','Prejeto dne')} name="receivedOn" type="date" defaultValue={today()} max={today()} required/><label className="field"><span>{L('Von','Od')}</span><select name="channel" defaultValue="worker">{Object.entries(channels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
        <label className="field"><span>{L('Art der Anfrage','Vrsta zahteve')}</span><select name="kind" defaultValue="information">{Object.entries(kinds).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><small>{L('Bei Klarstellungen ist eine begründete Antwort nötig; Frist hier intern ebenfalls zwei Monate.','Pri pojasnilih je potreben utemeljen odgovor; interni rok je prav tako dva meseca.')}</small></label>
        <Field label={L('Anfragende Person oder Stelle (Kürzel genügt)','Prosilec (zadostuje oznaka)')} name="requesterLabel" required maxLength={120} hint={L('Keine Gehaltsdaten eintragen.','Ne vpisujte podatkov o plačah.')}/>
        <TextField label={L('Notiz (optional)','Opomba (neobvezno)')} name="note" maxLength={2000}/>
        <Button type="submit" busy={busy}>{L('Anfrage speichern','Shrani zahtevo')}<ArrowRight size={16}/></Button></form></section>

    <section className="panel"><div className="panel-title"><h3>{L('Anfragen und Fristen','Zahteve in roki')}</h3><Tag>{s.total}</Tag></div>
      {!data.requests.length?<p className="muted">{L('Noch keine Anfragen.','Zahtev še ni.')}</p>:<div className="table-scroll"><table><thead><tr><th>{L('Anfragende','Prosilec')}</th><th>{L('Eingang','Prejeto')}</th><th>{L('Frist','Rok')}</th><th>{L('Status','Status')}</th><th/></tr></thead><tbody>{data.requests.map(r=><React.Fragment key={r.id}><tr>
        <td><strong>{r.requester_label}</strong><small>{channels[r.channel]} · {kinds[r.kind||'information']}</small></td><td>{date(r.received_on)}</td><td>{date(r.due_on)}{r.daysLeft!==null&&<small>{r.daysLeft<0?L(`${-r.daysLeft} Tage überfällig`,`${-r.daysLeft} dni zamude`):L(`noch ${r.daysLeft} Tage`,`še ${r.daysLeft} dni`)}</small>}</td>
        <td><Tag tone={toneOf[r.state]}>{states[r.state]}</Tag></td>
        <td>{r.status==='open'&&<Button secondary onClick={()=>{setOpen(open===r.id?null:r.id);setPreview(null);}}>{L('Beantworten','Odgovori')}</Button>}</td></tr>
        {open===r.id&&<tr><td colSpan={5}><div className="answer-box">
          <p>{L('Interne Personalnummer der anfragenden Person aus Ihrem Entgeltdatenstand. Sie wird nicht gespeichert.','Interna šifra zaposlenega iz vašega podatkovnega posnetka. Ne shrani se.')}</p>
          <form onSubmit={form(async body=>{setPreview(null);setPreview({id:r.id,internalId:body.internalId,...(await api(`/requests/${r.id}/answer`,{year,internalId:body.internalId,format:'json'}))});})}>
            <div className="form-grid"><Field label={L('Personalnummer','Šifra zaposlenega')} name="internalId" required maxLength={255} autoComplete="off"/><Field label={L('Datenstand (Jahr)','Podatkovni posnetek (leto)')} value={year} readOnly/></div>
            <Button type="submit" busy={busy}><FileText size={15}/>{L('Antwort berechnen','Izračunaj odgovor')}</Button></form>
          {preview?.id===r.id&&<div className="answer-preview"><h4>{L('Individuelles Entgeltniveau','Individualna raven plače')} · {preview.answer.worker.category}</h4>
            <p>{L('Bruttojahresentgelt','Bruto letno')}: <strong>{money(preview.answer.worker.annual)}</strong> · {L('pro Stunde','na uro')}: <strong>{money(preview.answer.worker.hourly)}</strong></p>
            {preview.answer.category.protected?<Notice>{L('Kategorie zu klein: Durchschnitte werden nicht mitgeteilt (Art. 12 Abs. 3).','Kategorija je premajhna: povprečja se ne sporočajo (člen 12(3)).')}</Notice>
            :<p>{L('Durchschnitt Männer','Povprečje moških')} ({preview.answer.category.men.count}): <strong>{money(preview.answer.category.men.annual)}</strong> · {L('Frauen','ženske')} ({preview.answer.category.women.count}): <strong>{money(preview.answer.category.women.annual)}</strong></p>}
            <div className="button-row">{['pdf','html','txt'].map(format=><Button secondary key={format} busy={busy} onClick={()=>run(()=>fetchFile(`/requests/${r.id}/answer`,{year,internalId:preview.internalId,format},`equitensa-pay-information-${year}.${format}`,format==='pdf'?'application/pdf':format==='html'?'text/html':'text/plain'))}><Download size={15}/>{format.toUpperCase()}</Button>)}</div></div>}
          <form onSubmit={form(async body=>{await api(`/requests/${r.id}/close`,body);setOpen(null);setPreview(null);setMessage(L('Anfrage als beantwortet markiert.','Zahteva je označena kot odgovorjena.'));await load();})}>
            <div className="form-grid"><Field label={L('Beantwortet am','Odgovorjeno dne')} name="answeredOn" type="date" defaultValue={today()} min={r.received_on} max={today()} required/><Field label={L('Kurznotiz (optional, keine Gehaltsdaten)','Kratka opomba (neobvezno, brez podatkov o plačah)')} name="summary" maxLength={2000}/></div>
            <Button type="submit" busy={busy}>{L('Als beantwortet markieren','Označi kot odgovorjeno')}</Button></form>
        </div></td></tr>}</React.Fragment>)}</tbody></table></div>}</section>
  </div>;
}
