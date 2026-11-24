import React from 'react';
import {Field} from './ui';
import {dueDateFromTerm} from '../shared/invoice-terms.js';
export default function FinanceDocumentDetails({draft,setDraft,L}) {
  return <div className="fc-document-details"><Field label={L('Bestellnummer / Projektreferenz','Številka naročila / referenca projekta')} maxLength={120} value={draft.reference||''} onChange={e=>setDraft(d=>({...d,reference:e.target.value}))}/>
    <span>{L('Zahlungsziel ab Ausstellungsdatum','Rok plačila od datuma izdaje')}</span><div className="fc-term-options">{[0,7,14,30,60].map(days=><button type="button" key={days} disabled={!dueDateFromTerm(draft.issueDate,days)} aria-pressed={draft.dueDate===dueDateFromTerm(draft.issueDate,days)} onClick={()=>setDraft(d=>({...d,dueDate:dueDateFromTerm(d.issueDate,days)}))}>{days===0?L('Sofort','Takoj'):`${days} ${L('Tage','dni')}`}</button>)}</div><small>{L('Setzt das Fälligkeitsdatum. Individuelle Daten bleiben frei bearbeitbar.','Nastavi datum zapadlosti. Datume lahko še vedno uredite ročno.')}</small>
  </div>;
}
