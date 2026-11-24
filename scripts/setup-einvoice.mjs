import {mkdir,writeFile,readFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const version='2.26.0',filename=`Mustang-CLI-${version}.jar`,expected='42d7868cb68264874a7b8cab4c3587b03b23ccc7cd72373da917f66758bb9736';
const path=new URL('../var/tools/'+filename,import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let existing;try{existing=await readFile(path);}catch{}
if(existing&&sha(existing)===expected){console.log('Pinned Mustang validator is installed.');process.exit(0);}
const response=await fetch(`https://github.com/ZUGFeRD/mustangproject/releases/download/core-${version}/${filename}`);
if(!response.ok)throw Error('Validator download failed: '+response.status);
const bytes=Buffer.from(await response.arrayBuffer());if(sha(bytes)!==expected)throw Error('Validator checksum mismatch; installation aborted');
await mkdir(new URL('../var/tools/',import.meta.url),{recursive:true});await writeFile(new URL(path.href+'.tmp'),bytes);await rename(new URL(path.href+'.tmp'),path);
console.log('Installed pinned Mustang 2.26.0. Java 17+ is required. Apache-2.0: https://github.com/ZUGFeRD/mustangproject/blob/master/LICENSE');
