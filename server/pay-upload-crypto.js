import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export function seal(key,aad,bytes){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(aad));return Buffer.concat([iv,c.update(bytes),c.final(),c.getAuthTag()]);}
export function unseal(key,aad,bytes){if(bytes.length<28)throw Error('IMPORT_UPLOAD_CORRUPTED');const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAAD(Buffer.from(aad));d.setAuthTag(bytes.subarray(-16));return Buffer.concat([d.update(bytes.subarray(12,-16)),d.final()]);}
export async function* uploadChunks({dir,key,companyId,id,chunks}){
 for(let index=0;index<chunks.length;index++){
  const bytes=unseal(Buffer.from(key),`${companyId}:${id}:${index}`,await readFile(join(dir,`${index}.enc`)));
  if(bytes.length!==chunks[index].size)throw Error('IMPORT_UPLOAD_CORRUPTED');
  yield bytes;
 }
}
