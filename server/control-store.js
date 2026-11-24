import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const empty = () => ({ owners: [], sessions: {}, settings: null, revision: 0, audit: [], suspended: {}, lastWebhook: null });
export function encryptControl(document, key) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('equitensa:platform-control:v1'));
  const body=Buffer.concat([cipher.update(JSON.stringify(document),'utf8'),cipher.final()]);
  return ['v1',iv.toString('hex'),body.toString('base64'),cipher.getAuthTag().toString('hex')].join('.');
}
export function decryptControl(value, key) {
  const [version,iv,body,tag]=value.split('.');
  if(version!=='v1')throw new Error('INVALID_CONTROL_VERSION');
  const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));
  cipher.setAAD(Buffer.from('equitensa:platform-control:v1'));cipher.setAuthTag(Buffer.from(tag,'hex'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body,'base64')),cipher.final()]).toString('utf8'));
}
export function controlAudit(state, actor, action, details={}) {
  state.audit.push({id:randomUUID(),actor,action,details,created_at:new Date().toISOString()});
}
export class MemoryControlStore {
  state=empty(); queue=Promise.resolve();
  async read() { await this.queue; return structuredClone(this.state); }
  async mutate(fn) {
    const operation=this.queue.then(async()=>{const draft=structuredClone(this.state);const result=await fn(draft);this.state=draft;return result;});
    this.queue=operation.catch(()=>{});return operation;
  }
}
export class FileControlStore {
  constructor(path,key) { this.path=resolve(path);this.key=key; }
  async read() { try{return decryptControl(await readFile(this.path,'utf8'),this.key);}catch(e){if(e.code==='ENOENT')return empty();throw e;} }
  async mutate(fn) {
    await mkdir(dirname(this.path),{recursive:true,mode:0o700});
    const lockPath=this.path+'.lock';let lock;
    for(let n=0;n<100;n++){try{lock=await open(lockPath,'wx',0o600);break;}catch(e){if(e.code!=='EEXIST' && !(process.platform==='win32' && ['EPERM','EACCES'].includes(e.code)))throw e;await new Promise(r=>setTimeout(r,50));}}
    if(!lock)throw new Error('CONTROL_STORE_BUSY');
    const temporary=this.path+'.'+randomUUID()+'.tmp';
    try{const state=await this.read(),result=await fn(state);await writeFile(temporary,encryptControl(state,this.key),{mode:0o600,flag:'wx'});await rename(temporary,this.path);return result;}
    finally{await unlink(temporary).catch(()=>{});await lock.close();await unlink(lockPath);}
  }
}
export class PostgresControlStore {
  constructor(pool,key) { this.pool=pool;this.key=key; }
  async read() {const row=(await this.pool.query('SELECT ciphertext FROM platform_control WHERE id=1')).rows[0];return row?decryptControl(row.ciphertext,this.key):empty();}
  async mutate(fn) {
    const client=await this.pool.connect();
    try{await client.query('BEGIN');await client.query('INSERT INTO platform_control(id,ciphertext) VALUES(1,$1) ON CONFLICT DO NOTHING',[encryptControl(empty(),this.key)]);
      const row=(await client.query('SELECT ciphertext FROM platform_control WHERE id=1 FOR UPDATE')).rows[0];
      const state=decryptControl(row.ciphertext,this.key),result=await fn(state);
      await client.query('UPDATE platform_control SET ciphertext=$1,updated_at=now() WHERE id=1',[encryptControl(state,this.key)]);await client.query('COMMIT');return result;
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
}
export async function runtimeControl(store,production,env=process.env) {
  let key;
  if(env.ADMIN_ENCRYPTION_KEY){if(!/^[a-f0-9]{64}$/i.test(env.ADMIN_ENCRYPTION_KEY))throw new Error('INVALID_ADMIN_ENCRYPTION_KEY');key=Buffer.from(env.ADMIN_ENCRYPTION_KEY,'hex');}
  else if(production || store.pool)throw new Error('ADMIN_ENCRYPTION_KEY_REQUIRED');
  else {
    const keyPath=resolve('var/admin.key');await mkdir(dirname(keyPath),{recursive:true,mode:0o700});
    try{await writeFile(keyPath,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
    key=await readFile(keyPath);if(key.length!==32)throw new Error('INVALID_ADMIN_ENCRYPTION_KEY');
  }
  return store.pool?new PostgresControlStore(store.pool,key):new FileControlStore('var/admin.enc',key);
}
