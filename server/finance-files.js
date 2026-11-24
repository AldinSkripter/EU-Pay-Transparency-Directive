import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import PDFDocument from 'pdfkit';
import {readEinvoiceXml} from './finance-xml-reader.js';

const fail=()=>{throw Object.assign(new Error('FINANCE_INVALID_ATTACHMENT'),{status:400});};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validateFinanceAttachment(body){
  if(typeof body.filename!=='string'||!body.filename.trim()||body.filename.length>200||typeof body.data!=='string'||body.data.length>2800000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data))fail();
  const bytes=Buffer.from(body.data,'base64');if(!bytes.length||bytes.length>2000000)fail();let mime,extension;
  if(bytes.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(Math.max(0,bytes.length-1024)).includes(Buffer.from('%%EOF'))){mime='application/pdf';extension='pdf';}
  else if(/^(?:\uFEFF)?\s*</.test(bytes.toString('utf8'))){try{readEinvoiceXml(bytes);mime='application/xml';extension='xml';}catch{fail();}}
  else {
    if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){mime='image/png';extension='png';if(bytes.length<24||bytes.readUInt32BE(16)>6000||bytes.readUInt32BE(20)>6000||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>12000000)fail();}
    else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){mime='image/jpeg';extension='jpg';}
    else fail();
    try{const doc=new PDFDocument({autoFirstPage:false});doc.resume();const image=doc.openImage(bytes);doc.end();if(image.width>6000||image.height>6000||image.width*image.height>12000000||image.width<1||image.height<1)fail();}catch{fail();}
  }
  return {bytes,filename:body.filename.trim().replace(/[\\/\x00-\x1f]/g,'_'),mime,extension,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export class FinanceFileVault {
  constructor({key,demo=false,root=fileURLToPath(new URL('../var/finance-files/',import.meta.url))}){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('FINANCE_FILE_KEY_REQUIRED');this.key=createHash('sha256').update(key).update('finance-file-v1').digest();this.root=demo?join(root,'demo-'+createHash('sha256').update(key).digest('hex').slice(0,16)):root;}
  path(companyId,id){if(!uuid.test(companyId)||!uuid.test(id))throw Error('FINANCE_INVALID_FILE_ID');return join(this.root,companyId,id+'.enc');}
  async put(companyId,attachment){const id=randomUUID(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(companyId+'\0'+id));const encrypted=Buffer.concat([cipher.update(attachment.bytes),cipher.final()]);const path=this.path(companyId,id);await mkdir(join(this.root,companyId),{recursive:true,mode:0o700});await writeFile(path,Buffer.concat([Buffer.from('EQF1'),iv,cipher.getAuthTag(),encrypted]),{flag:'wx',mode:0o600});return {id,filename:attachment.filename,mime:attachment.mime,extension:attachment.extension,size:attachment.size,sha256:attachment.sha256};}
  async get(companyId,file){const raw=await readFile(this.path(companyId,file.id));if(raw.subarray(0,4).toString()!=='EQF1')throw Error('FINANCE_FILE_CORRUPTED');const decipher=createDecipheriv('aes-256-gcm',this.key,raw.subarray(4,16));decipher.setAAD(Buffer.from(companyId+'\0'+file.id));decipher.setAuthTag(raw.subarray(16,32));const bytes=Buffer.concat([decipher.update(raw.subarray(32)),decipher.final()]);if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('FINANCE_FILE_CORRUPTED');return bytes;}
  async discard(companyId,id){await unlink(this.path(companyId,id)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
