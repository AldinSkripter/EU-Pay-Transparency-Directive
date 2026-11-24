import {payImportLimits} from '../shared/pay-import-limits.js';
import React, { useEffect, useState } from 'react';
import { api, Button, Field, TextField, CheckField, Notice, download, errorText } from './ui';

const emptyCounts = () => ({ men: { fullTime: '', partTime: '' }, women: { fullTime: '', partTime: '' } });
const blank = () => ({ cycle: 'three', firstReport: true, counts: emptyCounts(), previousCounts: emptyCounts(), previousYear: '', equalityMeasures: '', equalityEffects: '', equalPayMeasures: '', confirmed: false, anonymityReviewed: false, csv: '' });
const atHeader = 'internal_id;pay_group;group_year;time_dependent_annual;time_independent_annual;fte_fraction;year_fraction';

export default function NationalReport({ L, country, year }) {
  const [data, setData] = useState(null), [form, setForm] = useState(blank), [busy, setBusy] = useState(false), [error, setError] = useState(null), [dirty, setDirty] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null); setError(null); setForm(blank()); setDirty(false);
    api(`/national-report?year=${year}`).then(result => {
      if (!live) return;
      setData(result);
      if (country === 'DE' && result.document) setForm({ ...blank(), ...result.document });
    }).catch(e => { if (live) setError(e); });
    return () => { live = false; };
  }, [country, year]);
  const edit = patch => { setForm(value => ({ ...value, ...patch })); setDirty(true); };
  const run = async action => { setBusy(true); setError(null); try { await action(); } catch (e) { setError(e); } finally { setBusy(false); } };
  const save = async () => {
    const result = await api('/national-report', { ...form, year });
    setData(current => ({ ...current, document: result.document })); setDirty(false);
    // Discard the uploaded source after successful calculation; only aggregates were saved.
    if (country === 'AT') setForm(blank());
  };
  const file = format => run(async () => {
    const response = await fetch('/api/national-report/document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, format }) });
    if (!response.ok) { const result = await response.json(); throw new Error(result.error); }
    download(await response.arrayBuffer(), `equitensa-${country}-${year}-national.${format}`, response.headers.get('content-type'));
  });
  const counts = (key, label) => <fieldset><legend>{label}</legend><div className="form-grid">
    {['men', 'women'].flatMap(sex => ['fullTime', 'partTime'].map(kind => <Field key={`${sex}-${kind}`} type="number" min="0" step="any" label={`${sex === 'men' ? 'Männer' : 'Frauen'} · ${kind === 'fullTime' ? 'Vollzeit' : 'Teilzeit'}`} value={form[key]?.[sex]?.[kind] ?? ''} onChange={e => edit({ [key]: { ...form[key], [sex]: { ...form[key]?.[sex], [kind]: e.target.value } } })} />))}
  </div></fieldset>;
  return <section className="panel form-panel">
    <h3>{L('Länderspezifischer Bericht', 'Nacionalno poročilo')} · {country}</h3>
    {error && <Notice tone="error">{errorText(error, L)}</Notice>}
    {!data ? <p>{L('Wird geladen …', 'Nalaganje …')}</p> : <>
      <p>{data.rule.scope}</p><a href={data.rule.source} target="_blank" rel="noreferrer">{L('Rechtsgrundlage', 'Pravna podlaga')} ↗</a>
      {country === 'SI' ? <Notice>Za slovensko poročilo izberite zgoraj »Poročilo (člen 9)«. Jezik in vsebina sledita državi podjetja. Uradna nacionalna predloga še ni potrjena; aplikacija ne označuje interne datoteke XML kot uradno slovensko shemo.</Notice> : <>
        {!data.snapshotId && <Notice>{L('Bitte zuerst Jahresdaten importieren.', 'Najprej uvozite letne podatke.')}</Notice>}
        <details><summary>Zusatzangaben für {data.rule.title}</summary>
          {country === 'DE' ? <>
            <Notice>Für berichtspflichtige Arbeitgeber nach § 21 EntgTranspG. Maßnahmen betreffen den gesamten Berichtszeitraum; durchschnittliche Beschäftigtenzahlen das letzte Kalenderjahr. Fehlende Maßnahmen begründen. Der Fünfjahreszyklus gilt nur bei erfüllten Voraussetzungen des § 22 Abs. 1.</Notice>
            <label className="field">Berichtszyklus<select value={form.cycle} onChange={e => edit({ cycle: e.target.value })}><option value="three">Drei Jahre (§ 22 Abs. 2)</option><option value="five">Fünf Jahre (§ 22 Abs. 1)</option></select></label>
            <TextField label="Maßnahmen zur Gleichstellung / Begründung fehlender Maßnahmen" maxLength={3000} value={form.equalityMeasures} onChange={e => edit({ equalityMeasures: e.target.value })} />
            <TextField label="Wirkungen der Gleichstellungsmaßnahmen" maxLength={3000} value={form.equalityEffects} onChange={e => edit({ equalityEffects: e.target.value })} />
            <TextField label="Maßnahmen zur Entgeltgleichheit / Begründung fehlender Maßnahmen" maxLength={3000} value={form.equalPayMeasures} onChange={e => edit({ equalPayMeasures: e.target.value })} />
            {counts('counts', `Durchschnittliche Beschäftigtenzahlen ${year}`)}
            <CheckField checked={form.firstReport} onChange={e => edit({ firstReport: e.target.checked })}>Erster Bericht nach § 21 (sonst Veränderung zum vorherigen Bericht erforderlich).</CheckField>
            {!form.firstReport && <><Field type="number" label="Letztes Kalenderjahr des vorherigen Berichts" min="2000" max={year - 1} value={form.previousYear} onChange={e => edit({ previousYear: e.target.value })} />{counts('previousCounts', 'Durchschnittliche Beschäftigtenzahlen im vorherigen Bericht')}</>}
          </> : <>
            <Notice>§ 11a GlBG: Verwendungsgruppen und verfügbare Gruppenjahre, Entgelt auf ganzjährige Vollzeit hochgerechnet. Verwenden Sie eine Zeile pro importierter Person. Zeitabhängige Zahlungen einschließlich anteiliger Sonderzahlungen und zeitunabhängige Leistungen getrennt zuordnen. Bei wechselnden Stunden, Gruppen oder Verträgen zuerst fachlich aufbereiten. CSV: Semikolon, Dezimalpunkt, Bruchteile zwischen 0 und 1.</Notice>
            <p>Spalten: Personalnummer, Verwendungs-/Funktionsgruppe, Gruppenjahr (falls vorhanden), zeitabhängiges Jahresentgelt, zeitunabhängiges Jahresentgelt, Vollzeitanteil, Jahresanteil. Die Summe der Entgeltbestandteile muss mit dem Jahresimport übereinstimmen.</p>
            <Button secondary onClick={() => download(`${atHeader}\n`, 'equitensa-AT-zusatzdaten.csv', 'text/csv')}>Leere CSV-Vorlage herunterladen</Button>
            <label className="field">Zusatzdaten (CSV)<input type="file" accept=".csv,text/csv" onChange={e => { const selected = e.target.files?.[0]; if (selected) run(async () => { if (selected.size > payImportLimits.fileBytes) throw new Error('PAYLOAD_TOO_LARGE'); edit({ csv: await selected.text() }); }); }} /></label>
            {form.csv && <p>CSV geladen. Personalnummern und Quelldatei werden nach der Berechnung nicht gespeichert.</p>}
            <CheckField checked={form.anonymityReviewed} onChange={e => edit({ anonymityReviewed: e.target.checked })}>Anonymität, Gruppierung und mögliche Rückschlüsse unter Berücksichtigung des betrieblichen Zusatzwissens geprüft. Kleine und ableitbare Gruppen werden zusätzlich geschützt.</CheckField>
          </>}
          <CheckField checked={form.confirmed} onChange={e => edit({ confirmed: e.target.checked })}>Anwendungsbereich, vollständige Angaben und Zuordnung für dieses Berichtsjahr geprüft und bestätigt.</CheckField>
          <Button busy={busy} disabled={!data.snapshotId || !form.confirmed || (country === 'AT' && (!form.csv || !form.anonymityReviewed))} onClick={() => run(save)}>Prüfen, berechnen & speichern</Button>
        </details>
        {data.document && <p>Zusatzangaben gespeichert · {new Date(data.document.confirmedAt).toLocaleDateString('de-DE')}. Neue Jahresdaten erfordern eine neue Prüfung.</p>}
        <div className="button-row">{['pdf', 'html', 'txt'].map(format => <Button key={format} secondary busy={busy} disabled={!data.document || dirty} onClick={() => file(format)}>{data.rule.title} · {format.toUpperCase()}</Button>)}</div>
      </>}
    </>}
  </section>;
}
