import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {createBridge,SITE} from '../companion/server.mjs';
import {validateRequest,validateDeck,validateMetadata,paperFilename,wordCandidate,validateVocabulary} from '../companion/research.mjs';
class FakeRPC extends EventEmitter {
 constructor(){super();this.calls=[];this.loggedIn=false;this.seq=0;}
 async request(method,params){this.calls.push({method,params});
  if(method==='account/read')return{account:this.loggedIn?{type:'chatgpt',email:'test@example.invalid',planType:'test'}:null};
  if(method==='model/list')return{data:[{model:'fixture-model',displayName:'Fixture only',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low',description:'Faster'},{reasoningEffort:'high',description:'Deeper'}]}],nextCursor:null};
  if(method==='account/rateLimits/read'){if(this.rateError)throw Error('fixture offline');return{ordinaryUsageAllowed:false,rateLimits:{primary:{usedPercent:this.used||10,resetsAt:2000000000,windowDurationMins:300},secondary:{usedPercent:31,resetsAt:null,windowDurationMins:10080}},rateLimitsByLimitId:{codex:{primary:{usedPercent:this.used||10,windowDurationMins:300,resetsAt:2000000000}}}};}
  if(method==='account/login/start')return{type:'chatgpt',loginId:'fixture-login',authUrl:'https://auth.openai.com/fixture'};
  if(method==='account/logout'){this.loggedIn=false;return{}};
  if(method==='thread/start'){assert.equal(params.permissions,'paperleaf_reading');assert(!('sandbox' in params));return{thread:{id:'thread-'+(++this.seq)},model:'fixture-model'};}
  if(method==='turn/start'){assert.equal(params.summary,'auto');assert.equal(params.effort,'high');assert(!('sandboxPolicy' in params));return{turn:{id:'turn-'+this.seq,status:'inProgress'}};}
  return{};
 }
 close(){}
}
const rpc=new FakeRPC(),b=createBridge({rpc,workdir:'/tmp/paperleaf-test',port:0,token:'a'.repeat(43)});
await new Promise(r=>b.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+b.server.address().port;
async function req(route,{method='GET',body,origin=SITE,token=b.token,host}={}){return fetch(base+route,{method,headers:{Origin:origin,'X-Paperleaf-Token':token,'Content-Type':'application/json',...(host?{Host:host}:{})},body:body?JSON.stringify(body):undefined})}
async function json(route,opts,status=200){const r=await req(route,opts);assert.equal(r.status,status,await r.clone().text());return r.json()}
const tick=()=>new Promise(r=>setImmediate(r));
try{
 assert.equal((await req('/status',{origin:'https://evil.invalid'})).status,403);
 assert.equal((await req('/status',{token:'x'.repeat(43)})).status,401);
 assert.equal((await req('/status',{token:'é'.repeat(43)})).status,401);
 const badHost=await new Promise(resolve=>{http.get(base+'/status',{headers:{Host:'evil.invalid',Origin:SITE,'X-Paperleaf-Token':b.token}},r=>{r.resume();resolve(r.statusCode)});});assert.equal(badHost,403);
 assert.equal((await req('/status',{method:'OPTIONS',token:''})).status,204);
 assert.equal((await json('/status')).account,null);
 const payload={id:crypto.randomUUID(),title:'Fixture paper',kind:'ask',question:'Explain this method',pages:[{page:1,text:'Fixture methods.'}],model:'fixture-model',effort:'high'};
 await json('/jobs',{method:'POST',body:payload},401);assert.equal(rpc.calls.filter(x=>x.method==='turn/start').length,0);
 const login=await json('/login',{method:'POST',body:{}});assert.equal(new URL(login.authUrl).hostname,'auth.openai.com');
 rpc.loggedIn=true;rpc.emit('notification',{method:'account/login/completed',params:{success:true}});
 const state=await json('/status');assert.equal(state.account.plan,'test');assert.equal(state.models[0].id,'fixture-model');assert(!JSON.stringify(state).includes('accessToken'));
 assert.equal(state.connection.transport,'http-sse');
 assert.equal(state.rateLimits.primary.usedPercent,10);assert.equal(state.ordinaryUsageAllowed,false);const firstTime=state.rateLimitsUpdatedAt;
 rpc.used=42;assert.equal((await json('/status')).rateLimits.primary.usedPercent,10,'normal status caches');
 const fresh=await json('/status?refresh=1');assert.equal(fresh.rateLimits.primary.usedPercent,42);assert(fresh.rateLimitsUpdatedAt>=firstTime);assert.equal(fresh.rateLimitsByLimitId.codex.primary.usedPercent,42);
 rpc.rateError=true;const stale=await json('/status?refresh=1');assert.equal(stale.rateLimits.primary.usedPercent,42);assert(stale.rateLimitsWarning.includes('刷新失败'));rpc.rateError=false;
 await json('/jobs',{method:'POST',body:payload},202);await tick();const job=b.jobs.get(payload.id);assert(job.threadId);assert.equal(job.status,'running');
 await json('/jobs',{method:'POST',body:payload});assert.equal(rpc.calls.filter(x=>x.method==='turn/start').length,1);
 const event=(method,params={})=>rpc.emit('notification',{method,params:{threadId:job.threadId,turnId:job.turnId,...params}});
 event('item/reasoning/summaryPartAdded',{itemId:'r1',summaryIndex:0});event('item/reasoning/summaryTextDelta',{itemId:'r1',summaryIndex:0,delta:'可公开的思考摘要'});
 event('item/reasoning/textDelta',{itemId:'r1',contentIndex:0,delta:'RAW_REASONING_MUST_NOT_APPEAR'});
 let status=await json('/jobs/'+job.id);assert.equal(status.stage,'thinking');assert.equal(status.reasoningSummary,'可公开的思考摘要');assert(!JSON.stringify(status).includes('RAW_REASONING'));
 event('item/completed',{item:{id:'r1',type:'reasoning',summary:['完成的公开摘要'],content:['RAW_REASONING_MUST_NOT_APPEAR']}});
 event('item/started',{item:{id:'comment',type:'agentMessage',phase:'commentary'}});event('item/agentMessage/delta',{itemId:'comment',delta:'正在整理文献'});
 status=await json('/jobs/'+job.id);assert.equal(status.text,'');assert.equal(status.activity,'正在整理文献');assert.equal(status.reasoningSummary,'完成的公开摘要');assert(!JSON.stringify(status).includes('RAW_REASONING'));
 event('error',{willRetry:true,error:{message:'retry fixture'}});
 status=await json('/jobs/'+job.id);assert.equal(status.lastRetry.reason,'unknown');
 event('error',{willRetry:true,error:{message:'SECRET_DO_NOT_FORWARD https://example.invalid/?token=private',codexErrorInfo:{httpConnectionFailed:{httpStatusCode:503}}}});
 status=await json('/jobs/'+job.id);assert.equal(status.lastRetry.reason,'server');assert.equal(status.lastRetry.httpStatus,503);assert.equal(status.retryCount,2);assert(!JSON.stringify(status).includes('SECRET_DO_NOT_FORWARD'));assert(!JSON.stringify(status).includes('token=private'));
 assert.equal(rpc.calls.filter(x=>x.method==='turn/start').length,1,'Retries must not create another billable task');
 event('turn/plan/updated',{plan:[{step:'核对研究问题',status:'inProgress'}]});
 rpc.emit('notification',{method:'item/agentMessage/delta',params:{threadId:job.threadId,turnId:job.turnId,itemId:'answer',delta:'Fixture answer'}});
 assert.equal((await json('/jobs/'+job.id)).text,'Fixture answer');
 assert((await json('/jobs/'+job.id)).firstResponseAt>=job.created);
 rpc.emit('notification',{method:'item/completed',params:{threadId:job.threadId,item:{id:'answer',type:'agentMessage',phase:'final_answer',text:'Verified fixture [p.1]'}}});
 rpc.emit('notification',{method:'turn/completed',params:{threadId:job.threadId,turn:{status:'completed'}}});
 const finished=await json('/jobs/'+job.id);assert.equal(finished.status,'completed');assert.equal(finished.stage,'completed');assert(finished.completedAt>=finished.created);assert(!finished.text.includes('正在整理文献'));assert(finished.events.some(e=>e.kind==='commentary'&&e.text==='正在整理文献'));assert(finished.events.some(e=>e.kind==='retry'));assert(finished.events.some(e=>e.kind==='plan'&&e.text.includes('核对研究问题')));assert(!JSON.stringify(finished).includes('RAW_REASONING'));
 const unsupported={...payload,id:crypto.randomUUID(),effort:'not-supported'};const priorTurns=rpc.calls.filter(x=>x.method==='turn/start').length;await json('/jobs',{method:'POST',body:unsupported},202);await tick();assert.equal((await json('/jobs/'+unsupported.id)).status,'error');assert.equal(rpc.calls.filter(x=>x.method==='turn/start').length,priorTurns);
 const second={...payload,id:crypto.randomUUID()};await json('/jobs',{method:'POST',body:second},202);await tick();
 await json('/jobs/'+second.id+'/cancel',{method:'POST',body:{}});assert.equal(b.jobs.get(second.id).status,'cancelled');assert(rpc.calls.some(x=>x.method==='turn/interrupt'));
 const third={...payload,id:crypto.randomUUID()};await json('/jobs/'+third.id+'/cancel',{method:'POST',body:{}});const before=rpc.calls.filter(x=>x.method==='turn/start').length;assert.equal((await json('/jobs',{method:'POST',body:third})).status,'cancelled');assert.equal(rpc.calls.filter(x=>x.method==='turn/start').length,before);
 const fourth={...payload,id:crypto.randomUUID()};await json('/jobs',{method:'POST',body:fourth},202);await tick();const failed=b.jobs.get(fourth.id);rpc.emit('notification',{method:'turn/completed',params:{threadId:failed.threadId,turn:{status:'failed',error:{message:'Quota unavailable'}}}});assert.equal(failed.status,'error');
 assert.throws(()=>validateRequest({...payload,pages:[{page:1,text:'x'.repeat(160001)}]}));
 assert.throws(()=>validateDeck({title:'Fixture',subtitle:'',slides:[{title:'Test',bullets:['Test'],speakerNotes:'',pages:[9]}]},[1]));
 const metadata={title:'A Test: Reading / Papers?',authors:'Alice Example; Bob Example',year:'2026',journal:'Fixture Journal',doi:'10.1234/fixture',abstract:'仅用于验证的信息。',keywords:['测试']};
 const identification={...payload,id:crypto.randomUUID(),kind:'metadata'};
 await json('/jobs',{method:'POST',body:identification},202);await tick();const identifying=b.jobs.get(identification.id);
 assert(rpc.calls.filter(x=>x.method==='turn/start').at(-1).params.outputSchema.properties.authors);
 rpc.emit('notification',{method:'item/completed',params:{threadId:identifying.threadId,item:{id:'metadata-answer',type:'agentMessage',phase:'final_answer',text:JSON.stringify(metadata)}}});
 rpc.emit('notification',{method:'turn/completed',params:{threadId:identifying.threadId,turn:{status:'completed'}}});
 const identified=await json('/jobs/'+identification.id);assert.equal(identified.status,'completed');assert.deepEqual(identified.metadata,metadata);
 assert.equal(paperFilename(metadata),'2026 - Alice Example - A Test_ Reading _ Papers_.pdf');
 assert.equal(validateMetadata({...metadata,year:'',doi:''}).year,'');
 assert.throws(()=>validateMetadata({...metadata,year:'unknown'}));assert.throws(()=>validateMetadata({...metadata,doi:'fabricated'}));
 const wordPayload={...payload,id:crypto.randomUUID(),kind:'translate',selection:'regularization',detectVocabulary:true};await json('/jobs',{method:'POST',body:wordPayload},202);await tick();const wordJob=b.jobs.get(wordPayload.id);const wordInfo={word:'regularization',phonetic:'',partOfSpeech:'n.',meaning:'正则化',contextMeaning:'降低过拟合',examples:[{en:'Regularization reduces overfitting.',zh:'正则化降低过拟合。'}],relatedWords:['regularize']};assert(rpc.calls.filter(x=>x.method==='turn/start').at(-1).params.outputSchema.properties.vocabulary);rpc.emit('notification',{method:'item/agentMessage/delta',params:{threadId:wordJob.threadId,itemId:'word-answer',delta:'{"text":'}});assert.equal((await json('/jobs/'+wordJob.id)).text,'');rpc.emit('notification',{method:'item/completed',params:{threadId:wordJob.threadId,item:{id:'word-answer',type:'agentMessage',phase:'final_answer',text:JSON.stringify({text:'**正则化**',vocabulary:wordInfo})}}});rpc.emit('notification',{method:'turn/completed',params:{threadId:wordJob.threadId,turn:{status:'completed'}}});const learned=await json('/jobs/'+wordJob.id);assert.equal(learned.text,'**正则化**');assert.equal(learned.vocabulary.word,'regularization');assert.equal(wordCandidate('two words'),'');assert.equal(wordCandidate('accuracy.'),'accuracy');assert.throws(()=>validateVocabulary({...wordInfo,word:'other'},'regularization'));
 await json('/logout',{method:'POST',body:{}});const loggedOut=await json('/status');assert.equal(loggedOut.account,null);assert.equal(loggedOut.rateLimits,null);assert.equal(loggedOut.rateLimitsByLimitId,null);
 console.log('PASS: forced quota refresh/cache/failure/logout isolation, reasoning summaries, exclusion of raw reasoning, commentary separation and real event stages.');
 console.log('PASS: companion origin/host/token checks, Unicode token safety, login gate, official auth URL, model catalog, idempotent tasks, stream completion, cancellation (including pre-create race), errors, bounded context, citations, structured metadata and filename sanitization. Model responses were explicit fixtures.');
}finally{await b.close();b.server.closeAllConnections();}
