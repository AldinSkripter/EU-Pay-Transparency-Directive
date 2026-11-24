import React,{useState} from 'react';
import ModuleOverview from './ModuleOverview';
import {ArrowUpRight,ChartNoAxesCombined,Receipt} from 'lucide-react';
import './module-switcher.css';
export default function ModuleSwitcher({active,L}){
 const [overview,setOverview]=useState(false);
  return <><div className="eq-modules eq-sidebar-modules" aria-label={L('Arbeitsbereich wechseln','Zamenjaj delovni prostor')}><span className="eq-modules-label">EQUITENSA SUITE</span><div><a href="/" aria-current={active==='pay'?'page':undefined}><ChartNoAxesCombined size={17}/><span>Pay<small>{L('Entgelttransparenz','Preglednost plačil')}</small></span>{active==='pay'?<i/>:<ArrowUpRight size={14}/>}</a><a href="/finance" aria-current={active==='finance'?'page':undefined}><Receipt size={17}/><span>Finance<small>{L('Rechnungen & Belege','Računi in dokumenti')}</small></span>{active==='finance'?<i/>:<ArrowUpRight size={14}/>}</a></div><button type="button" className="eq-module-manage" onClick={()=>setOverview(true)}>{L('Module & Pakete','Moduli in paketi')}<ArrowUpRight size={12}/></button></div>{overview&&<ModuleOverview L={L} onClose={()=>setOverview(false)}/>}</>;
}
