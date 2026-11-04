import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {createBridge,SITE} from '../companion/server.mjs';
import {validateRequest,validateDeck,validateMetadata,paperFilename} from '../companion/research.mjs';
class FakeRPC extends EventEmitter {
 constructor(){super();this.calls=[];this.loggedIn=false;this.seq=0;}
 async request(method,params){this.calls.push({method,params});
  if(method==='account/read')return{account:this.loggedIn?{type:'chatgpt',email:'test@example.invalid',planType:'test'}:null};
  if(method==='model/list')return{data:[{model:'fixture-model',displayName:'Fixture only',isDefault:true}],nextCursor:null};
  if(method==='account/rateLimits/read')return{rateLimits:{primary:{usedPercent:10,resetsAt:2000000000,windowDurationMins:300}}};
  if(method==='account/login/start')return{type:'chatgpt',loginId:'fixture-login',authUrl:'https://auth.openai.com/fixture'};
  if(method==='account/logout'){this.loggedIn=false;return{}};
  if(method==='thread/start'){assert.equal(params.permissions,'paperleaf_reading');assert(!('sandbox' in params));return{thread:{id:'thread-'+(++this.seq)},model:'fixture-model'};}
  if(method==='turn/start'){assert(!('sandboxPolicy' in params));return{turn:{id:'turn-'+this.seq,status:'inProgress'}};}
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
 const payload={id:crypto.randomUUID(),title:'Fixture paper',kind:'ask',question:'Explain this method',pages:[{page:1,text:'Fixture methods.'}],model:'fixture-model'};
 await json('/jobs',{method:'POST',body:payload},401);assert.equal(rpc.calls.filter(x=>x.method==='turn/start').length,0);
 const login=await json('/login',{method:'POST',body:{}});assert.equal(new URL(login.authUrl).hostname,'auth.openai.com');
 rpc.loggedIn=true;rpc.emit('notification',{method:'account/login/completed',params:{success:true}});
 const state=await json('/status');assert.equal(state.account.plan,'test');assert.equal(state.models[0].id,'fixture-model');assert(!JSON.stringify(state).includes('accessToken'));
 await json('/jobs',{method:'POST',body:payload},202);await tick();const job=b.jobs.get(payload.id);assert(job.threadId);assert.equal(job.status,'running');
 await json('/jobs',{method:'POST',body:payload});assert.equal(rpc.calls.filter(x=>x.method==='turn/start').length,1);
 rpc.emit('notification',{method:'item/agentMessage/delta',params:{threadId:job.threadId,turnId:job.turnId,itemId:'answer',delta:'Fixture answer'}});
 assert.equal((await json('/jobs/'+job.id)).text,'Fixture answer');
 rpc.emit('notification',{method:'item/completed',params:{threadId:job.threadId,item:{id:'answer',type:'agentMessage',phase:'final_answer',text:'Verified fixture [p.1]'}}});
 rpc.emit('notification',{method:'turn/completed',params:{threadId:job.threadId,turn:{status:'completed'}}});
 assert.equal((await json('/jobs/'+job.id)).status,'completed');
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
 await json('/logout',{method:'POST',body:{}});assert.equal((await json('/status')).account,null);
 console.log('PASS: companion origin/host/token checks, Unicode token safety, login gate, official auth URL, model catalog, idempotent tasks, stream completion, cancellation (including pre-create race), errors, bounded context, citations, structured metadata and filename sanitization. Model responses were explicit fixtures.');
}finally{await b.close();b.server.closeAllConnections();}
