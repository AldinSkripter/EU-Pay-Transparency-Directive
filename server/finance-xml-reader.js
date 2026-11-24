import {SaxesParser} from 'saxes';
export function readEinvoiceXml(bytes){
 const raw=Buffer.from(bytes).toString('utf8');if(raw.length>2000000||/<!DOCTYPE|<!ENTITY/i.test(raw))throw Error('FINANCE_INVALID_XML');
 const parser=new SaxesParser({xmlns:true}),stack=[];let root,count=0,rootAttributes={};
 parser.on('opentag',tag=>{if(++count>20000||stack.length>60)throw Error('FINANCE_XML_LIMIT');const node={name:tag.local,uri:tag.uri,text:'',children:[]};if(stack.length)stack.at(-1).children.push(node);else {root=node;rootAttributes=tag.attributes;}stack.push(node);});
 parser.on('text',text=>{if(stack.length)stack.at(-1).text+=text;});parser.on('cdata',text=>{if(stack.length)stack.at(-1).text+=text;});parser.on('closetag',()=>stack.pop());parser.write(raw).close();
 const path=(n,...parts)=>parts.reduce((a,key)=>a?.children.find(c=>c.name===key),n);const value=(n,...parts)=>path(n,...parts)?.text.trim()||'';
 let supplier,reference,incurredOn,amount,currency,format;
 if(root?.name==='CrossIndustryInvoice'&&root.uri==='urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100'){
  const trade=path(root,'SupplyChainTradeTransaction'),settlement=path(trade,'ApplicableHeaderTradeSettlement');
  supplier=value(trade,'ApplicableHeaderTradeAgreement','SellerTradeParty','Name');reference=value(root,'ExchangedDocument','ID');
  const date=value(root,'ExchangedDocument','IssueDateTime','DateTimeString');incurredOn=/^\d{8}$/.test(date)?`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}`:'';
  amount=value(settlement,'SpecifiedTradeSettlementHeaderMonetarySummation','GrandTotalAmount');currency=value(settlement,'InvoiceCurrencyCode');
  format=value(root,'ExchangedDocumentContext','GuidelineSpecifiedDocumentContextParameter','ID').includes('xrechnung')?'XRechnung CII':'CII / ZUGFeRD';
  if(value(root,'ExchangedDocument','TypeCode')!=='380')throw Error('FINANCE_INVOICE_TYPE_UNSUPPORTED');
 }else if(root?.name==='Invoice'&&root.uri==='urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'){
  const party=path(root,'AccountingSupplierParty','Party');supplier=value(party,'PartyLegalEntity','RegistrationName')||value(party,'PartyName','Name');reference=value(root,'ID');incurredOn=value(root,'IssueDate');amount=value(root,'LegalMonetaryTotal','TaxInclusiveAmount');currency=value(root,'DocumentCurrencyCode');format=value(root,'CustomizationID').includes('xrechnung')?'XRechnung UBL':'UBL 2.1';
  if(value(root,'InvoiceTypeCode')!=='380')throw Error('FINANCE_INVOICE_TYPE_UNSUPPORTED');
 }else if(root?.name==='Invoice'&&root.uri==='http://www.ebinterface.at/schema/6p1/'){
  if(rootAttributes.DocumentType?.value!=='Invoice')throw Error('FINANCE_INVOICE_TYPE_UNSUPPORTED');
  supplier=value(root,'Biller','Address','Name');reference=value(root,'InvoiceNumber');incurredOn=value(root,'InvoiceDate');amount=value(root,'TotalGrossAmount');currency=rootAttributes.InvoiceCurrency?.value;format='ebInterface 6.1';
 }else if(root?.name==='Invoice'&&root.uri==='urn:eslog:2.00'){
  const invoice=path(root,'M_INVOIC');
  if(value(invoice,'S_BGM','C_C002','D_1001')!=='380')throw Error('FINANCE_INVOICE_TYPE_UNSUPPORTED');
  const find=(name,...qualifier)=>invoice?.children.find(n=>n.name===name&&value(n,...qualifier.slice(0,-1))===qualifier.at(-1));
  supplier=value(find('G_SG2','S_NAD','D_3035','SE'),'S_NAD','C_C080','D_3036');
  reference=value(invoice,'S_BGM','C_C106','D_1004');incurredOn=value(find('S_DTM','C_C507','D_2005','137'),'C_C507','D_2380');
  amount=value(find('G_SG50','S_MOA','C_C516','D_5025','388'),'S_MOA','C_C516','D_5004');
  currency=value(find('G_SG7','S_CUX','C_C504','D_6347','2'),'S_CUX','C_C504','D_6345');format='e-SLOG 2.0';
 }else throw Error('FINANCE_XML_FORMAT_UNSUPPORTED');
 if(currency!=='EUR')throw Error('FINANCE_CURRENCY_UNSUPPORTED');
 if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0)throw Error('FINANCE_XML_AMOUNT_UNSUPPORTED');
 const [whole,fraction='']=amount.split('.');amount=whole+'.'+fraction.padEnd(2,'0');
 return {text:`${supplier}\n${reference}\n${incurredOn}\nEUR ${amount}`,suggestions:{supplier:supplier.slice(0,255),reference:reference.slice(0,255),incurredOn,amount,category:'other',note:''},format,requiresReview:true,validated:false};
}
