// Explicit integration test: uses an already logged-in Codex profile and a small
// fictional paper. It consumes account quota and never copies or logs credentials.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {spawnCodexProfile,createBridge,SITE} from '../companion/server.mjs';
import {CodexRPC} from '../companion/rpc.mjs';
const [flag,profile,...options]=process.argv.slice(2);
const model=options[options.indexOf('--model')+1],effort=options[options.indexOf('--effort')+1];
const settings={...(options.includes('--model')?{model}:{}),...(options.includes('--effort')?{effort}:{})};
if(flag!=='--profile'||!profile)throw Error('Use --profile <already-signed-in Codex profile>; this test consumes quota.');
await mkdir('work',{recursive:true});const workdir=await mkdtemp(path.resolve('work/live-reading-'));
const child=spawnCodexProfile(workdir,path.resolve(profile)),rpc=new CodexRPC(child);let bridge;
const text='A Synthetic Study of Prediction Accuracy\nAlice Example; Bob Example\n2026\nAbstract: We compared a baseline linear model and a regularized linear model on 100 synthetic samples. The regularized model achieved 90% accuracy compared with 80% for the baseline. This small synthetic experiment does not establish performance on real-world data.';
try{
 await rpc.initialize();const {account}=await rpc.request('account/read',{refreshToken:false});assert.equal(account?.type,'chatgpt','Sign in to Codex first');
 bridge=createBridge({rpc,workdir,port:0});await new Promise(resolve=>bridge.server.listen(0,'127.0.0.1',resolve));
 const call=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${bridge.server.address().port}${route}`,{method:body?'POST':'GET',headers:{Origin:SITE,'X-Paperleaf-Token':bridge.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert(r.ok);return r.json()};
 const run=async input=>{const id=crypto.randomUUID(),started=Date.now();let j=await call('/jobs',{id,title:'Synthetic conversation test',pages:[{page:1,text}],...settings,...input});while(['preparing','running'].includes(j.status)&&Date.now()-started<180000){await new Promise(r=>setTimeout(r,500));j=await call('/jobs/'+id)}assert.equal(j.status,'completed',j.error||j.status);console.log(JSON.stringify({kind:input.kind,model:j.model,firstTextMs:j.firstResponseAt?j.firstResponseAt-j.created:null,totalMs:Date.now()-j.created,retries:j.retryCount}));return j};
 const firstQuestion='这段材料是合成实验。请记住我们为这次讨论起的代号：青柠42。简短确认。';
 const first=await run({kind:'ask',question:firstQuestion});
 const second=await run({kind:'ask',question:'我们刚才约定的讨论代号是什么？只回复这个代号。',history:[{role:'user',text:firstQuestion},{role:'assistant',text:first.text}]});assert(second.text.includes('青柠42'),'follow-up must use prior conversation');console.log(JSON.stringify({test:'follow-up',status:'passed',events:second.events.map(e=>e.kind),publicCommentary:second.events.filter(e=>e.kind==='commentary').length}));
 const paragraph=await run({kind:'translate',translationMode:'paragraph',selection:'The regularized model achieved 90% accuracy compared with 80% for the baseline. This small synthetic experiment does not establish performance on real-world data.'});assert(paragraph.text.includes('90%')&&paragraph.text.includes('80%'));assert(!paragraph.text.includes('术语说明'));console.log(JSON.stringify({test:'paragraph-translation',status:'passed',translation:paragraph.text}));
 const usage=await call('/status?refresh=1');console.log(JSON.stringify({test:'quota-refresh',returned:!!usage.rateLimits,warning:usage.rateLimitsWarning||'',updated:!!usage.rateLimitsUpdatedAt}));
 for(const kind of ['translate','ask','metadata','summary','slides']){
  const id=crypto.randomUUID(),started=Date.now(),stages=new Set();let j=await call('/jobs',{id,kind,title:'A Synthetic Study of Prediction Accuracy',pages:[{page:1,text}],selection:'The regularized model achieved 90% accuracy compared with 80% for the baseline.',question:'结果能否推广到真实数据？请简洁回答。',slideCount:6,...settings});
  while(['preparing','running'].includes(j.status)&&Date.now()-started<180000){await new Promise(r=>setTimeout(r,500));j=await call('/jobs/'+id);stages.add(j.stage)}
  assert.equal(j.status,'completed',`${kind}: ${j.error||j.status}`);assert(j.text.trim());
  if(kind==='translate')assert(j.text.includes('90%')&&/[\u4e00-\u9fff]/.test(j.text));
  if(kind==='ask')assert(j.text.includes('[p.1]'));
  if(kind==='metadata'){assert.equal(j.metadata.year,'2026');assert(j.metadata.authors.includes('Alice'));}
  if(kind==='slides')assert.equal(j.deck.slides.length,6);
  console.log(JSON.stringify({test:kind,status:'passed',model:j.model,firstTextMs:j.firstResponseAt?j.firstResponseAt-j.created:null,retries:j.retryCount,stages:[...stages],summaryCharacters:j.reasoningSummary?.length||0,seconds:Math.round((Date.now()-started)/1000),...(kind==='translate'?{translation:j.text}:{}),...(kind==='slides'?{slides:j.deck.slides.length}:{})}));
 }
 console.log('PASS: real signed-in Codex through the production Paperleaf bridge: translation, Q&A, metadata, summary and 6-slide structured report.');
}finally{await bridge?.close();bridge?.server.closeAllConnections();child.stdin.end();rpc.close();await new Promise(r=>setTimeout(r,500));child.kill('SIGKILL');await rm(workdir,{recursive:true,force:true})}
