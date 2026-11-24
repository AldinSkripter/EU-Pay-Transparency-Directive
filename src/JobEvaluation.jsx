import React, { useEffect, useState } from 'react';
import { api, Field, TextField, CheckField, Notice, errorText } from './ui';
const keys = ['skills', 'effort', 'responsibility', 'conditions'];

export default function JobEvaluation({ L, year, value = {}, onChange, status }) {
  const [categories, setCategories] = useState([]), [error, setError] = useState(null);
  useEffect(() => { let live = true; api(`/employer-context?year=${year}`).then(result => { if (live) setCategories(result.categories); }).catch(e => { if (live) setError(e); }); return () => { live = false; }; }, [year]);
  const labels = { skills: L('Fähigkeiten', 'Spretnosti'), effort: L('Belastung', 'Napor'), responsibility: L('Verantwortung', 'Odgovornost'), conditions: L('Arbeitsbedingungen', 'Delovne razmere') };
  const edit = patch => onChange({ ...value, ...patch });
  const category = (name, patch) => edit({ categories: { ...value.categories, [name]: { ...value.categories?.[name], ...patch } } });
  const role = (name, title, patch) => {
    const existing = value.categories?.[name]?.roles || [];
    category(name, { roles: [...existing.filter(r => r.title !== title), { ...existing.find(r => r.title === title), title, ...patch }] });
  };
  return <section className="panel form-panel">
    <h3>{L('Bewertung und Nachweise der Gleichwertigkeit', 'Vrednotenje in dokazila enakovrednosti')} · Art. 4 / 10(4)</h3>
    {error && <Notice tone="error">{errorText(error, L)}</Notice>}
    {status && <Notice tone={status.ready?'success':'info'}>{status.ready?L('Gespeicherte Bewertungsangaben vollständig. Die fachliche Prüfung bleibt beim Arbeitgeber.','Shranjeni podatki vrednotenja so popolni. Strokovni pregled ostaja odgovornost delodajalca.'):L('Im gespeicherten Stand fehlen: ','V shranjenem stanju manjkajo: ')+status.missing.map(key=>({methodology:L('Verfahren / Methodik','Postopek / metodologija'),reference:L('Belegreferenz','Referenca dokazila'),assessedBy:L('Bewertet durch','Ocenil'),assessedOn:L('Bewertungsdatum','Datum vrednotenja'),genderNeutralConfirmed:L('Bestätigung der geschlechtsneutralen Anwendung','Potrditev spolno nevtralne uporabe'),weights:L('Gültige Gewichte (Summe 100 %)','Veljavne uteži (vsota 100 %)')})[key]||key).join(', ')}</Notice>}
    <Notice>{L('Verwenden Sie Ihre fachlich geprüfte Methode oder bewerten Sie Tätigkeiten mit den vier Faktoren. Die Punkteskala ist eine Arbeitshilfe, kein gesetzlicher Standard. Dokumentieren Sie die Zuordnung und Belege ohne Namen oder Personalnummern.', 'Uporabite strokovno preverjeno metodo ali ocenite delovna mesta s štirimi dejavniki. Točkovna lestvica je pripomoček, ne zakonski standard. Zabeležite razvrstitev in dokazila brez imen ali šifer zaposlenih.')}</Notice>
    <label className="field"><span>{L('Verfahren', 'Postopek')}</span><select value={value.mode || ''} onChange={e => edit({ mode: e.target.value, weights: Object.fromEntries(keys.map(key => [key, value.weights?.[key] ?? 25])) })}>
      <option value="">{L('Bitte wählen', 'Izberite')}</option><option value="documented">{L('Eigene / externe Methode dokumentieren', 'Dokumentirajte lastno / zunanjo metodo')}</option><option value="scored">{L('Vier Faktoren bewerten (1–5)', 'Ocenite štiri dejavnike (1–5)')}</option>
    </select></label>
    {value.mode && <>
      <TextField label={L('Methodik und objektive Bewertungsregeln', 'Metodologija in objektivna pravila vrednotenja')} value={value.methodology || ''} maxLength={3000} onChange={e => edit({ methodology: e.target.value })} />
      <Field label={L('Belegreferenz (Dokument, Version, Ablage)', 'Referenca dokazila (dokument, različica, lokacija)')} value={value.reference || ''} maxLength={1000} onChange={e => edit({ reference: e.target.value })} />
      <div className="form-grid"><Field label={L('Bewertet durch / Funktion', 'Ocenil / funkcija')} value={value.assessedBy || ''} maxLength={255} onChange={e => edit({ assessedBy: e.target.value })} /><Field label={L('Bewertungsdatum', 'Datum vrednotenja')} type="date" max={new Date().toISOString().slice(0, 10)} value={value.assessedOn || ''} onChange={e => edit({ assessedOn: e.target.value })} /></div>
      {value.mode === 'scored' && <><p>{L('Gewichte müssen zusammen 100 % ergeben und für alle Tätigkeiten gleich angewendet werden.', 'Uteži morajo skupaj znašati 100 % in se enako uporabljati za vsa delovna mesta.')}</p><div className="form-grid">{keys.map(key => <Field key={key} label={`${labels[key]} %`} type="number" min="0.01" max="100" step="any" value={value.weights?.[key] ?? ''} onChange={e => edit({ weights: { ...value.weights, [key]: e.target.value } })} />)}</div></>}
      {categories.map(group => {
        const entry = value.categories?.[group.category] || {};
        return <fieldset key={group.category}><legend>{group.category}</legend>
          <TextField label={L('Warum sind diese Tätigkeiten gleich oder gleichwertig?', 'Zakaj so ta delovna mesta enaka ali enakovredna?')} value={entry.rationale || ''} maxLength={3000} onChange={e => category(group.category, { rationale: e.target.value })} />
          <TextField label={L('Belege und Vergleichsgrundlage der Kategorie', 'Dokazila in primerjalna podlaga kategorije')} value={entry.evidence || ''} maxLength={3000} onChange={e => category(group.category, { evidence: e.target.value })} />
          {value.mode === 'scored' && group.titles.map(title => { const current = entry.roles?.find(r => r.title === title) || {}; return <fieldset key={title}><legend>{title}</legend><div className="form-grid">{keys.map(key => <Field key={key} type="number" min="1" max="5" step="any" label={`${labels[key]} (1–5)`} value={current.scores?.[key] ?? ''} onChange={e => role(group.category, title, { scores: { ...current.scores, [key]: e.target.value } })} />)}</div><TextField label={L('Begründung und Belege der Bewertung', 'Utemeljitev in dokazila vrednotenja')} value={current.evidence || ''} maxLength={3000} onChange={e => role(group.category, title, { evidence: e.target.value })} />{current.weightedScore != null && <p>{L('Gespeicherter Arbeitswert', 'Shranjena vrednost dela')}: {current.weightedScore} / 5</p>}</fieldset>; })}
        </fieldset>;
      })}
      <CheckField checked={value.genderNeutralConfirmed || false} onChange={e => edit({ genderNeutralConfirmed: e.target.checked })}>{L('Die Methode und ihre Anwendung sind objektiv und geschlechtsneutral. Relevante soziale Kompetenzen werden nicht unterbewertet. Die Kategoriezuordnung wurde fachlich geprüft.', 'Metoda in njena uporaba sta objektivni in spolno nevtralni. Ustrezne socialne spretnosti niso podcenjene. Razvrstitev je strokovno preverjena.')}</CheckField>
    </>}
  </section>;
}

export function RemediationProof({ L, value = {}, snapshotId, onChange }) {
  const edit = patch => onChange({ ...value, ...patch, targetSnapshotId: snapshotId });
  return <details><summary>{L('Durchführung und Wirksamkeit belegen', 'Dokažite izvedbo in učinkovitost')}</summary>
    <Notice>{L('„Behoben“ wird erst mit Datum, Beleg und dokumentierter Prüfung für den aktuellen Datenstand gespeichert. Beschreiben Sie auch den Vergleich vor/nach der Maßnahme.', 'Oznaka »Odpravljeno« se shrani šele z datumom, dokazilom in dokumentiranim preverjanjem trenutnega posnetka. Opišite tudi primerjavo pred ukrepom in po njem.')}</Notice>
    <div className="form-grid"><Field type="date" label={L('Umgesetzt am', 'Izvedeno dne')} value={value.completedOn || ''} onChange={e => edit({ completedOn: e.target.value })} /><Field type="date" label={L('Geprüft am', 'Preverjeno dne')} value={value.verifiedOn || ''} onChange={e => edit({ verifiedOn: e.target.value })} /></div>
    <TextField label={L('Umsetzungsbeleg / Referenz', 'Dokazilo o izvedbi / referenca')} maxLength={3000} value={value.evidence || ''} onChange={e => edit({ evidence: e.target.value })} />
    <Field label={L('Geprüft durch', 'Preveril')} maxLength={255} value={value.verifiedBy || ''} onChange={e => edit({ verifiedBy: e.target.value })} />
    <TextField label={L('Vorher/nachher, Ergebnis und Wirksamkeit', 'Pred/po, rezultat in učinkovitost')} maxLength={3000} value={value.verification || ''} onChange={e => edit({ verification: e.target.value })} />
    <Field label={L('Referenzdatenstand (optional)', 'Referenčni posnetek (neobvezno)')} maxLength={100} value={value.baselineSnapshotId || ''} onChange={e => edit({ baselineSnapshotId: e.target.value })} />
  </details>;
}
