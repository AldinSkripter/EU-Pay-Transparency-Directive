import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword, hashToken } from './auth.js';
import { controlAudit } from './control-store.js';

export const publicOwner = o => ({id:o.id,email:o.email,role:o.role,enabled:o.enabled,mfa:!!o.mfaSecret,created_at:o.created_at});
export function validOwner(email,password,role) {return typeof email==='string' && email.length<=255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && typeof password==='string' && password.length>=14 && password.length<=128 && ['owner','auditor'].includes(role);}
export async function addOwner(control,email,password,role='owner',actor='server-cli') {
  if(!validOwner(email,password,role))throw new Error('INVALID_OWNER');
  const owner={id:randomUUID(),email:email.trim().toLowerCase(),password_hash:await hashPassword(password),role,enabled:true,created_at:new Date().toISOString()};
  return control.mutate(state=>{if(state.owners.some(o=>o.email===owner.email))throw new Error('EMAIL_EXISTS');state.owners.push(owner);controlAudit(state,actor,'owner_created',{ownerId:owner.id,role});return publicOwner(owner);});
}
// Break-glass recovery used by the server CLI: new password, 2FA cleared, every session revoked.
export async function resetOwner(control,email,password,actor='server-cli') {
  if(typeof email!=='string'||typeof password!=='string'||password.length<14||password.length>128)throw new Error('INVALID_OWNER');
  const password_hash=await hashPassword(password),address=email.trim().toLowerCase();
  await control.mutate(s=>{
    const owner=s.owners.find(o=>o.email===address);if(!owner)throw new Error('OWNER_NOT_FOUND');
    owner.password_hash=password_hash;owner.enabled=true;
    delete owner.mfaSecret;delete owner.pendingMfa;delete owner.backupHashes;delete owner.lastMfaStep;
    revokeOwnerSessions(s,owner.id);controlAudit(s,actor,'owner_reset_by_cli',{ownerId:owner.id});
  });
}
export async function completeOwnerSetup(control,token,email,password) {
  if(!validOwner(email,password,'owner') || !/^[a-f0-9]{64}$/.test(token||''))throw new Error('INVALID_OWNER_SETUP');
  const owner={id:randomUUID(),email:email.trim().toLowerCase(),password_hash:await hashPassword(password),role:'owner',enabled:true,created_at:new Date().toISOString()};
  await control.mutate(s=>{
    if(s.owners.length || !s.setup || s.setup.expiresAt<=Date.now() || s.setup.tokenHash!==hashToken(token))throw new Error('INVALID_OWNER_SETUP');
    delete s.setup;s.owners.push(owner);controlAudit(s,owner.email,'owner_bootstrapped');
  });return publicOwner(owner);
}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function mfaSecret() {
  const bytes=randomBytes(20);let bits=0,value=0,result='';
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
  return result;
}
function base32(secret) {let bits=0,value=0;const result=[];for(const c of secret){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){result.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(result);}
export function totp(secret,time=Date.now()) {
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/30000)));
  const hash=createHmac('sha1',base32(secret)).update(counter).digest(),offset=hash[19]&15;
  return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
export function verifyTotp(secret,code,time=Date.now()) {
  if(!/^\d{6}$/.test(String(code||'')))return null;
  for(const delta of [-1,0,1]){const at=time+delta*30000;if(timingSafeEqual(Buffer.from(totp(secret,at)),Buffer.from(String(code))))return Math.floor(at/30000);}
  return null;
}
export function ownerToken(req) {
  const token=(req.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('equitensa_owner='))?.slice('equitensa_owner='.length);
  return /^[a-f0-9]{64}$/.test(token||'')?token:null;
}
export const ownerCookie = secure => ({path:'/api/admin',httpOnly:true,secure,sameSite:'strict',maxAge:3600_000});
export function revokeOwnerSessions(state,id) {for(const [hash,session] of Object.entries(state.sessions))if(session.ownerId===id)delete state.sessions[hash];}
export async function loginOwner(control,email,password,code) {
  const state=await control.read(),owner=state.owners.find(o=>o.email===String(email).trim().toLowerCase());
  const encoded=owner?.password_hash || '00000000000000000000000000000000:'+ '00'.repeat(64);
  if(!await verifyPassword(password,encoded) || !owner?.enabled)throw new Error('INVALID_OWNER_LOGIN');
  const step=owner.mfaSecret?verifyTotp(owner.mfaSecret,code):null;
  const backupHash=hashToken(String(code||''));
  const token=randomBytes(32).toString('hex');
  await control.mutate(s=>{
    const current=s.owners.find(o=>o.id===owner.id);
    if(!current?.enabled || current.password_hash!==encoded)throw new Error('INVALID_OWNER_LOGIN');
    if(current.mfaSecret){
      if(step!==null && step>(current.lastMfaStep||0))current.lastMfaStep=step;
      else if(current.backupHashes?.includes(backupHash))current.backupHashes=current.backupHashes.filter(v=>v!==backupHash);
      else throw new Error('INVALID_OWNER_LOGIN');
    }
    for(const [hash,session] of Object.entries(s.sessions))if(session.expiresAt<=Date.now())delete s.sessions[hash];
    s.sessions[hashToken(token)]={ownerId:owner.id,expiresAt:Date.now()+3600_000};
    controlAudit(s,owner.email,'owner_login');
  });return {token,owner:publicOwner(owner)};
}
