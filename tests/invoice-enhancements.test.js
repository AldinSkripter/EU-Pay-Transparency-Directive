import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateFinance,validateFinanceProfile,financePdf} from '../server/finance.js';
import {dueDateFromTerm} from '../shared/invoice-terms.js';
test('discounts reduce the tax base with exact cents for all three countries',()=>{
  for(const [country,rate,tax] of [['DE','19',1710],['AT','20',1800],['SI','22',1980]]) {
    const result=calculateFinance([{description:'Service',quantity:'1',unitPrice:'100',rate,discountPercent:'10'}],country);
    assert.equal(result.netCents,9000);assert.equal(result.taxCents,tax);assert.equal(result.lines[0].discountCents,1000);
  }
  const line={description:'Service',quantity:'1',unitPrice:'0.05',rate:'19'};
  assert.equal(calculateFinance([{...line,discountPercent:'10'}],'DE').netCents,4);
  assert.equal(calculateFinance([{...line,discountPercent:'100'}],'DE').grossCents,0);
  for(const discountPercent of ['100.01','-1','abc',10])assert.throws(()=>calculateFinance([{...line,discountPercent}],'DE'));
});
test('payment terms handle month boundaries and leap years without local timezone shifts',()=>{
  assert.equal(dueDateFromTerm('2028-02-28',7),'2028-03-06');
  assert.equal(dueDateFromTerm('2026-12-31',30),'2027-01-30');
  assert.equal(dueDateFromTerm('2026-02-30',14),null);
  assert.equal(dueDateFromTerm('2026-01-01',-1),null);
});
test('extended design validates and produces PDFs with discounts and references',async()=>{
  for(const tableStyle of ['soft','plain','contrast'])for(const titleAlign of ['left','center','right']) {
    const issuer=validateFinanceProfile({country:'SI',confirmCountry:true,name:'Example',design:{titleSize:36,tableStyle,titleAlign}},'SI');
    const calculated=calculateFinance([{description:'Test',quantity:'2',unitPrice:'100',rate:'22',discountPercent:'12.5'}],'SI');
    const pdf=await financePdf({...calculated,kind:'invoice',status:'draft',reference:'PO-123',customer:{name:'Buyer'},issueDate:'2026-11-15',serviceDate:'2026-11-15',dueDate:'2026-11-29'},issuer,'SI');
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  }
  for(const design of [{titleSize:99},{tableStyle:'url(x)'},{titleAlign:'free'}])assert.throws(()=>validateFinanceProfile({country:'SI',confirmCountry:true,name:'Test',design},'SI'));
});
