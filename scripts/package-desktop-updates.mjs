// Run after build-site. Static chunks stay under Workers' per-file asset limit;
// they are authenticated by the existing private Site and never enter source Git.
import {mkdir,open,writeFile,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateRelease} from '../desktop/updater.mjs';
const release=JSON.parse(await readFile('desktop/release.json','utf8'));
const {version}=JSON.parse(await readFile('desktop/package.json','utf8'));
if(version!==release.version)throw Error('Desktop/release version mismatch');
const source=path.resolve(`work/desktop/installer/Paperleaf-Setup-${version}-Windows-x64.exe`);
const root=path.resolve('dist/client'),relative=`/desktop-updates/${version}`;
await stat(path.join(root,'vinext-client-entry-manifest.json'));
await rm(path.join(root,'desktop-updates'),{recursive:true,force:true});
await mkdir(root+relative,{recursive:true});
const hash=createHash('sha256'),chunks=[];let size=0;
const input=await open(source,'r');
try{
 while(true){
  const buffer=Buffer.alloc(20*1024**2),{bytesRead}=await input.read(buffer,0,buffer.length,null);if(!bytesRead)break;
  const bytes=buffer.subarray(0,bytesRead),sha256=createHash('sha256').update(bytes).digest('hex');
  hash.update(bytes);size+=bytesRead;const url=relative+'/'+sha256+'.part';
  await writeFile(root+url,bytes);chunks.push({path:url,size:bytesRead,sha256});
 }
}finally{await input.close()}
const sha256=hash.digest('hex');if(sha256!==release.sha256)throw Error('Installer SHA-256 differs from published release metadata');
const manifest=validateRelease({version,date:release.date,notes:release.notes,artifact:{platform:'win32-x64',size,sha256,chunks}});
await writeFile(path.join(root,'desktop-update.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version,size,chunks:chunks.length,sha256}));
