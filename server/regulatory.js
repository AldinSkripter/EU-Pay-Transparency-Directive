import { obligation } from '../shared/plans.js';
export const regulatory = {
  source:'https://eur-lex.europa.eu/eli/dir/2023/970/oj/eng',
  version:'EU-2023-970-v2',
  verifiedOn:'2026-11-03',
  nationalSource:'https://eur-lex.europa.eu/legal-content/EN/NIM/?uri=CELEX:32023L0970',
  transpositionDeadline:'2026-06-07',
  indicators:['overall_gap','variable_gap','median_gap','median_variable_gap','variable_recipients','quartiles','equal_value_categories'],
  recipients:[
    {id:'authority',article:'9(7)',indicators:'a-g',description:'Nationally designated collection and publication body'},
    {id:'workers',article:'9(9)',indicators:'g required; a-f included as additional summary',description:'Workers and workers’ representatives; inspectorate/equality body upon request'},
    {id:'public',article:'9(7)',indicators:'a-f',description:'Optional employer publication; national body publication is defined by Article 29'},
    {id:'internal',article:'9(6), 10',indicators:'a-g + methodology + review',description:'Management and representatives: methodology, explanations, remediation'},
  ],
  markets:Object.fromEntries(['DE','AT','SI'].map(country=>[country,{country,authority:null,submissionFormat:null,schema:null,status:'NATIONAL_CHANNEL_UNVERIFIED',automaticSubmission:false}])),
};
export function reportingPlan(country,year,headcount,audience='internal') {
  const recipient=regulatory.recipients.find(r=>r.id===audience);
  if (!recipient || !regulatory.markets[country]) throw new Error('INVALID_AUDIENCE');
  const confirmed=Number.isInteger(headcount) && headcount>0;
  const duty=confirmed ? obligation(headcount) : null;
  const firstYear=duty?.reporting ? Number(duty.firstDue.slice(0,4)) : null;
  const frequency=duty?.frequencyYears ?? null;
  const reportingYear=year+1;
  const due=firstYear && reportingYear>=firstYear && (reportingYear-firstYear)%frequency===0 ? `${reportingYear}-06-07` : null;
  return {rulesVersion:regulatory.version,source:regulatory.source,verifiedOn:regulatory.verifiedOn,country,referenceYear:year,headcount:confirmed?headcount:null,headcountConfirmed:confirmed,
    euMinimum:{firstDue:firstYear?`${firstYear}-06-07`:null,frequencyYears:frequency,dueForReferenceYear:due},recipient,
    national:regulatory.markets[country],delivery:{mode:'USER_DOWNLOAD',officialSubmissionAvailable:false,receipt:null}};
}
