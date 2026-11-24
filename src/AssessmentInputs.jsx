import React from 'react';
import { Field, TextField, CheckField, Notice } from './ui';

export function AssessmentStatus({ L, missing = [] }) {
  if (!missing.length) return null;
  const labels = {
    snapshot: L('Aktuellen Datenstand prüfen', 'Preverite trenutni podatkovni posnetek'),
    previousMeasures: L('Wirksamkeit früherer Maßnahmen oder erste Bewertung dokumentieren', 'Zabeležite učinkovitost prejšnjih ukrepov ali prvo oceno'),
    jointReview: L('Zusammenarbeit mit der Arbeitnehmervertretung bestätigen', 'Potrdite sodelovanje s predstavniki delavcev'),
    reasons: L('Gründe für die Entgeltunterschiede dokumentieren', 'Zabeležite razloge za razlike v plačah'),
    measures: L('Maßnahme, Verantwortliche und Termin ergänzen', 'Dopolnite ukrep, odgovorno osebo in rok'),
    leaveOutcomes: L('Rückkehr aus Urlaub: Anwendbarkeit und Anteile ergänzen', 'Vrnitev z dopusta: dopolnite uporabo in deleže'),
  };
  return <Notice tone="error"><strong>{L('Gemeinsame Entgeltbewertung noch unvollständig.', 'Skupna ocena plač še ni popolna.')}</strong><ul>{missing.map((item, index) => <li key={index}>{item.article} · {item.category ? `${item.category}: ` : ''}{labels[item.field]}</li>)}</ul></Notice>;
}

export default function AssessmentInputs({ L, workflow, groups, onChange }) {
  const assessment = workflow.assessment || {};
  const update = patch => onChange({ ...assessment, ...patch });
  const outcome = (category, patch) => update({ leaveOutcomes: { ...assessment.leaveOutcomes, [category]: { ...assessment.leaveOutcomes?.[category], ...patch } } });
  return <section className="panel form-panel">
    <h3>{L('Pflichtangaben zur gemeinsamen Entgeltbewertung', 'Obvezni podatki skupne ocene plač')} · Art. 10(2)(e)</h3>
    <Notice>{L('Je Kategorie und Geschlecht zählen Sie die Personen, die aus Mutterschafts-, Vaterschafts-, Eltern- oder Pflegeurlaub zurückkehrten und während deren Urlaub die Kategorie eine Entgeltverbesserung erhielt. Erfassen Sie, wie viele davon nach Rückkehr profitierten. Der Anteil wird berechnet; er lässt sich nicht aus Jahresgehältern ableiten. Wenn nicht zutreffend, begründen Sie dies.', 'Po kategoriji in spolu preštejte osebe, ki so se vrnile z materinskega, očetovskega, starševskega dopusta ali dopusta za nego in je njihova kategorija med dopustom prejela izboljšanje plače. Navedite, koliko jih je po vrnitvi prejelo izboljšanje. Delež se izračuna; iz letnih plač ga ni mogoče izpeljati. Če se ne uporablja, to obrazložite.')}</Notice>
    {groups.map(group => {
      const value = assessment.leaveOutcomes?.[group.category] || {};
      return <fieldset key={group.category}><legend>{group.category}</legend>
        <label className="field"><span>{L('Entgeltverbesserung während relevanten Urlaubs?', 'Izboljšanje plače med ustreznim dopustom?')}</span><select value={value.applicable === true ? 'yes' : value.applicable === false ? 'no' : ''} onChange={e => outcome(group.category, { applicable: e.target.value === '' ? null : e.target.value === 'yes' })}>
          <option value="">{L('Bitte wählen', 'Izberite')}</option><option value="yes">{L('Ja, relevante Rückkehrende erfassen', 'Da, vnesite upravičene povratnike')}</option><option value="no">{L('Nicht zutreffend, begründen', 'Se ne uporablja, obrazložite')}</option>
        </select></label>
        {value.applicable === true && <div className="form-grid">{['men', 'women'].map(sex => <fieldset key={sex}><legend>{sex === 'men' ? L('Männer', 'Moški') : L('Frauen', 'Ženske')}</legend>
          {['eligible', 'benefited'].map(key => <Field key={key} type="number" min="0" max={sex === 'men' ? group.male_count : group.female_count} step="1" label={key === 'eligible' ? L('Relevante Rückkehrende (Personen)', 'Upravičeni povratniki (osebe)') : L('Davon mit Entgeltverbesserung', 'Od tega z izboljšanjem plače')} value={value[sex]?.[key] ?? ''} onChange={e => outcome(group.category, { [sex]: { ...value[sex], [key]: e.target.value } })} />)}
        </fieldset>)}</div>}
        {value.applicable !== undefined && value.applicable !== null && <TextField label={value.applicable ? L('Erläuterung (optional)', 'Pojasnilo (neobvezno)') : L('Begründung, weshalb nicht zutreffend', 'Razlog, zakaj se ne uporablja')} maxLength={3000} value={value.note || ''} onChange={e => outcome(group.category, { note: e.target.value })} />}
      </fieldset>;
    })}
    <CheckField checked={assessment.jointReviewConfirmed || false} onChange={e => update({ jointReviewConfirmed: e.target.checked })}>{L('Gründe, Maßnahmen und Angaben dieser Bewertung wurden in Zusammenarbeit mit der Arbeitnehmervertretung festgestellt. Falls keine Vertretung besteht, wurde der einschlägige nationale Prozess dokumentiert.', 'Razlogi, ukrepi in podatki te ocene so bili določeni v sodelovanju s predstavniki delavcev. Če predstavnikov ni, je ustrezni nacionalni postopek dokumentiran.')}</CheckField>
  </section>;
}
