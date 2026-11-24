import React,{useState} from 'react';
import {ArrowRight,MailCheck,RefreshCw,ShieldCheck,KeyRound,Mail,CircleCheck} from 'lucide-react';
import {api,Button,Notice,errorText} from './ui';
import {AuthShell,CardHead,IconField,PasswordField} from './AuthShell';

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
  return <AuthShell L={L} eyebrow="ONE LAST STEP" title={L('Bitte bestätigen Sie Ihre E-Mail-Adresse.','Prosimo, potrdite svoj e-poštni naslov.')} text={L('Wir haben Ihnen einen Bestätigungslink geschickt. Erst danach öffnet sich Ihr Arbeitsbereich.','Poslali smo vam potrditveno povezavo. Šele nato se odpre vaš delovni prostor.')}>
    <CardHead icon={MailCheck} title={L('Posteingang prüfen','Preverite prejeto pošto')} text={<>{L('Der Link wurde an','Povezava je bila poslana na')} <strong>{me.user.email}</strong> {L('gesendet und ist 24 Stunden gültig. Schauen Sie bei Bedarf im Spam-Ordner nach.','in velja 24 ur. Po potrebi preverite mapo z vsiljeno pošto.')}</>}/>
    {me.mailDeliveryMode==='local'&&<Notice>{L('Lokaler E-Mail-Test: Ohne SMTP werden Nachrichten im Adminpanel unter „E-Mail und Vorlagen“ im lokalen Testposteingang angezeigt. Es wurde keine externe E-Mail versendet.', 'Lokalni preizkus e-pošte: brez SMTP so sporočila prikazana v lokalnem testnem nabiralniku v skrbniški plošči pod »E-pošta in predloge«. Zunanja e-pošta ni bila poslana.')}</Notice>}
    {me.mailDeliveryMode==='unconfigured'&&<Notice tone="error">{L('Der E-Mail-Versand ist noch nicht eingerichtet. Bitte kontaktieren Sie den Support.', 'Pošiljanje e-pošte še ni nastavljeno. Obrnite se na podporo.')}</Notice>}
    {me.verificationDelivery==='failed'&&<Notice tone="error">{errorText(new Error('EMAIL_DELIVERY_FAILED'),L)}</Notice>}
    {error&&<Notice tone="error">{errorText(error,L)}</Notice>}{message&&<Notice>{message}</Notice>}
    <div className="auth-actions">
      <Button busy={busy} onClick={()=>run(async()=>{const fresh=await onCheck();if(!fresh?.user.emailVerified)setMessage(L('Noch nicht bestätigt. Öffnen Sie den Link in der E-Mail und versuchen Sie es erneut.','Še ni potrjeno. Odprite povezavo v e-pošti in poskusite znova.'));})}>{L('Ich habe bestätigt','Potrdil/a sem')}<ArrowRight size={16}/></Button>
      <Button secondary busy={busy} onClick={()=>run(async()=>{await api('/auth/resend-verification',{});setMessage(L('Neuer Link gesendet. Der vorherige Link ist nicht mehr gültig.','Nova povezava je poslana. Prejšnja ne velja več.'));})}><RefreshCw size={15}/>{L('Link erneut senden','Ponovno pošlji povezavo')}</Button>
    </div>
    <button className="text-button auth-link" onClick={onLogout}>{L('Abmelden','Odjava')}</button>
  </AuthShell>;
}

// Second sign-in step for accounts with two-factor sign-in.
export function MfaChallenge({L,credentials,onSignedIn,onCancel}) {
  const {busy,error,run}=useAction();
  return <AuthShell L={L} eyebrow="TWO-FACTOR SIGN-IN" title={L('Noch ein Schritt.','Še en korak.')} text={L('Geben Sie den Code Ihrer Authenticator-App ein. Haben Sie das Gerät nicht zur Hand, funktioniert auch ein Wiederherstellungscode.','Vnesite kodo iz svoje aplikacije za preverjanje. Če naprave nimate pri roki, deluje tudi koda za obnovitev.')}>
    <CardHead icon={ShieldCheck} title={L('Bestätigungscode','Potrditvena koda')} text={L('Ihr Konto ist mit Zwei-Faktor-Anmeldung geschützt.','Vaš račun je zaščiten z dvostopenjsko prijavo.')}/>
    {error&&<Notice tone="error">{errorText(error,L)}</Notice>}
    <form className="auth-form" onSubmit={e=>{e.preventDefault();const code=new FormData(e.currentTarget).get('code');run(async()=>{await api('/auth/login',{...credentials,code});await onSignedIn();});}}>
      <IconField icon={KeyRound} label={L('Sechsstelliger Code oder Wiederherstellungscode','Šestmestna koda ali koda za obnovitev')} name="code" autoComplete="one-time-code" inputMode="text" maxLength={20} required autoFocus/>
      <Button type="submit" busy={busy}>{L('Anmelden','Prijava')}<ArrowRight size={16}/></Button>
    </form><button className="text-button auth-link" onClick={onCancel}>{L('Zurück zur Anmeldung','Nazaj na prijavo')}</button>
  </AuthShell>;
}

export function ForgotPassword({L,onBack}) {
  const {busy,error,run}=useAction(),[sent,setSent]=useState(false);
  return <AuthShell L={L} eyebrow="ACCOUNT RECOVERY" title={L('Passwort vergessen?','Ste pozabili geslo?')} text={L('Wir senden Ihnen einen Link zum Zurücksetzen.','Poslali vam bomo povezavo za ponastavitev.')}>
    <CardHead icon={Mail} title={L('Passwort zurücksetzen','Ponastavitev gesla')} text={L('Geben Sie die E-Mail-Adresse Ihres Kontos ein.','Vnesite e-poštni naslov svojega računa.')}/>
    {error&&<Notice tone="error">{errorText(error,L)}</Notice>}
    {sent?<Notice tone="success">{L('Falls zu dieser Adresse ein Konto existiert, ist ein Link unterwegs. Er ist eine Stunde gültig.','Če za ta naslov obstaja račun, je povezava na poti. Velja eno uro.')}</Notice>
    :<form className="auth-form" onSubmit={e=>{e.preventDefault();const email=new FormData(e.currentTarget).get('email');run(async()=>{await api('/auth/forgot-password',{email});setSent(true);});}}><IconField icon={Mail} label={L('Geschäftliche E-Mail','Poslovna e-pošta')} name="email" type="email" autoComplete="email" required maxLength={255}/><Button type="submit" busy={busy}>{L('Link senden','Pošlji povezavo')}<ArrowRight size={16}/></Button></form>}
    <button className="text-button auth-link" onClick={onBack}>{L('Zurück zur Anmeldung','Nazaj na prijavo')}</button>
  </AuthShell>;
}

export function ResetPassword({L,token,onDone}) {
  const {busy,error,run}=useAction(),[done,setDone]=useState(false);
  return <AuthShell L={L} eyebrow="ACCOUNT RECOVERY" title={L('Neues Passwort festlegen.','Nastavite novo geslo.')} text={L('Aus Sicherheitsgründen werden danach alle anderen Geräte abgemeldet. Zwei-Faktor-Anmeldung bleibt aktiv.','Zaradi varnosti bodo nato odjavljene vse druge naprave. Dvostopenjska prijava ostane vklopljena.')}>
    <CardHead icon={KeyRound} title={L('Neues Passwort','Novo geslo')}/>
    {error&&<Notice tone="error">{errorText(error,L)}</Notice>}
    {done?<><Notice tone="success"><CircleCheck size={15}/> {L('Passwort geändert. Sie können sich jetzt anmelden.','Geslo je spremenjeno. Zdaj se lahko prijavite.')}</Notice><Button onClick={onDone}>{L('Zur Anmeldung','Na prijavo')}<ArrowRight size={16}/></Button></>
    :<form className="auth-form" onSubmit={e=>{e.preventDefault();const password=new FormData(e.currentTarget).get('password');run(async()=>{await api('/auth/reset-password',{token,password});setDone(true);});}}><PasswordField L={L} label={L('Neues Passwort','Novo geslo')} meter/><Button type="submit" busy={busy}>{L('Passwort speichern','Shrani geslo')}<ArrowRight size={16}/></Button></form>}
  </AuthShell>;
}
