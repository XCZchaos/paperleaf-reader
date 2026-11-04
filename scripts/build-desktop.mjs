import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {packager} from '@electron/packager';
const root=process.cwd(),work=path.join(root,'work','desktop'),source=path.join(work,'app'),vendor=path.join(work,'vendor');
const {version}=JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8'));
const codexVersion='0.165.0',electronVersion='45.2.2';
await fs.mkdir(work,{recursive:true});await fs.rm(source,{recursive:true,force:true});await fs.mkdir(source,{recursive:true});
await fs.mkdir(path.join(source,'desktop'));for(const name of ['main.mjs','runtime.mjs','updater.mjs','preload.cjs','package.json','README.md'])await fs.copyFile(path.join(root,'desktop',name),path.join(source,'desktop',name));await fs.copyFile(path.join(root,'desktop','package.json'),path.join(source,'package.json'));
await fs.mkdir(path.join(source,'companion'),{recursive:true});for(const name of ['server.mjs','rpc.mjs','research.mjs','progress.mjs','transport.mjs'])await fs.copyFile(path.join(root,'companion',name),path.join(source,'companion',name));
await fs.cp(path.join(root,'desktop/assets'),path.join(source,'desktop/assets'),{recursive:true});
const stamp=path.join(vendor,'version');
if(await fs.readFile(stamp,'utf8').catch(()=>'')!==codexVersion){
 const response=await fetch(`https://registry.npmjs.org/@openai%2Fcodex/${codexVersion}-win32-x64`);if(!response.ok)throw Error('Official Codex package metadata unavailable');const metadata=await response.json();
 const artifact=await fetch(metadata.dist.tarball);if(!artifact.ok)throw Error('Official Codex package download failed');const bytes=Buffer.from(await artifact.arrayBuffer());
 const [algorithm,expected]=metadata.dist.integrity.split('-');if(algorithm!=='sha512'||createHash('sha512').update(bytes).digest('base64')!==expected)throw Error('Codex package integrity mismatch');
 const archive=path.join(work,'codex-windows.tgz');await fs.writeFile(archive,bytes);await fs.rm(vendor,{recursive:true,force:true});await fs.mkdir(vendor,{recursive:true});
 const listing=spawnSync('tar',['-tzf',archive],{encoding:'utf8'});if(listing.status!==0||listing.stdout.split('\n').filter(Boolean).some(x=>!x.startsWith('package/')||x.split('/').includes('..')))throw Error('Unexpected Codex archive layout');
 const extract=spawnSync('tar',['-xzf',archive,'-C',vendor,'--strip-components=1','--no-same-owner'],{encoding:'utf8'});if(extract.status!==0)throw Error('Codex extraction failed');await fs.writeFile(stamp,codexVersion);
}
async function files(dir){const result=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())result.push(...await files(f));else result.push(f);}return result;}
const native=(await files(vendor)).find(x=>path.basename(x)==='codex.exe');if(!native)throw Error('Codex executable missing');
const codex=path.join(work,'codex');await fs.rm(codex,{recursive:true,force:true});await fs.cp(path.dirname(path.dirname(native)),codex,{recursive:true});
// Preserve the upstream license and package-relative resources with the native binary.
for(const name of ['LICENSE','NOTICE']){const response=await fetch(`https://raw.githubusercontent.com/openai/codex/rust-v${codexVersion}/${name}`);if(!response.ok)throw Error(`Missing Codex ${name}`);await fs.writeFile(path.join(codex,name),await response.text());}
const roots=await packager({dir:source,out:path.join(work,'release'),platform:'win32',arch:'x64',electronVersion,name:'Paperleaf',appVersion:version,appBundleId:'com.paperleaf.reader',executableName:'Paperleaf',icon:path.join(root,'desktop/assets/paperleaf.ico'),overwrite:true,asar:true,prune:false,extraResource:[codex],win32metadata:{CompanyName:'Paperleaf',FileDescription:'Paperleaf literature reader',ProductName:'Paperleaf',InternalName:'Paperleaf'},download:{cacheRoot:path.join(work,'electron-cache')}});
const output=roots[0];await fs.copyFile(path.join(root,'desktop/assets/paperleaf.ico'),path.join(output,`paperleaf-${version}.ico`));await fs.copyFile(path.join(root,'desktop','README.md'),path.join(output,'使用说明.md'));
// Product UI supports Chinese and English. Preserve both Chinese variants and
// the Chromium English fallback, while omitting unused browser locale packs.
const supportedLocales=new Set(['en-US.pak','zh-CN.pak','zh-TW.pak']);
for(const name of await fs.readdir(path.join(output,'locales'))){
 if(name.endsWith('.pak')&&!supportedLocales.has(name))await fs.unlink(path.join(output,'locales',name));
}
console.log(JSON.stringify({directory:output,electronVersion,codexVersion}));
