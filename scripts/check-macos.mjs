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
