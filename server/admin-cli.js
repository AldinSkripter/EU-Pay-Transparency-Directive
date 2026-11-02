import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { MemoryStore, PostgresStore } from './store.js';
import { runtimeControl, controlAudit } from './control-store.js';
import { addOwner } from './owner-auth.js';
import { hashToken } from './auth.js';

const production=process.env.NODE_ENV==='production';
const store=process.env.DATABASE_URL?new PostgresStore(process.env.DATABASE_URL):new MemoryStore();
try{
  const control=await runtimeControl(store,production);
  if(process.argv.includes('--setup')){
    const token=randomBytes(32).toString('hex');
    await control.mutate(s=>{if(s.owners.length)throw new Error('Owner already exists. Use admin:create for server-side recovery.');s.setup={tokenHash:hashToken(token),expiresAt:Date.now()+1800_000};controlAudit(s,'server-cli','owner_setup_link_created');});
    console.log('One-time owner setup link (expires in 30 minutes; do not share):');
    console.log(`${production?'https://equitensa.de':'http://127.0.0.1:3000'}/admin#setup=${token}`);
  }else{
    if(!process.stdin.isTTY)throw new Error('Run admin:create in an interactive terminal.');
    let muted=false;
    const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
    const rl=createInterface({input:process.stdin,output,terminal:true});
    try{
      const email=await rl.question('Owner email: ');
      process.stdout.write('Owner password (14+ characters, hidden): ');muted=true;const password=await rl.question('');muted=false;process.stdout.write('\n');
      process.stdout.write('Confirm password (hidden): ');muted=true;const confirm=await rl.question('');muted=false;process.stdout.write('\n');
      if(password!==confirm)throw new Error('Passwords do not match.');
      await addOwner(control,email,password);console.log('Owner created. Sign in at /admin; enroll MFA for production access.');
    }finally{muted=false;rl.close();}
  }
}catch(e){console.error(['INVALID_OWNER','EMAIL_EXISTS'].includes(e.message)?e.message:e.code||e.message);process.exitCode=1;}finally{await store.close();}
