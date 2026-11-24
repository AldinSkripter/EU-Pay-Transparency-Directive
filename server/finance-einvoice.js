import {reverseCharge,taxProblems,taxNotice,zeroTax,taxCategory} from '../shared/finance-tax.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {ebinterfaceInvoice,eslogInvoice} from './finance-national-xml.js';
const exec=promisify(execFile);
export const einvoiceProfiles={DE:['xrechnung','zugferd'],AT:['ebinterface','ubl'],SI:['eslog','ubl']};
const xml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const amount=c=>(c/100).toFixed(2);
const el=(name,value,attrs='')=>`<ram:${name}${attrs}>${xml(value)}</ram:${name}>`;
const dt=value=>`<udt:DateTimeString format="102">${xml(value.replaceAll('-',''))}</udt:DateTimeString>`;
const units={'h':'HUR','Std.':'HUR','Stk.':'C62','Stk':'C62','kos':'C62','Pauschal':'C62','pauschal':'C62','kg':'KGM','m':'MTR','Tag':'DAY','dan':'DAY'};
export function einvoiceProblems(d,p,country,format){
  const missing=[];
  if(!einvoiceProfiles[country]?.includes(format))missing.push('format');
  if(d.kind!=='invoice')missing.push('invoice_only');
  missing.push(...taxProblems(d,p,country));
  if((!zeroTax(d)&&d.taxTreatment!=='domestic_vat_foreign'&&d.customer?.country!==country)||d.customer?.publicBody)missing.push('private_domestic_b2b_only');
  for(const k of ['name','address','postalCode','city','iban','email'])if(!p[k])missing.push('issuer.'+k);
  if(d.taxTreatment!=='small_business'&&!p.vatId&&!(country==='DE'&&p.taxId))missing.push('issuer.vatId');
  if(p.vatId&&!({DE:/^DE\d{9}$/,AT:/^ATU\d{8}$/,SI:/^SI\d{8}$/}[country]?.test(p.vatId)))missing.push('issuer.vatId');
  if(d.taxTreatment!=='small_business'&&country==='AT'&&d.customer?.business&&d.customer.country===country&&d.grossCents>1000000&&!d.customer?.vatId)missing.push('customer.vatId');
  if(d.customer?.vatId&&d.customer.country===country&&!({DE:/^DE\d{9}$/,AT:/^ATU\d{8}$/,SI:/^SI\d{8}$/}[country]?.test(d.customer.vatId)))missing.push('customer.vatId_format');
  if(format==='ebinterface'&&!zeroTax(d)&&d.customer?.business&&d.customer.country===country&&!/^ATU\d{8}$/.test(d.customer?.vatId||''))missing.push('customer.vatId');
  for(const k of ['name','address','postalCode','city','email'])if(!d.customer?.[k])missing.push('customer.'+k);
  if(!d.reference)missing.push('buyerReference');
  if(format==='xrechnung'){if(!d.einvoice?.contactName)missing.push('contactName');if(!d.einvoice?.contactPhone)missing.push('contactPhone');}
  if(d.lines.some(l=>!units[l.unit]))missing.push('unitCode');
  if((!zeroTax(d)&&d.lines.some(l=>Number(l.rate)<=0))||d.grossCents<=0)missing.push('positive_standard_tax_only');
  return missing;
}
export function ciiInvoice(d,p,country,format){
  const missing=einvoiceProblems(d,p,country,format);if(missing.length)throw Object.assign(new Error('FINANCE_EINVOICE_FIELDS'),{status:400,fields:missing});
  const xr=format==='xrechnung',guideline=xr?'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0':'urn:cen.eu:en16931:2017';
  const party=(a,seller=false)=>`<ram:${seller?'Seller':'Buyer'}TradeParty>${seller&&(taxCategory(d)==='O'||!a.vatId)?el('ID',a.vatId||a.taxId):''}${el('Name',a.name)}${seller&&xr?`<ram:DefinedTradeContact>${el('PersonName',d.einvoice.contactName)}<ram:TelephoneUniversalCommunication>${el('CompleteNumber',d.einvoice.contactPhone)}</ram:TelephoneUniversalCommunication><ram:EmailURIUniversalCommunication>${el('URIID',a.email)}</ram:EmailURIUniversalCommunication></ram:DefinedTradeContact>`:''}<ram:PostalTradeAddress>${el('PostcodeCode',a.postalCode)}${el('LineOne',a.address)}${el('CityName',a.city)}${el('CountryID',seller?country:a.country)}</ram:PostalTradeAddress><ram:URIUniversalCommunication>${el('URIID',a.email,' schemeID="EM"')}</ram:URIUniversalCommunication>${a.vatId&&taxCategory(d)!=='O'?`<ram:SpecifiedTaxRegistration>${el('ID',a.vatId,' schemeID="VA"')}</ram:SpecifiedTaxRegistration>`:''}${seller&&a.taxId?`<ram:SpecifiedTaxRegistration>${el('ID',a.taxId,' schemeID="FC"')}</ram:SpecifiedTaxRegistration>`:''}</ram:${seller?'Seller':'Buyer'}TradeParty>`;
  const tax=(t,header=false)=>`<ram:ApplicableTradeTax>${header?el('CalculatedAmount',amount(t.taxCents)):''}${el('TypeCode','VAT')}${header&&zeroTax(d)?el('ExemptionReason',taxNotice(country,d.taxTreatment)):''}${header?el('BasisAmount',amount(t.netCents)):''}${el('CategoryCode',taxCategory(d))}${taxCategory(d)==='O'&&!header?'':el('RateApplicablePercent',t.rate)}</ram:ApplicableTradeTax>`;
  const lines=d.lines.map((l,i)=>`<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument>${el('LineID',i+1)}</ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct>${el('Name',l.description)}</ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice>${el('ChargeAmount',l.unitPrice)}</ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery>${el('BilledQuantity',l.quantity,` unitCode="${units[l.unit]}"`)}</ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement>${tax(l)}${l.discountCents?`<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>${el('ActualAmount',amount(l.discountCents))}${el('Reason','Discount')}</ram:SpecifiedTradeAllowanceCharge>`:''}<ram:SpecifiedTradeSettlementLineMonetarySummation>${el('LineTotalAmount',amount(l.netCents))}</ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`).join('');
  const number=d.number||`TEST-${d.id||'PREVIEW'}`;
  return `<?xml version="1.0" encoding="UTF-8"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"><rsm:ExchangedDocumentContext><ram:BusinessProcessSpecifiedDocumentContextParameter>${el('ID','urn:fdc:peppol.eu:2017:poacc:billing:01:1.0')}</ram:BusinessProcessSpecifiedDocumentContextParameter><ram:GuidelineSpecifiedDocumentContextParameter>${el('ID',guideline)}</ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext><rsm:ExchangedDocument>${el('ID',number)}${el('TypeCode','380')}<ram:IssueDateTime>${dt(d.issueDate)}</ram:IssueDateTime><ram:IncludedNote>${el('Content',d.demo||d.status==='draft'?'TEST / DRAFT - NOT AN ISSUED INVOICE':d.note||'Invoice')}</ram:IncludedNote></rsm:ExchangedDocument><rsm:SupplyChainTradeTransaction>${lines}<ram:ApplicableHeaderTradeAgreement>${el('BuyerReference',d.reference)}${party(p,true)}${party(d.customer)}</ram:ApplicableHeaderTradeAgreement><ram:ApplicableHeaderTradeDelivery>${taxCategory(d)==='K'?'<ram:ShipToTradeParty><ram:PostalTradeAddress>'+el('PostcodeCode',d.customer.postalCode)+el('LineOne',d.customer.address)+el('CityName',d.customer.city)+el('CountryID',d.customer.country)+'</ram:PostalTradeAddress></ram:ShipToTradeParty>':''}<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${dt(d.serviceDate)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery><ram:ApplicableHeaderTradeSettlement>${el('InvoiceCurrencyCode','EUR')}<ram:SpecifiedTradeSettlementPaymentMeans>${el('TypeCode','58')}<ram:PayeePartyCreditorFinancialAccount>${el('IBANID',p.iban)}${el('AccountName',p.name)}</ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>${d.taxes.map(t=>tax(t,true)).join('')}<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime>${dt(d.dueDate)}</ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms><ram:SpecifiedTradeSettlementHeaderMonetarySummation>${el('LineTotalAmount',amount(d.netCents))}${el('ChargeTotalAmount','0.00')}${el('AllowanceTotalAmount','0.00')}${el('TaxBasisTotalAmount',amount(d.netCents))}${el('TaxTotalAmount',amount(d.taxCents),' currencyID="EUR"')}${el('GrandTotalAmount',amount(d.grossCents))}${el('DuePayableAmount',amount(d.grossCents))}</ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
}
const jar=resolve('var/tools/Mustang-CLI-2.26.0.jar');
export const validatorAvailable=()=>existsSync(jar);
let active=0;
export async function validatedEinvoice(d,p,country,format,pdfFactory){
  const xml=ciiInvoice(d,p,country,format);
  if(!validatorAvailable())throw Object.assign(new Error('FINANCE_VALIDATOR_UNAVAILABLE'),{status:503});
  if(active>=2)throw Object.assign(new Error('FINANCE_VALIDATOR_BUSY'),{status:429});
  active++;let dir;
  try{
    dir=await mkdtemp(join(tmpdir(),'equitensa-einvoice-'));const source=join(dir,'invoice.xml');await writeFile(source,xml,{mode:0o600});
    const run=async args=>{try{return await exec('java',['-Xmx512m','-jar',jar,'--disable-file-logging',...args],{cwd:dir,timeout:60000,maxBuffer:2000000,windowsHide:true});}catch(e){throw Object.assign(new Error('FINANCE_EINVOICE_VALIDATION'),{status:422,fields:[String(e.stdout||e.stderr||e.message).slice(0,8000)]});}};
    let output=source,mime='application/xml',extension='xml';
    if(format==='ubl'){output=join(dir,'invoice.ubl.xml');await run(['--action','ubl','--source',source,'--out',output,'--profileID','urn:fdc:peppol.eu:2017:poacc:billing:01:1.0','--customizationID','urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0']);}
    if(format==='zugferd'){
      const pdf=join(dir,'visual.pdf');await writeFile(pdf,await pdfFactory(),{mode:0o600});output=join(dir,'invoice.zugferd.pdf');
      await run(['--action','combine','--source',pdf,'--source-xml',source,'--out',output,'--format','zf','--version','2','--profile','E','--no-additional-attachments']);mime='application/pdf';extension='pdf';
    }
    const report=await run(['--action','validate','--source',output]);
    if([...report.stdout.matchAll(/<summary[^>]*status="([^"]+)"/g)].at(-1)?.[1]!=='valid')throw Object.assign(new Error('FINANCE_EINVOICE_VALIDATION'),{status:422,fields:[report.stdout.slice(0,8000)]});
    if(format==='ebinterface'||format==='eslog'){
      const native=format==='ebinterface'?ebinterfaceInvoice(d,p):eslogInvoice(d,p);
      output=join(dir,'national.xml');await writeFile(output,native,{mode:0o600});
      const schema=resolve('server/schemas',format==='ebinterface'?'ebinterface/Invoice.xsd':'eslog/eSLOG20_INVOIC_v200.xsd');
      try{
        const result=await exec('java',['-Xmx128m',resolve('server/InvoiceSchemaValidator.java'),schema,output],{timeout:20000,maxBuffer:200000,windowsHide:true});
        if(!result.stdout.includes('XSD_VALID'))throw Error('XSD validation failed');
      }catch(e){throw Object.assign(new Error('FINANCE_EINVOICE_VALIDATION'),{status:422,fields:[String(e.stderr||e.message).slice(0,4000)]});}
    }
    return {bytes:await readFile(output),mime,extension,report:report.stdout,validation:format==='ebinterface'||format==='eslog'?'EN16931-core-and-national-XSD':'Mustang-2.26.0-valid'};
  }finally{active--;if(dir&&dirname(resolve(dir))===resolve(tmpdir())&&dir.includes('equitensa-einvoice-'))await rm(dir,{recursive:true,force:true});}
}
