import qrcodegen from 'nayuki-qr-code-generator';
import iconv from 'iconv-lite';
const {QrCode,QrSegment}=qrcodegen;
const invalid=field=>{throw Object.assign(new Error('FINANCE_QR_INVALID'),{status:422,fields:[field]});};
function field(value,max,name,required=true){
  if(typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value)||value.trim().length>max||(required&&!value.trim()))invalid(name);
  return value.trim();
}
function iban(value){
  const v=String(value||'').replace(/ /g,'').toUpperCase();
  const lengths={DE:22,AT:20,SI:19};
  // Initial scope: beneficiary accounts in the three supported markets.
  if(!lengths[v.slice(0,2)]||v.length!==lengths[v.slice(0,2)]||! /^[A-Z]{2}\d+$/.test(v))invalid('iban');
  const digits=(v.slice(4)+v.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
  if(BigInt(digits)%97n!==1n)invalid('iban');return v;
}
export function paymentPayload(d,issuer,country){
  if(!['DE','AT','SI'].includes(country)||d.kind!=='invoice')invalid('invoice');
  if(!Number.isSafeInteger(d.grossCents)||d.grossCents<1||d.grossCents>99999999999)invalid('amount');
  const bank=iban(issuer.iban),number=field(d.number||d.reference||'PREVIEW',country==='SI'?42:140,'reference');
  const name=field(issuer.name,country==='SI'?33:70,'name');
  if(country!=='SI'){
    const text=['BCD','002','1','SCT','',name,bank,`EUR${(d.grossCents/100).toFixed(2)}`,'','',number].join('\n');
    const bytes=Buffer.from(text,'utf8');if(bytes.length>331)invalid('payload_length');
    return {format:'EPC / GiroCode',text,bytes,eci:null,min:1,max:13};
  }
  const person=(p,prefix)=>[field(p.name,33,prefix+'.name'),field(p.address,33,prefix+'.address'),field(`${p.postalCode||''} ${p.city||''}`.trim(),33,prefix+'.city')];
  const deadline=field(d.dueDate,10,'dueDate');const dt=new Date(deadline+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==deadline)invalid('dueDate');
  // Ordinary bank-transfer order, no registered-issuer privileges. SI99 means no
  // structured reference; the exact invoice number is carried in payment purpose.
  const fields=['UPNQR','','','','',...person(d.customer||{},'customer'),String(d.grossCents).padStart(11,'0'),'','','OTHR',number,deadline.split('-').reverse().join('.'),bank,'SI99',...person(issuer,'issuer')];
  const prefix=fields.join('\n')+'\n';const text=prefix+String(prefix.length).padStart(3,'0')+'\n';
  const bytes=iconv.encode(text,'iso-8859-2');if(iconv.decode(bytes,'iso-8859-2')!==text)invalid('unsupported_characters');if(bytes.length>411)invalid('payload_length');
  return {format:'UPN QR',text,bytes,eci:4,min:15,max:15};
}
export function qrMatrix(payload){
  const segments=[...(payload.eci===null?[]:[QrSegment.makeEci(payload.eci)]),QrSegment.makeBytes([...payload.bytes])];
  const qr=QrCode.encodeSegments(segments,QrCode.Ecc.MEDIUM,payload.min,payload.max,-1,false);
  return Array.from({length:qr.size},(_,y)=>Array.from({length:qr.size},(_,x)=>qr.getModule(x,y)?1:0));
}
export function urlMatrix(url){return qrMatrix({bytes:Buffer.from(url),eci:null,min:1,max:20});}
export function svgData(matrix){
  const size=matrix.length+8;let path='';matrix.forEach((row,y)=>row.forEach((v,x)=>{if(v)path+=`M${x+4} ${y+4}h1v1h-1z`;}));
  return 'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><path fill="white" d="M0 0h${size}v${size}H0z"/><path fill="black" d="${path}"/></svg>`).toString('base64');
}
export function paymentQr(d,issuer,country){
  if(!issuer.design?.paymentQr)return null;
  const payload=paymentPayload(d,issuer,country);
  const testOnly=d.status!=='issued'||d.demo===true;
  const matrix=testOnly?urlMatrix(`EQUITENSA TEST - NOT A PAYMENT - ${country}`):qrMatrix(payload);
  return {format:payload.format,matrix,image:svgData(matrix),testOnly};
}
export function drawQr(pdf,matrix,x,y,size){
  const unit=size/(matrix.length+8);pdf.save().rect(x,y,size,size).fill('white');
  matrix.forEach((row,j)=>row.forEach((v,i)=>{if(v)pdf.rect(x+(i+4)*unit,y+(j+4)*unit,unit,unit).fill('black');}));pdf.restore();
}
