export const providers = [
  ['personio', 'Personio', 'DE'], ['hibob', 'HiBob', 'EU'], ['workday', 'Workday', 'Enterprise'],
  ['sap', 'SAP SuccessFactors', 'Enterprise'], ['bamboohr', 'BambooHR', 'EU'], ['rippling', 'Rippling', 'EU'],
  ['sagehr', 'Sage HR', 'EU'], ['zoho', 'Zoho People', 'EU'], ['deel', 'Deel', 'EU'],
  ['gusto', 'Gusto', 'US'], ['payfit', 'PayFit', 'EU'], ['nmbrs', 'NMBRS', 'EU'],
  ['datev', 'DATEV', 'DE'], ['bmd', 'BMD', 'AT'], ['pantheon', 'PANTHEON', 'SI'],
  ['minimax', 'Minimax', 'SI'], ['factorial', 'Factorial', 'EU'], ['rexx', 'rexx systems', 'DE'],
].map(([id, name, market]) => ({ id, name, market, status: 'planned', historicalPayroll: false }));

export class HrisProvider {
  async fetchEmployees() { throw new Error('PROVIDER_NOT_IMPLEMENTED'); }
  async fetchPayrollPeriods() { throw new Error('HISTORICAL_PAYROLL_NOT_IMPLEMENTED'); }
  async testConnection() { throw new Error('PROVIDER_NOT_IMPLEMENTED'); }
}
// Registry avoids changing factory code and employee schema for every new adapter.
export class HrisIntegrationFactory {
  static registry = new Map();
  static register(name, Provider) {
    if (!(Provider.prototype instanceof HrisProvider)) throw new Error('INVALID_PROVIDER_INTERFACE');
    this.registry.set(name.toLowerCase(), Provider);
  }
  static getProvider(name, credentials) {
    const Provider = this.registry.get(String(name).toLowerCase());
    if (!Provider) throw new Error('PROVIDER_NOT_IMPLEMENTED');
    return new Provider(credentials);
  }
}
