const text = (value, max = 3000) => typeof value === 'string' && value.length <= max ? value.trim() : '';
const validDate=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
export function validateWorkflow(input, snapshot, previous = {}) {
  if (!input || typeof input !== 'object' || !snapshot || input.snapshotId !== snapshot.id) throw new Error('SNAPSHOT_CHANGED');
  const categories = [...new Set(snapshot.rows.map(r => r.worker_category))];
  const classification = Object.fromEntries(categories.map(category => {
    const entry = input.classification?.[category] || {};
    return [category, Object.fromEntries(['skills','effort','responsibility','conditions'].map(key => [key,text(entry[key])]))];
  }));
  const reviews = Object.fromEntries(categories.map(category => {
    const entry = input.reviews?.[category] || {};
    return [category, { explanation:text(entry.explanation), action:text(entry.action), owner:text(entry.owner,255), due:validDate(entry.due) ? entry.due : '', justified:entry.justified === true, remedied:entry.remedied === true }];
  }));
  const count = Number(input.profile?.headcount);
  const document = { snapshotId:snapshot.id, profile:{ legalName:text(input.profile?.legalName,255), headcount:Number.isInteger(count) && count > 0 && count <= 1000000 ? count : null, payrollComplete:input.profile?.payrollComplete === true }, classification, reviews,
    approval:{ manager:text(input.approval?.manager,255), representatives:text(input.approval?.representatives), confirmed:input.approval?.confirmed === true, consulted:input.approval?.consulted === true },
    // Art. 10(2)(e) and (g): content of the joint pay assessment that cannot be derived from pay data.
    assessment:{ previousMeasures:text(input.assessment?.previousMeasures), leaveReturn:Object.fromEntries(categories.map(category=>[category,text(input.assessment?.leaveReturn?.[category])])) },
    reportingDate:validDate(input.reportingDate) ? input.reportingDate : '' };
  if (previous.snapshotId===snapshot.id && previous.approval?.confirmed && document.approval.confirmed && ['profile','classification','reviews'].some(key=>JSON.stringify(previous[key])!==JSON.stringify(document[key]))) {
    document.approval.confirmed=false;document.approval.consulted=false;
  }
  return document;
}
export function readiness(workflow, analysis, snapshot) {
  const current = !!snapshot && workflow?.snapshotId === snapshot.id;
  const headcount=workflow?.profile?.headcount || analysis.count;
  const reportingRequiredByEu=headcount>=150 || (headcount>=100 && workflow?.reportingDate>='2031-01-01');
  const checks = [
    {id:'data',done:!!snapshot && analysis.count > 0},
    {id:'profile',done:current && !!workflow.profile?.legalName && workflow.profile.headcount >= analysis.count && workflow.profile.payrollComplete === true},
    {id:'categories',done:current && analysis.groups.every(g => ['skills','effort','responsibility','conditions'].every(key => !!workflow.classification?.[g.category]?.[key]))},
    {id:'reviews',done:current && analysis.groups.filter(g=>g.review_required).every(g=> { const r=workflow.reviews?.[g.category]; return !!r?.explanation && (r.justified || (!!r.action && !!r.owner && !!r.due)); })},
    {id:'approval',done:current && !!workflow.approval?.manager && !!workflow.approval?.representatives && workflow.approval.confirmed && workflow.approval.consulted},
  ];
  const assessments = analysis.groups.filter(g=>g.review_required).map(g=> {
    const r=current ? workflow.reviews?.[g.category] : null;
    const date = current && validDate(workflow?.reportingDate) ? new Date(`${workflow.reportingDate}T00:00:00Z`) : null;
    if (date) { const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+6);const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,end)); }
    return {category:g.category, deadline:date?.toISOString().slice(0,10) || null, reportingRequiredByEu, jointAssessmentRequired:reportingRequiredByEu && !!date && date <= new Date() && !r?.justified && !r?.remedied};
  });
  return { checks, percent:Math.round(checks.filter(c=>c.done).length/checks.length*100), ready:checks.every(c=>c.done), assessments };
}
