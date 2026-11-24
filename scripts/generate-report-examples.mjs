import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { reportJson,reportHtml,reportPdf } from '../server/reports.js';
import { assessmentJson,assessmentHtml,assessmentPdf } from '../server/assessment.js';
import { controlsDocument,validateControls,controlState } from '../server/employer-controls.js';
import { employerControls,directiveArticles } from '../shared/employer-controls.js';
import { renderPdf,renderHtml } from '../server/document-render.js';
import { referenceSnapshot,expectedArticle9 } from '../tests/fixtures/eu-report-reference.js';

const directory=fileURLToPath(new URL('../docs/examples/eu-reference/',import.meta.url));
await mkdir(directory,{recursive:true});
for(const country of ['DE','AT','SI']){
  const company={name:`SYNTHETIC EXAMPLE ${country} — not a real company`,country};
  const snapshot=referenceSnapshot('authority');
  for(const [type,writers] of [['article9',{json:reportJson,html:reportHtml,pdf:reportPdf}],['article10',{json:assessmentJson,html:assessmentHtml,pdf:assessmentPdf}]]){
    for(const [format,writer] of Object.entries(writers))await writeFile(join(directory,`${country}-${type}.${format}`),await writer(company,snapshot));
  }
  const internal=referenceSnapshot('internal');
  // Explicitly open: a synthetic example must never pretend that real employer processes were verified.
  const controls=validateControls({snapshotId:internal.id,records:Object.fromEntries(employerControls.map(control=>[control.id,{status:'open',owner:'SYNTHETIC HR',action:'Demonstration only; complete with real employer evidence.'}]))},internal);
  internal.workflow.employerControls={...controls,state:controlState(controls,internal.id),articles:directiveArticles};
  for(const [format,writer] of Object.entries({json:reportJson,html:reportHtml,pdf:reportPdf}))await writeFile(join(directory,`${country}-internal-with-annex.${format}`),await writer(company,internal));
  const doc=controlsDocument(company,2026,controls,internal.id);
  await writeFile(join(directory,`${country}-employer-register.html`),renderHtml(doc,{lang:doc.language,title:doc.title}));
  await writeFile(join(directory,`${country}-employer-register.pdf`),await renderPdf(doc,{author:company.name,title:doc.title}));
}
await writeFile(join(directory,'EXPECTED.json'),JSON.stringify({synthetic:true,expectedArticle9},null,2));
await writeFile(join(directory,'README.txt'),'SYNTHETIC EXAMPLES ONLY — NOT A LEGAL CERTIFICATE\narticle9: authority report, Article 9(a-g)\narticle10: joint assessment, Article 10(2)(a-g)\ninternal-with-annex: internal report plus job evaluation, open employer evidence and all 37 articles\nemployer-register: separate employer evidence register\nDE/AT: German; SI: Slovenian. No official state submission.\nEXPECTED.json contains independent arithmetic reference values.\n');
console.log(`Generated synthetic reports: ${directory}`);
