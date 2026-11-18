// Run on a native macOS runner of the target architecture; no cross-build claims.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw Error('Build this installer on an Apple Silicon or Intel macOS runner.');
const root=process.cwd(),arch=process.arch,work=path.join(root,'work',`mac-${arch}`),source=path.join(work,'app');
const {version}=JSON.parse(await fs.readFile('desktop/package.json','utf8'));
const codexVersion='0.165.0',electronVersion='45.2.2';
const require=createRequire(path.join(root,'work/mac-tooling/package.json'));
const {packager}=require('@electron/packager');
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15*60*1000});
await fs.rm(work,{recursive:true,force:true});await fs.mkdir(source,{recursive:true});
await fs.cp('desktop',path.join(source,'desktop'),{recursive:true,filter:src=>!src.endsWith('uninstall-files.nsh')});
await fs.copyFile('desktop/package.json',path.join(source,'package.json'));
await fs.mkdir(path.join(source,'companion'));
for(const name of ['server.mjs','rpc.mjs','research.mjs','argument.mjs','progress.mjs','transport.mjs'])await fs.copyFile(path.join('companion',name),path.join(source,'companion',name));

const metadataResponse=await fetch(`https://registry.npmjs.org/@openai%2Fcodex/${codexVersion}-darwin-${arch}`);
if(!metadataResponse.ok)throw Error('Official macOS Codex package metadata unavailable');
const metadata=await metadataResponse.json();
const archiveResponse=await fetch(metadata.dist.tarball);if(!archiveResponse.ok)throw Error('Official macOS Codex archive unavailable');
const bytes=Buffer.from(await archiveResponse.arrayBuffer()),[algorithm,expected]=metadata.dist.integrity.split('-');
if(algorithm!=='sha512'||createHash('sha512').update(bytes).digest('base64')!==expected)throw Error('Codex archive integrity mismatch');
const archive=path.join(work,'codex.tgz'),vendor=path.join(work,'vendor');await fs.writeFile(archive,bytes);await fs.mkdir(vendor);
if(run('tar',['-tzf',archive]).split('\n').filter(Boolean).some(p=>!p.startsWith('package/')||p.split('/').includes('..')))throw Error('Unexpected Codex archive layout');
run('tar',['-xzf',archive,'-C',vendor,'--strip-components=1']);
async function files(dir){const result=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())result.push(...await files(f));else result.push(f)}return result}
const native=(await files(vendor)).find(p=>path.basename(p)==='codex'&&path.basename(path.dirname(p))==='bin');
if(!native)throw Error('Codex executable missing');
const codex=path.join(work,'codex');await fs.cp(path.dirname(path.dirname(native)),codex,{recursive:true});
for(const name of ['LICENSE','NOTICE']){const response=await fetch(`https://raw.githubusercontent.com/openai/codex/rust-v${codexVersion}/${name}`);if(!response.ok)throw Error(`Missing Codex ${name}`);await fs.writeFile(path.join(codex,name),await response.text())}

// Derive the native macOS icon from the existing Paperleaf brand artwork.
const iconset=path.join(work,'paperleaf.iconset');await fs.mkdir(iconset);
for(const size of [16,32,128,256,512])for(const scale of [1,2])run('sips',['-z',String(size*scale),String(size*scale),'desktop/assets/paperleaf.png','--out',path.join(iconset,`icon_${size}x${size}${scale===2?'@2x':''}.png`)]);
const icon=path.join(work,'paperleaf.icns');run('iconutil',['-c','icns',iconset,'-o',icon]);
const [output]=await packager({dir:source,out:path.join(work,'release'),platform:'darwin',arch,electronVersion,name:'Paperleaf',appVersion:version,appBundleId:'com.paperleaf.reader',executableName:'Paperleaf',icon,overwrite:true,asar:true,prune:false,extraResource:[codex],extendInfo:{NSHumanReadableCopyright:'Paperleaf · Open source components retain their original licenses.'}});
const app=path.join(output,'Paperleaf.app');
// Ad-hoc signing makes both architectures executable, but is not a Developer ID
// signature or Apple notarization. Do not describe this build as notarized.
run('codesign',['--force','--deep','--sign','-',app]);
run('codesign',['--verify','--deep','--strict',app]);
const stage=path.join(work,'dmg');await fs.mkdir(stage);run('ditto',[app,path.join(stage,'Paperleaf.app')]);await fs.symlink('/Applications',path.join(stage,'Applications'));
await fs.writeFile(path.join(stage,'安装说明.txt'),`Paperleaf ${version} · ${arch==='arm64'?'Apple Silicon':'Intel'}\n\n将 Paperleaf.app 拖入 Applications（应用程序）。\n首次打开可能被 macOS 拦截：在确认来源和 SHA-256 后，可通过「系统设置 → 隐私与安全性 → 仍要打开」授权此应用。\n本包仅作 ad-hoc 签名，尚未经过 Apple Developer ID 签名与公证。不要关闭系统的全局安全保护。\n更新时退出 Paperleaf，再用新版替换「应用程序」中的旧版；用户资料独立保存。\n`);
const installer=path.join(work,`Paperleaf-${version}-macOS-${arch}.dmg`);
run('hdiutil',['create','-volname',`Paperleaf ${version}`,'-srcfolder',stage,'-ov','-format','UDZO',installer]);
run('hdiutil',['verify',installer]);
const data=await fs.readFile(installer),sha256=createHash('sha256').update(data).digest('hex');
await fs.writeFile(installer+'.sha256',`${sha256}  ${path.basename(installer)}\n`);
await fs.writeFile(path.join(work,'build.json'),JSON.stringify({version,arch,platform:'darwin',electronVersion,codexVersion,installer,app,sha256,size:data.length,signing:'ad-hoc',notarized:false},null,2)+'\n');
console.log(JSON.stringify({installer,app,arch,sha256,bytes:data.length,signing:'ad-hoc',notarized:false}));
