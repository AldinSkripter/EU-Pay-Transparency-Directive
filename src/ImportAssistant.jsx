import React,{useState} from 'react';
import {Sparkles,CircleAlert,TriangleAlert,Info,CircleCheck,RotateCcw,Check} from 'lucide-react';
import {Button,Tag,Notice,CheckField,errorText} from './ui';
import {describeFinding,genderLabels,assistantErrors} from './import-quality-text';

const icon={error:<CircleAlert size={17}/>,warning:<TriangleAlert size={17}/>,info:<Info size={17}/>};
const MAX_SHOWN=8;

// Corrections the user has chosen so far, in the shape the server expects (empty entries left out).
export const serializeFixes=fixes=>{
  const out={};
  if(fixes.normalizeNumbers)out.normalizeNumbers=true;
  if(fixes.emptyBonusAsZero)out.emptyBonusAsZero=true;
  if(Object.keys(fixes.categoryMap||{}).length)out.categoryMap=fixes.categoryMap;
  if(Object.keys(fixes.genderMap||{}).length)out.genderMap=fixes.genderMap;
  if(Object.keys(fixes.multiply||{}).length)out.multiply=fixes.multiply;
  if(fixes.excludeRows?.length)out.excludeRows=fixes.excludeRows;
  if(fixes.edits?.length)out.edits=fixes.edits;
  return Object.keys(out).length?out:undefined;
};
export const countFixes=fixes=>{const s=serializeFixes(fixes)||{};return (s.normalizeNumbers?1:0)+(s.emptyBonusAsZero?1:0)+Object.keys(s.categoryMap||{}).length+Object.keys(s.genderMap||{}).length+Object.keys(s.multiply||{}).length+(s.excludeRows?.length||0)+(s.edits?.length||0);};

function RowEdit({finding,fixes,setFixes,L,label}) {
  const [draft,setDraft]=useState({});
  const edited=row=>fixes.edits?.find(e=>e.row===row&&e.field===finding.field)?.value;
  const save=cell=>{
    const value=(draft[cell.row]??cell.value).trim();
    setFixes(f=>({...f,edits:[...(f.edits||[]).filter(e=>!(e.row===cell.row&&e.field===finding.field)),{row:cell.row,field:finding.field,value}]}));
  };
  return <div className="table-scroll"><table className="quality-rows"><thead><tr><th>{L('Zeile','Vrstica')}</th><th>{label(finding.field)}</th><th/></tr></thead><tbody>{finding.cells.slice(0,MAX_SHOWN).map(cell=><tr key={cell.row}><td>{cell.row}</td><td><input aria-label={`${label(finding.field)} ${cell.row}`} value={draft[cell.row]??cell.value} onChange={e=>setDraft(d=>({...d,[cell.row]:e.target.value}))}/></td><td><Button secondary onClick={()=>save(cell)}>{edited(cell.row)!==undefined?<Check size={14}/>:null}{L('Übernehmen','Uporabi')}</Button></td></tr>)}</tbody></table></div>;
}

function Finding({finding,L,label,fixes,setFixes,decimalSeparator,setDecimalSeparator}) {
  const [gender,setGender]=useState(()=>Object.fromEntries((finding.values||[]).map(v=>[v.value,v.suggestion||''])));
  const [factor,setFactor]=useState(12);
  const genders=genderLabels(L),fix=finding.fix;
  const rows=finding.rows||[];
  const listing=rows.length?`${L('Zeilen','Vrstice')} ${rows.join(', ')}${finding.count>rows.length?` … (+${finding.count-rows.length})`:''}`:'';
  return <li className={`quality-item ${finding.severity}`}>
    <div className="quality-head">{icon[finding.severity]}<p>{describeFinding(finding,L,label)}</p></div>
    {listing&&<small className="muted">{listing}</small>}
    {fix?.type==='normalizeNumbers'&&<Button secondary disabled={fixes.normalizeNumbers} onClick={()=>setFixes(f=>({...f,normalizeNumbers:true}))}>{L('Zahlen automatisch bereinigen','Samodejno počisti števila')}</Button>}
    {fix?.type==='decimalSeparator'&&<Button secondary onClick={()=>setDecimalSeparator(fix.value)}>{fix.value===','?L('Komma als Dezimaltrennzeichen verwenden','Uporabi vejico kot decimalno ločilo'):L('Punkt als Dezimaltrennzeichen verwenden','Uporabi piko kot decimalno ločilo')}</Button>}
    {fix?.type==='emptyBonusAsZero'&&<Button secondary disabled={fixes.emptyBonusAsZero} onClick={()=>setFixes(f=>({...f,emptyBonusAsZero:true}))}>{L('Leere Felder als 0 werten','Prazna polja obravnavaj kot 0')}</Button>}
    {fix?.type==='excludeRows'&&<Button secondary onClick={()=>setFixes(f=>({...f,excludeRows:[...new Set([...(f.excludeRows||[]),...fix.rows])]}))}>{L(`Diese ${fix.rows.length} Zeilen ausschließen`,`Izključi teh ${fix.rows.length} vrstic`)}</Button>}
    {fix?.type==='multiply'&&<div className="button-row"><label className="field inline-field"><span>{L('Zahlungen pro Jahr','Plačil na leto')}</span><select value={factor} onChange={e=>setFactor(Number(e.target.value))}>{fix.factors.map(x=><option key={x} value={x}>{x}</option>)}</select></label><Button secondary onClick={()=>setFixes(f=>({...f,multiply:{...f.multiply,[fix.field]:factor}}))}>{L(`Beträge × ${factor} rechnen`,`Zneske pomnoži × ${factor}`)}</Button></div>}
    {finding.code==='GENDER_UNKNOWN'&&<div className="quality-gender">{finding.values.map(v=><label className="field" key={v.value}><span>„{v.value}“ · {v.count}×</span><select value={gender[v.value]??''} onChange={e=>setGender(g=>({...g,[v.value]:e.target.value}))}><option value="">{L('Zuordnung wählen','Izberite')}</option>{Object.entries(genders).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>)}<Button secondary disabled={!Object.values(gender).some(Boolean)} onClick={()=>setFixes(f=>({...f,genderMap:{...f.genderMap,...Object.fromEntries(Object.entries(gender).filter(([,code])=>code))}}))}>{L('Zuordnung übernehmen','Uporabi dodelitev')}</Button></div>}
    {finding.code==='CATEGORY_SIMILAR'&&<div className="quality-groups">{finding.groups.map(group=><div key={group.to} className="quality-group"><span>{[group.to,...group.from].map(l=>`„${l}“ (${group.counts[l]})`).join(' + ')} → <strong>{group.to}</strong></span><Button secondary disabled={group.from.every(l=>fixes.categoryMap?.[l]===group.to)} onClick={()=>setFixes(f=>({...f,categoryMap:{...f.categoryMap,...Object.fromEntries(group.from.map(l=>[l,group.to]))}}))}>{L('Zusammenführen','Združi')}</Button></div>)}</div>}
    {finding.code==='MAPPING_MISSING'&&finding.suggestions?.length>0&&<div className="quality-groups">{finding.suggestions.map(s=><div key={s.field} className="quality-group"><span>{L('Inhalt der Spalte','Vsebina stolpca')} „{s.column}“ {L('passt zu','ustreza polju')} <strong>{label(s.field)}</strong></span><Button secondary onClick={()=>s.apply(s)}>{L('Zuordnen','Poveži')}</Button></div>)}</div>}
    {finding.cells?.length>0&&finding.field&&!['GENDER_UNKNOWN'].includes(finding.code)&&<RowEdit finding={finding} fixes={fixes} setFixes={setFixes} L={L} label={label}/>}
  </li>;
}

function Suggestions({result,L,label,mapping,setMapping,fixes,setFixes}) {
  if(!result.mapping.length&&!result.categories.length)return <Notice>{L('Der KI-Assistent hat nichts Zusätzliches gefunden.','Pomočnik z umetno inteligenco ni našel ničesar dodatnega.')}</Notice>;
  return <div className="quality-ai">
    {result.mapping.map(m=><div className="quality-group" key={m.field}><span><Tag>KI</Tag> {L('Spalte','Stolpec')} „{m.column}“ → <strong>{label(m.field)}</strong>{m.reason&&<small className="muted"> · {m.reason}</small>}</span><Button secondary disabled={mapping[m.field]===m.column} onClick={()=>setMapping(x=>({...x,[m.field]:m.column}))}>{L('Zuordnen','Poveži')}</Button></div>)}
    {result.categories.map(g=><div className="quality-group" key={g.to}><span><Tag>KI</Tag> {[g.to,...g.from].map(l=>`„${l}“ (${g.counts[l]})`).join(' + ')} → <strong>{g.to}</strong>{g.reason&&<small className="muted"> · {g.reason}</small>}</span><Button secondary disabled={g.from.every(l=>fixes.categoryMap?.[l]===g.to)} onClick={()=>setFixes(f=>({...f,categoryMap:{...f.categoryMap,...Object.fromEntries(g.from.map(l=>[l,g.to]))}}))}>{L('Zusammenführen','Združi')}</Button></div>)}
    {result.categories.length>0&&<small className="muted">{L('Ob Tätigkeiten gleich oder gleichwertig sind, entscheiden Sie (Art. 4). Ein Vorschlag der KI ist keine Entscheidung.','Ali so dela enaka ali enakovredna, odločate vi (člen 4). Predlog umetne inteligence ni odločitev.')}</small>}
  </div>;
}

export default function ImportAssistant({L,quality,pending,error,fixes,setFixes,mapping,setMapping,decimalSeparator,setDecimalSeparator,fieldLabel,assistantAvailable,runAssistant,busy}) {
  const [consent,setConsent]=useState(false),[asking,setAsking]=useState(false),[result,setResult]=useState(null),[assistError,setAssistError]=useState(null);
  if(!quality)return pending?<p className="muted">{L('Daten werden geprüft …','Preverjanje podatkov …')}</p>:null;
  const {summary,findings}=quality,applied=countFixes(fixes);
  const withApply=findings.map(f=>f.code==='MAPPING_MISSING'?{...f,suggestions:(f.suggestions||[]).map(s=>({...s,apply:x=>setMapping(m=>({...m,[x.field]:x.column}))}))}:f);
  const ask=async()=>{setAsking(true);setAssistError(null);try{setResult(await runAssistant());}catch(e){setAssistError(e);}finally{setAsking(false);}};
  const messages=assistantErrors(L);
  return <section className="quality-panel" aria-live="polite">
    <div className="panel-title"><div><span className="eyebrow">{L('DATENQUALITÄT','KAKOVOST PODATKOV')}</span><h3>{summary.ready?L('Die Daten sind bereit für den Import','Podatki so pripravljeni za uvoz'):L('Das sollten Sie vor dem Import beheben','To odpravite pred uvozom')}</h3></div>{summary.ready?<CircleCheck size={24}/>:<Sparkles size={24}/>}</div>
    <div className="tag-row"><Tag tone={summary.errors?'amber':'mint'}>{summary.errors} {L('Fehler','napak')}</Tag><Tag>{summary.warnings} {L('Hinweise','opozoril')}</Tag><Tag>{summary.info} {L('Infos','informacij')}</Tag><Tag>{summary.rows} {L('Zeilen','vrstic')}{summary.excluded?` (−${summary.excluded})`:''}</Tag>{pending&&<Tag>{L('wird geprüft …','preverjanje …')}</Tag>}</div>
    {error&&<Notice tone="error">{errorText(error,L)}</Notice>}
    {applied>0&&<Notice tone="success">{L(`${applied} Korrekturen werden beim Import angewendet. Die Originaldatei bleibt unverändert und wird nicht gespeichert.`,`Pri uvozu se uporabi ${applied} popravkov. Izvirna datoteka ostane nespremenjena in se ne shrani.`)} <Button secondary onClick={()=>setFixes({})}><RotateCcw size={14}/>{L('Zurücksetzen','Ponastavi')}</Button></Notice>}
    {!findings.length&&<Notice tone="success">{L('Keine Auffälligkeiten gefunden.','Ni najdenih nepravilnosti.')}</Notice>}
    {findings.length>0&&<ul className="quality-list">{withApply.map((f,i)=><Finding key={`${f.code}-${f.field||''}-${i}`} finding={f} L={L} label={fieldLabel} fixes={fixes} setFixes={setFixes} decimalSeparator={decimalSeparator} setDecimalSeparator={setDecimalSeparator}/>)}</ul>}
    {assistantAvailable&&<div className="quality-ai-box">
      <h4><Sparkles size={16}/> {L('KI-Assistent','Pomočnik z umetno inteligenco')}</h4>
      <p>{L('Erkennt Spalten und Kategorien, die die automatischen Prüfungen nicht erkennen (z. B. andere Bezeichnungen oder Sprachen). Es sind nur Vorschläge; Sie bestätigen jeden einzelnen.','Prepozna stolpce in kategorije, ki jih samodejni pregledi ne prepoznajo (npr. drugačne oznake ali jeziki). To so samo predlogi; vsakega potrdite sami.')}</p>
      <CheckField disabled={busy||asking} checked={consent} onChange={e=>setConsent(e.target.checked)}>{L('Ich stimme zu, dass für diese Anfrage Spaltenüberschriften, Spaltenstatistiken (gerundet) und die Bezeichnungen der Tätigkeiten und Kategorien mit Häufigkeit an den KI-Dienst (Anthropic) gesendet werden. Nicht gesendet werden Personalnummern, einzelne Gehälter und Spalten mit persönlichen Daten.','Soglašam, da se za to zahtevo storitvi umetne inteligence (Anthropic) pošljejo naslovi stolpcev, zaokrožene statistike stolpcev ter nazivi del in kategorij s pogostostjo. Ne pošljejo se šifre zaposlenih, posamezne plače in stolpci z osebnimi podatki.')}</CheckField>
      <Button secondary disabled={!consent||busy} busy={asking} onClick={ask}><Sparkles size={15}/>{L('KI-Vorschläge holen','Pridobi predloge')}</Button>
      {assistError&&<Notice tone="error">{messages[assistError.message]||errorText(assistError,L)}</Notice>}
      {result&&<Suggestions result={result} L={L} label={fieldLabel} mapping={mapping} setMapping={setMapping} fixes={fixes} setFixes={setFixes}/>}
    </div>}
  </section>;
}
