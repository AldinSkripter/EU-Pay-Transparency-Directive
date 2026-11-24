export const euVatCountries = 'AT BE BG HR CY CZ DE DK EE ES FI FR GR HU IE IT LT LU LV MT NL PL PT RO SE SI SK'.split(' ');
export const reverseCharge = d => d.taxTreatment === 'eu_b2b_services';
export const taxTreatments=['domestic','domestic_vat_foreign','eu_b2b_services','eu_goods','export_goods','non_eu_b2b_services','small_business'];
export const zeroTax=d=>['eu_b2b_services','eu_goods','export_goods','non_eu_b2b_services','small_business'].includes(d.taxTreatment);
export const taxCategory=d=>({eu_b2b_services:'AE',eu_goods:'K',export_goods:'G',non_eu_b2b_services:'O',small_business:'E'}[d.taxTreatment]||'S');
export function availableTaxTreatments(buyer,country){
 if(!buyer||buyer.publicBody)return [];
 if(buyer.country===country)return ['domestic','small_business'];
 if(euVatCountries.includes(buyer.country))return buyer.business?['domestic_vat_foreign','eu_b2b_services','eu_goods']:['domestic_vat_foreign'];
 return buyer.business?['domestic_vat_foreign','non_eu_b2b_services','export_goods']:['domestic_vat_foreign','export_goods'];
}
export const taxEvidenceFields={domestic:[],domestic_vat_foreign:['localVatConfirmed','reference'],eu_b2b_services:['generalRuleConfirmed','vatVerified','checkedOn','reference'],eu_goods:['vatVerified','checkedOn','reference','goodsConditionsConfirmed','destinationCountry','transportReference','reportingConfirmed'],export_goods:['goodsConditionsConfirmed','destinationCountry','transportReference'],non_eu_b2b_services:['generalRuleConfirmed','businessEvidence'],small_business:['smallBusinessConfirmed']};
export const taxProblemLabels={
 taxTreatment:['Steuerbehandlung wählen','Izberite obravnavo DDV'],
 'customer.vatId_format':['USt-ID des Kunden prüfen','Preverite ID za DDV stranke'],
 'issuer.taxId':['Steuernummer angeben','Vnesite davčno številko podjetja'],
 general_rule_confirmation:['B2B-Grundregel bestätigen','Potrdite splošno pravilo B2B'],
 vat_verification_evidence:['Externen USt-ID-Prüfnachweis mit Datum angeben','Vnesite dokazilo in datum preverjanja ID za DDV'],
 eu_service_b2b_required:['Geschäftskunde in einem anderen EU-Mitgliedstaat erforderlich','Potrebna poslovna stranka v drugi državi EU'],
 domestic_place_of_supply_evidence:['Inländischen Leistungsort mit Begründung bestätigen','Potrdite domači kraj obdavčitve z razlogom'],
 non_eu_customer_required:['Empfänger außerhalb EU erforderlich','Potreben prejemnik zunaj EU'],
 foreign_business_evidence:['Unternehmereigenschaft des Kunden belegen','Dokazilo o poslovnem statusu stranke'],
 transport_evidence:['Warenbewegung, Bestimmungsland und Transport-/Ausfuhrnachweis prüfen','Preverite premik blaga, namembno državo in dokazila'],
 eu_goods_reporting_confirmation:['Erwerbsbesteuerung und Zusammenfassende Meldung bestätigen','Potrdite obdavčitev pridobitve in rekapitulacijsko poročilo'],
 small_business_eligibility:['Inländische Kleinunternehmerbefreiung bestätigen','Potrdite domačo oprostitev za male zavezance'],
 reverse_charge_zero_tax:['Steuerbefreiung / nicht steuerbar: nur 0 % ohne Steuerausweis','Oprostitev / neobdavčeno: samo 0 % brez obračunanega DDV']
};
const rcNotice = country => country === 'SI'
  ? 'Obrnjena davčna obveznost — Reverse charge. Člen 44 in 196 Direktive 2006/112/ES; 25. člen ZDDV-1.'
  : `Steuerschuldnerschaft des Leistungsempfängers — Reverse charge. Art. 44 und 196 Richtlinie 2006/112/EG; ${country === 'DE' ? '§ 3a Abs. 2 UStG' : '§ 3a Abs. 6 UStG'}.`;
export function taxNotice(country,mode='eu_b2b_services'){
 if(mode==='small_business')return {DE:'Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG. Kein Umsatzsteuerausweis.',AT:'Umsatzsteuerbefreit aufgrund der Kleinunternehmerregelung gemäß § 6 Abs. 1 Z 27 UStG.',SI:'DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.'}[country];
 const bases={DE:{eu_goods:'§ 4 Nr. 1 b i. V. m. § 6a UStG',export_goods:'§ 4 Nr. 1 a i. V. m. § 6 UStG',non_eu_b2b_services:'§ 3a Abs. 2 UStG'},AT:{eu_goods:'Art. 6 Abs. 1 i. V. m. Art. 7 UStG',export_goods:'§ 6 Abs. 1 Z 1 i. V. m. § 7 UStG',non_eu_b2b_services:'§ 3a Abs. 6 UStG'},SI:{eu_goods:'46. člen ZDDV-1',export_goods:'52. člen ZDDV-1',non_eu_b2b_services:'25. člen ZDDV-1'}};
 if(mode==='eu_b2b_services')return rcNotice(country);
 if(mode==='eu_goods')return `${country==='SI'?'Oproščena dobava blaga znotraj Unije':'Steuerfreie innergemeinschaftliche Lieferung'} — Intra-community supply. ${bases[country][mode]}; Art. 138 Directive 2006/112/EC.`;
 if(mode==='export_goods')return `${country==='SI'?'Oproščen izvoz blaga':'Steuerfreie Ausfuhrlieferung'} — Export outside EU. ${bases[country][mode]}; Art. 146 Directive 2006/112/EC.`;
 if(mode==='non_eu_b2b_services')return `${country==='SI'?'Storitev ni predmet domačega DDV; kraj obdavčitve pri prejemniku':'Nicht im Inland steuerbare B2B-Dienstleistung; Leistungsort beim Empfänger'} — Outside scope of domestic VAT. ${bases[country][mode]}; Art. 44 Directive 2006/112/EC.`;
 return '';
}
export function taxProblems(d, issuer, country) {
  const mode=d.taxTreatment||'domestic',problems=[];
  if(!taxTreatments.includes(mode))return ['taxTreatment'];
  if(mode==='domestic')return d.customer?.country!==country?['cross_border_not_supported']:[];
  const buyer=d.customer||{},e=d.taxEvidence||{};
  if(mode==='small_business'){
    if(buyer.country!==country||e.smallBusinessConfirmed!==true)problems.push('small_business_eligibility');
    if(!issuer.taxId&&!issuer.vatId)problems.push('issuer.taxId');
    if(d.lines?.some(l=>l.rate!=='0')||d.taxCents!==0)problems.push('reverse_charge_zero_tax');
    return problems;
  }
  if(mode==='domestic_vat_foreign')return buyer.country===country||e.localVatConfirmed!==true||!e.reference?.trim()?['domestic_place_of_supply_evidence']:[];
  if(['export_goods','non_eu_b2b_services'].includes(mode)){
    if(euVatCountries.includes(buyer.country)||buyer.country===country||buyer.publicBody)problems.push('non_eu_customer_required');
    if(mode==='non_eu_b2b_services'){
      if(!buyer.business||!e.businessEvidence?.trim())problems.push('foreign_business_evidence');
      if(e.generalRuleConfirmed!==true)problems.push('general_rule_confirmation');
    }
  }else{
  if(!euVatCountries.includes(buyer.country)||buyer.country===country||!buyer.business||buyer.publicBody)problems.push('eu_service_b2b_required');
  const prefix=buyer.country==='GR'?'EL':buyer.country;
  if(!new RegExp(`^${prefix}[A-Z0-9]{2,12}$`).test(buyer.vatId||''))problems.push('customer.vatId_format');
  if(!issuer.vatId)problems.push('issuer.vatId');
  if(mode==='eu_b2b_services'&&e.generalRuleConfirmed!==true)problems.push('general_rule_confirmation');
  if(e.vatVerified!==true||!e.reference?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(e.checkedOn||'')||!Number.isFinite(Date.parse(e.checkedOn+'T00:00:00Z'))||e.checkedOn>d.issueDate)problems.push('vat_verification_evidence');
  }
  if(['eu_goods','export_goods'].includes(mode)){
    if(e.goodsConditionsConfirmed!==true||!e.transportReference?.trim()||e.destinationCountry!==buyer.country)problems.push('transport_evidence');
    if(mode==='eu_goods'&&e.reportingConfirmed!==true)problems.push('eu_goods_reporting_confirmation');
  }
  if(d.lines?.some(l=>l.rate!=='0')||d.taxCents!==0)problems.push('reverse_charge_zero_tax');
  return problems;
}
