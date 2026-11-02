import { controlAudit } from './control-store.js';

export const googleRedirects = ['de','at','si'].map(tld=>`https://equitensa.${tld}/api/auth/google/callback`);
export const defaultGoogle = () => ({enabled:false,clientId:'',clientSecret:'',redirectUris:googleRedirects,revision:0});
export const googleView = config => ({enabled:config.enabled,clientId:config.clientId,clientSecretConfigured:!!config.clientSecret,redirectUris:config.redirectUris,revision:config.revision});
export function googleDraft(body,previous,demo) {
  if(typeof body.enabled!=='boolean' || typeof body.clientId!=='string' || body.clientId.length>255 || !Array.isArray(body.redirectUris) || body.redirectUris.length>12)throw new Error('INVALID_GOOGLE_SETTINGS');
  const clientId=body.clientId.trim(),clientSecret=body.clientSecret===''||body.clientSecret===undefined?previous.clientSecret:body.clientSecret;
  if(typeof clientSecret!=='string' || clientSecret.length>512 || /\s/.test(clientSecret))throw new Error('INVALID_GOOGLE_SETTINGS');
  if(body.redirectUris.some(value=>typeof value!=='string'))throw new Error('INVALID_GOOGLE_REDIRECT');
  const redirectUris=[...new Set(body.redirectUris.map(value=>value.trim()).filter(Boolean))];
  for(const value of redirectUris){
    let url;try{url=new URL(value);}catch{throw new Error('INVALID_GOOGLE_REDIRECT');}
    const production=url.protocol==='https:' && /^(www\.)?equitensa\.(de|at|si)$/.test(url.hostname) && !url.port;
    const local=demo && url.protocol==='http:' && ['localhost','127.0.0.1','localhost.at','localhost.si'].includes(url.hostname);
    if((!production&&!local)||url.username||url.password||url.search||url.hash||url.pathname!=='/api/auth/google/callback'||url.href!==value)throw new Error('INVALID_GOOGLE_REDIRECT');
  }
  if(body.enabled && (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)||!clientSecret||!redirectUris.length))throw new Error('GOOGLE_SETTINGS_INCOMPLETE');
  return {enabled:body.enabled,clientId,clientSecret,redirectUris,revision:previous.revision+1};
}
export function googleAdminRoutes(router,{control,demo,editable}) {
  router.get('/authentication',async(req,res)=>res.json(googleView((await control.read()).google||defaultGoogle())));
  router.post('/authentication',editable,async(req,res)=>{
    await control.mutate(state=>{
      const previous=state.google||defaultGoogle();
      if(req.body.revision!==previous.revision)throw new Error('SETTINGS_CHANGED');
      state.google=googleDraft(req.body,previous,demo);
      controlAudit(state,req.owner.email,'google_auth_settings_changed',{enabled:state.google.enabled,revision:state.google.revision});
    });res.json(googleView((await control.read()).google));
  });
}
export function googleForRequest(config,req,secure) {
  const redirectUri=`${secure?'https':'http'}://${req.get('host')}/api/auth/google/callback`;
  return config.enabled && config.clientId && config.clientSecret && config.redirectUris.includes(redirectUri)?redirectUri:null;
}
