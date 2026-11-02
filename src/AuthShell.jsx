import React,{createContext,useContext,useState} from 'react';
import {ArrowRight,ArrowLeft,Globe2,ShieldCheck,Languages,FileSpreadsheet,Lock,CalendarClock,Mail,Building2,Eye,EyeOff,KeyRound,Check} from 'lucide-react';
import {Logo,Button} from './ui';
import {GoogleButton} from './GoogleAuth';

// Market/language state lives in App; the auth screens only need to read and change it.
export const AuthContext=createContext({country:'DE',setCountry:()=>{},onHome:()=>{}});

const benefits=L=>[
  [ShieldCheck,L('Abgebildet nach Richtlinie (EU) 2023/970','Zasnovano po direktivi (EU) 2023/970'),L('Kennzahlen nach Art. 9, 5-%-Prüfung nach Art. 10, Schutz kleiner Gruppen.','Kazalniki po členu 9, preverjanje 5 % po členu 10, zaščita majhnih skupin.')],
  [Languages,L('Deutsch und Slowenisch','Nemščina in slovenščina'),L('Bericht und Oberfläche richten sich nach dem Land Ihrer Gesellschaft.','Poročilo in vmesnik sledita državi vaše družbe.')],
  [FileSpreadsheet,L('Import aus Ihrem HR- und Lohnsystem','Uvoz iz vašega kadrovskega in plačnega sistema'),L('DATEV, BMD, Pantheon, Personio u. a. per Datei oder API, mit automatischer Datenprüfung.','DATEV, BMD, Pantheon, Personio idr. z datoteko ali API, s samodejnim pregledom podatkov.')],
  [Lock,L('Datenschutz von Anfang an','Zasebnost od začetka'),L('Pseudonymisierte Personalnummern, strikte Mandantentrennung, Zwei-Faktor-Anmeldung.','Psevdonimizirane šifre zaposlenih, stroga ločitev podjetij, dvostopenjska prijava.')],
];

export function PlanSummary({L,plan,interval,onChange}) {
  const total=interval==='annual'?plan.annual:plan.monthly;
  return <div className="auth-plan"><span className="eyebrow">{L('IHR PAKET','VAŠ PAKET')}</span><div><strong>{plan.name}</strong><span>€{total.toLocaleString('de-DE')} / {interval==='annual'?L('Jahr','leto'):L('Monat','mesec')}</span></div><small>{L('Bis zu','Do')} {plan.limit.toLocaleString('de-DE')} {L('Beschäftigte · zzgl. USt.','zaposlenih · brez DDV')}</small>{onChange&&<button type="button" className="text-button" onClick={onChange}>{L('Paket ändern','Spremeni paket')}</button>}</div>;
}

export function AuthShell({L,eyebrow,title,text,aside,children,notice,wide=false}) {
  const {country,setCountry,onHome}=useContext(AuthContext);
  return <div className="auth-shell">
    <aside className="auth-aside">
      <div className="auth-aside-inner">
        <div className="auth-logo"><Logo onClick={onHome}/></div>
        <div className="auth-pitch">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{text}</p>
          {aside}
        </div>
        <ul className="auth-benefits">{benefits(L).map(([Icon,head,body])=><li key={head}><span><Icon size={18}/></span><div><strong>{head}</strong><small>{body}</small></div></li>)}</ul>
        <div className="auth-deadline"><CalendarClock size={18}/><div><strong>{L('7. Juni 2027','7. junij 2027')}</strong><small>{L('Erste Berichte ab 150 Beschäftigten (Daten aus 2026).','Prva poročila od 150 zaposlenih (podatki iz leta 2026).')}</small></div></div>
      </div>
    </aside>
    <main className="auth-main">
      <div className="auth-top">
        <button className="auth-back" onClick={onHome}><ArrowLeft size={15}/>{L('Startseite','Domov')}</button>
        <label className="locale-control"><Globe2 size={15}/><select aria-label={L('Markt und Sprache','Trg in jezik')} value={country} onChange={e=>setCountry(e.target.value)}><option value="DE">DE · Deutsch</option><option value="AT">AT · Deutsch</option><option value="SI">SI · Slovenščina</option></select></label>
      </div>
      <div className={`auth-card${wide?' wide':''}`}>{notice}{children}</div>
      <p className="auth-legal">{L('Equitensa ist ein Arbeitswerkzeug und ersetzt keine Rechtsberatung.','Equitensa je delovno orodje in ne nadomešča pravnega svetovanja.')}</p>
    </main>
  </div>;
}

export const CardHead=({icon:Icon,title,text})=><div className="auth-card-head">{Icon&&<span className="auth-card-icon"><Icon size={22}/></span>}<h2>{title}</h2>{text&&<p>{text}</p>}</div>;

export function IconField({icon:Icon,label,hint,action,L:_L,...props}) {
  return <label className="field icon-field"><span>{label}</span><div className="icon-input">{Icon&&<Icon size={17}/>}<input {...props}/>{action}</div>{hint&&<small>{hint}</small>}</label>;
}

const strength=value=>{
  const score=[value.length>=12,value.length>=16,/[a-z]/.test(value)&&/[A-Z]/.test(value),/\d/.test(value),/[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  return value?Math.max(1,Math.min(4,Math.ceil(score*4/5))):0;
};
export function PasswordField({L,label,login,meter=false,hint}) {
  const [shown,setShown]=useState(false),[value,setValue]=useState('');
  const level=strength(value),names=[L('Zu kurz','Prekratko'),L('Schwach','Šibko'),L('Okay','V redu'),L('Gut','Dobro'),L('Stark','Močno')];
  return <>
    <IconField L={L} icon={KeyRound} label={label} name="password" type={shown?'text':'password'} minLength={login?1:12} maxLength={128} autoComplete={login?'current-password':'new-password'} required hint={hint}
      onChange={e=>setValue(e.target.value)}
      action={<button type="button" className="icon-toggle" aria-label={shown?L('Passwort verbergen','Skrij geslo'):L('Passwort anzeigen','Prikaži geslo')} aria-pressed={shown} onClick={()=>setShown(s=>!s)}>{shown?<EyeOff size={17}/>:<Eye size={17}/>}</button>}/>
    {meter&&<div className="strength" aria-live="polite"><div className={`strength-bar l${value.length<12&&value?0:level}`}>{[1,2,3,4].map(i=><i key={i}/>)}</div><small>{value?(value.length<12?names[0]:names[level]):L('Mindestens 12 Zeichen','Vsaj 12 znakov')}</small></div>}
  </>;
}

export function CountryPicker({L,country}) {
  const options=[['DE',L('Deutschland','Nemčija'),'DE'],['AT',L('Österreich','Avstrija'),'AT'],['SI',L('Slowenien','Slovenija'),'SI']];
  return <fieldset className="country-picker"><legend>{L('Land Ihres Unternehmens (Berichtsland)','Država vašega podjetja (država poročanja)')}</legend>
    <div>{options.map(([code,name])=><label key={code}><input type="radio" name="country" value={code} defaultChecked={code===country} required/><span><b>{code}</b>{name}<Check size={15}/></span></label>)}</div>
    <small>{L('Bestimmt Berichtsregeln und -sprache. Später nicht änderbar; eine Gesellschaft pro Konto.','Določa pravila in jezik poročila. Pozneje ni spremenljivo; ena družba na račun.')}</small></fieldset>;
}

export function AccountForm({L,login,busy,submit,country,google}) {
  return <>
    {google&&<GoogleButton L={L} busy={busy} onClick={google}/>}
    <form className="auth-form" onSubmit={e=>{e.preventDefault();submit(Object.fromEntries(new FormData(e.currentTarget)));}}>
      {!login&&<IconField icon={Building2} label={L('Unternehmensname','Ime podjetja')} name="companyName" autoComplete="organization" required maxLength={255}/>}
      <IconField icon={Mail} label={L('Geschäftliche E-Mail','Poslovna e-pošta')} name="email" type="email" autoComplete="email" required/>
      <PasswordField L={L} label={L('Passwort','Geslo')} login={login} meter={!login}/>
      {!login&&<CountryPicker L={L} country={country}/>}
      <Button type="submit" busy={busy}>{login?L('Anmelden','Prijava'):L('Konto erstellen & weiter','Ustvarite račun in nadaljujte')}<ArrowRight size={16}/></Button>
    </form>
  </>;
}
