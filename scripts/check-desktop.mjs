import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const asar=createRequire(require.resolve('@electron/packager'))('@electron/asar');
import {DesktopRuntime,validateDesktopRequest,validOAuthURL} from '../desktop/runtime.mjs';
const temporary=await mkdtemp(path.join(tmpdir(),'paperleaf-desktop-test-'));
let account=null,opened='',calls=[];
class FakeChild extends EventEmitter{
 constructor(){super();this.stdout=new PassThrough();this.stderr=new PassThrough();this.closed=false;let buffer='';this.stdin=new Writable({write:(chunk,_encoding,done)=>{buffer+=chunk.toString();let index;while((index=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,index));buffer=buffer.slice(index+1);if(message.id){let result={};if(message.method==='account/read')result={account:null};if(message.method==='model/list')result={data:[],nextCursor:null};if(message.method==='account/login/start')result={type:'chatgpt',loginId:'fixture',authUrl:'https://auth.openai.com/fixture'};queueMicrotask(()=>this.stdout.write(JSON.stringify({id:message.id,result})+'\n'));}}done()}})}
 kill(){if(this.closed)return;this.closed=true;queueMicrotask(()=>{this.stdout.end();this.emit('exit',0)})}
}
const runtime=new DesktopRuntime({dataDir:temporary,binaryPath:'/fixture/codex.exe',getAccount:async()=>account,openExternal:async url=>{opened=url},spawnProfile:(workdir,profile,options)=>{const child=new FakeChild();calls.push({workdir,profile,options,child});return child}});
try{
 for(const route of ['/status','/status?refresh=1','/jobs/'+crypto.randomUUID()])assert.equal(validateDesktopRequest(route).method,'GET');
 for(const route of ['/file','/execute','https://evil.invalid/status','/../status','/status?token=x'])assert.throws(()=>validateDesktopRequest(route));
 assert.throws(()=>validateDesktopRequest('/login',{method:'GET'}));assert.throws(()=>validateDesktopRequest('/jobs',{method:'POST',body:'a'.repeat(1200001)}));assert.throws(()=>validateDesktopRequest('/jobs',{method:'POST',body:'invalid JSON'}));
 assert(validOAuthURL('https://auth.openai.com/login'));assert(validOAuthURL('https://chatgpt.com/auth/codex'));
 for(const url of ['http://auth.openai.com','https://auth.openai.com.evil.invalid','https://a:b@chatgpt.com','file:///tmp/test'])assert(!validOAuthURL(url));
 await assert.rejects(runtime.request('/status'),/Paperleaf/);assert.equal(calls.length,0);
 account={id:'fixture-owner-one'};const statuses=await Promise.all([runtime.request('/status'),runtime.request('/status')]);assert.equal(calls.length,1);assert(statuses.every(s=>s.connected&&s.account===null));
 assert.equal(calls[0].options.binaryPath,'/fixture/codex.exe');assert.equal(calls[0].options.credentialStore,'auto');assert(!calls[0].profile.includes(account.id));
 const login=await runtime.request('/login',{method:'POST',body:'{}'});assert.deepEqual(login,{started:true});assert.equal(opened,'https://auth.openai.com/fixture');assert(!JSON.stringify(statuses).includes(runtime.bridge.token));
 account={id:'fixture-owner-two'};await runtime.request('/status');assert.equal(calls.length,2);assert.notEqual(calls[0].profile,calls[1].profile);assert(calls[0].child.closed);
 account=null;await assert.rejects(runtime.request('/status'),/Paperleaf/);assert(calls[1].child.closed);assert.equal(runtime.bridge,null);
 account={id:'fixture-owner-two'};await runtime.request('/status');assert.equal(calls.length,3);await runtime.disconnect();assert(calls[2].child.closed);
 const preload=await readFile('desktop/preload.cjs','utf8');
 let bridge,invocations=[];const renderer=new EventEmitter();renderer.invoke=async(...args)=>{invocations.push(args)};
 const expose=(_name,value)=>{bridge=value};
 runInNewContext(preload,{require:()=>({contextBridge:{exposeInMainWorld:expose},ipcRenderer:renderer}),location:{origin:'https://untrusted.example'}});assert.equal(bridge,undefined,'Never expose desktop IPC on another origin');
 runInNewContext(preload,{require:()=>({contextBridge:{exposeInMainWorld:expose},ipcRenderer:renderer}),location:{origin:'https://paperleaf-xcz-reader.shamboo2003.chatgpt.site'}});
 await bridge.setReaderFocus(true);await bridge.setReaderFocus(false);assert.deepEqual(invocations,[['paperleaf:reader-focus',true],['paperleaf:reader-focus',false]]);
 let toggles=0;const stop=bridge.onReaderFocusToggle((...args)=>{assert.equal(args.length,0,'Do not expose Electron event objects');toggles++});
 renderer.emit('paperleaf:toggle-reader-focus',{sender:'private'});assert.equal(toggles,1);stop();renderer.emit('paperleaf:toggle-reader-focus');assert.equal(toggles,1);assert.equal(renderer.listenerCount('paperleaf:toggle-reader-focus'),0,'Reader unmount cleans up native listener');
 console.log('PASS: focus-mode preload origin gate, narrow IPC, isolated callbacks and listener cleanup.');
 const packageRoot=path.join(process.cwd(),'work/desktop/release/Paperleaf-win32-x64');
 for(const file of ['Paperleaf.exe','resources/codex/bin/codex.exe']){const data=await readFile(path.join(packageRoot,file));assert.equal(data.subarray(0,2).toString(),'MZ');const offset=data.readUInt32LE(0x3c);assert.equal(data.subarray(offset,offset+4).toString(),'PE\0\0');assert.equal(data.readUInt16LE(offset+4),0x8664);}
 for(const file of ['desktop/main.mjs','desktop/runtime.mjs','desktop/updater.mjs','desktop/preload.cjs','companion/server.mjs','companion/rpc.mjs','companion/research.mjs','companion/progress.mjs','companion/transport.mjs','desktop/assets/paperleaf.ico'])assert.deepEqual(asar.extractFile(path.join(packageRoot,'resources/app.asar'),file),await readFile(file),file+' differs from source');
 const {version}=JSON.parse(await readFile('desktop/package.json','utf8'));
 for(const file of ['package.json','desktop/package.json'])assert.equal(JSON.parse(asar.extractFile(path.join(packageRoot,'resources/app.asar'),file).toString()).version,version,'Packaged version mismatch: '+file);
 assert.equal(JSON.parse(await readFile('companion/package.json','utf8')).version,version,'Companion version mismatch');
 assert.equal(statuses[0].version,version,'Bridge status version mismatch');
 assert.match(asar.extractFile(path.join(packageRoot,'resources/app.asar'),'desktop/preload.cjs').toString(),new RegExp("version:'"+version.replaceAll('.','\\.')+"'"),'Exposed desktop version mismatch');
 const brand=await readFile('desktop/assets/paperleaf.ico');assert.deepEqual(await readFile(path.join(packageRoot,`paperleaf-${version}.ico`)),brand);
 const {NtExecutable,NtExecutableResource,Resource,Data}=createRequire(require.resolve('@electron/packager'))('resedit');const exe=NtExecutable.from(await readFile(path.join(packageRoot,'Paperleaf.exe')));const resources=NtExecutableResource.from(exe);const group=Resource.IconGroupEntry.fromEntries(resources.entries)[0];const embedded=group.getIconItemsFromEntries(resources.entries),expected=Data.IconFile.from(brand).icons;assert.equal(embedded.length,expected.length);for(let i=0;i<expected.length;i++)assert(Buffer.from(embedded[i].bin).equals(Buffer.from(expected[i].data.bin)),'Application PE icon differs from Paperleaf brand');
 const versionResource=Resource.VersionInfo.fromEntries(resources.entries)[0];assert(versionResource,'Application PE version missing');
 const productVersions=versionResource.getAvailableLanguages().map(language=>versionResource.getStringValues(language).ProductVersion).filter(Boolean);assert(productVersions.length);assert(productVersions.every(value=>value===version||value===version+'.0'),'Application PE version mismatch');
 const native=JSON.parse(await readFile(path.join(packageRoot,'resources/codex/codex-package.json'),'utf8'));assert.equal(native.entrypoint,'bin/codex.exe');assert.equal(native.version,'0.165.0');
 console.log('PASS: desktop authentication gate, parallel initialization, narrow IPC route validation, official OAuth URL checks, system-browser login dispatch, per-account Codex profiles, logout cleanup, Windows x64 package binaries and exact packaged source bytes.');
 console.log('Windows GUI, signed-in OAuth, and real model requests are not exercised by these Linux tests.');
}finally{await runtime.disconnect();await rm(temporary,{recursive:true,force:true})}
