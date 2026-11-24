import React,{useEffect,useRef,useState} from 'react';
import {LayoutDashboard,Focus,CalendarDays} from 'lucide-react';
export default function WorkspaceOverviewBar({module,L}){
 const root=useRef(null),key=`equitensa-view-${module}`;
 const [view,setView]=useState(()=>{try{return localStorage.getItem(key)==='focus'?'focus':'overview';}catch{return 'overview';}});
 useEffect(()=>{const shell=root.current?.closest('.workspace,.finance-shell');shell?.classList.toggle('eq-focus-view',view==='focus');try{localStorage.setItem(key,view);}catch{}return()=>shell?.classList.remove('eq-focus-view');},[view,key]);
 const date=new Intl.DateTimeFormat(L('de-DE','sl-SI'),{weekday:'long',day:'numeric',month:'long'}).format(new Date());
 return <section ref={root} className="eq-overview-bar"><div><span className="eq-live-dot"/><strong>{module==='finance'?'FINANCE':'PAY'} WORKSPACE</strong><span className="eq-view-date"><CalendarDays size={14}/>{date}</span></div><div role="group" aria-label={L('Dashboard-Ansicht','Pogled nadzorne plošče')}>{[['overview',LayoutDashboard,L('Übersicht','Pregled')],['focus',Focus,L('Fokus','Fokus')]].map(([id,Icon,label])=><button key={id} onClick={()=>setView(id)} aria-pressed={view===id}><Icon size={15}/>{label}</button>)}</div><p>{view==='focus'?L('Kennzahlen und nächste Schritte im Fokus. Diagramme sind ausgeblendet.','Kazalniki in naslednji koraki v ospredju. Grafikoni so skriti.'):L('Ihr Arbeitsbereich auf einen Blick. Ansicht wird in diesem Browser gespeichert.','Pregled delovnega prostora. Pogled se shrani v tem brskalniku.')}</p></section>;
}
