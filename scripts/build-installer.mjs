import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=process.cwd();
const {version}=JSON.parse(await fs.readFile('desktop/package.json','utf8'));
const packageDir=path.join(root,'work/desktop/release/Paperleaf-win32-x64');
const shipped=[],dirs=[];
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isDirectory()){await walk(file);dirs.push(path.relative(packageDir,file));}else shipped.push(path.relative(packageDir,file));
}}
await walk(packageDir);
const nsisPath=p=>p.split(path.sep).join('\\').replaceAll('$','$$').replaceAll('"','$\\"');
await fs.writeFile('desktop/uninstall-files.nsh',shipped.map(p=>`Delete "$INSTDIR\\${nsisPath(p)}"`).concat(dirs.map(p=>`RMDir "$INSTDIR\\${nsisPath(p)}"`)).join('\n')+'\n');
// Use the pinned builder's checksum-verified compiler directly. Our custom NSIS
// script embeds raw files; building a second .7z payload only wastes disk/time.
// Direct compilation also permits LZMA to finish on slower build machines.
const require=createRequire(import.meta.url);
const builderRequire=createRequire(require.resolve('electron-builder'));
const {getMakeNsisPath}=builderRequire('app-builder-lib/out/toolsets/windows.js');
const compiler=await getMakeNsisPath();
const output=path.join(root,'work/desktop/installer',`Paperleaf-Setup-${version}-Windows-x64.exe`);
await fs.mkdir(path.dirname(output),{recursive:true});
const escape=value=>value.replaceAll('$','$$').replaceAll('"','$\\"').replace(/[\r\n]/g,' ');
await new Promise((resolve,reject)=>{
  const child=spawn(compiler.path,['-WX','-V3','-INPUTCHARSET','UTF8',
    `-DPROJECT_DIR=${escape(root)}`,`-DVERSION=${version}`,
    `-XOutFile "${escape(output)}"`,path.join(root,'desktop/installer.nsi')],
    {cwd:root,env:{...process.env,...compiler.env},stdio:'inherit',timeout:30*60*1000});
  child.once('error',reject);
  child.once('close',(code,signal)=>code===0?resolve():reject(Error(`NSIS compilation failed (${signal||code})`)));
});
const bytes=(await fs.stat(output)).size;
// Leave room for the web app below the private Site's 256 MiB archive limit.
if(bytes>245*1024*1024)throw Error('Installer exceeds the 245 MiB release budget; reduce the payload before publishing.');
console.log(JSON.stringify({version,files:[output],bytes,sizeMiB:Number((bytes/1024**2).toFixed(1))}));
