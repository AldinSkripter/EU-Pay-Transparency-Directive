export const markets = {
  DE: { country: 'DE', locale: 'de-DE', currency: 'EUR', authorityStatus: 'unverified' },
  AT: { country: 'AT', locale: 'de-AT', currency: 'EUR', authorityStatus: 'unverified' },
  SI: { country: 'SI', locale: 'sl-SI', currency: 'EUR', authorityStatus: 'unverified' },
};
export function resolveMarket(host, env = process.env) {
  const hostname = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  for (const country of ['SI', 'AT', 'DE']) {
    const domain = `equitensa.${country.toLowerCase()}`;
    const developmentHosts = country === 'DE' ? 'localhost,127.0.0.1' : `localhost.${country.toLowerCase()}`;
    const defaults = `${domain},www.${domain},${developmentHosts}`;
    const hosts = (env[`MARKET_${country}_HOSTS`] || defaults).split(',').map(h => h.trim().toLowerCase());
    if (hosts.includes(hostname)) return markets[country];
  }
  return null;
}
export function marketContext(req, res, next) {
  const market = resolveMarket(req.get('host'));
  if (!market) return res.status(421).json({ error: 'UNKNOWN_HOST' });
  req.marketContext = market;
  res.setHeader('X-Market-Country', market.country);
  res.setHeader('X-Market-Locale', market.locale);
  next();
}
