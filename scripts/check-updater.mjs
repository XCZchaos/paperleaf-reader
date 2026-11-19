import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DesktopUpdater,newerVersion,validateRelease} from '../desktop/updater.mjs';
const bytes=Buffer.from('MZ fixture installer payload'),sha=createHash('sha256').update(bytes).digest('hex');
const manifest={version:'1.2.1',date:'2026-11-04',notes:['Continuous reading'],artifact:{platform:'win32-x64',size:bytes.length,sha256:sha,chunks:[{path:`/desktop-updates/1.2.1/${sha}.part`,size:bytes.length,sha256:sha}]}};
const directory=await mkdtemp(path.join(tmpdir(),'paperleaf-updater-'));let launched=0,requests=[],corrupt=false;
const updater=new DesktopUpdater({version:'1.2.0',site:'https://fixture.invalid',dataDir:directory,platform:'win32',arch:'x64',fetch:async(url,options)=>{requests.push({url,options});return url.endsWith('.json')?Response.json(manifest):new Response(corrupt?Buffer.from('corrupted'):bytes)},launch:async file=>{assert.deepEqual(await readFile(file),bytes);launched++}});
try{
 assert(newerVersion('1.10.0','1.9.9'));assert(!newerVersion('1.2.0','1.2.0'));assert(!newerVersion('1.1.9','1.2.0'));assert.throws(()=>newerVersion('1.2.0-evil','1.0.0'));
 for(const change of [m=>m.artifact.chunks[0].path='https://evil.invalid/a.exe',m=>m.artifact.chunks[0].path='/desktop-updates/1.2.1/../evil.part',m=>m.artifact.size++,m=>m.artifact.sha256='bad']){const copy=structuredClone(manifest);change(copy);assert.throws(()=>validateRelease(copy))}
 assert.equal((await updater.check()).status,'available');assert.equal((await updater.download()).status,'ready');
 assert(requests.every(r=>r.options.credentials==='include'&&r.options.redirect==='error'));
 await updater.install();assert.equal(launched,1);
 updater.state.status='available';corrupt=true;assert.equal((await updater.download()).status,'error');assert.equal(launched,1);
 corrupt=false;await updater.download();await writeFile(updater.file,'tampered');assert.equal((await updater.install()).status,'error');assert.equal(launched,1);
 manifest.version='1.1.1';manifest.artifact.chunks[0].path=`/desktop-updates/1.1.1/${sha}.part`;assert.equal((await updater.check()).status,'current');
 await assert.rejects(updater.request('https://evil.invalid'),/不支持/);
 updater.fetch=async()=>new Response('<html>Login</html>',{headers:{'content-type':'text/html'}});assert.equal((await updater.check()).status,'error');assert.match(updater.state.error,/登录/);
 manifest.version='1.2.1';manifest.artifact.chunks[0].path=`/desktop-updates/1.2.1/${sha}.part`;
 updater.fetch=async(url,{signal})=>url.endsWith('.json')?Response.json(manifest):new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 await updater.check();const pending=updater.download();await new Promise(resolve=>setTimeout(resolve,30));updater.cancel();assert.equal((await pending).status,'available');
 let macUrl='';
 const mac=new DesktopUpdater({version:'1.2.0',site:'https://fixture.invalid',dataDir:directory,platform:'darwin',arch:'arm64',fetch:async()=>Response.json(manifest),openExternal:async url=>{macUrl=url},launch:async()=>{throw Error('Must not execute a Windows installer on macOS')}});
 assert.equal((await mac.check()).status,'available');assert.equal(mac.snapshot().manualUpdate,true);assert.equal(mac.snapshot().release.size,0);
 await mac.download();assert.equal(macUrl,'https://github.com/XCZchaos/paperleaf-reader/releases/tag/v1.2.1');assert.equal(mac.snapshot().status,'available');await assert.rejects(mac.install(),/下载/);
 const perChip={arm64:Buffer.from('arm64 package fixture'),x64:Buffer.from('intel package fixture')};
 manifest.macPackages=Object.fromEntries(Object.entries(perChip).map(([arch,data])=>[arch,{size:data.length,sha256:createHash('sha256').update(data).digest('hex')}]));
 for(const arch of ['arm64','x64']){
  let served=perChip[arch],calls=0;const expected=`https://github.com/XCZchaos/paperleaf-reader/releases/download/v1.2.1/Paperleaf-1.2.1-macOS-${arch}.pkg`;
  const u=new DesktopUpdater({version:'1.2.0',site:'https://fixture.invalid',platform:'darwin',arch,dataDir:directory,fetch:async (url,options)=>{
   if(url.endsWith('desktop-update.json'))return Response.json(manifest);
   assert.equal(url,expected);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');return new Response(served);
  },launch:async file=>{assert(file.endsWith('-'+arch+'.pkg'));assert.deepEqual(await readFile(file),perChip[arch]);calls++;}});
  assert.equal((await u.check()).manualUpdate,false);assert.equal(u.snapshot().release.size,served.length);assert.equal(u.snapshot().installMethod,'macos-pkg');
  served=perChip[arch==='x64'?'arm64':'x64'];assert.equal((await u.download()).status,'error');assert.equal(calls,0);
  served=perChip[arch];assert.equal((await u.download()).status,'ready');await writeFile(u.file,'modified');assert.equal((await u.install()).status,'error');assert.equal(calls,0);
  assert.equal((await u.download()).status,'ready');await u.install();assert.equal(calls,1);
 }
 const invalid=structuredClone(manifest);invalid.macPackages.arm64.sha256='not-a-digest';assert.throws(()=>validateRelease(invalid));
 console.log('PASS: per-chip PKGs use fixed release URLs without cloud credentials; swapped packages and post-download tampering are rejected.');
 console.log('PASS: macOS update detection uses release notes and a fixed official release URL; never runs Windows EXE.');
 console.log('PASS: version ordering, manifest boundaries, same-session download, SHA-256, tampering rejection, launch gate, auth failure and cancellation.');
}finally{await rm(directory,{recursive:true,force:true})}
