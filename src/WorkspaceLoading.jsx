import React from 'react';
import {Logo} from './ui';

export default function WorkspaceLoading({L}){
 const translate=L||((de,sl)=>document.documentElement.lang.startsWith('sl')?sl:de);
 return <div className="loading-page" role="status" aria-live="polite" aria-busy="true"><Logo/><p>{translate('Ihr Arbeitsbereich wird vorbereitet …','Pripravljamo vaš delovni prostor …')}</p></div>;
}
