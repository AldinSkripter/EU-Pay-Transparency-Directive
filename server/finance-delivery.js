import nodemailer from 'nodemailer';
import {createHash,randomUUID} from 'node:crypto';
import {financeArchive} from './finance-archive.js';

const fail=(code,status=400)=>{throw Object.assign(new Error(code),{status});};
const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
export async function originalFiles(vault,companyId,document){
 if(document.status!=='issued'||!document.originals?.length)fail('FINANCE_ORIGINALS_REQUIRED',409);
 return Promise.all(document.originals.map(async file=>({...file,bytes:await vault.get(companyId,file)})));
}
export async function invoiceEmail(document,files,country,{recipient,subject,message}={}){
 const sl=country==='SI',to=recipient||document.customer.email;
 if(!email(to))fail('FINANCE_CUSTOMER_EMAIL_REQUIRED');
 const title=subject||(sl?'Račun ':'Rechnung ')+document.number;
 if(typeof title!=='string'||!title.trim()||title.length>200||/[\r\n]/.test(title)||message!==undefined&&(typeof message!=='string'||message.length>5000))fail('FINANCE_INVALID_INPUT');
 const amount=new Intl.NumberFormat(sl?'sl-SI':country==='AT'?'de-AT':'de-DE',{style:'currency',currency:'EUR'}).format(document.grossCents/100);
 const body=message||(sl?`Spoštovani,\n\nv prilogi je račun ${document.number} v znesku ${amount}. Rok plačila: ${document.dueDate}.\n\nLep pozdrav\n${document.issuer.name}`:`Guten Tag,\n\nanbei erhalten Sie die Rechnung ${document.number} über ${amount}. Fällig am ${document.dueDate}.\n\nFreundliche Grüße\n${document.issuer.name}`);
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows',disableFileAccess:true,disableUrlAccess:true});
 const result=await transport.sendMail({...(email(document.issuer.email)?{from:{name:document.issuer.name,address:document.issuer.email}}:{}),to:{address:to},subject:(document.demo?'[TEST] ':'')+title,text:(document.demo?(sl?'TESTNI DOKUMENT — ni veljaven račun.\n\n':'TESTDOKUMENT — keine produktive Rechnung.\n\n'):'')+body,headers:{'X-Unsent':'1'},attachments:files.map(f=>({filename:f.filename,content:f.bytes,contentType:f.mime}))});
 return result.message;
}
export async function invoiceBundle(document,files){
 const manifest={documentId:document.id,number:document.number,country:document.country,demo:!!document.demo,issuedAt:document.issuedAt,files:files.map(({bytes,...file})=>file)};
 const chunks=[];
 async function* entries(){yield {name:'manifest.json',bytes:Buffer.from(JSON.stringify(manifest,null,2))};for(const file of files)yield {name:file.filename,bytes:file.bytes};}
 await financeArchive(entries(),async chunk=>{chunks.push(chunk);});return Buffer.concat(chunks);
}
export function recordExternalDelivery(d,body,actor){
 if(d.status!=='issued'||d.kind!=='invoice'||!d.originals?.length)fail('FINANCE_ORIGINALS_REQUIRED',409);
 if(body.confirm!==true||!['email','portal','other'].includes(body.channel)||!email(body.recipient)||typeof body.reference!=='string'||!body.reference.trim()||body.reference.length>500)fail('FINANCE_INVALID_INPUT');
 const when=typeof body.sentAt==='string'?new Date(body.sentAt):new Date(NaN);
 if(!Number.isFinite(+when)||+when>Date.now()||+when<Date.parse(d.issuedAt))fail('FINANCE_INVALID_DATE');
 d.deliveries??=[];if(d.deliveries.length>=100)fail('FINANCE_RECORD_LIMIT');
 const event={id:randomUUID(),channel:body.channel,recipient:body.recipient,reference:body.reference.trim(),sentAt:when.toISOString(),recordedAt:new Date().toISOString(),recordedBy:actor,status:'externally_recorded',files:d.originals.map(f=>({id:f.id,sha256:f.sha256})),demo:!!d.demo};
 const fingerprint=createHash('sha256').update(JSON.stringify([event.channel,event.recipient,event.reference,event.sentAt])).digest('hex');
 const existing=d.deliveries.find(e=>e.fingerprint===fingerprint);if(existing)return existing;
 event.fingerprint=fingerprint;d.deliveries.push(event);return event;
}
