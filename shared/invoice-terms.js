export function dueDateFromTerm(issueDate,days) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)||![0,7,14,30,60].includes(days))return null;
  const date=new Date(issueDate+'T12:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==issueDate)return null;
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
