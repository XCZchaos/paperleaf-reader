// Explicit opt-in; two real model calls using a tiny synthetic paper. No tokens
// are read, copied or printed. The supplied, already signed-in profile is reused.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {spawnCodexProfile,createBridge,SITE} from '../companion/server.mjs';
import {CodexRPC} from '../companion/rpc.mjs';
import {newArgumentStudy,generateArgumentStudy,studyComplete} from '../lib/argument-study.mjs';
import {argumentHtml} from '../lib/argument-html.mjs';
import {fixturePaper,fixturePages} from './check-argument.mjs';
const args=process.argv.slice(2);
if(!args.includes('--default-profile')&&!args.includes('--profile'))throw Error('Explicit --profile <already-signed-in-profile> or --default-profile required; consumes account quota.');
const profile=args.includes('--profile')?path.resolve(args[args.indexOf('--profile')+1]):process.env.CODEX_HOME||path.join(homedir(),'.codex');
await fs.mkdir('work/argument',{recursive:true});const workdir=await fs.mkdtemp(path.resolve('work/argument/live-'));
const child=spawnCodexProfile(workdir,profile),rpc=new CodexRPC(child);let bridge;
try{
 await rpc.initialize();const {account}=await rpc.request('account/read',{refreshToken:false});assert.equal(account?.type,'chatgpt','The profile must already be signed in to ChatGPT.');
 bridge=createBridge({rpc,workdir,port:0});await new Promise(r=>bridge.server.listen(0,'127.0.0.1',r));
 const call=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${bridge.server.address().port}${route}`,{method:body?'POST':'GET',headers:{Origin:SITE,'X-Paperleaf-Token':bridge.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw Error(v.error);return v};
 const status=await call('/status');const model=['gpt-6.2-sol','gpt-6.1-sol','gpt-6-sol'].map(id=>status.models.find(m=>m.id===id)).find(Boolean)||status.models.find(m=>m.default);assert(model,'No usable model returned');
 const effort=['low','medium'].find(id=>model.reasoningEfforts?.some(e=>e.id===id))||'';
 console.log(JSON.stringify({test:'argument-live',model:model.id,effort,source:'five synthetic paragraphs, three pages'}));
 const runTask=async(input,signal,onProgress)=>{
  let j=await call('/jobs',{...input,id:crypto.randomUUID()}),lastLog=Date.now();const start=Date.now();
  while(['preparing','running'].includes(j.status)){
   if(signal.aborted||Date.now()-start>360000){await call('/jobs/'+j.id+'/cancel',{});throw Error('Live test cancelled or timed out');}
   await new Promise(r=>setTimeout(r,500));j=await call('/jobs/'+j.id);onProgress(j);
   if(Date.now()-lastLog>30000){console.log(JSON.stringify({phase:input.argument.phase,status:j.status,stage:j.stage,seconds:Math.round((Date.now()-start)/1000),retries:j.retryCount||0}));lastLog=Date.now();}
  }
  assert.equal(j.status,'completed',j.error);console.log(JSON.stringify({phase:input.argument.phase,seconds:Math.round((Date.now()-start)/1000),retries:j.retryCount||0}));return j;
 };
 const result=await generateArgumentStudy({study:newArgumentStudy(fixturePaper,fixturePages,'body','科研方法 · 合成材料实测'),runTask,signal:AbortSignal.timeout(720000),onProgress:()=>{},onChange:async s=>fs.writeFile('work/argument/live.json',JSON.stringify(s,null,2)),model:model.id,effort});
 assert(studyComplete(result));assert.equal(result.batches.flatMap(b=>b.result.paragraphs).length,5);assert(result.batches[0].result.paragraphs.every(p=>/[\u4e00-\u9fff]/.test(p.translation)));assert(result.batches[0].result.paragraphs.find(p=>p.id==='p2-1').translation.includes('90'));
 const fonts={};for(const [key,file] of [['lora400','lora-latin-400-normal.woff2'],['lora600','lora-latin-600-normal.woff2'],['ibm400','ibm-plex-sans-latin-400-normal.woff2'],['ibm600','ibm-plex-sans-latin-600-normal.woff2']])fonts[key]=(await fs.readFile('public/fonts/'+file)).toString('base64');for(const [key,file] of [['loraLicense','lora-OFL.txt'],['ibmLicense','ibm-plex-sans-OFL.txt']])fonts[key]=await fs.readFile('public/fonts/'+file,'utf8');
 await fs.writeFile('work/argument/live.html',argumentHtml(result,fonts));
 console.log('PASS: real signed-in Codex through the production bridge generated all five bilingual paragraph annotations and a source-linked overview; HTML export validated. Synthetic source, Linux runtime; not Windows interactive OAuth or a long-paper quality benchmark.');
}finally{await bridge?.close();bridge?.server.closeAllConnections();rpc.close();child.kill();await fs.rm(workdir,{recursive:true,force:true})}
