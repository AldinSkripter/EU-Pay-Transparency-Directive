// Directive (EU) 2023/970, Article 9(1): the seven indicators, labelled by letter so every export
// can be read against the legal text. Values come from analyze(); nothing is recomputed here.
export const languages = { DE: 'de', AT: 'de', SI: 'sl' };
const titles = {
  de: {
    a: 'Geschlechtsspezifisches Entgeltgefälle (Durchschnitt)',
    b: 'Geschlechtsspezifisches Entgeltgefälle bei ergänzenden oder variablen Bestandteilen (Durchschnitt)',
    c: 'Medianes geschlechtsspezifisches Entgeltgefälle',
    d: 'Medianes Entgeltgefälle bei ergänzenden oder variablen Bestandteilen',
    e: 'Anteil der Frauen und Männer mit ergänzenden oder variablen Bestandteilen',
    f: 'Anteil der Frauen und Männer in jedem Entgeltquartil',
    g: 'Entgeltgefälle nach Kategorien von Arbeitnehmern (gleiche oder gleichwertige Arbeit)',
  },
  sl: {
    a: 'Spolna razlika v plačah (povprečje)',
    b: 'Spolna razlika v dopolnilnih ali spremenljivih sestavinah plače (povprečje)',
    c: 'Mediana spolne razlike v plačah',
    d: 'Mediana razlike v dopolnilnih ali spremenljivih sestavinah plače',
    e: 'Delež žensk in moških, ki prejemajo dopolnilne ali spremenljive sestavine plače',
    f: 'Delež žensk in moških v vsakem plačnem kvartilu',
    g: 'Razlika v plačah po kategorijah delavcev (enako ali enakovredno delo)',
  },
  en: {
    a: 'Gender pay gap (mean)',
    b: 'Gender pay gap in complementary or variable components (mean)',
    c: 'Median gender pay gap',
    d: 'Median gender pay gap in complementary or variable components',
    e: 'Proportion of female and male workers receiving complementary or variable components',
    f: 'Proportion of female and male workers in each pay quartile',
    g: 'Gender pay gap by categories of workers (same work or work of equal value)',
  },
};
export const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
// Article 9(7): the employer may publish a-f; g goes to the authority, workers and, on request, inspectorates.
export const audienceLetters = { authority: letters, workers: letters, internal: letters, public: letters.slice(0, 6) };

export function article9(analysis, { country, audience = 'internal' }) {
  const t = titles[languages[country] || 'en'];
  const allowed = audienceLetters[audience] || audienceLetters.public;
  const values = {
    a: { hourly: analysis.mean_gap, annual: analysis.annual_mean_gap },
    b: { hourly: analysis.variable_gap, annual: analysis.annual_variable_gap },
    c: { hourly: analysis.median_gap, annual: analysis.annual_median_gap },
    d: { hourly: analysis.median_variable_gap, annual: analysis.annual_median_variable_gap },
    e: { male_percent: analysis.male_variable_receivers, female_percent: analysis.female_variable_receivers },
    f: analysis.quartiles.map((q, i) => ({ quartile: q.quartile, count: q.count, suppressed: q.suppressed, male_percent: q.male_percent, female_percent: q.female_percent,
      annual_count: analysis.annual_quartiles[i].count, annual_suppressed: analysis.annual_quartiles[i].suppressed, annual_male_percent: analysis.annual_quartiles[i].male_percent, annual_female_percent: analysis.annual_quartiles[i].female_percent })),
    g: analysis.groups.map(g => ({ category: g.category, count: g.count, male_count: g.male_count, female_count: g.female_count, suppressed: g.suppressed, comparable: g.comparable, base_gap_hourly: g.base_gap, variable_gap_hourly: g.variable_gap, mean_gap_hourly: g.mean_gap, base_gap_annual: g.annual_base_gap, variable_gap_annual: g.annual_variable_gap,
      // The Art. 10 assessment is the employer's own working view; it is not part of what other recipients get.
      ...(audience === 'internal' ? { review_required: g.review_required, review_gap_hourly: g.review_gap_hourly, review_gap_annual: g.review_gap_annual } : {}) })),
  };
  return allowed.map(letter => ({ letter, reference: `Directive (EU) 2023/970, Art. 9(1)(${letter})`, title: t[letter], values: values[letter] }));
}

// Flat rows [letter, reference, title, item, metric, value] for CSV, XLSX and text exports.
export function article9Rows(items) {
  return items.flatMap(({ letter, reference, title, values }) => {
    const row = (item, metric, value) => [letter, reference, title, item, metric, value];
    if (Array.isArray(values)) return values.flatMap(v => Object.entries(v).filter(([k]) => !['quartile', 'category'].includes(k)).map(([metric, value]) => row(v.category ?? `Q${v.quartile}`, metric, value)));
    return Object.entries(values).map(([metric, value]) => row('ALL', metric, value));
  });
}
