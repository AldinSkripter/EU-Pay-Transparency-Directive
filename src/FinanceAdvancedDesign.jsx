import {columnOptions,defaultColumns} from '../shared/invoice-columns';
import React from 'react';
export default function FinanceAdvancedDesign({design,setDesign,L}) {
  return <div className="fi-advanced"><h4>{L('Feinschliff für Ihr Dokument','Podrobnosti dokumenta')}</h4>
    <fieldset className="fi-columns"><legend>{L('Tabellenspalten','Stolpci tabele')}</legend>{columnOptions.map(([key,de,sl])=><label key={key}><input type="checkbox" checked={(design.columns||defaultColumns).includes(key)} disabled={['description','total'].includes(key)} onChange={e=>setDesign('columns',e.target.checked?[...(design.columns||defaultColumns),key]:(design.columns||defaultColumns).filter(k=>k!==key))}/>{L(de,sl)}</label>)}</fieldset>
    <label className="fq-toggle"><input type="checkbox" checked={design.paymentQr===true} onChange={e=>setDesign('paymentQr',e.target.checked)}/><span>{L('QR für Banküberweisung','QR za bančno plačilo')}</span></label>
    <p>{L('DE / AT: EPC · SI: UPN QR. Benötigt gültige Bank- und Firmendaten. Entwürfe und Demo enthalten nur einen nicht zahlbaren Testcode.','DE / AT: EPC · SI: UPN QR. Potrebni so veljavni bančni podatki in podatki podjetja. Osnutki in demo vsebujejo le neplačljivo testno kodo.')}</p>
    <label className="field"><span>{L('QR-Position im PDF','Položaj QR v PDF')}</span><select value={design.qrPosition||'right'} onChange={e=>setDesign('qrPosition',e.target.value)}><option value="left">{L('Links','Levo')}</option><option value="right">{L('Rechts','Desno')}</option></select></label>
    <label className="fd-slider"><span>{L('Titelgröße','Velikost naslova')}<b>{design.titleSize||24} pt</b></span><input type="range" min="18" max="36" value={design.titleSize||24} onChange={e=>setDesign('titleSize',Number(e.target.value))}/></label>
    <label className="field"><span>{L('Titelausrichtung','Poravnava naslova')}</span><select value={design.titleAlign||'left'} onChange={e=>setDesign('titleAlign',e.target.value)}>{[['left',L('Links','Levo')],['center',L('Zentriert','Sredina')],['right',L('Rechts','Desno')]].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <label className="field"><span>{L('Tabellenkopf','Glava tabele')}</span><select value={design.tableStyle||'soft'} onChange={e=>setDesign('tableStyle',e.target.value)}>{[['soft',L('Sanfte Farbfläche','Nežna barva')],['plain',L('Weiß / minimal','Bela / minimalna')],['contrast',L('Markenfarbe / Kontrast','Barva znamke / kontrast')]].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
  </div>;
}
