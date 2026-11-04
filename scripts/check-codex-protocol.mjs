// Validate the real protocol decoder without a login, model request, or account quota.
import assert from 'node:assert/strict';
import {spawnCodexProfile} from '../companion/server.mjs';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {CodexRPC} from '../companion/rpc.mjs';
await mkdir('work',{recursive:true});
const temporary=await mkdtemp(path.join(process.cwd(),'work/paperleaf-protocol-'));
const profile=path.join(temporary,'profile'),workdir=path.join(temporary,'reading');
await mkdir(profile);await mkdir(workdir);
const child=spawnCodexProfile(workdir,profile,{binaryPath:process.env.PAPERLEAF_TEST_CODEX_BINARY}),rpc=new CodexRPC(child);
try {
 await rpc.initialize();assert.equal((await rpc.request('account/read',{refreshToken:false})).account,null);
 const config=await rpc.request('config/read',{includeLayers:false,cwd:workdir});
 assert.equal(config.config.model_provider,'paperleaf_chatgpt');
 const provider=config.config.model_providers.paperleaf_chatgpt;
 assert.equal(provider.requires_openai_auth,true);
 assert.equal(provider.wire_api,'responses');
 assert.equal(provider.supports_websockets,false);
 assert(!provider.env_key&&!provider.base_url,'Codex must continue choosing the signed-in ChatGPT backend');
 assert.equal(config.config.default_permissions,'paperleaf_reading');
 const permissions=config.config.permissions.paperleaf_reading;
 assert.equal(permissions.filesystem[':root'],'read');
 assert.equal(config.config.project_doc_max_bytes,0);

 assert.equal(permissions.network.enabled,false);
 const profiles=await rpc.request('permissionProfile/list',{cwd:workdir});
 assert(profiles.data.some(p=>p.id==='paperleaf_reading'&&p.allowed),JSON.stringify(profiles.data));
 // This real thread startup exercises AGENTS discovery and Windows sandbox preparation.
 const started=await rpc.request('thread/start',{cwd:workdir,model:'gpt-6.1-sol',approvalPolicy:'untrusted',permissions:'paperleaf_reading',ephemeral:true,baseInstructions:'Read only supplied text. No tools.'},45000);
 assert(started.thread.id);
 await rpc.request('thread/unsubscribe',{threadId:started.thread.id});
 const turn={threadId:'00000000-0000-4000-8000-000000000000',input:[{type:'text',text:'Protocol validation only',text_elements:[]}],approvalPolicy:'untrusted'};
 await assert.rejects(rpc.request('turn/start',{...turn,sandboxPolicy:{type:'readOnly',access:{type:'restricted',includePlatformDefaults:false,readableRoots:[workdir]}}}),/readOnly.access/);
 // Reaching the thread lookup proves this request passed the actual decoder.
 await assert.rejects(rpc.request('turn/start',turn),/thread.*(not found|unknown)|no thread found/i);
 console.log('PASS: Codex 0.165.0 initialize/account, registered restricted permission profile (portable read-only, project instructions disabled, tool network disabled), real thread startup, old-parameter regression and current turn decoding. No inference was attempted.');
} finally {
 // Close the inherited stdin pipe as well as the npm launcher. On Windows the
 // native child can briefly retain its cwd after the launcher reports exit.
 child.stdin.end();rpc.close();await Promise.race([new Promise(r=>{if(child.exitCode!==null)r();else child.once('close',r)}),new Promise(r=>setTimeout(()=>{child.kill('SIGKILL');r()},1000))]);
 await rm(temporary,{recursive:true,force:true,maxRetries:12,retryDelay:150});
}
