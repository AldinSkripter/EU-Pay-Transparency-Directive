import { validateLeaveOutcome, assessmentCompleteness } from './assessment-input.js';
import { validateEvaluation, evaluationCompleteness, remediationProof, remediationComplete } from './employer-input.js';
import { isEuReportingYear } from '../shared/plans.js';
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
    const proof = remediationProof(entry.proof);
    if (entry.remedied === true && !remediationComplete(proof, snapshot.id)) throw new Error('REMEDIATION_PROOF_REQUIRED');
    return [category, { explanation:text(entry.explanation), action:text(entry.action), owner:text(entry.owner,255), due:validDate(entry.due) ? entry.due : '', justified:entry.justified === true, remedied:entry.remedied === true && remediationComplete(proof, snapshot.id), proof }];
  }));
  const count = Number(input.profile?.headcount);
  const document = { snapshotId:snapshot.id, profile:{ legalName:text(input.profile?.legalName,255), headcount:Number.isInteger(count) && count > 0 && count <= 1000000 ? count : null, payrollComplete:input.profile?.payrollComplete === true }, classification, reviews,
    approval:{ manager:text(input.approval?.manager,255), representatives:text(input.approval?.representatives), confirmed:input.approval?.confirmed === true, consulted:input.approval?.consulted === true },
    // Art. 4(4): the criteria for comparing the value of work are agreed with workers' representatives where such representatives exist.
    criteriaAgreement:{ status:['agreed','no_representatives','pending'].includes(input.criteriaAgreement?.status) ? input.criteriaAgreement.status : '', note:text(input.criteriaAgreement?.note,500) },
    // Art. 10(2)(e) and (g): content of the joint pay assessment that cannot be derived from pay data.
    assessment:{ previousMeasures:text(input.assessment?.previousMeasures), jointReviewConfirmed:input.assessment?.jointReviewConfirmed === true,
      leaveReturn:Object.fromEntries(categories.map(category=>[category,text(input.assessment?.leaveReturn?.[category])])),
      leaveOutcomes:Object.fromEntries(categories.map(category => [category, validateLeaveOutcome(input.assessment?.leaveOutcomes?.[category], {
        men: snapshot.rows.filter(r => r.worker_category === category && r.gender === 'M').length,
        women: snapshot.rows.filter(r => r.worker_category === category && r.gender === 'F').length,
      })])) },
    jobEvaluation: validateEvaluation(input.jobEvaluation, snapshot.rows),
    reportingDate:validDate(input.reportingDate) ? input.reportingDate : '' };
  const approvalIdentityChanged = ['manager','representatives'].some(key => previous.approval?.[key] !== document.approval[key]);
  if (previous.snapshotId===snapshot.id && previous.approval?.confirmed && document.approval.confirmed && (approvalIdentityChanged || ['profile','classification','reviews','criteriaAgreement','assessment','jobEvaluation','reportingDate'].some(key=>JSON.stringify(previous[key])!==JSON.stringify(document[key])))) {
    document.approval.confirmed=false;document.approval.consulted=false;
  }
  return document;
}
export function readiness(workflow, analysis, snapshot) {
  const current = !!snapshot && workflow?.snapshotId === snapshot.id;
  const headcount=workflow?.profile?.headcount || analysis.count;
  const reportingRequiredByEu=isEuReportingYear(headcount,snapshot?.reporting_year);
  const checks = [
    {id:'data',done:!!snapshot && analysis.count > 0},
    {id:'profile',done:current && !!workflow.profile?.legalName && workflow.profile.headcount >= analysis.count && workflow.profile.payrollComplete === true},
    {id:'categories',done:current && ['agreed','no_representatives'].includes(workflow.criteriaAgreement?.status) && evaluationCompleteness(workflow.jobEvaluation,snapshot.rows).ready && analysis.groups.every(g => ['skills','effort','responsibility','conditions'].every(key => !!workflow.classification?.[g.category]?.[key]))},
    {id:'reviews',done:current && analysis.groups.filter(g=>g.explanation_required || g.review_required).every(g=> { const r=workflow.reviews?.[g.category]; return !!r?.explanation && (r.justified || (!!r.action && !!r.owner && !!r.due)); })},
    {id:'approval',done:current && !!workflow.approval?.manager && !!workflow.approval?.representatives && workflow.approval.confirmed && workflow.approval.consulted},
  ];
  const missing = [];
  const need = (step, field, article, category) => missing.push({step,field,article,...(category ? {category} : {})});
  if (!snapshot || !analysis.count) need('data','payroll','3, 9');
  if (!current) need('profile','currentSnapshot','9(6)');
  if (current) {
    if (!workflow.profile?.legalName) need('profile','legalName','2, 9');
    if (!(workflow.profile?.headcount >= analysis.count)) need('profile','headcount','9(2)–(5)');
    if (!workflow.profile?.payrollComplete) need('profile','payrollComplete','3(1)(a)–(b)');
    if (!['agreed','no_representatives'].includes(workflow.criteriaAgreement?.status)) need('categories','criteriaAgreement','4(4)');
    for (const field of evaluationCompleteness(workflow.jobEvaluation,snapshot.rows).missing) need('categories','evaluation','4, 10(4)',field);
    for (const g of analysis.groups) {
      if (['skills','effort','responsibility','conditions'].some(key=>!workflow.classification?.[g.category]?.[key])) need('categories','classification','4(4)',g.category);
      if (g.explanation_required || g.review_required) {
        const r=workflow.reviews?.[g.category];
        if (!r?.explanation) need('reviews','explanation','9(10)',g.category);
        if (!r?.justified && !(r?.action && r?.owner && r?.due)) need('reviews','measures','9(10)',g.category);
      }
    }
    if (!workflow.approval?.manager) need('approval','manager','9(6)');
    if (!workflow.approval?.representatives) need('approval','representatives','9(6)');
    if (!workflow.approval?.confirmed) need('approval','confirmation','9(6)');
    if (!workflow.approval?.consulted) need('approval','consultation','9(6)');
  }
  const assessments = analysis.groups.filter(g=>g.review_required).map(g=> {
    const r=current ? workflow.reviews?.[g.category] : null;
    const date = current && validDate(workflow?.reportingDate) ? new Date(`${workflow.reportingDate}T00:00:00Z`) : null;
    if (date) { const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+6);const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,end)); }
    return {category:g.category, deadline:date?.toISOString().slice(0,10) || null, reportingRequiredByEu, jointAssessmentRequired:reportingRequiredByEu && !!date && date <= new Date() && !r?.justified && !(r?.remedied && remediationComplete(r.proof,snapshot.id))};
  });
  return { checks, missing, percent:Math.round(checks.filter(c=>c.done).length/checks.length*100), ready:checks.every(c=>c.done), assessments, assessment:assessmentCompleteness(workflow,snapshot), evaluation:evaluationCompleteness(workflow?.jobEvaluation,snapshot?.rows || []) };
}
