import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { controlAudit } from './control-store.js';

export const emailKinds=['verify','welcome','reset','passwordChanged'];
const countries=['DE','AT','SI'];
const address=v=>typeof v==='string'&&v.length<=255&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v);
const clean=(v,max=3000)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)?v.trim():'';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy={
  DE:{verify:['Equitensa: E-Mail-Adresse bestätigen','Willkommen bei Equitensa.','Ihr Arbeitsbereich für faire Vergütung wartet auf Sie. Bestätigen Sie Ihre E-Mail-Adresse, um mit {company} zu starten.','E-Mail bestätigen','Der Link ist 24 Stunden gültig.'],welcome:['Willkommen bei Equitensa','Ihr nächster Schritt zu fairer Vergütung.','Ihre E-Mail-Adresse ist bestätigt. Importieren Sie Ihre Daten, prüfen Sie die Kategorien und bereiten Sie Ihren ersten Bericht vor.','Arbeitsbereich öffnen','Die Funktionen Ihres Arbeitsbereichs richten sich nach Ihrem gebuchten Paket.'],reset:['Equitensa: Passwort zurücksetzen','Ein sicherer Neustart.','Für Ihr Konto wurde das Zurücksetzen des Passworts angefordert.','Passwort zurücksetzen','Der Link ist 1 Stunde gültig. Haben Sie das nicht angefordert, ignorieren Sie diese E-Mail; Ihr Passwort bleibt unverändert.'],passwordChanged:['Equitensa: Passwort geändert','Ihr Passwort wurde geändert.','Das Passwort für Ihr Equitensa-Konto wurde aktualisiert. Falls Sie dies nicht veranlasst haben, kontaktieren Sie umgehend unseren Support.','Equitensa öffnen','Diese Nachricht dient der Sicherheit Ihres Kontos.']},
  SI:{verify:['Equitensa: potrdite e-poštni naslov','Dobrodošli v Equitensa.','Vaš delovni prostor za pravično plačilo je pripravljen. Potrdite e-poštni naslov in začnite s podjetjem {company}.','Potrdite e-pošto','Povezava velja 24 ur.'],welcome:['Dobrodošli v Equitensa','Naslednji korak do pravičnega plačila.','Vaš e-poštni naslov je potrjen. Uvozite podatke, preverite kategorije in pripravite svoje prvo poročilo.','Odprite delovni prostor','Funkcije delovnega prostora so odvisne od vašega naročniškega paketa.'],reset:['Equitensa: ponastavitev gesla','Varen nov začetek.','Za vaš račun je bila zahtevana ponastavitev gesla.','Ponastavite geslo','Povezava velja 1 uro. Če tega niste zahtevali, prezrite to sporočilo; geslo ostane nespremenjeno.'],passwordChanged:['Equitensa: geslo spremenjeno','Vaše geslo je bilo spremenjeno.','Geslo vašega računa Equitensa je bilo posodobljeno. Če tega niste storili vi, se takoj obrnite na podporo.','Odprite Equitensa','To sporočilo je namenjeno varnosti vašega računa.']},
};
export function defaultEmailSettings(){
  return {revision:0,mode:'fallback',host:'',port:587,security:'starttls',username:'',password:'',fromName:'Equitensa',fromEmail:'no-reply@equitensa.de',replyTo:'',brand:{name:'Equitensa',accent:'#5032c7',background:'#f3f1fa',footer:'Equitensa · Fair pay. Clear next steps.'},templates:Object.fromEntries(countries.map(country=>[country,Object.fromEntries(emailKinds.map(kind=>{const c=copy[country==='AT'?'DE':country][kind];return [kind,{subject:c[0],heading:c[1],body:c[2],button:c[3],note:c[4]}];}))]))};
}
export function emailDraft(input,previous=defaultEmailSettings()){
  if(!input||Number(input.revision)!==previous.revision)throw new Error('EMAIL_SETTINGS_CHANGED');
  if(!['fallback','smtp'].includes(input.mode)||!['tls','starttls'].includes(input.security))throw new Error('INVALID_EMAIL_SETTINGS');
  const draft={revision:previous.revision+1,mode:input.mode,host:clean(input.host,255),port:Number(input.port),security:input.security,username:clean(input.username,255),password:input.clearPassword?'':input.password?clean(input.password,1024):previous.password,fromName:clean(input.fromName,100),fromEmail:clean(input.fromEmail,255),replyTo:clean(input.replyTo,255),brand:{name:clean(input.brand?.name,100),accent:input.brand?.accent,background:input.brand?.background,footer:clean(input.brand?.footer,1000)},templates:{}};
  if(!draft.fromName||!address(draft.fromEmail)||(draft.replyTo&&!address(draft.replyTo))||!draft.brand.name||!/^#[a-f0-9]{6}$/i.test(draft.brand.accent||'')||!/^#[a-f0-9]{6}$/i.test(draft.brand.background||'')||!Number.isInteger(draft.port)||draft.port<1||draft.port>65535||/[\r\n]/.test(draft.fromName+draft.username))throw new Error('INVALID_EMAIL_SETTINGS');
  if(draft.mode==='smtp'&&(!/^[a-z0-9][a-z0-9.:-]*$/i.test(draft.host)||!draft.username||!draft.password))throw new Error('SMTP_SETTINGS_INCOMPLETE');
  for(const country of countries){draft.templates[country]={};for(const kind of emailKinds){const entry=input.templates?.[country]?.[kind];const result=Object.fromEntries(['subject','heading','body','button','note'].map(key=>[key,clean(entry?.[key],key==='subject'?200:3000)]));if(Object.values(result).some(v=>!v)||/[\r\n]/.test(result.subject))throw new Error('INVALID_EMAIL_TEMPLATE');draft.templates[country][kind]=result;}}
  return draft;
}
export const emailView=settings=>{const {password,...rest}=settings;return {...rest,passwordConfigured:!!password};};
export function renderEmail(settings,kind,country,{link,company='Ihr Unternehmen',email=''}={}){
  if(!emailKinds.includes(kind)||!countries.includes(country))throw new Error('INVALID_EMAIL_TEMPLATE');
  const url=new URL(link);if(!['https:','http:'].includes(url.protocol))throw new Error('INVALID_EMAIL_TEMPLATE');
  const template=settings.templates[country][kind],brand=settings.brand,sl=country==='SI';
  const substitute=value=>value.replace(/\{(company|email|brand)\}/g,(_,key)=>({company,email,brand:brand.name})[key]);
  const c=Object.fromEntries(Object.entries(template).map(([key,v])=>[key,substitute(v)]));
  c.subject=c.subject.replace(/[\r\n]/g,' ');
  const note=[c.note,...(kind==='verify'?[sl?'Povezava velja 24 ur.':'Der Link ist 24 Stunden gültig.']:kind==='reset'?[sl?'Povezava velja 1 uro.':'Der Link ist 1 Stunde gültig.']:[])].filter((v,i,a)=>a.indexOf(v)===i).join(' ');
  const text=`${brand.name}\n\n${c.heading}\n\n${c.body}\n\n${c.button}: ${link}\n\n${note}\n\n${brand.footer}${settings.replyTo?`\n${settings.replyTo}`:''}\n`;
  const html=`<!doctype html><html lang="${sl?'sl':'de'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head><body style="margin:0;background:${brand.background};font-family:Arial,Helvetica,sans-serif;color:#211d35"><div style="display:none;max-height:0;overflow:hidden">${esc(c.heading)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px"><tr><td style="padding:0 8px 24px;font-size:24px;font-weight:bold;color:${brand.accent}">${esc(brand.name)}<span style="float:right;font-size:11px;letter-spacing:2px;color:#766e8c;padding-top:10px">${country} · ${sl?'PRAVIČNO PLAČILO':'FAIRE VERGÜTUNG'}</span></td></tr><tr><td style="background:#ffffff;border-radius:20px;padding:44px 36px;border-top:5px solid ${brand.accent}"><p style="font-size:11px;letter-spacing:3px;color:${brand.accent};margin:0 0 24px">${esc(brand.name.toUpperCase())} / ${sl?'VAŠ DELOVNI PROSTOR':'IHR ARBEITSBEREICH'}</p><h1 style="font-size:32px;line-height:1.2;margin:0 0 24px">${esc(c.heading)}</h1><p style="font-size:16px;line-height:1.8;color:#625b74;white-space:pre-line">${esc(c.body)}</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:32px 0"><tr><td bgcolor="${brand.accent}" style="border-radius:10px"><a href="${esc(link)}" style="display:inline-block;padding:17px 26px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">${esc(c.button)} →</a></td></tr></table><p style="font-size:13px;line-height:1.7;color:#766e8c">${esc(note)}</p><hr style="border:0;border-top:1px solid #ebe7f3;margin:28px 0"><p style="font-size:12px;color:#766e8c">${sl?'Če gumb ne deluje, kopirajte povezavo:':'Falls der Button nicht funktioniert, kopieren Sie den Link:'}</p><a href="${esc(link)}" style="font-size:12px;word-break:break-all;color:${brand.accent}">${esc(link)}</a></td></tr><tr><td style="padding:24px 12px;font-size:12px;line-height:1.8;color:#766e8c;text-align:center">${esc(brand.footer)}${settings.replyTo?`<br><a href="mailto:${esc(settings.replyTo)}" style="color:${brand.accent}">${esc(settings.replyTo)}</a>`:''}</td></tr></table></td></tr></table></body></html>`;
  return {subject:c.subject,text,html};
}
export const smtpOptions=settings=>({host:settings.host,port:settings.port,secure:settings.security==='tls',requireTLS:settings.security==='starttls',auth:{user:settings.username,pass:settings.password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true,tls:{minVersion:'TLSv1.2'}});
export function createEmailPlatform({control,fallback,demo,transportFactory=options=>nodemailer.createTransport(options)}){
  const outbox=[];
  const settings=async()=> (await control.read()).email||defaultEmailSettings();
  async function deliver(message,config,{kind,country,to,userId,test=false}){
    const id=randomUUID(),date=new Date().toISOString();let status='failed',code=null;
    try{
      if(config.mode==='smtp'){
        const transport=transportFactory(smtpOptions(config));
        try{const result=await transport.sendMail({from:{name:config.fromName,address:config.fromEmail},to,replyTo:config.replyTo||undefined,...message});if(result?.rejected?.length||result?.accepted&& !result.accepted.length)throw new Error('SMTP_RECIPIENT_REJECTED');status='accepted';}finally{transport.close?.();}
      }else{await fallback.send({to,...message});status=fallback.deliveryMode==='smtp'?'accepted':demo?'local':'accepted';}
      if(demo){outbox.unshift({id,date,to,kind,country,...message,status});outbox.splice(30);}
      return {id,status};
    }catch(error){code=['EAUTH','ECONNECTION','ESOCKET','ETIMEDOUT','ETLS','EENVELOPE','SMTP_RECIPIENT_REJECTED'].includes(error.code||error.message)?error.code||error.message:'EMAIL_SEND_FAILED';throw Object.assign(new Error('EMAIL_DELIVERY_FAILED'),{deliveryCode:code});}
    finally{await control.mutate(state=>{state.emailDeliveries=[{id,date,kind,country,to:to.replace(/^(.).+(@.+)$/,'$1***$2'),status,code,test,...(userId?{userId}:{})},...(state.emailDeliveries||[])].slice(0,100);});}
  }
  return {settings,outbox,async mode(){return (await settings()).mode==='smtp'||fallback.deliveryMode==='smtp'?'smtp':demo?'local':'unconfigured';},async verificationStatus(userId){return (await control.read()).emailDeliveries?.find(d=>d.userId===userId&&d.kind==='verify'&&!d.test)?.status||null;},async sendAccount({kind,country,link,company,email,userId}){const config=await settings();return deliver(renderEmail(config,kind,country,{link,company,email}),config,{kind,country,to:email,userId});},
    async test(config,{country,kind,to,origin}){if(!address(to))throw new Error('INVALID_EMAIL_SETTINGS');const link=`${origin}/?email-preview=1`;return deliver(renderEmail(config,kind,country,{link,company:'Example GmbH',email:to}),config,{kind,country,to,test:true});},
    async verify(config){const transport=transportFactory(smtpOptions(config));try{await transport.verify();}catch{throw new Error('SMTP_CONNECTION_FAILED');}finally{transport.close?.();}},
  };
}
export function emailAdminRoutes(router,{platform,control,editable,demo}){
  const view=async owner=>({ ...emailView(await platform.settings()),deliveries:(await control.read()).emailDeliveries||[],demo,localOutbox:demo&&owner.role==='owner'?platform.outbox:[] });
  router.get('/email',async(req,res)=>res.json(await view(req.owner)));
  router.post('/email',editable,async(req,res)=>{
    const previous=await platform.settings(),draft=emailDraft(req.body,previous);
    await control.mutate(state=>{if((state.email?.revision||0)!==previous.revision)throw new Error('EMAIL_SETTINGS_CHANGED');state.email=draft;controlAudit(state,req.owner.email,'email_settings_saved',{revision:draft.revision,mode:draft.mode});});res.json(await view(req.owner));
  });
  router.post('/email/verify',editable,async(req,res)=>{const draft=emailDraft(req.body,await platform.settings());if(draft.mode!=='smtp')throw new Error('SMTP_SETTINGS_INCOMPLETE');await platform.verify(draft);res.json({ok:true});});
  router.post('/email/preview',async(req,res)=>{
    const config=emailDraft(req.body,await platform.settings());
    res.json(renderEmail(config,req.body.kind,req.body.country,{link:`${req.get('origin')}/?email-preview=1`,company:'Example GmbH',email:req.owner.email}));
  });
  router.post('/email/test',editable,async(req,res)=>{
    const config=emailDraft(req.body,await platform.settings());res.json(await platform.test(config,{kind:req.body.kind,country:req.body.country,to:req.body.to,origin:req.get('origin')}));
  });
}
