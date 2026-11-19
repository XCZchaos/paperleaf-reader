import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {validateRequest} from '../companion/research.mjs';
import {createBridge,SITE} from '../companion/server.mjs';
import {validateArgumentBatch,validateArgumentOverview,argumentSchema} from '../companion/argument.mjs';
import {newArgumentStudy,argumentBatches,generateArgumentStudy,validateArgumentStudy,studyComplete} from '../lib/argument-study.mjs';
import {argumentHtml,highlightedOriginal} from '../lib/argument-html.mjs';

export const fixturePaper={id:'argument-fixture-paper',title:'Evidence, Generalization, and the Limits of a Small Experiment',authors:'Paperleaf · synthetic QA material',pages:3};
export const fixturePages=[
 {page:1,bodyParagraphs:[
  '1 Introduction. Predictive accuracy on a small dataset does not necessarily establish generalizability. We argue that reported improvements should be interpreted in relation to the design and scope of the evidence.',
  'We define generalizability as performance on data drawn from the intended deployment population, rather than performance on the data used to develop a method.',
 ],paragraphs:[]},
 {page:2,bodyParagraphs:[
  '2 Methods and Results. We compared a baseline and a regularized model on 100 synthetic samples using a held-out test split. The regularized model achieved 90% accuracy, whereas the baseline achieved 80%.',
  'These results support an improvement within this synthetic setting. However, the experiment used a single dataset and did not estimate uncertainty; it therefore cannot establish better performance on real-world data.',
 ],paragraphs:[]},
 {page:3,bodyParagraphs:[
  '3 Conclusion. The observed improvement is encouraging but conditional. Independent datasets and uncertainty estimates are needed before the claim can be extended to a deployment population.',
 ],paragraphs:[]},
];
const copy={
 'p1-1':['1 Introduction · 研究问题','小规模数据集上的预测准确率并不必然意味着方法具有可推广性。本文主张，应结合证据的研究设计与适用范围来解读所报告的性能改进。','提出问题与核心主张','以“准确率不等于可推广性”为起点，限定后文实验证据能够支持的结论范围。','论证技巧：先区分观察到的结果与可推广的主张，为后文讨论研究边界建立标准。','thesis','We argue that reported improvements should be interpreted in relation to the design and scope of the evidence.'],
 'p1-2':['1 Introduction · 研究问题','本文将可推广性定义为模型在来自预期部署总体的数据上的表现，而非在开发方法所用数据上的表现。','界定关键概念','为判断实验结果能否支持推广性主张提供评价依据。','通过对照定义排除概念混用。分析者判断：这一标准仍需在后续研究中具体落实为代表性的抽样方案。','concept','generalizability'],
 'p2-1':['2 Methods and Results · 方法与证据','研究使用留出测试划分，在 100 个合成样本上比较基线模型与正则化模型。正则化模型的准确率为 90%，基线模型为 80%。','交代方法并提供数据','把抽象主张落到明确的比较设计和观察结果，为下一段评估证据强度提供基础。','明确交代样本和比较对象。分析者判断：单次点估计不足以说明结果的稳定性；本段未提供不确定性区间。','evidence','90% accuracy'],
 'p2-2':['2 Methods and Results · 方法与证据','这些结果支持模型在该合成场景中取得改进。但实验仅使用了一个数据集，且未估计不确定性，因此尚不能据此认定其在真实数据上也有更好表现。','让步并限制结论','承认局部改进，同时阻止从合成实验直接跳跃到真实应用的推广性结论。','让步结构使结论与证据范围保持一致。这里是作者明确提出的限制，而非分析者补充的反驳。','rebuttal','However, the experiment used a single dataset and did not estimate uncertainty;'],
 'p3-1':['3 Conclusion · 结论','观察到的改进具有积极意义，但这一判断仍附带条件。在将主张扩展到实际部署总体之前，还需要独立数据集与不确定性估计的支持。','总结并提出验证方向','回扣引言中的推广性标准，把证据缺口转化为后续验证要求。','以条件化结论避免过度概括。分析者判断：尚未提出具体的验证数据来源或不确定性估计方案。','method','Independent datasets and uncertainty estimates'],
};
export function fixtureBatch(paragraphs){return{digest:'合成测试论文：p1-1 主张根据研究范围解读性能改进；p1-2 定义推广性；p2-1 报告 100 个合成样本、90% 对比 80%；p2-2 承认单数据集与缺乏不确定性估计；p3-1 提出独立验证。不是实际科研结论。',paragraphs:paragraphs.map(p=>{
 const a=copy[p.id]||['正文','这是用于验证续做流程的合成段落。','测试段落','用于测试逐段覆盖。','测试数据不构成研究证据。','concept',p.original.slice(0,12)];
 return{id:p.id,section:a[0],translation:a[1],function:a[2],role:a[3],critique:a[4],dimension:a[5],highlights:[{quote:a[6],kind:a[5],occurrence:0},...(p.id==='p2-1'?[{quote:'using a held-out test split',kind:'method',occurrence:0}]:[])]};
})};}
export function fixtureOverview(ids){const f=(text,id)=>({text,sources:ids.includes(id)?[id]:[ids[0]]});return{
 problem:f('小样本实验中的性能改进，能否支持真实应用中的可推广性主张？','p1-1'),
 thesis:f('应结合研究设计与证据的适用范围解读性能提升。','p1-1'),
 evidence:f('合成实验比较了 100 个样本上的两种模型，正则化模型准确率为 90%，基线为 80%。','p2-1'),
 rebuttal:f('作者承认局部改进，但明确指出单个合成数据集且缺少不确定性估计，不能支撑真实应用推广。','p2-2'),
 conclusion:f('在推广到部署总体前，需要独立数据集和不确定性估计。','p3-1'),
 claim:f('性能提升的意义必须与其证据范围相匹配，不能从单一合成实验直接推及真实应用。','p1-1'),
 strongest:f('将结论限制在可观察的证据范围内，并明确给出尚不具备推广依据的原因。','p2-2'),
 weakest:f('分析者判断：核心改进仅以单次准确率呈现，缺乏不确定性估计，难以判断差异的稳定性。','p2-1'),
};}
export function completedFixture(){const s=newArgumentStudy(fixturePaper,fixturePages,'body','科研方法 · 第 6 周研讨');const batch=argumentBatches(s.sources)[0];s.review.batches=[{model:'fixture',decisions:batch.map(p=>({id:p.id,before:'keep',splits:[],reason:''}))}];s.batches=[{ids:batch.map(p=>p.id),result:validateArgumentBatch(fixtureBatch(batch),batch),model:'QA fixture — not a live model',effort:'medium'}];s.overview=fixtureOverview(s.sources.map(p=>p.id));s.overviewModel='QA fixture — not a live model';return s;}

async function checks(){
 const fixture=completedFixture();assert(studyComplete(fixture));assert.equal(validateArgumentStudy(fixture).sources.length,5);
 const raw=fixtureBatch(fixture.sources);raw.paragraphs[0].highlights.push({quote:'a hallucinated passage',kind:'thesis',occurrence:0});
 const validated=validateArgumentBatch(raw,fixture.sources);assert.equal(validated.skippedHighlights,1);assert.equal(validated.paragraphs[0].original,fixture.sources[0].original);
 assert.throws(()=>validateArgumentBatch({...raw,paragraphs:raw.paragraphs.slice(1)},fixture.sources),/不完整/);
 assert.throws(()=>validateArgumentBatch({...raw,paragraphs:[raw.paragraphs[1],...raw.paragraphs.slice(1)]},fixture.sources),/错位/);
 assert.throws(()=>validateArgumentOverview({...fixture.overview,claim:{text:'claim',sources:['p999-1']}},fixture.sources.map(p=>p.id)),/未读取/);
 const repeated={id:'p1-1',page:1,original:'word and word'};
 const result=validateArgumentBatch({digest:'test',paragraphs:[{...raw.paragraphs[0],id:'p1-1',highlights:[{quote:'word',kind:'concept',occurrence:1}]}]},[repeated]);assert.match(highlightedOriginal(result.paragraphs[0]),/^word and <mark/);
 const malicious=structuredClone(fixture);malicious.title='<script>alert(1)</script>';malicious.course='</title><img src=x onerror=alert(1)>';malicious.batches[0].result.paragraphs[0].translation='</p><script>alert(2)</script>';
 const html=argumentHtml(malicious);assert(!html.includes('<script'));assert(!html.includes('<img'));assert(html.includes('&lt;script&gt;'));assert(html.includes("default-src 'none'"));assert(html.includes('grid-template-columns:1fr'));assert(html.includes('#f0ece2'));
 for(const id of fixture.sources.map(p=>p.id))assert(html.includes(`id="${id}"`));for(const dimension of ['thesis','concept','evidence','rebuttal','method'])assert(html.includes(`hl-${dimension}`));
 const incomplete={...fixture,batches:[],overview:null};assert(!studyComplete(incomplete));assert(argumentHtml(incomplete).includes('未完成草稿'));assert.throws(()=>validateArgumentStudy({...incomplete,overview:fixture.overview}),/未完成/);
 assert.throws(()=>newArgumentStudy(fixturePaper,[{page:1,bodyParagraphs:['a'.repeat(160001)]}]),/上限/);
 const long=newArgumentStudy({...fixturePaper,pages:2},[{page:1,bodyParagraphs:Array.from({length:21},(_,i)=>'Synthetic continuation paragraph '+i+'.')}]);
 long.paragraphVersion=3;delete long.review; // Regression for unfinished pre-AI studies.
 let calls=0,snapshot,controller=new AbortController();
 const runTask=async(input)=>{calls++;return {model:'fixture',effort:'low',argument:input.argument.phase==='paragraphs'?validateArgumentBatch(fixtureBatch(input.argument.paragraphs),input.argument.paragraphs):fixtureOverview(input.argument.sources)}};
 await assert.rejects(()=>generateArgumentStudy({study:long,runTask,signal:controller.signal,onProgress:()=>{},onChange:s=>{snapshot=s;controller.abort()}}),{name:'AbortError'});
 assert.equal(calls,1);assert.equal(snapshot.batches.length,1);controller=new AbortController();
 const final=await generateArgumentStudy({study:snapshot,runTask,signal:controller.signal,onProgress:()=>{},onChange:()=>{}});assert(studyComplete(final));assert.equal(calls,4,'resume sends only two missing batches plus overview');
 assert.equal(final.batches.flatMap(b=>b.ids).length,21);
 const payload={id:crypto.randomUUID(),kind:'argument',title:fixture.title,pages:[{page:1,text:fixture.sources[0].original}],argument:{phase:'paragraphs',paragraphs:[fixture.sources[0]],context:''}};
 assert(validateRequest(payload).argument);assert.throws(()=>validateRequest({...payload,pages:[{page:2,text:'different'}]}),/不一致/);
 assert.equal(argumentSchema('paragraphs').properties.paragraphs.items.additionalProperties,false);
 // Exercise the actual bridge serialization/notification/schema path, with an
 // explicitly fake RPC instead of passing fixture results directly to the UI.
 let expectedPhase='paragraphs';
 class FakeRPC extends EventEmitter{async request(method,params){if(method==='account/read')return{account:{type:'chatgpt',email:'fixture@invalid',planType:'fixture'}};if(method==='model/list')return{data:[{model:'fixture',displayName:'fixture',isDefault:true,supportedReasoningEfforts:[]} ]};if(method==='thread/start')return{thread:{id:'argument-thread'},model:'fixture'};if(method==='turn/start'){assert.deepEqual(params.outputSchema,argumentSchema(expectedPhase));if(expectedPhase==='segmentation')assert(params.input[0].text.includes('自然段边界'));return{turn:{id:'turn',status:'inProgress'}}}return{}}close(){}}
 const rpc=new FakeRPC(),bridge=createBridge({rpc,workdir:'/tmp/argument-fixture',port:0});
 try{await new Promise(r=>bridge.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${bridge.server.address().port}`;
 const post=await fetch(base+'/jobs',{method:'POST',headers:{Origin:SITE,'X-Paperleaf-Token':bridge.token,'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(post.status,202);await new Promise(r=>setImmediate(r));
 const value=JSON.stringify(fixtureBatch(payload.argument.paragraphs));
 for(const [method,params] of [['turn/started',{turn:{id:'turn'}}],['item/started',{item:{id:'reason',type:'reasoning'}}],['item/reasoning/textDelta',{itemId:'reason',delta:'PRIVATE_REASONING_FIXTURE'}],['item/reasoning/summaryTextDelta',{itemId:'reason',summaryIndex:0,delta:'可展示的摘要'}],['item/completed',{item:{id:'reason',type:'reasoning',summary:['可展示的摘要'],content:['PRIVATE_REASONING_FIXTURE']}}],['thread/tokenUsage/updated',{tokenUsage:{last:{inputTokens:120,outputTokens:42}}}],['error',{willRetry:true,error:{message:'stream disconnected'}}],['item/started',{item:{id:'output',type:'agentMessage',phase:'final_answer'}}],['item/agentMessage/delta',{itemId:'output',delta:value}],['item/completed',{item:{id:'output',type:'agentMessage',phase:'final_answer',text:value}}],['turn/completed',{turn:{id:'turn',status:'completed'}}]])rpc.emit('notification',{method,params:{threadId:'argument-thread',...params}});
 const response=await fetch(base+'/jobs/'+payload.id,{headers:{Origin:SITE,'X-Paperleaf-Token':bridge.token}});const job=await response.json();assert.equal(job.status,'completed',job.error);assert.equal(job.argument.paragraphs[0].original,fixture.sources[0].original);assert.equal(job.text,'','structured JSON never leaks into the reader text stream');
 for(const id of ['source','model','connected','turn','analysis-reason','usage','retry-1','output','verified','stage-completed'])assert(job.events.some(e=>e.id===id),id);
 assert.equal(job.events.filter(e=>e.id==='output').length,1);assert.match(job.events.find(e=>e.id==='output').text,/字符/);
 assert.equal(job.reasoningSummary,'可展示的摘要');assert(!JSON.stringify(job).includes('PRIVATE_REASONING_FIXTURE'));
 expectedPhase='segmentation';
 const blocks=[{id:'p1-1',page:1,original:'Earlier findings establish a baseline.'},{id:'p2-1',page:2,original:'The following words continue it. A separate experiment followed.'}];
 const segment={...payload,argument:{phase:'segmentation',previous:null,next:null,paragraphs:blocks},pages:blocks.map(b=>({page:b.page,text:b.original}))};
 const decisions=blocks.map((p,i)=>({id:p.id,before:i?'join':'keep',splits:i?['A separate experiment']:[],reason:i?'前一句续接上文，后一句引出另一个实验。':''}));
 const headers={Origin:SITE,'X-Paperleaf-Token':bridge.token,'Content-Type':'application/json'};
 for(const valid of [true,false]){
  const id=crypto.randomUUID();
  const posted=await fetch(base+'/jobs',{method:'POST',headers,body:JSON.stringify({...segment,id})});
  assert.equal(posted.status,202);await new Promise(r=>setImmediate(r));
  const text=JSON.stringify({decisions:valid?decisions:[decisions[0],{...decisions[1],splits:['words absent from PDF']}]});
  const notify=(method,params)=>rpc.emit('notification',{method,params:{threadId:'argument-thread',...params}});
  notify('item/completed',{item:{id:'boundary-output',type:'agentMessage',phase:'final_answer',text}});
  notify('turn/completed',{turn:{id:'turn',status:'completed'}});
  const j=await (await fetch(base+'/jobs/'+id,{headers})).json();
  if(valid){assert.equal(j.status,'completed',j.error);assert.deepEqual(j.argument.decisions,decisions);assert(j.events.some(e=>e.id==='verified'&&e.title.includes('分段')))}
  else{assert.equal(j.status,'error');assert(!j.argument);assert(!j.events.some(e=>e.id==='verified'))}
 }
 }finally{await bridge.close();bridge.server.closeAllConnections()}
 await fs.mkdir('work/argument',{recursive:true});await fs.writeFile('work/argument/fixture.json',JSON.stringify(fixture,null,2));
 const fonts={};for(const [key,file] of [['lora400','lora-latin-400-normal.woff2'],['lora600','lora-latin-600-normal.woff2'],['ibm400','ibm-plex-sans-latin-400-normal.woff2'],['ibm600','ibm-plex-sans-latin-600-normal.woff2']])fonts[key]=(await fs.readFile('public/fonts/'+file)).toString('base64');for(const [key,file] of [['loraLicense','lora-OFL.txt'],['ibmLicense','ibm-plex-sans-OFL.txt']])fonts[key]=await fs.readFile('public/fonts/'+file,'utf8');
 const standalone=argumentHtml(fixture,fonts);assert.equal((standalone.match(/data:font\/woff2;base64/g)||[]).length,4);assert(!/(?:src|href)="https?:\/\//.test(standalone));await fs.writeFile('work/argument/fixture.html',standalone);
 console.log('PASS: production bridge with synthetic RPC verified semantic output schema, a real join/split event and rejection of an invented split. Also checked paragraph coverage, exact and repeated highlights, malformed results, cancellation/resume, source limits, safe single-file HTML, embedded fonts and linked overview. Not a live-model quality test.');
}
if(process.argv[1]?.endsWith('check-argument.mjs'))await checks();
