import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMarket } from '../server/market.js';
import { HrisProvider, HrisIntegrationFactory, providers } from '../server/hris.js';
test('market allowlist handles port and exact aliases without substring spoofing', () => {
  const env = { MARKET_DE_HOSTS:'pay.de',MARKET_AT_HOSTS:'pay.at',MARKET_SI_HOSTS:'pay.si' };
  assert.equal(resolveMarket('PAY.SI:3000',env).country,'SI');
  assert.equal(resolveMarket('pay.at.',env).country,'AT');
  assert.equal(resolveMarket('pay.si.attacker.net',env),null);
  assert.equal(resolveMarket('attacker.at',env),null);
  assert.equal(resolveMarket('localhost',{}).locale,'de-DE');
  for (const [country,locale] of [['DE','de-DE'],['AT','de-AT'],['SI','sl-SI']]) {
    const domain=`equitensa.${country.toLowerCase()}`;
    assert.equal(resolveMarket(domain,{}).country,country);
    assert.equal(resolveMarket(`WWW.${domain.toUpperCase()}:443`,{}).locale,locale);
    assert.equal(resolveMarket(`${domain}.attacker.net`,{}),null);
  }
});
test('provider registry enforces interface and never pretends planned connectors work', () => {
  assert.throws(() => HrisIntegrationFactory.getProvider('personio',{}),/NOT_IMPLEMENTED/);
  assert.throws(() => HrisIntegrationFactory.register('invalid',class {}),/INTERFACE/);
  class TestProvider extends HrisProvider {}
  HrisIntegrationFactory.register('test',TestProvider);
  assert.ok(HrisIntegrationFactory.getProvider('TEST',{}) instanceof TestProvider);
  assert.ok(providers.some(p => p.id==='workday'));
  assert.ok(providers.every(p => p.status==='planned'));
});
