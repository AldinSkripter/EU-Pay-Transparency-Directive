import {validateFinanceAttachment} from './finance-files.js';
export function validateCompanyBrand(body){
  const name=body.displayName,logo=body.logo;
  if(typeof name!=='string'||!name.trim()||name.length>120||typeof logo!=='string'||logo.length>340000)throw Object.assign(new Error('INVALID_COMPANY_BRAND'),{status:400});
  if(logo){
    const match=/^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(logo);
    if(!match)throw Object.assign(new Error('INVALID_COMPANY_LOGO'),{status:400});
    const file=validateFinanceAttachment({filename:'logo',data:match[2]});
    if(file.mime!==match[1]||file.size>250000)throw Object.assign(new Error('INVALID_COMPANY_LOGO'),{status:400});
  }
  return {displayName:name.trim(),logo};
}
export function companyBrandRoutes(app,store){
  app.get('/api/company/brand',async(req,res)=>res.json({brand:await store.companyDocument(req.session.company.id,'workspace_brand')||{displayName:req.session.company.name,logo:''}}));
  app.post('/api/company/brand',async(req,res)=>{
    let brand;try{brand=validateCompanyBrand(req.body);}catch{return res.status(400).json({error:'INVALID_COMPANY_BRAND'});}
    await store.saveCompanyDocument(req.session.company.id,'workspace_brand',brand);
    res.json({brand});
  });
}
