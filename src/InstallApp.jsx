import React,{useEffect,useState} from 'react';
import {Download,Check,ChevronDown} from 'lucide-react';
import {canInstall,promptInstall,subscribeInstall} from './pwa';
import './install-app.css';
export default function InstallApp({L}){
 const [ready,setReady]=useState(canInstall),[help,setHelp]=useState(false),[installed,setInstalled]=useState(()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true);
 useEffect(()=>{const unsubscribe=subscribeInstall(()=>setReady(canInstall()));const media=matchMedia('(display-mode: standalone)'),update=()=>setInstalled(media.matches||navigator.standalone===true),done=()=>setInstalled(true);media.addEventListener('change',update);window.addEventListener('appinstalled',done);return()=>{unsubscribe();media.removeEventListener('change',update);window.removeEventListener('appinstalled',done);};},[]);
 const install=async()=>{if(ready){try{if(await promptInstall())return;}catch{}}setHelp(v=>!v);};
 return <div className="eq-install"><button className="eq-install-button" onClick={install} disabled={installed} aria-expanded={help}>{installed?<Check size={16}/>:<Download size={16}/>}<span>{installed?L('App installiert','Aplikacija nameščena'):L('App installieren','Namesti aplikacijo')}</span>{!installed&&<ChevronDown size={13}/>}</button>{help&&!installed&&<div className="eq-install-help"><strong>Windows / Mac · Chrome / Edge</strong><p>{L('Im Browsermenü „App installieren“ wählen, falls verfügbar.','V meniju brskalnika izberite »Namesti aplikacijo«, če je na voljo.')}</p><strong>Mac · Safari</strong><p>{L('Teilen → Zum Dock hinzufügen.','Deli → Dodaj v Dock.')}</p><small>{L('Internetverbindung erforderlich. Die Installation gilt für diese Webadresse.','Potrebna je internetna povezava. Namestitev velja za ta spletni naslov.')}</small></div>}</div>;
}
