import React,{useState} from 'react';
import {api,Button,Field,CheckField,Tag} from './ui';
import {useAdminLang} from './admin-i18n';
export default function GoogleSettings({data,demo,canWrite,busy,perform,onSaved}) {
  const {t}=useAdminLang();
  const [draft,setDraft]=useState({...data,clientSecret:''}),[password,setPassword]=useState('');
  const edit=(key,value)=>setDraft(d=>({...d,[key]:value}));
  return <div className="admin-payment-grid">
    <section className="panel"><span className="eyebrow">GOOGLE ACCOUNT CONNECTION</span><h2>{t('Google registration and sign-in')}</h2><p>{t('Let customers sign in with a Google account. Owner access stays protected by a separate account.')}</p><Tag tone={data.enabled?'mint':'amber'}>{data.enabled?t('ON'):t('OFF')}</Tag>
      <form onSubmit={e=>{e.preventDefault();perform(async()=>{onSaved(await api('/admin/authentication',{...draft,currentPassword:password}));setPassword('');});}}>
        <fieldset disabled={!canWrite||busy}>
          <CheckField checked={draft.enabled} onChange={e=>edit('enabled',e.target.checked)}>{t('Allow customers to register and sign in with Google')}</CheckField>
          <Field label="Google OAuth Client ID" value={draft.clientId} placeholder="…apps.googleusercontent.com" onChange={e=>edit('clientId',e.target.value)} maxLength={255}/>
          <Field label="Google OAuth Client Secret" type="password" autoComplete="off" value={draft.clientSecret} placeholder={data.clientSecretConfigured?t('Secret saved · an empty field keeps it'):t('Enter the Google client secret')} maxLength={512} onChange={e=>edit('clientSecret',e.target.value)}/>
          <p>{t('The secret is stored encrypted and is not returned to the browser after saving. A new entry replaces the previous secret.')}</p>
          <label className="field"><span>{t('Authorized redirect URIs · one address per line')}</span><textarea rows={demo?5:3} value={draft.redirectUris.join('\n')} onChange={e=>edit('redirectUris',e.target.value.split('\n'))}/><small>{t('The same addresses must be entered in the Google Cloud Console. Use the exact domain, including www if you use it.')}</small></label>
          {demo&&<Button secondary type="button" onClick={()=>edit('redirectUris',[...new Set([...draft.redirectUris,`${location.origin}/api/auth/google/callback`])])}>{t('Add the local redirect address')}</Button>}
          <Field label={t('Your current owner password')} type="password" autoComplete="current-password" value={password} required onChange={e=>setPassword(e.target.value)}/>
          <Button type="submit" busy={busy}>{t('Save and apply')}</Button>
        </fieldset>
      </form>
    </section>
    <aside>
      <section className="panel admin-stripe-guide"><h3>{t('Setting up in Google')}</h3><ol><li>{t('In the Google Cloud Console create a project and an OAuth consent screen for external users.')}</li><li>{t('Create an OAuth client ID of type Web application.')}</li><li>{t('Add all redirect addresses from this panel to the authorized redirect URIs.')}</li><li>{t('Enter the client ID and client secret, then turn sign-in on and save.')}</li><li>{t('While Google is in test mode, add test users. For public sign-in, publish the consent screen and complete the verification Google asks for.')}</li></ol><a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">{t('Open the Google Cloud Console')} ↗</a><p>{t('We only request openid, email and profile. Access to Gmail, contacts or Google Drive is not needed.')}</p></section>
      <section className="panel"><h3>{t('What the customer gets')}</h3><p>{t('A new user confirms the company and country. An existing account is only linked after its password is confirmed. The chosen package and billing period follow the user through Google sign-in.')}</p><p>{t('Turning it off removes new Google sign-ins; existing sessions stay active until they expire or the user signs out. For accounts that only use Google, restore a working Google configuration before their next sign-in.')}</p><p>{t('Saving the settings does not confirm a real Google sign-in. Check registration and the return from Google on every domain.')}</p></section>
    </aside>
  </div>;
}
