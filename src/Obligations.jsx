import React,{useState} from 'react';
import {ArrowUpRight,CalendarClock,Users,Check,Info} from 'lucide-react';
import {ArrowButton,Tag,plans,recommendPlan,planRange,obligation,upcomingDeadlines,annualSavingsPercent} from './ui';

// The slider is logarithmic so 10 and 3 000 employees both fit. Rounding keeps the thresholds (100, 150,
// 250, 1 000, 2 500) reachable; any exact headcount can still be typed into the number field.
const MIN=10,MAX=3000,span=Math.log(MAX)-Math.log(MIN);
const toHeadcount=t=>{const n=Math.round(Math.exp(Math.log(MIN)+t/1000*span));return n<100?n:n<1000?Math.round(n/5)*5:Math.round(n/50)*50;};
const toPosition=n=>Math.round((Math.log(Math.min(Math.max(n,MIN),MAX))-Math.log(MIN))/span*1000);
const marks=[100,150,250,1000,2500],presets=[50,120,180,250,600,1500];
const milestones=[
  {due:'2026-06-07',kind:'law',bands:[]},
  {due:'2027-06-07',kind:'first',bands:['250+','150-249']},
  {due:'2028-06-07',kind:'annual',bands:['250+']},
  {due:'2030-06-07',kind:'cycle',bands:['150-249']},
  {due:'2031-06-07',kind:'small',bands:['100-149']},
];

export function ObligationExplorer({L,select}) {
  const [headcount,setHeadcount]=useState(180),[draft,setDraft]=useState('180');
  const lang=L('de','sl'),number=n=>n.toLocaleString(lang==='sl'?'sl-SI':'de-DE');
  const date=iso=>new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang==='sl'?'sl-SI':'de-DE',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const set=n=>{const value=Math.min(Math.max(Math.round(n),1),100000);setHeadcount(value);setDraft(String(value));};
  const duty=obligation(headcount),plan=recommendPlan(headcount),deadlines=upcomingDeadlines(headcount,3);
  const frequency=duty.frequencyYears===1?L('jährlich','vsako leto'):L('alle drei Jahre','vsaka tri leta');
  const title=!duty.reporting?L('Keine Berichtspflicht nach EU-Mindestvorgaben','Brez obveznosti poročanja po minimalnih zahtevah EU')
    :duty.band==='250+'?L('Jährliche Berichtspflicht','Letna obveznost poročanja')
    :duty.band==='150-249'?L('Berichtspflicht alle drei Jahre','Obveznost poročanja vsaka tri leta')
    :L('Berichtspflicht ab 2031, danach alle drei Jahre','Obveznost poročanja od 2031, nato vsaka tri leta');
  const reportYears=deadlines.map(d=>d.referenceYear).join(', ');
  return <div className="explorer">
    <div className="explorer-input">
      <div className="explorer-head"><span className="explorer-icon"><Users size={20}/></span><div><h3>{L('Wie viele Beschäftigte hat Ihr Unternehmen?','Koliko zaposlenih ima vaše podjetje?')}</h3><p>{L('Wir zeigen, ob und bis wann Sie berichten müssen, und empfehlen das passende Paket.','Pokazali bomo, ali in do kdaj morate poročati, ter priporočili ustrezen paket.')}</p></div></div>
      <div className="explorer-count"><label htmlFor="headcount">{L('Beschäftigte','Zaposleni')}</label><input id="headcount" type="number" inputMode="numeric" min="1" max="100000" value={draft} onChange={e=>{setDraft(e.target.value);const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=100000)setHeadcount(n);}} onBlur={()=>set(Number(draft)||1)}/></div>
      <div className="explorer-slider"><input type="range" min="0" max="1000" step="1" value={toPosition(headcount)} aria-label={L('Beschäftigtenzahl','Število zaposlenih')} onChange={e=>set(toHeadcount(Number(e.target.value)))}/>
        <div className="explorer-marks" aria-hidden="true">{marks.map(m=><span key={m} style={{left:`${toPosition(m)/10}%`}}>{number(m)}</span>)}</div></div>
      <div className="explorer-presets">{presets.map(n=><button key={n} type="button" className={n===headcount?'active':''} onClick={()=>set(n)}>{number(n)}</button>)}</div>
    </div>
    <div className="explorer-result">
      <div className="explorer-verdict"><Tag tone={duty.reporting?'violet':'mint'}>{duty.reporting?L('BERICHTSPFLICHT','OBVEZNOST POROČANJA'):L('FREIWILLIG','PROSTOVOLJNO')}</Tag><h3>{title}</h3></div>
      {duty.reporting?<dl className="explorer-facts">
        <div><dt>{L('Erste Meldung bis','Prva oddaja do')}</dt><dd>{date(duty.firstDue)}</dd></div>
        <div><dt>{L('Daten aus dem Jahr','Podatki za leto')}</dt><dd>{duty.referenceYear}</dd></div>
        <div><dt>{L('Rhythmus','Ritem')}</dt><dd>{frequency}</dd></div>
        <div><dt>{L('Berichtsjahre','Leta poročanja')}</dt><dd>{reportYears} …</dd></div>
      </dl>:<p className="explorer-note">{L('Unter 100 Beschäftigten sieht die EU keine Meldepflicht nach Artikel 9 vor. Sie können freiwillig berichten, und die Mitgliedstaaten dürfen eine Pflicht einführen.','Pod 100 zaposlenimi EU ne predvideva obveznosti poročanja po členu 9. Poročate lahko prostovoljno, države članice pa lahko uvedejo obveznost.')}</p>}
      <p className="explorer-note"><Info size={14}/>{L('Unabhängig von der Größe gelten Artikel 5–7: Gehaltsangabe vor der Einstellung, zugängliche Entgeltkriterien und das Auskunftsrecht der Beschäftigten, zu beantworten binnen zwei Monaten.','Ne glede na velikost veljajo členi 5–7: podatek o plači pred zaposlitvijo, dostopna merila za plače in pravica zaposlenih do informacij, na katere je treba odgovoriti v dveh mesecih.')}</p>
      <div className="explorer-plan">
        {plan?<><div><span className="eyebrow">{L('EMPFOHLENES PAKET','PRIPOROČENI PAKET')}</span><h4>{plan.name}</h4><p>{L('Für','Za')} {number(planRange(plan).from)}–{number(plan.limit)} {L('Beschäftigte','zaposlenih')}</p></div>
          <div className="explorer-price"><strong>€{number(Math.round(plan.annual/12*100)/100)}<small>/ {L('Monat','mesec')}</small></strong><small>{L(`€${number(plan.annual)} jährlich · ${annualSavingsPercent(plan)} % gespart`,`€${number(plan.annual)} letno · ${annualSavingsPercent(plan)} % prihranka`)}</small></div>
          <ArrowButton onClick={()=>select(plan.id,'annual')}>{L(`${plan.name} wählen`,`Izberite ${plan.name}`)}</ArrowButton></>
        :<div><span className="eyebrow">{L('INDIVIDUELLES ANGEBOT','INDIVIDUALNA PONUDBA')}</span><h4>{L('Mehr als','Več kot')} {number(plans.at(-1).limit)} {L('Beschäftigte','zaposlenih')}</h4><p>{L('Unsere Pakete decken bis zu 2.500 Beschäftigte pro rechtlicher Einheit ab. Für größere Einheiten erstellen wir ein individuelles Angebot.','Naši paketi pokrivajo do 2.500 zaposlenih na pravno osebo. Za večje enote pripravimo individualno ponudbo.')}</p></div>}
      </div>
    </div>
    <ol className="timeline" aria-label={L('Wichtige Fristen','Ključni roki')}>{milestones.map(m=>{
      const past=new Date(`${m.due}T00:00:00Z`)<new Date(),mine=m.bands.includes(duty.band),label={
        law:[L('Umsetzungsfrist der Richtlinie','Rok za prenos direktive'),L('Mitgliedstaaten müssen die Richtlinie in nationales Recht überführen (Art. 34).','Države članice morajo direktivo prenesti v nacionalno pravo (člen 34).')],
        first:[L('Erster Bericht: 150+ Beschäftigte','Prvo poročilo: 150+ zaposlenih'),L('Daten aus 2026. 250+ jährlich, 150–249 danach alle drei Jahre (Art. 9 Abs. 2–3).','Podatki za 2026. 250+ letno, 150–249 nato vsaka tri leta (člen 9(2)–(3)).')],
        annual:[L('Zweiter Jahresbericht: 250+','Drugo letno poročilo: 250+'),L('Daten aus 2027, danach jedes Jahr bis 7. Juni.','Podatki za 2027, nato vsako leto do 7. junija.')],
        cycle:[L('Zweiter Bericht: 150–249','Drugo poročilo: 150–249'),L('Daten aus 2029, im Dreijahresrhythmus.','Podatki za 2029, v tritletnem ritmu.')],
        small:[L('Erster Bericht: 100–149','Prvo poročilo: 100–149'),L('Daten aus 2030, danach alle drei Jahre (Art. 9 Abs. 4).','Podatki za 2030, nato vsaka tri leta (člen 9(4)).')],
      }[m.kind];
      return <li key={m.due} className={`${past?'past':''} ${mine?'mine':''}`}><span className="timeline-dot">{past?<Check size={12}/>:<CalendarClock size={12}/>}</span><time dateTime={m.due}>{date(m.due)}</time><strong>{label[0]}</strong><p>{label[1]}</p>{mine&&<Tag tone="violet">{L('Gilt für Sie','Velja za vas')}</Tag>}</li>;})}</ol>
    <a className="source-link" href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023L0970" target="_blank" rel="noreferrer">{L('Richtlinie (EU) 2023/970 lesen · Art. 5–10 & 34','Preberite direktivo (EU) 2023/970 · členi 5–10 in 34')}<ArrowUpRight size={15}/></a>
    <p className="explorer-disclaimer">{L('EU-Mindestvorgaben. Nationale Umsetzungsgesetze können strengere Schwellen, Fristen und Meldewege festlegen und ersetzen keine Rechtsberatung.','Minimalne zahteve EU. Nacionalni zakoni o prenosu lahko določijo strožje pragove, roke in kanale oddaje; to ni pravno svetovanje.')}</p>
  </div>;
}
