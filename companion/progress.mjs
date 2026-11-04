const MAX_SUMMARY=12000, MAX_EVENTS=48, MAX_EVENT_TEXT=24000;
const titles={preparing:'准备阅读材料',thinking:'Codex 正在处理',writing:'正在生成回答',finalizing:'核对输出格式',completed:'回答已完成',cancelled:'已停止',error:'请求中断'};
export function progressEvent(job,id,kind,title,text='',done=true){
 job.events ||= [];
 const old=job.events.find(e=>e.id===id);
 const item={id,kind,title,text:String(text||'').slice(0,4000),at:old?.at||Date.now(),done};
 if(old)Object.assign(old,item);else job.events.push(item);
 if(job.events.length>MAX_EVENTS)job.events.splice(0,job.events.length-MAX_EVENTS);
 let budget=MAX_EVENT_TEXT;
 for(let i=job.events.length-1;i>=0;i--){const e=job.events[i];e.text=e.text.slice(0,Math.max(0,budget));budget-=e.text.length;}
 job.updated=Date.now();
}
function storeSummary(job,id,parts){let remaining=Math.max(0,MAX_SUMMARY-[...job.summaries.entries()].filter(([key])=>key!==id).flatMap(([,v])=>v).reduce((n,s)=>n+s.length,0));job.summaries.set(id,parts.map(s=>{const text=String(s||'').slice(0,remaining);remaining-=text.length;return text}));}
export function setStage(job,stage){if(job.stage!==stage)progressEvent(job,'stage-'+stage,'stage',titles[stage]||stage);job.stage=stage;job.updated=Date.now();}
export function readingProgress(job,method,p){
 if(method==='item/agentMessage/delta'||method==='item/reasoning/summaryTextDelta'||method==='item/completed')job.retrying=false;
 if(method==='turn/started')setStage(job,'thinking');
 if(method==='item/started'&&p.item?.type==='reasoning')setStage(job,'thinking');
 // Consume only public summaries. Never consume reasoning/textDelta or content.
 if(method==='item/reasoning/summaryTextDelta'||method==='item/reasoning/summaryPartAdded'){
  const index=p.summaryIndex;if(!Number.isInteger(index)||index<0||index>=24)return;
  if(!job.summaries.has(p.itemId)&&job.summaries.size>=24)return;
  const parts=job.summaries.get(p.itemId)||[];
  if(method.endsWith('summaryTextDelta'))parts[index]=((parts[index]||'')+String(p.delta||'')).slice(0,MAX_SUMMARY);
  storeSummary(job,p.itemId,parts);job.updated=Date.now();
 }
 if(method==='item/completed'&&p.item?.type==='reasoning'&&Array.isArray(p.item.summary)){
  if(job.summaries.has(p.item.id)||job.summaries.size<24)storeSummary(job,p.item.id,p.item.summary.slice(0,24));job.updated=Date.now();
 }
 if(method==='turn/plan/updated'){
  const text=(p.plan||[]).slice(0,12).map(s=>`${s.status==='completed'?'✓':s.status==='inProgress'?'→':'·'} ${String(s.step||'').slice(0,240)}`).join('\n');
  progressEvent(job,'plan','plan','阅读计划',text,false);
 }
 if(method==='item/plan/delta'){
  const id='plan-'+p.itemId,previous=job.events?.find(e=>e.id===id)?.text||'';
  progressEvent(job,id,'plan','阅读计划',previous+String(p.delta||''),false);
 }
 if(method==='item/completed'&&p.item?.type==='plan')progressEvent(job,'plan-'+p.item.id,'plan','阅读计划',p.item.text,true);
 if(method==='item/started'&&p.item?.type==='contextCompaction')progressEvent(job,'context','stage','正在整理对话上下文');
 if(method==='error'&&p.willRetry){
  job.retrying=true;job.retries=(job.retries||0)+1;job.lastRetry={...retryDiagnosis(p.error),at:Date.now()};
  const r=job.lastRetry;
  progressEvent(job,'retry-'+job.retries,'retry',`${r.label} · 第 ${job.retries} 次`,`${r.detail}${r.httpStatus?`（HTTP ${r.httpStatus}）`:''}`);
 }
}
export function publicProgress(job){return {stage:job.stage,events:job.events||[],retryCount:job.retries||0,retrying:!!job.retrying,lastRetry:job.lastRetry||null,firstResponseAt:job.firstResponseAt||null,reasoningSummary:[...job.summaries.values()].flat().filter(Boolean).join('\n\n').slice(0,MAX_SUMMARY),activity:job.activity||'',updated:job.updated,completedAt:job.completedAt||null};}
import {retryDiagnosis} from './transport.mjs';
