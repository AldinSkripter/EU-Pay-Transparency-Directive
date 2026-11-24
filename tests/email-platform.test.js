import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { defaultEmailSettings,emailDraft,emailView,renderEmail,smtpOptions } from '../server/email-platform.js';
import { encryptControl,decryptControl,MemoryControlStore } from '../server/control-store.js';
import { MemoryStore } from '../server/store.js';
import { MemoryMailer } from '../server/mailer.js';
import { createApp } from '../server/app.js';
import { addOwner } from '../server/owner-auth.js';
import nodemailer from 'nodemailer';

const origin='http://localhost:3000',password='correct-horse-123';
test('premium mail: three editable country variants, four events, escaped content, text alternative and immutable action link',()=>{
  const settings=defaultEmailSettings();
  for(const country of ['DE','AT','SI'])for(const kind of ['verify','welcome','reset','passwordChanged']){
    const mail=renderEmail(settings,kind,country,{link:`https://equitensa.de/?${kind}=sample`,company:'<script>attack</script>',email:'user@example.test'});
    assert.ok(mail.html.includes(`<html lang="${country==='SI'?'sl':'de'}">`));assert.ok(!mail.html.includes('<script>'));
    assert.ok(mail.text.includes(`https://equitensa.de/?${kind}=sample`));assert.ok(mail.html.includes('role="presentation"'));assert.ok(mail.html.includes('max-width:600px'));
    if(kind==='verify'){assert.ok(mail.html.includes('24'));assert.ok(mail.subject.includes(country==='SI'?'potrdite':'bestätigen'));}
  }
  settings.templates.AT.welcome.heading='Only Austrian variant';
  assert.ok(renderEmail(settings,'welcome','AT',{link:origin}).html.includes('Only Austrian variant'));
  assert.ok(!renderEmail(settings,'welcome','DE',{link:origin}).html.includes('Only Austrian variant'));
  settings.templates.DE.verify.note='Edited note';assert.ok(renderEmail(settings,'verify','DE',{link:origin}).html.includes('24 Stunden'));
  assert.throws(()=>renderEmail(settings,'verify','DE',{link:'javascript:alert(1)'}),/INVALID_EMAIL_TEMPLATE/);
});

test('SMTP settings preserve masked passwords, require TLS and remain encrypted at rest',()=>{
  const previous=defaultEmailSettings(),draft=emailDraft({...previous,mode:'smtp',host:'smtp.example.test',username:'mailuser',password:'SMTP-secret-never-returned'},previous);
  assert.equal(emailView(draft).password,undefined);assert.equal(emailView(draft).passwordConfigured,true);
  const kept=emailDraft({...emailView(draft),password:''},draft);assert.equal(kept.password,draft.password);
  const key=randomBytes(32),sealed=encryptControl({email:draft},key);assert.ok(!sealed.includes(draft.password));assert.equal(decryptControl(sealed,key).email.password,draft.password);
  assert.equal(smtpOptions(draft).requireTLS,true);assert.equal(smtpOptions({...draft,security:'tls',port:465}).secure,true);
  assert.throws(()=>emailDraft({...draft,revision:0},draft),/EMAIL_SETTINGS_CHANGED/);
  assert.throws(()=>emailDraft({...previous,mode:'smtp'},previous),/SMTP_SETTINGS_INCOMPLETE/);
  assert.throws(()=>emailDraft({...previous,fromEmail:'test\r\nBcc:attack@example.test'},previous),/INVALID_EMAIL_SETTINGS/);
});

test('Nodemailer serializes a real multipart email with both HTML and text',async()=>{
  const message=renderEmail(defaultEmailSettings(),'verify','SI',{link:'https://equitensa.de/?verify=sample',company:'Sample d.o.o.'});
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows'});
  const result=await transport.sendMail({from:'Equitensa <no-reply@equitensa.de>',to:'test@example.test',...message});
  const wire=result.message.toString();assert.match(wire,/Content-Type: multipart\/alternative/);assert.match(wire,/Content-Type: text\/html/);assert.match(wire,/Content-Type: text\/plain/);assert.match(wire,/To: test@example.test/);
});

async function fixture(t,{demo=true,fail=false}={}){
  const store=new MemoryStore(),control=new MemoryControlStore(),mailer=new MemoryMailer(),sent=[],options=[];
  await addOwner(control,'owner@example.test',password);await addOwner(control,'auditor@example.test',password,'auditor');
  const factory=config=>{options.push(config);return {async verify(){if(fail)throw new Error('EAUTH');},async sendMail(mail){if(fail)throw Object.assign(new Error('authentication failed'),{code:'EAUTH'});sent.push(mail);return {accepted:[mail.to],rejected:[]};},close(){}};};
  const server=createApp({store,control,mailer,demo,emailTransportFactory:factory,secret:'a'.repeat(64),origins:[origin]}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const call=(path,cookie,body)=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const login=await call('/admin/auth/login',null,{email:'owner@example.test',password}),owner=login.headers.get('set-cookie').split(';')[0];
  return {store,control,mailer,sent,options,call,owner};
}
test('admin controls mail live: reauthentication, masked secret, preview, SMTP verification, test and revision conflict',async t=>{
  const f=await fixture(t),{call,owner}=f;
  assert.equal((await call('/admin/email')).status,401);
  const initial=await (await call('/admin/email',owner)).json();
  const draft={...initial,mode:'smtp',host:'smtp.example.test',username:'smtp-user',password:'SMTP-private-secret'};
  assert.equal((await call('/admin/email',owner,{...draft,currentPassword:'wrong'})).status,403);
  assert.equal((await call('/admin/email/verify',owner,{...draft,currentPassword:password})).status,200);
  const saved=await call('/admin/email',owner,{...draft,currentPassword:password});assert.equal(saved.status,200);
  const view=await saved.json();assert.equal(view.passwordConfigured,true);assert.ok(!JSON.stringify(view).includes('SMTP-private-secret'));
  assert.equal((await call('/admin/email',owner,{...draft,currentPassword:password})).status,409);
  const preview=await call('/admin/email/preview',owner,{...view,country:'SI',kind:'verify'});assert.equal(preview.status,200);assert.ok((await preview.json()).html.includes('<html lang="sl">'));
  const response=await call('/admin/email/test',owner,{...view,currentPassword:password,country:'AT',kind:'welcome',to:'test@example.test'});assert.equal(response.status,200);assert.equal((await response.json()).status,'accepted');
  assert.equal(f.sent[0].to,'test@example.test');assert.ok(f.sent[0].html.includes('Equitensa'));assert.equal(f.options[0].requireTLS,true);
  const auditorLogin=await call('/admin/auth/login',null,{email:'auditor@example.test',password}),auditor=auditorLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/admin/email/test',auditor,{...view,currentPassword:password,country:'DE',kind:'verify',to:'test@example.test'})).status,403);
  assert.deepEqual((await (await call('/admin/email',auditor)).json()).localOutbox,[]);
  assert.ok(!JSON.stringify((await f.control.read()).audit).includes('SMTP-private-secret'));
});

test('DE/AT/SI registration verifies once, sends welcome, local test inbox works and demo never asks for verification',async t=>{
  const {call,owner,mailer}=await fixture(t);
  for(const country of ['DE','AT','SI']){
    const registered=await call('/auth/register',null,{email:`user-${country}@example.test`,password,companyName:`Company ${country}`,country});assert.equal(registered.status,201);
    const cookie=registered.headers.get('set-cookie').split(';')[0];
    assert.equal((await call('/analysis',cookie)).status,403);
    const verify=mailer.outbox.at(-1);assert.ok(verify.html.includes(`<html lang="${country==='SI'?'sl':'de'}">`));assert.ok(verify.text.includes(`Company ${country}`));
    const token=verify.text.match(/[?]verify=([a-f0-9]{64})/)[1];
    assert.equal((await call('/auth/verify-email',null,{token})).status,200);
    assert.equal((await call('/auth/verify-email',null,{token})).status,400);
    assert.equal((await call('/analysis',cookie)).status,200);
    assert.ok(mailer.outbox.at(-1).subject.includes(country==='SI'?'Dobrodošli':'Willkommen'));
    const demoResponse=await call('/demo',null,{country});assert.equal(demoResponse.status,200);
    const demoCookie=demoResponse.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await call('/me',demoCookie)).json()).user.emailVerified,true);
  }
  const view=await (await call('/admin/email',owner)).json();assert.equal(view.localOutbox.length,6);assert.equal(view.deliveries.length,6);
  assert.ok(view.deliveries.every(d=>d.status==='local'&&!d.to.includes('user-DE')));
});

test('SMTP failure is recorded without secrets; resend fails visibly and never verifies an account',async t=>{
  const {call,owner,control}=await fixture(t,{demo:false,fail:true});
  const draft={...defaultEmailSettings(),mode:'smtp',host:'smtp.example.test',username:'test',password:'SMTP_SECRET',currentPassword:password};
  assert.equal((await call('/admin/email',owner,draft)).status,200);
  assert.equal((await call('/admin/email/verify',owner,{...draft,revision:1})).status,502);
  const r=await call('/auth/register',null,{email:'user@example.test',password,companyName:'Test',country:'SI'}),cookie=r.headers.get('set-cookie').split(';')[0];assert.equal(r.status,201);
  assert.equal((await call('/auth/resend-verification',cookie,{})).status,503);
  assert.equal((await (await call('/me',cookie)).json()).verificationDelivery,'failed');
  assert.equal((await (await call('/me',cookie)).json()).user.emailVerified,false);
  const view=await (await call('/admin/email',owner)).json();assert.equal(view.deliveries[0].status,'failed');assert.equal(view.deliveries[0].code,'EAUTH');assert.deepEqual(view.localOutbox,[]);
  assert.ok(!JSON.stringify(view).includes('SMTP_SECRET'));assert.ok(!JSON.stringify((await control.read()).emailDeliveries).includes('?verify='));
});

test('password reset and password change notifications follow the registered company country',async t=>{
  const {call,mailer}=await fixture(t);
  const register=await call('/auth/register',null,{email:'reset@example.test',password,companyName:'Example',country:'SI'});
  assert.equal(register.status,201);
  await call('/auth/forgot-password',null,{email:'reset@example.test'});
  const reset=mailer.outbox.at(-1);assert.ok(reset.html.includes('<html lang="sl">'));assert.ok(reset.subject.includes('ponastavitev'));
  const token=reset.text.match(/[?]reset=([a-f0-9]{64})/)[1];
  assert.equal((await call('/auth/reset-password',null,{token,password:'new-password-for-test'})).status,200);
  assert.ok(mailer.outbox.at(-1).subject.includes('geslo spremenjeno'));assert.ok(mailer.outbox.at(-1).html.includes('<html lang="sl">'));
  assert.equal((await call('/auth/reset-password',null,{token,password:'another-password-test'})).status,400);
});
