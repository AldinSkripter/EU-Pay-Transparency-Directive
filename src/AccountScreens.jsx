import React,{useState} from 'react';
import {ArrowRight,MailCheck,RefreshCw} from 'lucide-react';
import {api,Logo,Button,Field,Notice,errorText} from './ui';

// Small helper: one busy flag and one error per screen.
function useAction() {
  const [busy,setBusy]=useState(false),[error,setError]=useState(null);
  const run=async fn=>{setBusy(true);setError(null);try{return await fn();}catch(e){setError(e);}finally{setBusy(false);}};
  return {busy,error,run,setError};
}

// Shown right after registration and whenever an unverified account signs in. The server refuses every
// other request until the emailed link has been used.
export function VerifyEmail({L,me,onCheck,onLogout}) {
  const {busy,error,run}=useAction(),[message,setMessage]=useState('');
  return <main className="auth-page"><div className="auth-copy"><span className="eyebrow">ONE LAST STEP</span><h1>{L('Bitte bestätigen Sie Ihre E-Mail-Adresse.','Prosimo, potrdite svoj e-poštni naslov.')}</h1><p>{L('Wir haben Ihnen einen Bestätigungslink geschickt. Erst danach öffnet sich Ihr Arbeitsbereich.','Poslali smo vam potrditveno povezavo. Šele nato se odpre vaš delovni prostor.')}</p></div>
    <section className="panel"><span className="large-icon"><MailCheck size={28}/></span><h2>{L('Posteingang prüfen','Preverite prejeto pošto')}</h2><p>{L('Der Link wurde an','Povezava je bila poslana na')} <strong>{me.user.email}</strong> {L('gesendet und ist 24 Stunden gültig. Schauen Sie bei Bedarf im Spam-Ordner nach.','in velja 24 ur. Po potrebi preverite mapo z vsiljeno pošto.')}</p>
      {error&&<Notice tone="error">{errorText(error,L)}</Notice>}{message&&<Notice>{message}</Notice>}
      <div className="button-row">
        <Button busy={busy} onClick={()=>run(async()=>{const fresh=await onCheck();if(!fresh?.user.emailVerified)setMessage(L('Noch nicht bestätigt. Öffnen Sie den Link in der E-Mail und versuchen Sie es erneut.','Še ni potrjeno. Odprite povezavo v e-pošti in poskusite znova.'));})}>{L('Ich habe bestätigt','Potrdil/a sem')}<ArrowRight size={16}/></Button>
        <Button secondary busy={busy} onClick={()=>run(async()=>{await api('/auth/resend-verification',{});setMessage(L('Neuer Link gesendet. Der vorherige Link ist nicht mehr gültig.','Nova povezava je poslana. Prejšnja ne velja več.'));})}><RefreshCw size={15}/>{L('Link erneut senden','Ponovno pošlji povezavo')}</Button>
      </div>
      <button className="text-button" onClick={onLogout}>{L('Abmelden','Odjava')}</button>
    </section></main>;
}

// Second sign-in step for accounts with two-factor sign-in.
export function MfaChallenge({L,credentials,onSignedIn,onCancel}) {
  const {busy,error,run}=useAction();
  return <main className="auth-page"><div className="auth-copy"><span className="eyebrow">TWO-FACTOR SIGN-IN</span><h1>{L('Noch ein Schritt.','Še en korak.')}</h1><p>{L('Geben Sie den Code Ihrer Authenticator-App ein. Haben Sie das Gerät nicht zur Hand, funktioniert auch ein Wiederherstellungscode.','Vnesite kodo iz svoje aplikacije za preverjanje. Če naprave nimate pri roki, deluje tudi koda za obnovitev.')}</p></div>
    <section className="panel"><h2>{L('Bestätigungscode','Potrditvena koda')}</h2>{error&&<Notice tone="error">{errorText(error,L)}</Notice>}
      <form onSubmit={e=>{e.preventDefault();const code=new FormData(e.currentTarget).get('code');run(async()=>{await api('/auth/login',{...credentials,code});await onSignedIn();});}}>
        <Field label={L('Sechsstelliger Code oder Wiederherstellungscode','Šestmestna koda ali koda za obnovitev')} name="code" autoComplete="one-time-code" inputMode="text" maxLength={20} required autoFocus/>
        <Button type="submit" busy={busy}>{L('Anmelden','Prijava')}<ArrowRight size={16}/></Button>
      </form><button className="text-button" onClick={onCancel}>{L('Zurück zur Anmeldung','Nazaj na prijavo')}</button></section></main>;
}

export function ForgotPassword({L,onBack}) {
  const {busy,error,run}=useAction(),[sent,setSent]=useState(false);
  return <main className="auth-page"><div className="auth-copy"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>{L('Passwort vergessen?','Ste pozabili geslo?')}</h1><p>{L('Wir senden Ihnen einen Link zum Zurücksetzen.','Poslali vam bomo povezavo za ponastavitev.')}</p></div>
    <section className="panel"><h2>{L('Passwort zurücksetzen','Ponastavitev gesla')}</h2>{error&&<Notice tone="error">{errorText(error,L)}</Notice>}
      {sent?<Notice>{L('Falls zu dieser Adresse ein Konto existiert, ist ein Link unterwegs. Er ist eine Stunde gültig.','Če za ta naslov obstaja račun, je povezava na poti. Velja eno uro.')}</Notice>
      :<form onSubmit={e=>{e.preventDefault();const email=new FormData(e.currentTarget).get('email');run(async()=>{await api('/auth/forgot-password',{email});setSent(true);});}}><Field label={L('Geschäftliche E-Mail','Poslovna e-pošta')} name="email" type="email" autoComplete="email" required maxLength={255}/><Button type="submit" busy={busy}>{L('Link senden','Pošlji povezavo')}<ArrowRight size={16}/></Button></form>}
      <button className="text-button" onClick={onBack}>{L('Zurück zur Anmeldung','Nazaj na prijavo')}</button></section></main>;
}

export function ResetPassword({L,token,onDone}) {
  const {busy,error,run}=useAction(),[done,setDone]=useState(false);
  return <main className="auth-page"><div className="auth-copy"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>{L('Neues Passwort festlegen.','Nastavite novo geslo.')}</h1><p>{L('Aus Sicherheitsgründen werden danach alle anderen Geräte abgemeldet. Zwei-Faktor-Anmeldung bleibt aktiv.','Zaradi varnosti bodo nato odjavljene vse druge naprave. Dvostopenjska prijava ostane vklopljena.')}</p></div>
    <section className="panel"><h2>{L('Neues Passwort','Novo geslo')}</h2>{error&&<Notice tone="error">{errorText(error,L)}</Notice>}
      {done?<><Notice>{L('Passwort geändert. Sie können sich jetzt anmelden.','Geslo je spremenjeno. Zdaj se lahko prijavite.')}</Notice><Button onClick={onDone}>{L('Zur Anmeldung','Na prijavo')}<ArrowRight size={16}/></Button></>
      :<form onSubmit={e=>{e.preventDefault();const password=new FormData(e.currentTarget).get('password');run(async()=>{await api('/auth/reset-password',{token,password});setDone(true);});}}><Field label={L('Neues Passwort','Novo geslo')} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required hint={L('Mindestens 12 Zeichen','Vsaj 12 znakov')}/><Button type="submit" busy={busy}>{L('Passwort speichern','Shrani geslo')}<ArrowRight size={16}/></Button></form>}
    </section></main>;
}
