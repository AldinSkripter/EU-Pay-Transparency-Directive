import React,{useState} from 'react';
import ImportPanel from './ImportPanel';
import PayrollPanel from './PayrollPanel';
import {Button} from './ui';
export default function DataImport(props){const [mode,setMode]=useState('annual');return <><div className="import-mode-tabs"><Button disabled={props.busy} secondary={mode!=='annual'} onClick={()=>setMode('annual')}>{props.L('Jahresdaten importieren','Uvoz letnih podatkov')}</Button><Button disabled={props.busy} secondary={mode!=='monthly'} onClick={()=>setMode('monthly')}>{props.L('HR & Monatsabrechnungen','HR in mesečni obračuni')}</Button></div>{mode==='annual'?<ImportPanel {...props}/>:<PayrollPanel {...props}/>}</>;}
