import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { MemoryStore, PostgresStore } from './store.js';
import { runtimeControl, controlAudit } from './control-store.js';
import { addOwner, resetOwner } from './owner-auth.js';
import { hashToken } from './auth.js';

const production=process.env.NODE_ENV==='production';
const store=process.env.DATABASE_URL?new PostgresStore(process.env.DATABASE_URL):new MemoryStore();
// Prompts on an interactive terminal; hidden answers are not echoed.
async function prompts(run) {
  if(!process.stdin.isTTY)throw new Error('Run this command in an interactive terminal.');
  let muted=false;
  const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
  const rl=createInterface({input:process.stdin,output,terminal:true});
  const ask=async(label,hidden=false)=>{process.stdout.write(hidden?`${label} (hidden): `:`${label}: `);muted=hidden;const answer=await rl.question('');muted=false;if(hidden)process.stdout.write('\n');return answer;};
  try{return await run(ask);}finally{muted=false;rl.close();}
}
const newPassword=async ask=>{const password=await ask('New password (14+ characters)',true),confirm=await ask('Confirm password',true);if(password!==confirm)throw new Error('Passwords do not match.');return password;};
try{
  const control=await runtimeControl(store,production);
  if(process.argv.includes('--setup')){
    const token=randomBytes(32).toString('hex');
    await control.mutate(s=>{if(s.owners.length)throw new Error('Owner already exists. Use admin:create for server-side recovery.');s.setup={tokenHash:hashToken(token),expiresAt:Date.now()+1800_000};controlAudit(s,'server-cli','owner_setup_link_created');});
    console.log('One-time owner setup link (expires in 30 minutes; do not share):');
    console.log(`${production?'https://equitensa.de':'http://127.0.0.1:3000'}/admin#setup=${token}`);
  }else if(process.argv.includes('--reset')){
    // Server-side recovery: needs shell access to the host, so it is the owner's break-glass path.
    await prompts(async ask=>{
      const email=await ask('Owner email');
      await resetOwner(control,email,await newPassword(ask),'server-cli');
      console.log('Password reset and 2FA turned off. All sessions of this owner were signed out; sign in at /admin.');
    });
  }else{
    await prompts(async ask=>{
      const email=await ask('Owner email');
      const password=await ask('Owner password (14+ characters)',true),confirm=await ask('Confirm password',true);
      if(password!==confirm)throw new Error('Passwords do not match.');
      await addOwner(control,email,password);console.log('Owner created. Sign in at /admin; 2FA is optional unless ADMIN_REQUIRE_MFA is on in production.');
    });
  }
}catch(e){console.error(['INVALID_OWNER','EMAIL_EXISTS','OWNER_NOT_FOUND'].includes(e.message)?e.message:e.code||e.message);process.exitCode=1;}finally{await store.close();}
