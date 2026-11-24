export const columnOptions=[['position','Pos.','Št.',8],['description','Beschreibung','Opis',38],['quantity','Menge','Količina',12],['unitPrice','Einzelpreis','Cena/enoto',17],['rate','USt.','DDV',10],['discount','Rabatt','Popust',11],['total','Gesamt netto','Skupaj neto',18]];
export const defaultColumns=['position','description','quantity','unitPrice','total'];
export function invoiceColumns(design={}) {const keys=design.columns||defaultColumns;return columnOptions.filter(c=>keys.includes(c[0]));}
export function invoiceCell(key,line,index,money){return ({position:String(index+1),description:line.description,quantity:`${line.quantity} ${line.unit}`,unitPrice:money(Math.round(Number(line.unitPrice||0)*100)),rate:`${line.rate}%`,discount:`${line.discountPercent||0}%`,total:money(line.netCents)})[key];}
export function invoiceDescription(line,design,money,sl=false){
  const keys=invoiceColumns(design).map(c=>c[0]),details=[];
  if(!keys.includes('quantity'))details.push(`${line.quantity} ${line.unit}`);
  if(!keys.includes('unitPrice'))details.push(`${sl?'Cena/enoto':'Einzelpreis'}: ${money(Math.round(Number(line.unitPrice||0)*100))}`);
  if(line.discountCents&&!keys.includes('discount'))details.push(`${sl?'Popust':'Rabatt'}: ${line.discountPercent}%`);
  return line.description+(details.length?'\n'+details.join(' · '):'');
}
