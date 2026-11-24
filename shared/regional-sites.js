export const regionalSites = Object.freeze({
  DE: { origin: 'https://equitensa.de', label: 'Deutschland', language: 'de' },
  AT: { origin: 'https://equitensa.at', label: 'Österreich', language: 'de' },
  SI: { origin: 'https://equitensa.si', label: 'Slovenija', language: 'sl' },
});

// Only public entry routes cross domains. Never forward authentication tokens,
// query strings, document IDs or fragments to another origin.
export function regionalUrl(country, pathname = '/') {
  const site = regionalSites[country];
  if (!site) throw new Error('INVALID_COUNTRY');
  return site.origin + (pathname === '/finance' || pathname.startsWith('/finance/') ? '/finance' : '/');
}
