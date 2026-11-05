// Uses an existing signed-in profile, fictional evidence and actual account quota.
// No credentials or account identifiers are copied or logged.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {spawnCodexProfile,createBridge,SITE} from '../companion/server.mjs';
import {CodexRPC} from '../companion/rpc.mjs';
import {makeReadingContext,readingContextSelection} from '../lib/reading-context.mjs';
import {conversationContext} from '../lib/chat-context.mjs';
const [flag,profile]=process.argv.slice(2);if(flag!=='--profile'||!profile)throw Error('Pass --profile <already signed-in profile>; consumes account quota.');
await mkdir('work',{recursive:true});const workdir=await mkdtemp(path.resolve('work/context-live-'));
const child=spawnCodexProfile(workdir,path.resolve(profile)),rpc=new CodexRPC(child);let bridge;
try{
 await rpc.initialize();const {account}=await rpc.request('account/read',{refreshToken:false});assert.equal(account?.type,'chatgpt','A signed-in ChatGPT profile is required');
 bridge=createBridge({rpc,workdir,port:0});await new Promise(r=>bridge.server.listen(0,'127.0.0.1',r));
 const call=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${bridge.server.address().port}${route}`,{method:body?'POST':'GET',headers:{Origin:SITE,'X-Paperleaf-Token':bridge.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert(r.ok);return r.json()};
 const status=await call('/status'),model=status.models.find(m=>m.id==='gpt-6.1-terra')||status.models.find(m=>m.default)||status.models[0];assert(model,'An available model is required');
 const effort=model.reasoningEfforts?.some(e=>e.id==='low')?'low':'';
 const text='This is a fictional test, not a published paper. The regularized model achieved 90% accuracy compared with 80% for the baseline on 100 synthetic examples. It does not establish performance on real-world data.';
 const run=async(test,input)=>{const id=crypto.randomUUID(),started=Date.now();let j=await call('/jobs',{id,title:'Fictional reading interaction test',pages:[{page:1,text}],model:model.id,effort,...input});while(['preparing','running'].includes(j.status)&&Date.now()-started<180000){await new Promise(r=>setTimeout(r,500));j=await call('/jobs/'+id)}assert.equal(j.status,'completed',j.error||j.status);console.log(JSON.stringify({test,model:j.model,retries:j.retryCount,firstTextMs:j.firstResponseAt?j.firstResponseAt-j.created:null,totalMs:Date.now()-started}));return j};
 const context=makeReadingContext('note','fictional-note',1,text,'我的笔记：正则化模型准确率为 95%。讨论代号是青柠42。');
 const selection=readingContextSelection(context),question='请核对我的笔记中的准确率，简短纠正，并记住讨论代号。';
 const first=await run('note-context',{kind:'ask',selection,question});assert(first.text.includes('90')&&first.text.includes('95'),'Must compare the note with PDF evidence');
 const history=conversationContext([{question,selection,text:first.text}]).history;
 const next=await run('continuous-follow-up',{kind:'ask',selection,question:'刚才的讨论代号是什么？纠正后的准确率比基线高多少个百分点？请简短回答。',history});assert(next.text.includes('青柠42'));assert(/10|十/.test(next.text)&&next.text.includes('百分点'));
 const translated=makeReadingContext('translation','fictional-translation',1,text,'正则化模型在 100 个合成样本上的准确率为 90%，基线为 80%。');
 const checked=await run('translation-follow-up',{kind:'ask',selection:readingContextSelection(translated),question:'请用一句话解释译文中的基线指什么，只依据原文。'});assert(checked.text.includes('80'));
 const paragraph=await run('body-paragraph-translation',{kind:'translate',translationMode:'paragraph',selection:text});assert(paragraph.text.includes('90%')&&paragraph.text.includes('80%')&&paragraph.text.includes('100'));assert(!paragraph.text.includes('术语说明'));
 console.log('PASS: real note-context Q&A, continuous follow-up, translation-context Q&A, and faithful paragraph translation.');
}finally{await bridge?.close();bridge?.server.closeAllConnections();child.stdin.end();rpc.close();child.kill('SIGKILL');await rm(workdir,{recursive:true,force:true})}
