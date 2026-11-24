import React from 'react';
import {Languages} from 'lucide-react';
export default function FinanceLanguage({value,onChange,L}){
  return <label className="finance-language"><Languages size={16}/><select aria-label={L('Sprache der Oberfläche','Jezik vmesnika')} value={value} onChange={e=>onChange(e.target.value)}><option value="auto">{L('Sprache nach Firmenland','Jezik glede na državo')}</option><option value="de">Deutsch</option><option value="sl">Slovenščina</option></select></label>;
}
