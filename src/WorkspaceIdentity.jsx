import React,{useEffect,useState} from 'react';
import CompanyProfile from './CompanyProfile';
import {api} from './ui';
import {Building2,Settings2} from 'lucide-react';
import {Logo} from './ui';
import ModuleSwitcher from './ModuleSwitcher';
import './workspace-identity.css';
import './invoice-inspector.css';

export default function WorkspaceIdentity({company,active,L,onHome}) {
  const [brand,setBrand]=useState({displayName:company.name,logo:''}),[open,setOpen]=useState(false);
  useEffect(()=>{let live=true;api('/company/brand').then(r=>{if(live)setBrand(r.brand);}).catch(()=>{});return()=>{live=false;};},[company.id]);
  return <div className="eq-workspace-identity">
    <div className="eq-brand-row"><Logo onClick={onHome}/><span className="eq-product-label">{active==='finance'?'FINANCE':'PAY'}</span></div>
    <button className="eq-company-card" onClick={()=>setOpen(true)} aria-label={L('Firmenprofil bearbeiten','Uredi profil podjetja')}><span className="eq-company-icon">{brand.logo?<img src={brand.logo} alt=""/>:<Building2 size={20}/>}</span><div><strong title={brand.displayName}>{brand.displayName}</strong><small>{company.country} · EUR</small></div><Settings2 size={15}/></button>
    {open&&<CompanyProfile company={company} brand={brand} L={L} onClose={()=>setOpen(false)} onSaved={setBrand}/>}
    <ModuleSwitcher active={active} L={L}/>
  </div>;
}
