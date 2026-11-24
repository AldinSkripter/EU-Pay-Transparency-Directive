import { mkdir,writeFile } from 'node:fs/promises';
import { defaultEmailSettings,renderEmail,emailKinds } from '../server/email-platform.js';
const dir=new URL('../docs/examples/emails/',import.meta.url);await mkdir(dir,{recursive:true});
for(const country of ['DE','AT','SI'])for(const kind of emailKinds){
  const message=renderEmail(defaultEmailSettings(),kind,country,{link:'https://example.com/email-preview',company:country==='SI'?'Primer d.o.o.':'Beispiel GmbH',email:'sample@example.test'});
  await writeFile(new URL(`${country}-${kind}.html`,dir),message.html);
  await writeFile(new URL(`${country}-${kind}.txt`,dir),message.text);
}
console.log('Generated DE/AT/SI email design examples. Links are preview placeholders.');
