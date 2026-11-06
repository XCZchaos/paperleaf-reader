import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
await fs.mkdir('work',{recursive:true});const dir=await fs.mkdtemp(path.resolve('work/stream-check-'));
try{
 for(const name of ['codex-client','desktop','client']){
  let source=await fs.readFile(`lib/${name}.ts`,'utf8');
  source=source.replace("from './desktop'","from './desktop.mjs'");
  await fs.writeFile(`${dir}/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 await fs.copyFile('lib/job-stream.mjs',`${dir}/job-stream.mjs`);
 const {runCodexTask}=await import(`${dir}/codex-client.mjs`);
 let requests=0,inFlight=0,maxInFlight=0,cancelled=0;
 const base={id:'fixture',status:'running',stage:'writing',text:'',updated:1,error:'',created:Date.now(),model:'fixture',pages:[1],deck:null};
 const sequence=[{...base,text:'第一句。',updated:2},{...base,text:'第一句。',updated:2},{...base,text:'第一句。完整回答。',status:'completed',updated:3}];
 globalThis.window={paperleafDesktop:{version:'1.4.2',request:async(route)=>{inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await new Promise(r=>setTimeout(r,2));inFlight--;if(route.endsWith('/cancel')){cancelled++;return {}}if(route==='/jobs')return base;requests++;return sequence.shift()}}};
 const updates=[],ctrl=new AbortController();const result=await runCodexTask({kind:'ask',title:'Synthetic streaming test',pages:[{page:1,text:'fixture'}]},ctrl.signal,j=>updates.push(j.text));
 assert.deepEqual(updates,['','第一句。','第一句。完整回答。']);assert.equal(result.status,'completed');assert.equal(requests,3);assert.equal(maxInFlight,1);assert.equal(cancelled,0);
 // IPC promises cannot be aborted: reject a late reply without delivering it.
 let resolvePost;window.paperleafDesktop.request=async route=>{if(route.endsWith('/cancel')){cancelled++;return {}}return new Promise(r=>resolvePost=r)};
 const late=new AbortController(),seen=[];const task=runCodexTask({kind:'translate',title:'Late response test',pages:[]},late.signal,j=>seen.push(j));
 late.abort();resolvePost(base);await assert.rejects(task,e=>e.name==='AbortError');assert.equal(seen.length,0);assert.equal(cancelled,1);
 const writes=[],storage={'paperleaf-cloud-paper-translation':JSON.stringify({pending:true,value:['legacy translation']}),'paperleaf-cloud-paper-draft':JSON.stringify({pending:true,value:{text:'draft'}}),'paperleaf-cloud-paper-annotations':JSON.stringify({pending:true,value:[]})};
 globalThis.localStorage={...storage,getItem:key=>storage[key],setItem:(key,value)=>{storage[key]=value},removeItem:key=>{delete storage[key]}};
 const originalFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{writes.push(JSON.parse(options.body));return Response.json({ok:true})};
 try{const {flushPendingCloudCopies}=await import(`${dir}/client.mjs`);await flushPendingCloudCopies();assert.deepEqual(writes.map(x=>x.kind),['draft','annotations']);assert(JSON.parse(storage['paperleaf-cloud-paper-translation']).pending)}finally{globalThis.fetch=originalFetch;delete globalThis.localStorage}
 console.log('PASS: sequential streaming polls, partial output before completion, duplicate response suppression, final text integrity, and exactly-once cancellation with late desktop IPC responses; legacy selection caches are never auto-uploaded on logout.');
}finally{delete globalThis.window;await fs.rm(dir,{recursive:true,force:true})}
