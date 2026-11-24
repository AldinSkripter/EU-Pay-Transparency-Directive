// Development diagnostics only: web cookie sessions, NOT native mobile auth.
const origin=process.env.EQUITENSA_TEST_ORIGIN||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('This script is restricted to local synthetic demos.');
for(const country of ['DE','AT','SI']){
 let cookie='';
 const call=async(path,body)=>{
  const response=await fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];
  const data=await response.json();if(!response.ok)throw Error(`${path}: ${response.status} ${data.error}`);return data;
 };
 try{
  const health=await call('/health');if(health.mode!=='demo')throw Error('Synthetic demo required');
  await call('/demo',{country});const me=await call('/me');if(me.company.country!==country)throw Error('Wrong jurisdiction');
  const finance=await call('/finance');if(finance.state.country!==country||finance.stage!=='development')throw Error('Invalid Finance context');
  await call('/analysis?year=2026');await call('/workflow?year=2026');await call('/company/brand');
  console.log(`${country}: session, company, Finance, Pay and branding OK (revision ${finance.state.revision})`);
 }finally{if(cookie)await call('/auth/logout',{});}
}
