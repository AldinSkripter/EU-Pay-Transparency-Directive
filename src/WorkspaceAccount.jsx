import InstallApp from './InstallApp';
import React from 'react';
import {LogOut,Settings2,UserRound} from 'lucide-react';
export default function WorkspaceAccount({user,L,onLogout,onSettings}){return <div className="eq-account-dock"><InstallApp L={L}/><div className="eq-account-person"><span><UserRound size={18}/></span><div><strong>{L('Ihr Konto','Vaš račun')}</strong><small title={user?.email}>{user?.email}</small></div>{onSettings&&<button onClick={onSettings} aria-label={L('Konto & Sicherheit','Račun in varnost')}><Settings2 size={17}/></button>}</div><button className="eq-signout" onClick={onLogout}><LogOut size={17}/><span>{L('Abmelden','Odjava')}</span><small>{L('Sitzung beenden','Končaj sejo')}</small></button></div>;}
