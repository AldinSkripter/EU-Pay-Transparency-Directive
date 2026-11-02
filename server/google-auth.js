import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify,customFetch} from 'jose';
import {hashToken,verifyPassword,establishSession,sessionToken} from './auth.js';
import {defaultGoogle,googleForRequest} from './google-config.js';
import {markets} from './market.js';

const random=()=>randomBytes(32).toString('hex');
const cookieName='equitensa_google';
const cookieOptions=secure=>({httpOnly:true,secure,sameSite:'lax',path:'/api/auth/google',maxAge:600_000});
function browserToken(req){return (req.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';}
function binding(req){return hashToken(browserToken(req));}
export function googleRoutes(app,{store,control,secure,authLimit,googleFetch=fetch}) {
  const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{[customFetch]:googleFetch,timeoutDuration:10_000});
  const config=async()=>((await control.read()).google||defaultGoogle());
  const valid=async(req,flow)=>{
    const current=await config();
    if(!flow || current.revision!==flow.revision || !googleForRequest(current,req,secure))throw new Error('GOOGLE_FLOW_EXPIRED');
    return current;
  };
  const pending=async req=>{
    const flow=await store.authFlow(hashToken(browserToken(req)),binding(req));
    await valid(req,flow);
    if(flow.type!=='pending')throw new Error('GOOGLE_FLOW_EXPIRED');
    return flow;
  };
  app.post('/api/auth/google/start',authLimit,async(req,res)=>{
    const current=await config(),redirectUri=googleForRequest(current,req,secure);
    if(!redirectUri)return res.status(409).json({error:'GOOGLE_UNAVAILABLE'});
    const {intent='login',plan='prepare',interval='annual',country=req.marketContext.country}=req.body;
    if(!['login','signup'].includes(intent)||!['prepare','growth','scale'].includes(plan)||!['monthly','annual'].includes(interval)||!markets[country])return res.status(400).json({error:'INVALID_REGISTRATION'});
    const state=random(),browser=random(),nonce=random(),verifier=randomBytes(32).toString('base64url');
    await store.saveAuthFlow(hashToken(state),hashToken(browser),{type:'authorization',revision:current.revision,redirectUri,nonce,verifier,intent,plan,interval,country});
    res.cookie(cookieName,browser,cookieOptions(secure));
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:current.clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString();
    res.json({url:url.href});
  });
  app.get('/api/auth/google/callback',authLimit,async(req,res)=>{
    try {
      if(typeof req.query.state!=='string'||!/^\w{64}$/.test(req.query.state))throw new Error('GOOGLE_FLOW_EXPIRED');
      const flow=await store.authFlow(hashToken(req.query.state),binding(req),true);
      const current=await valid(req,flow);
      if(flow.type!=='authorization'||flow.redirectUri!==googleForRequest(current,req,secure))throw new Error('GOOGLE_FLOW_EXPIRED');
      if(req.query.error)throw new Error('GOOGLE_CANCELLED');
      if(typeof req.query.code!=='string'||req.query.code.length>4096)throw new Error('GOOGLE_INVALID_IDENTITY');
      const response=await googleFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:current.clientId,client_secret:current.clientSecret,code:req.query.code,code_verifier:flow.verifier,redirect_uri:flow.redirectUri,grant_type:'authorization_code'}),signal:AbortSignal.timeout(10_000)});
      if(!response.ok)throw new Error('GOOGLE_INVALID_IDENTITY');
      const tokens=await response.json();
      const {payload}=await jwtVerify(tokens.id_token,jwks,{algorithms:['RS256'],issuer:['https://accounts.google.com','accounts.google.com'],audience:current.clientId,requiredClaims:['sub','exp','iat','nonce','email','email_verified'],maxTokenAge:'10m'});
      if(payload.nonce!==flow.nonce || payload.email_verified!==true || typeof payload.sub!=='string' || !payload.sub || payload.sub.length>255 || typeof payload.email!=='string'||payload.email.length>255||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || (payload.azp && payload.azp!==current.clientId))throw new Error('GOOGLE_INVALID_IDENTITY');
      // Recheck the revision after the external network calls.
      await valid(req,flow);
      const user=await store.findGoogleUser(payload.sub);
      if(user){
        if((await control.read()).suspended[user.company_id])throw new Error('COMPANY_SUSPENDED');
        const old=sessionToken(req);if(old)await store.deleteSession(hashToken(old));
        await establishSession(store,res,user.id,secure);
        res.clearCookie(cookieName,cookieOptions(secure));
        return res.redirect('/?'+new URLSearchParams({google:'success',intent:flow.intent,plan:flow.plan,interval:flow.interval}));
      }
      // A verified matching email alone never attaches a Google identity to an existing tenant.
      const token=random();
      await store.saveAuthFlow(hashToken(token),hashToken(token),{...flow,type:'pending',sub:payload.sub,email:payload.email.toLowerCase()});
      res.cookie(cookieName,token,cookieOptions(secure));
      res.redirect('/?google=complete');
    } catch(error) {
      res.clearCookie(cookieName,cookieOptions(secure));
      const safe=['GOOGLE_CANCELLED','GOOGLE_FLOW_EXPIRED','COMPANY_SUSPENDED'].includes(error.message)?error.message:'GOOGLE_INVALID_IDENTITY';
      res.redirect('/?'+new URLSearchParams({google:'error',reason:safe}));
    }
  });
  app.get('/api/auth/google/pending',authLimit,async(req,res)=>{
    try {const flow=await pending(req);res.json({email:flow.email,existingAccount:!!await store.findUser(flow.email),country:flow.country,intent:flow.intent,plan:flow.plan,interval:flow.interval});}
    catch {res.status(409).json({error:'GOOGLE_FLOW_EXPIRED'});}
  });
  app.post('/api/auth/google/complete',authLimit,async(req,res)=>{
    try {
      const flow=await pending(req),existing=await store.findUser(flow.email);
      if(existing){
        if(req.body.link!==true || typeof req.body.password!=='string' || req.body.password.length>128 || !await verifyPassword(req.body.password,existing.password_hash))return res.status(401).json({error:'GOOGLE_LINK_PASSWORD_REQUIRED'});
        if(existing.google_sub && existing.google_sub!==flow.sub)return res.status(409).json({error:'GOOGLE_IDENTITY_EXISTS'});
        if((await control.read()).suspended[existing.company_id])return res.status(403).json({error:'COMPANY_SUSPENDED'});
      }else if(typeof req.body.companyName!=='string' || !req.body.companyName.trim() || req.body.companyName.length>255 || !markets[req.body.country])return res.status(400).json({error:'INVALID_REGISTRATION'});
      await valid(req,flow);
      if(!await store.authFlow(hashToken(browserToken(req)),binding(req),true))throw new Error('GOOGLE_FLOW_EXPIRED');
      let user=existing;
      if(existing)await store.attachGoogle(existing.id,flow.sub);
      else {
        const company={id:randomUUID(),name:req.body.companyName.trim(),country:req.body.country};
        user={id:randomUUID(),company_id:company.id,email:flow.email,password_hash:null,google_sub:flow.sub,role:'hr_manager'};
        await store.createAccount(company,user);
      }
      const old=sessionToken(req);if(old)await store.deleteSession(hashToken(old));
      await establishSession(store,res,user.id,secure);res.clearCookie(cookieName,cookieOptions(secure));
      await store.audit(user.company_id,existing?'google_identity_linked':'google_account_created',{user_id:user.id});
      res.json({ok:true,intent:flow.intent,plan:flow.plan,interval:flow.interval});
    }catch(error){res.status(409).json({error:['EMAIL_EXISTS','GOOGLE_IDENTITY_EXISTS'].includes(error.message)?error.message:'GOOGLE_FLOW_EXPIRED'});}
  });
}
