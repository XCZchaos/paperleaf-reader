import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const JSZip=require(require.resolve('jszip',{paths:[path.dirname(require.resolve('pptxgenjs'))]}));
const zip=new JSZip();
for(const name of ['package.json','README.md','server.mjs','rpc.mjs','research.mjs','start-windows.cmd','start-macos.command']){
 let data=await fs.readFile(path.join('companion',name));
 if(name.endsWith('.cmd'))data=Buffer.from(data.toString().replace(/\r?\n/g,'\r\n'));
 zip.file('paperleaf-codex/'+name,data,{unixPermissions:name.endsWith('.command')?0o100755:0o100644});
}
await fs.mkdir('public/downloads',{recursive:true});
await fs.writeFile('public/downloads/paperleaf-codex-companion.zip',await zip.generateAsync({type:'nodebuffer',platform:'UNIX',compression:'DEFLATE'}));
console.log('Packaged companion source, launchers and Chinese setup guide.');
