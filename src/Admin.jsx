import React,{useEffect,useMemo,useState,useRef} from 'react';
import {LayoutDashboard,Building2,CreditCard,Users,ScrollText,ShieldCheck,ArrowUpRight,Search,LogOut,Menu,X,KeyRound,RefreshCw,CheckCircle2,Languages} from 'lucide-react';
import {api,Logo,Button,Field,CheckField,Notice,Tag,plans} from './ui';
import './admin.css';
import GoogleSettings from './GoogleSettings';
import {AdminLang,useAdminLang,initialLang,saveLang,makeT,errorMessages,fallbackError} from './admin-i18n';

const icons={overview:LayoutDashboard,companies:Building2,payments:CreditCard,authentication:KeyRound,owners:Users,security:ShieldCheck,audit:ScrollText};
const pages=Object.keys(icons);

export default function Admin() {
  const [lang,setLangState]=useState(initialLang);
  const t=useMemo(()=>makeT(lang),[lang]);
  const setLang=next=>{saveLang(next);setLangState(next);};
  useEffect(()=>{document.documentElement.lang=lang;document.title=t('Equitensa · Administration');},[lang,t]);
  return <AdminLang.Provider value={{lang,t,setLang}}><AdminApp/></AdminLang.Provider>;
}

function LanguageSwitch() {
  const {lang,setLang,t}=useAdminLang();
  return <div className="admin-lang" role="group" aria-label={t('Language')}><Languages size={14}/>{['en','de'].map(code=><button key={code} type="button" className={lang===code?'selected':''} aria-pressed={lang===code} onClick={()=>setLang(code)}>{code.toUpperCase()}</button>)}</div>;
}

const useFormat=()=>{
  const {lang}=useAdminLang(),locale=lang==='de'?'de-DE':'en-IE';
  return {money:n=>new Intl.NumberFormat(locale,{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(n),date:v=>v?new Date(v).toLocaleString(locale):'—',number:n=>n.toLocaleString(locale)};
};
const useAdminError=()=>{const {t}=useAdminLang();return e=>t(errorMessages[e.message]||fallbackError);};

function AdminApp() {
  const {t}=useAdminLang(),adminError=useAdminError();
  const [session,setSession]=useState(null),[status,setStatus]=useState(null),[page,setPage]=useState('overview'),[mobile,setMobile]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(null),[notice,setNotice]=useState('');
  const [data,setData]=useState(null),[query,setQuery]=useState(''),[pagination,setPagination]=useState(1),[refresh,setRefresh]=useState(0);
  const [setupToken]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('setup')||'');
  const labels={overview:t('Platform overview'),companies:t('Companies & access'),payments:t('Stripe & billing'),authentication:t('Google sign-in'),owners:t('Owners & team'),security:t('Account security'),audit:t('Change log')};
  const descriptions={overview:t('Your companies, subscriptions and operations in one place.'),payments:t('Connect Stripe, check prices and manage billing.'),authentication:t('Allow customers to register and sign in with a Google account.'),companies:t('Review companies and manage access to the platform.'),owners:t('Owner accounts are separate from customer users.'),security:t('Protect the owner account and prepare recovery codes.'),audit:t('See who changed settings and access.')};
  useEffect(()=>{if(setupToken)history.replaceState({},'','/admin');},[]);
  const loadSession=async()=>{const result=await api('/admin/me');setSession(result);if(result.mfaRequired)setPage('security');return result;};
  useEffect(()=>{let live=true;Promise.all([api('/admin/auth/status'),api('/admin/me').catch(e=>{if(e.message==='OWNER_AUTH_REQUIRED')return null;throw e;})]).then(([status,me])=>{if(live){setStatus(status);setSession(me);if(me?.mfaRequired)setPage('security');}}).catch(e=>{if(live)setError(e);});return()=>{live=false;};},[]);
  useEffect(()=>{
    if(!session||page==='security')return;
    let live=true;setData(null);
    const path=`/admin/${page}${page==='companies'?`?q=${encodeURIComponent(query)}&page=${pagination}`:page==='audit'?`?page=${pagination}`:''}`;
    const timer=setTimeout(()=>api(path).then(d=>{if(live)setData(d);}).catch(e=>{if(live){setError(e);if(e.message==='OWNER_AUTH_REQUIRED')setSession(null);}}),page==='companies'?250:0);
    return()=>{live=false;clearTimeout(timer);};
  },[session,page,query,pagination,refresh]);
  const perform=async fn=>{setBusy(true);setError(null);setNotice('');try{await fn();}catch(e){setError(e);if(e.message==='OWNER_AUTH_REQUIRED')setSession(null);}finally{setBusy(false);}};
  const go=id=>{if(id!==page)setData(null);setPage(id);setPagination(1);setMobile(false);setError(null);setNotice('');};
  const reload=()=>setRefresh(r=>r+1);
  const logout=()=>perform(async()=>{await api('/admin/auth/logout',{});setSession(null);setData(null);});

  if(!status)return <div className="loading-page"><Logo/><p>{error?adminError(error):t('Preparing the owner panel…')}</p></div>;
  if(!session)return <div className="admin-login">
    <div className="admin-home"><Logo onClick={()=>location.assign('/')}/><LanguageSwitch/></div>
    <div className="admin-login-grid">
      <section className="admin-login-copy"><Tag tone="violet"><ShieldCheck size={14}/>EQUITENSA CONTROL</Tag><h1>{t('Your platform.')}<br/><em>{t('A clear view.')}</em></h1><p>{t('Manage billing, company access and your team from one owner panel.')}</p><div className="admin-login-points"><span><CreditCard size={18}/>{t('Stripe and packages')}</span><span><Building2 size={18}/>{t('Companies in three markets')}</span><span><ShieldCheck size={18}/>{t('Separate owner access')}</span></div><a href="/">{t('Open the public site')} <ArrowUpRight size={14}/></a></section>
      <section className="panel admin-login-form"><span className="eyebrow">OWNER ACCESS</span><h2>{status.initialized?t('Owner sign-in'):t('Set up the owner account')}</h2><p>{status.initialized?t('Use an owner account; customer sign-in is separate.'):t('The first owner is set up with a one-time link from the server.')}</p>
        {error&&<Notice tone="error">{adminError(error)}</Notice>}
        {!status.initialized&&!setupToken?<Notice>{t('On the server run')} <code>npm run admin:setup</code> {t('and open the one-time link it prints. The link is valid for 30 minutes.')}</Notice>
        :<form onSubmit={e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));perform(async()=>{await api(status.initialized?'/admin/auth/login':'/admin/auth/setup',status.initialized?body:{...body,token:setupToken});await loadSession();setStatus(s=>({...s,initialized:true}));});}}>
          <Field label={t('Owner email')} name="email" type="email" autoComplete="username" required maxLength={255}/>
          <Field label={t('Password')} name="password" type="password" autoComplete={status.initialized?'current-password':'new-password'} minLength={status.initialized?1:14} maxLength={128} required hint={!status.initialized?t('At least 14 characters.'):null}/>
          {status.initialized&&<Field label={t('2FA code (only if you turned 2FA on)')} name="code" autoComplete="one-time-code" maxLength={40} hint={t('Leave empty if two-factor sign-in is not turned on for this account. A recovery code also works here.')}/>}
          <Button type="submit" busy={busy}>{status.initialized?t('Sign in'):t('Create owner account')}<ArrowUpRight size={16}/></Button>
        </form>}
        {status.demo&&<small>{t('Local panel · customer data is test data. Owner settings are stored encrypted across restarts.')}</small>}
      </section>
    </div>
  </div>;

  const owner=session.owner,canWrite=owner.role==='owner';
  return <div className="admin-shell">
    {mobile&&<button className="admin-overlay" aria-label={t('Close menu')} onClick={()=>setMobile(false)}/>}
    <aside className={`admin-sidebar ${mobile?'open':''}`}><Logo onClick={()=>go('overview')}/><span className="admin-label">PLATFORM CONTROL</span>
      <nav>{pages.map(id=>{const Icon=icons[id];return <button key={id} className={page===id?'selected':''} disabled={session.mfaRequired&&id!=='security'} onClick={()=>go(id)}><Icon size={18}/>{labels[id]}</button>;})}</nav>
      <div className="admin-sidebar-bottom"><Tag tone="violet">{session.demo?t('LOCAL ENVIRONMENT'):t('PRODUCTION')}</Tag><strong>{owner.email}</strong><small>{canWrite?t('Owner · full access'):t('Auditor · read only')}</small><LanguageSwitch/><button onClick={logout}><LogOut size={16}/>{t('Sign out')}</button><a href="/">{t('Public site')} <ArrowUpRight size={14}/></a></div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar"><div><button className="admin-menu" onClick={()=>setMobile(!mobile)} aria-label={t('Menu')}>{mobile?<X/>:<Menu/>}</button><span>Equitensa <i>/</i> <strong>{labels[page]}</strong></span></div><span className="admin-secure"><ShieldCheck size={15}/>{owner.mfa?t('2FA on'):t('Owner access')}</span></header>
      <main className="admin-content">
        <div className="admin-page-heading"><div><span className="eyebrow">EQUITENSA / DE · AT · SI</span><h1>{labels[page]}</h1><p>{descriptions[page]}</p></div>{page!=='security'&&<Button secondary onClick={reload} busy={busy}><RefreshCw size={15}/>{t('Refresh')}</Button>}</div>
        {error&&<Notice tone="error">{adminError(error)}</Notice>}
        {notice&&<Notice>{notice}</Notice>}
        {session.mfaRequired&&<Notice>{t('In production, turn on two-factor sign-in first. Then sign in again.')}</Notice>}
        {page==='security'?<Security owner={owner} required={session.mfaRequired} busy={busy} perform={perform} onLogout={()=>setSession(null)} setNotice={setNotice}/>
        :!data?<div className="panel admin-loading">{t('Loading overview…')}</div>
        :page==='overview'?<Overview data={data} go={go}/>
        :page==='payments'?<Payments key={data.revision} data={data} busy={busy} perform={perform} canWrite={canWrite} demo={session.demo} onSaved={result=>{setData(result);setNotice(t('Settings saved and used immediately for new payments.'));reload();}} setNotice={setNotice}/>
        :page==='authentication'?<GoogleSettings key={data.revision} data={data} demo={session.demo} canWrite={canWrite} busy={busy} perform={perform} onSaved={result=>{setData(result);setNotice(t('Google settings saved. Check sign-in on every domain.'));reload();}}/>
        :page==='companies'?<Companies error={error} data={data} query={query} setQuery={v=>{setQuery(v);setPagination(1);}} page={pagination} setPage={setPagination} canWrite={canWrite} busy={busy} perform={perform} reload={reload}/>
        :page==='owners'?<Owners data={data} canWrite={canWrite} busy={busy} perform={perform} reload={reload}/>
        :<Audit data={data} page={pagination} setPage={setPagination}/>}
        <footer className="admin-footer">{t('Equitensa Control · Billing settings, owners and access · DE / AT / SI')}</footer>
      </main>
    </div>
  </div>;
}

function Overview({data,go}) {
  const {t}=useAdminLang(),{money,date,number}=useFormat();
  const active=data.subscriptions.filter(o=>['active','sandbox_active'].includes(o.status));
  // Only live subscriptions contribute to the monthly estimate.
  const monthly=active.filter(o=>o.mode==='stripe'&&o.stripe_environment==='live').reduce((n,o)=>{const p=plans.find(p=>p.id===o.plan);return n+(p?(o.interval==='annual'?p.annual/12:p.monthly)*o.count:0);},0);
  const stats=[[t('Companies'),data.companies,Building2],[t('Customer users'),data.users,Users],[t('Active subscriptions'),active.reduce((n,o)=>n+o.count,0),CreditCard],[t('Report snapshots'),data.snapshots,ScrollText]];
  const markets=[['DE',t('Germany'),'equitensa.de'],['AT',t('Austria'),'equitensa.at'],['SI',t('Slovenia'),'equitensa.si']];
  return <>
    <div className="admin-stat-grid">{stats.map(([label,value,Icon])=><article className="panel admin-stat" key={label}><div>{label}<Icon size={19}/></div><strong>{number(value)}</strong></article>)}</div>
    <div className="admin-overview-grid">
      <section className="panel"><div className="panel-title"><h2>{t('Billing and connection')}</h2><CreditCard size={23}/></div><Tag tone={data.payments.mode.startsWith('stripe')?'mint':'amber'}>{data.payments.mode.toUpperCase()}</Tag><div className="admin-revenue"><strong>{money(monthly)}</strong><span>{t('Monthly equivalent of active live Stripe subscriptions')}</span></div><p>{t('Estimate based on packages; not confirmed revenue or a report of invoiced amounts. Test subscriptions are excluded.')}</p><div className="admin-checks"><span><CheckCircle2 size={16}/>{data.payments.secretKeyConfigured?t('Stripe key saved'):t('Stripe key not entered')}</span><span><CheckCircle2 size={16}/>{data.payments.lastWebhook?t('Last webhook: {when}',{when:date(data.payments.lastWebhook.at)}):t('No webhook received yet')}</span></div><Button onClick={()=>go('payments')}>{t('Manage billing')}<ArrowUpRight size={16}/></Button></section>
      <section className="panel"><div className="panel-title"><h2>{t('Three markets. One platform.')}</h2><Building2 size={23}/></div>{markets.map(([code,name,domain])=><div className="admin-market-row" key={code}><span>{code}</span><div><strong>{name}</strong><small>{domain}</small></div><b>{data.byCountry[code]}</b></div>)}<Button secondary onClick={()=>go('companies')}>{t('Review companies')}<ArrowUpRight size={16}/></Button></section>
    </div>
    <section className="panel admin-operational"><ShieldCheck size={26}/><div><h3>{t('Access under control')}</h3><p>{t('Active owner accounts: {owners} · Blocked companies: {blocked}. Blocking access does not cancel the Stripe subscription; invoices and cancellation stay in Stripe.',{owners:data.owners,blocked:data.suspendedCount})}</p></div><Button secondary onClick={()=>go('owners')}>{t('Open team')}</Button></section>
  </>;
}

function Payments({data,busy,perform,canWrite,demo,onSaved,setNotice}) {
  const {t}=useAdminLang(),{money,date,number}=useFormat();
  const [draft,setDraft]=useState({...data,secretKey:'',webhookSecret:''}),[password,setPassword]=useState(''),[rotate,setRotate]=useState(false),[verified,setVerified]=useState(null);
  const edit=(key,value)=>{setDraft(d=>({...d,[key]:value}));setVerified(null);};
  const body=()=>({...draft,currentPassword:password,confirmRotation:rotate});
  return <div className="admin-payment-grid">
    <section className="panel"><span className="eyebrow">PAYMENT CONNECTION</span><h2>{t('Stripe settings')}</h2><p>{t('Keys are not returned to the browser after saving. An empty field keeps the existing key.')}</p>
      <form onSubmit={e=>{e.preventDefault();perform(async()=>{onSaved(await api('/admin/payments',body()));setPassword('');});}}>
        <fieldset disabled={!canWrite||busy}>
          <label className="field"><span>{t('Billing mode')}</span><select value={draft.mode} onChange={e=>edit('mode',e.target.value)}><option value="disabled">{t('Off · no new payments')}</option>{demo&&<option value="sandbox">{t('Local simulation · no Stripe')}</option>}<option value="stripe_test">{t('Stripe test · test cards')}</option>{!demo&&<option value="stripe_live">{t('Stripe live · real payments')}</option>}</select></label>
          <Field label={t('Stripe secret key')} type="password" autoComplete="off" value={draft.secretKey} placeholder={data.secretKeyConfigured?t('Key saved · enter a new one to replace it'):'sk_test_… / sk_live_…'} onChange={e=>edit('secretKey',e.target.value)} maxLength={512}/>
          <Field label={t('Webhook signing secret')} type="password" autoComplete="off" value={draft.webhookSecret} placeholder={data.webhookSecretConfigured?t('Webhook secret saved'):'whsec_…'} onChange={e=>edit('webhookSecret',e.target.value)} maxLength={512}/>
          <h3>{t('Package prices')}</h3><p>{t('In Stripe create six recurring EUR prices, without tax included. The amounts must match the public packages.')}</p>
          <div className="admin-price-fields">{plans.map(plan=><div className="admin-price-group" key={plan.id}><strong>{plan.name}</strong><Field label={t('Monthly · {amount}',{amount:money(plan.monthly)})} value={draft.prices[`${plan.id}_monthly`]} placeholder="price_…" maxLength={120} onChange={e=>edit('prices',{...draft.prices,[`${plan.id}_monthly`]:e.target.value})}/><Field label={t('Yearly · {amount}',{amount:money(plan.annual)})} value={draft.prices[`${plan.id}_annual`]} placeholder="price_…" maxLength={120} onChange={e=>edit('prices',{...draft.prices,[`${plan.id}_annual`]:e.target.value})}/></div>)}</div>
          <h3>{t('Moving on from test billing')}</h3><p>{t('You can archive test orders before switching to live. This removes their access to paid packages; test subscriptions in Stripe stay separate.')}</p>
          <Button secondary type="button" disabled={draft.mode!=='stripe_test'||!password} onClick={()=>perform(async()=>{const result=await api('/admin/payments/retire-tests',{confirm:true,currentPassword:password});setNotice(t('{count} test orders archived.',{count:result.count}));})}>{t('Archive test orders')}</Button>
          <h3>{t('Return domains')}</h3><p>{t('After paying, the customer returns to their own market.')}</p>
          {['DE','AT','SI'].map(code=><Field key={code} label={code} value={draft.returnOrigins[code]} onChange={e=>edit('returnOrigins',{...draft.returnOrigins,[code]:e.target.value})}/>)}
          <Field label={t('Your current owner password')} type="password" autoComplete="current-password" value={password} required onChange={e=>setPassword(e.target.value)}/>
          <CheckField checked={rotate} onChange={e=>setRotate(e.target.checked)}>{t('I confirm replacing the existing keys. The previous webhook secret stays accepted for 24 hours.')}</CheckField>
          <div className="button-row"><Button secondary type="button" onClick={()=>perform(async()=>{const result=await api('/admin/payments/verify',body());setVerified(result);setNotice(draft.mode.startsWith('stripe')?t('The Stripe account and all six prices were verified. The webhook is only confirmed once an event arrives.'):t('The chosen mode does not use Stripe.'));})}><KeyRound size={16}/>{t('Verify connection')}</Button><Button type="submit">{t('Save and apply')}</Button></div>
        </fieldset>
      </form>
      {verified?.account&&<Notice>{t('Verified account: {name} ({id}).',{name:verified.account.name,id:verified.account.id})}</Notice>}
    </section>
    <aside>
      <section className="panel admin-stripe-guide"><Tag tone="violet">SETUP GUIDE</Tag><h3>{t('From key to active package')}</h3><ol><li>{t('In the Stripe Dashboard choose test or live mode.')}</li><li>{t('Enter the secret key and the six price IDs.')}</li><li>{t('Create a webhook endpoint and enter its signing secret.')}</li><li>{t('Verify the connection and save the settings.')}</li><li>{t('Run a test checkout; the package activates after the signed webhook.')}</li></ol><a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">{t('Open the Stripe Dashboard')}<ArrowUpRight size={14}/></a></section>
      <section className="panel admin-plans"><h3>{t('Packages and prices')}</h3><small>{t('Stripe prices must carry exactly these net EUR amounts.')}</small>{plans.map(p=><div className="admin-plan-row" key={p.id}><strong>{p.name}</strong><span>{t('{amount} / month',{amount:money(p.monthly)})}</span><span>{t('{amount} / year',{amount:money(p.annual)})}</span><small>{t('up to {count} employees',{count:number(p.limit)})}</small></div>)}</section>
      <section className="panel admin-webhook"><h3>{t('Webhook endpoint')}</h3><code>https://equitensa.de/api/billing/webhook</code><small>{t('One endpoint for all three markets.')}</small><strong>{t('Subscribe the endpoint to:')}</strong><ul><li>checkout.session.completed</li><li>customer.subscription.updated</li><li>customer.subscription.deleted</li></ul><Tag tone={data.lastWebhook?'mint':'amber'}>{data.lastWebhook?t('EVENT RECEIVED'):t('WAITING FOR THE FIRST EVENT')}</Tag><small>{data.lastWebhook?`${data.lastWebhook.type} · ${date(data.lastWebhook.at)}`:t('Saving a key does not confirm the webhook by itself.')}</small></section>
      {data.account&&<section className="panel"><h3>{t('Saved account')}</h3><p>{data.account.name}</p><code>{data.account.id}</code><small>{t('Last verified: {when}',{when:date(data.verifiedAt)})}</small></section>}
    </aside>
  </div>;
}

function AdminDialog({children,onClose}) {
  const {t}=useAdminLang(),dialog=useRef(null);
  useEffect(()=>{const node=dialog.current;node.showModal();return()=>node.close();},[]);
  return <dialog ref={dialog} className="admin-dialog" aria-label={t('Manage access')} onCancel={onClose}>{children}</dialog>;
}
function Pager({page,setPage,total,size}) {
  const {t}=useAdminLang();
  return <div className="admin-pager"><span>{t('{total} results · page {page}',{total,page})}</span><div><Button secondary disabled={page<=1} onClick={()=>setPage(page-1)}>{t('Previous')}</Button><Button secondary disabled={page*size>=total} onClick={()=>setPage(page+1)}>{t('Next')}</Button></div></div>;
}

function Companies({error,data,query,setQuery,page,setPage,canWrite,busy,perform,reload}) {
  const {t}=useAdminLang(),adminError=useAdminError();
  const [selected,setSelected]=useState(null),[reason,setReason]=useState(''),[password,setPassword]=useState('');
  return <section className="panel">
    <div className="panel-title"><h2>{t('Customer companies')}</h2><label className="admin-search"><Search size={17}/><input aria-label={t('Search companies')} placeholder={t('Search by company name…')} value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    <div className="table-scroll"><table className="admin-table"><thead><tr><th>{t('Company')}</th><th>{t('Market')}</th><th>{t('Users / employees in snapshot')}</th><th>{t('Subscription')}</th><th>{t('Access')}</th><th/></tr></thead><tbody>{data.companies.map(c=><tr key={c.id}><td><strong>{c.name}</strong><small>{c.id}</small></td><td>{c.country}</td><td>{c.users} / {c.employees}{c.users>c.verified_users&&<small>{t('{count} without a verified email',{count:c.users-c.verified_users})}</small>}</td><td>{c.order?<><strong>{c.order.plan} · {c.order.interval}</strong><small>{c.order.mode} · {c.order.status}</small></>:t('No order')}</td><td><Tag tone={c.suspension?'amber':'mint'}>{c.suspension?t('Blocked'):t('Active')}</Tag></td><td>{canWrite&&<Button secondary onClick={()=>{setSelected(c);setReason('');setPassword('');}}>{c.suspension?t('Restore access'):t('Manage')}</Button>}</td></tr>)}</tbody></table></div>
    {!data.companies.length&&<div className="admin-empty">{t('No companies for this search.')}</div>}
    <Pager page={page} setPage={setPage} total={data.total} size={25}/>
    {selected&&<AdminDialog onClose={()=>setSelected(null)}><section className="panel"><button className="icon-btn admin-dialog-close" aria-label={t('Close')} onClick={()=>setSelected(null)}><X/></button><h2>{selected.suspension?t('Restore access'):t('Block access')}</h2><p>{t('{name}. Data is kept. This action does not cancel the subscription or stop Stripe billing.',{name:selected.name})}</p>{error&&<Notice tone="error">{adminError(error)}</Notice>}
      <form onSubmit={e=>{e.preventDefault();perform(async()=>{await api(`/admin/companies/${selected.id}/access`,{suspended:!selected.suspension,reason,currentPassword:password});setSelected(null);setPassword('');reload();});}}><Field label={t('Reason for the change')} value={reason} required={!selected.suspension} minLength={selected.suspension?0:5} maxLength={500} onChange={e=>setReason(e.target.value)}/><Field label={t('Owner password')} type="password" autoComplete="current-password" value={password} required onChange={e=>setPassword(e.target.value)}/><Button type="submit" busy={busy}>{selected.suspension?t('Restore access'):t('Confirm block')}</Button></form></section></AdminDialog>}
  </section>;
}

function Owners({data,canWrite,busy,perform,reload}) {
  const {t}=useAdminLang();
  const [selected,setSelected]=useState(null),[password,setPassword]=useState('');
  return <div className="admin-team-grid">
    <section className="panel"><h2>{t('Owner team')}</h2>{data.owners.map(o=><article className="admin-owner-row" key={o.id}><span className="admin-avatar">{o.email[0].toUpperCase()}</span><div><strong>{o.email}</strong><small>{o.role==='owner'?t('Owner'):t('Auditor')} · {o.mfa?t('2FA on'):t('2FA off')} · {o.enabled?t('Active'):t('Disabled')}</small></div>{canWrite&&<Button secondary onClick={()=>{setSelected(o);setPassword('');}}>{o.enabled?t('Disable'):t('Enable')}</Button>}</article>)}
      {selected&&<form className="admin-inline-form" onSubmit={e=>{e.preventDefault();perform(async()=>{await api(`/admin/owners/${selected.id}/access`,{enabled:!selected.enabled,currentPassword:password});setSelected(null);setPassword('');reload();});}}><p>{t('Access change: {email}. Active sessions of this account will be ended.',{email:selected.email})}</p><Field label={t('Your owner password')} type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/><div className="button-row"><Button type="submit" busy={busy}>{t('Confirm')}</Button><Button secondary type="button" onClick={()=>setSelected(null)}>{t('Cancel')}</Button></div></form>}
    </section>
    {canWrite&&<section className="panel"><h2>{t('Add a team member')}</h2><p>{t('An owner manages the platform; an auditor sees overviews and the change log without making changes. Hand the initial password to the team member securely.')}</p>
      <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,body=Object.fromEntries(new FormData(form));perform(async()=>{await api('/admin/owners',body);form.reset();reload();});}}><Field label={t('Member email')} name="email" type="email" required maxLength={255}/><label className="field"><span>{t('Role')}</span><select name="role"><option value="auditor">{t('Auditor · read only')}</option><option value="owner">{t('Owner · full access')}</option></select></label><Field label={t('Member initial password')} name="password" type="password" autoComplete="new-password" required minLength={14} maxLength={128}/><Field label={t('Your current owner password')} name="currentPassword" type="password" autoComplete="current-password" required maxLength={128}/><Button type="submit" busy={busy}>{t('Create account')}</Button></form></section>}
  </div>;
}

function Security({owner,required,busy,perform,onLogout,setNotice}) {
  const {t}=useAdminLang();
  const [password,setPassword]=useState(''),[enrollment,setEnrollment]=useState(null),[code,setCode]=useState(''),[backups,setBackups]=useState(null);
  const intro=owner.mfa?t('On. When signing in, use the code from your authenticator or one recovery code.')
    :required?t('Required in production. Connect an authenticator such as 1Password, Google or Microsoft Authenticator.')
    :t('Not turned on and not required. You can sign in with your password alone; for extra security connect an authenticator.');
  return <div className="admin-security-grid">
    <section className="panel"><span className="large-icon"><ShieldCheck size={28}/></span><h2>{t('Two-factor sign-in')}</h2><p>{intro}</p>
      {backups?<><Notice>{t('Keep these codes somewhere safe. Each works once. Sessions were ended; sign in again.')}</Notice><div className="admin-backups">{backups.map(c=><code key={c}>{c}</code>)}</div><Button onClick={onLogout}>{t('Codes saved · open sign-in')}</Button></>
      :!owner.mfa?<><Field label={t('Your current owner password')} type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/>
        {!enrollment?<Button busy={busy} onClick={()=>perform(async()=>setEnrollment(await api('/admin/auth/mfa/start',{currentPassword:password})))}>{t('Prepare authenticator')}</Button>
        :<><p>{t('In your authenticator add a time-based code (TOTP) and enter this key. The setup is valid for 10 minutes.')}</p><code className="admin-mfa-secret">{enrollment.secret}</code><a href={enrollment.uri}>{t('Open in authenticator')}<ArrowUpRight size={14}/></a><Field label={t('Six-digit code')} inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={e=>setCode(e.target.value)}/><Button busy={busy} onClick={()=>perform(async()=>{const r=await api('/admin/auth/mfa/confirm',{code});setBackups(r.backupCodes);setPassword('');setCode('');setEnrollment(null);})}>{t('Confirm and turn on 2FA')}</Button></>}</>
      :<Tag tone="mint">{t('2FA ON')}</Tag>}
    </section>
    <section className="panel"><h2>{t('Change password')}</h2><p>{t('Changing the password ends all owner sessions of this account.')}</p>
      <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,body=Object.fromEntries(new FormData(form));perform(async()=>{await api('/admin/auth/password',body);form.reset();setNotice(t('Password changed. Sign in again.'));onLogout();});}}><Field label={t('Current password')} name="currentPassword" type="password" autoComplete="current-password" required maxLength={128}/><Field label={t('New password')} name="password" type="password" autoComplete="new-password" minLength={14} maxLength={128} required/><Button busy={busy} type="submit">{t('Change password')}</Button></form>
      <div className="admin-recovery-note"><KeyRound size={19}/><p>{t('If you lose your password or your authenticator and recovery codes, an authorised server administrator can reset the password and turn 2FA off with')} <code>npm run admin:reset</code>.</p></div>
    </section>
  </div>;
}

function Audit({data,page,setPage}) {
  const {t}=useAdminLang(),{date}=useFormat();
  return <section className="panel"><h2>{t('Owner activity log')}</h2><p>{t('Sign-ins, owners, billing and access changes are recorded. The log never contains Stripe keys or passwords.')}</p><div className="table-scroll"><table className="admin-table"><thead><tr><th>{t('Time')}</th><th>{t('Who')}</th><th>{t('Action')}</th><th>{t('Context')}</th></tr></thead><tbody>{data.events.map(e=><tr key={e.id}><td>{date(e.created_at)}</td><td>{e.actor}</td><td><code>{e.action}</code></td><td><small>{Object.entries(e.details).map(([k,v])=>`${k}: ${v}`).join(' · ')||'—'}</small></td></tr>)}</tbody></table></div><Pager page={page} setPage={setPage} total={data.total} size={30}/></section>;
}
