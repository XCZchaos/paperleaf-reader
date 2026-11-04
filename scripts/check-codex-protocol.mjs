// Validate the real protocol decoder without a login, model request, or account quota.
import assert from 'node:assert/strict';
import {spawnCodexProfile} from '../companion/server.mjs';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {CodexRPC} from '../companion/rpc.mjs';
const temporary=await mkdtemp(path.join(process.cwd(),'work/paperleaf-protocol-'));
const profile=path.join(temporary,'profile'),workdir=path.join(temporary,'reading');
await mkdir(profile);await mkdir(workdir);
const child=spawnCodexProfile(workdir,profile),rpc=new CodexRPC(child);
try {
 await rpc.initialize();assert.equal((await rpc.request('account/read',{refreshToken:false})).account,null);
 const config=await rpc.request('config/read',{includeLayers:false,cwd:workdir});
 assert.equal(config.config.default_permissions,'paperleaf_reading');
 const permissions=config.config.permissions.paperleaf_reading;
 assert.equal(permissions.filesystem[':root'],'deny');
 assert.equal(permissions.filesystem[':workspace_roots'],'read');
 assert.equal(permissions.network.enabled,false);
 const profiles=await rpc.request('permissionProfile/list',{cwd:workdir});
 assert(profiles.data.some(p=>p.id==='paperleaf_reading'&&p.allowed),JSON.stringify(profiles.data));
 const turn={threadId:'00000000-0000-4000-8000-000000000000',input:[{type:'text',text:'Protocol validation only',text_elements:[]}],approvalPolicy:'untrusted'};
 await assert.rejects(rpc.request('turn/start',{...turn,sandboxPolicy:{type:'readOnly',access:{type:'restricted',includePlatformDefaults:false,readableRoots:[workdir]}}}),/readOnly.access/);
 // Reaching the thread lookup proves this request passed the actual decoder.
 await assert.rejects(rpc.request('turn/start',turn),/thread.*(not found|unknown)|no thread found/i);
 console.log('PASS: Codex 0.165.0 initialize/account, registered restricted permission profile (root denied, reading workspace read-only, tool network disabled), old-parameter regression and current turn decoding. No inference was attempted.');
} finally {
 rpc.close();await Promise.race([new Promise(r=>{if(child.exitCode!==null)r();else child.once('exit',r)}),new Promise(r=>setTimeout(()=>{child.kill('SIGKILL');r()},1000))]);
 await rm(temporary,{recursive:true,force:true});
}
