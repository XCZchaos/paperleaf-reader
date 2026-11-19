import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
if(process.platform!=='darwin')throw Error('Native macOS validation required');
const arch=process.arch,root=process.cwd(),work=path.join(root,`work/mac-${arch}`);
const build=JSON.parse(await fs.readFile(path.join(work,'build.json'),'utf8'));
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',timeout:180000});
const require=createRequire(path.join(root,'work/mac-tooling/package.json'));
const asar=createRequire(require.resolve('@electron/packager'))('@electron/asar');
const mount=path.join(work,'mounted');await fs.mkdir(mount,{recursive:true});
run('hdiutil',['attach','-nobrowse','-readonly','-mountpoint',mount,build.installer]);
try{
 const installed=path.join(work,'installed','Paperleaf.app');await fs.mkdir(path.dirname(installed),{recursive:true});run('ditto',[path.join(mount,'Paperleaf.app'),installed]);
 assert.equal(await fs.readlink(path.join(mount,'Applications')),'/Applications');
 run('codesign',['--verify','--deep','--strict',installed]);
 const contents=path.join(installed,'Contents'),resources=path.join(contents,'Resources');
 const appBinary=path.join(contents,'MacOS/Paperleaf'),codex=path.join(resources,'codex/bin/codex');
 for(const binary of [appBinary,codex])assert.equal(run('lipo',['-archs',binary]).trim(),arch==='x64'?'x86_64':'arm64');
 const plist=JSON.parse(run('plutil',['-convert','json','-o','-',path.join(contents,'Info.plist')]));
 assert.equal(plist.CFBundleShortVersionString,build.version);assert.equal(plist.CFBundleIdentifier,'com.paperleaf.reader');
 assert((await fs.stat(path.join(resources,plist.CFBundleIconFile))).size>1000);
 for(const file of ['desktop/main.mjs','desktop/runtime.mjs','desktop/updater.mjs','desktop/preload.cjs','companion/server.mjs','companion/rpc.mjs','companion/research.mjs','companion/argument.mjs','companion/progress.mjs','companion/transport.mjs'])assert.deepEqual(asar.extractFile(path.join(resources,'app.asar'),file),await fs.readFile(file),file+' differs from source');
 assert.equal(JSON.parse(asar.extractFile(path.join(resources,'app.asar'),'package.json').toString()).version,build.version);
 const dmg=await fs.readFile(build.installer);assert.equal(createHash('sha256').update(dmg).digest('hex'),build.sha256);
 console.log('PASS: mounted DMG, Applications link, copied app, architecture, brand icon, version, ad-hoc signature, packaged source and SHA-256.');
 execFileSync(process.execPath,['scripts/check-codex-protocol.mjs'],{env:{...process.env,PAPERLEAF_TEST_CODEX_BINARY:codex},stdio:'inherit',timeout:120000});
 const child=spawn(appBinary,[],{stdio:['ignore','pipe','pipe']});let stderr='',spawnError=null;child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-8000)});child.on('error',error=>{spawnError=error});
 try{await new Promise(resolve=>setTimeout(resolve,12000));if(spawnError)throw spawnError;assert.equal(child.exitCode,null,'Desktop exited during startup: '+stderr);console.log('PASS: installed macOS desktop remained running for 12 seconds. OAuth/model inference and Gatekeeper approval are not covered.');}
 finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve()},3000).unref()});}
}finally{run('hdiutil',['detach',mount]);}

// Exercise the same per-chip download and install gate as the renderer, then use
// Apple's noninteractive Installer engine on a disposable native runner.
if(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_ENVIRONMENT==='github-hosted'){
 const {DesktopUpdater}=await import('../desktop/updater.mjs');
 const {createReadStream,createWriteStream}=await import('node:fs');
 const {Readable}=await import('node:stream');
 const {pipeline}=await import('node:stream/promises');
 const {homedir}=await import('node:os');
 const appPath='/Applications/Paperleaf.app',old='1.5.2',oldName=`Paperleaf-${old}-macOS-${arch}.dmg`;
 assert.equal(await fs.lstat(appPath).catch(e=>{if(e.code==='ENOENT')return null;throw e}),null,'Runner already contains Paperleaf');
 const oldFile=path.join(work,oldName),prevMount=path.join(work,'previous');
 const response=await fetch(`https://github.com/XCZchaos/paperleaf-reader/releases/download/v${old}/${oldName}`);
 assert(response.ok);await pipeline(Readable.fromWeb(response.body),createWriteStream(oldFile,{flags:'wx'}));
 const priorHash={arm64:'d9211e782865196544c8b64e8f797b9672754de6689ce2043ebc13dcbaed52c1',x64:'afbe2708ff246cd6cc942a3f336fc61fea35b7875c780cfcc405e89df9b48b73'}[arch];
 assert.equal(createHash('sha256').update(await fs.readFile(oldFile)).digest('hex'),priorHash);
 await fs.mkdir(prevMount);run('hdiutil',['attach','-nobrowse','-readonly','-mountpoint',prevMount,oldFile]);
 try{run('sudo',['-n','/usr/bin/ditto',path.join(prevMount,'Paperleaf.app'),appPath]);}finally{run('hdiutil',['detach',prevMount]);}
 const installedPlist=path.join(appPath,'Contents/Info.plist');
 const versionOf=()=>run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',installedPlist]).trim();
 assert.equal(versionOf(),old);
 const profile=path.join(homedir(),'Library','Application Support','Paperleaf');await fs.mkdir(profile,{recursive:true});
 const marker=path.join(profile,'qa-retained-'+crypto.randomUUID());await fs.writeFile(marker,'user data fixture',{flag:'wx'});
 const url=`https://github.com/XCZchaos/paperleaf-reader/releases/download/v${build.version}/Paperleaf-${build.version}-macOS-${arch}.pkg`;
 const hash='a'.repeat(64),manifest={version:build.version,date:'2026-11-19',notes:['Test release'],artifact:{platform:'win32-x64',size:1,sha256:hash,chunks:[{path:`/desktop-updates/${build.version}/${hash}.part`,size:1,sha256:hash}]},macPackages:{[arch]:{size:build.pkgSize,sha256:build.pkgSha256}}};
 const updater=new DesktopUpdater({version:old,platform:'darwin',arch,site:'https://paperleaf.test',dataDir:path.join(work,'update-profile'),
  fetch:async(address,options)=>{if(address.endsWith('/desktop-update.json'))return Response.json(manifest);assert.equal(address,url);assert.equal(options.credentials,'omit');return new Response(Readable.toWeb(createReadStream(build.pkg)));},
  launch:async file=>{assert.equal(path.basename(file),path.basename(build.pkg));run('sudo',['-n','/usr/sbin/installer','-pkg',file,'-target','/']);}});
 assert.equal((await updater.check()).status,'available');
 assert.equal((await updater.download()).status,'ready');
 const applied=await updater.install();assert.equal(applied.status,'installing',applied.error);
 assert.equal(versionOf(),build.version);assert.equal(await fs.readFile(marker,'utf8'),'user data fixture');
 run('codesign',['--verify','--deep','--strict',appPath]);await fs.unlink(marker);
 console.log(`PASS: native ${arch} updated the installed ${old} app to ${build.version} using the actual PKG through the download and verification flow; retained the profile marker. Interactive Gatekeeper approval is outside this run.`);
}
