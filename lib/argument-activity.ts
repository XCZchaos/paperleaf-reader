import type {CodexJob, ProgressEvent} from './ai-types';
import type {ArgumentInput, ArgumentStudy} from './argument-types';
import type {runCodexTask} from './codex-client';
import {argumentBatches} from './argument-study.mjs';

type AttemptStatus = CodexJob['status'] | 'interrupted';
export type ArgumentAttempt = {
 id:string; label:string; scope:string; status:AttemptStatus; created:number; updated:number;
 model:string; effort:string; events:ProgressEvent[]; summary:string; error:string;
};
export type ArgumentHistory = {studyCreated:number; attempts:ArgumentAttempt[]};

function scopeOf(study:ArgumentStudy,input:ArgumentInput) {
 if(input.phase==='segmentation'){
  const parts=input.paragraphs,last=parts.at(-1)!;
  return {label:'AI 判别自然段',scope:'PDF 第 '+parts[0].page+'–'+(last.endPage||last.page)+' 页 · '+parts.length+' 个初步片段'};
 }
 const overview=input.phase==='overview';
 const sources=overview?study.sources:input.paragraphs;
 const batches=argumentBatches(study.sources);
 const first=sources[0],last=sources[sources.length-1];
 const finalPage=last.endPage||last.page;
 const pages=first.page===finalPage?`PDF 第 ${first.page} 页`:`PDF 第 ${first.page}–${finalPage} 页`;
 const firstNumber=study.sources.findIndex(p=>p.id===first.id)+1;
 const lastNumber=firstNumber+sources.length-1;
 const sourceRange=overview?`${sources.length} 段 · ${batches.length} 份批次摘要`:`第 ${firstNumber}${firstNumber===lastNumber?'':'–'+lastNumber} 段 · ${sources.reduce((n,p)=>n+p.original.length,0).toLocaleString()} 字符`;
 const index=overview?0:batches.findIndex(b=>b[0].id===first.id)+1;
 return {label:overview?'全文论证总览':`第 ${index} / ${batches.length} 批`,scope:pages+' · '+sourceRange};
}

// Retain only the native bridge's public progress fields. Structured model
// payloads and the original PDF text do not belong in an execution log.
export function traceArgumentTasks(getStudy:()=>ArgumentStudy,run:typeof runCodexTask,record:(a:ArgumentAttempt,flush:boolean)=>void):typeof runCodexTask {
 return async(input,signal,notify)=>{
  if(!input.argument)throw Error('缺少精读阶段');
  const created=Date.now();
  let a:ArgumentAttempt={id:crypto.randomUUID(),...scopeOf(getStudy(),input.argument),status:'preparing',created,updated:created,model:input.model||'',effort:input.effort||'',events:[],summary:'',error:''};
  record(a,true);
  function snapshot(job:CodexJob){
   a={...a,status:job.status,updated:job.completedAt||job.updated||Date.now(),model:job.model||a.model,effort:job.effort||a.effort,events:job.events||[],summary:job.reasoningSummary||'',error:job.error||''};
  }
  try{
   const job=await run(input,signal,j=>{snapshot(j);record(a,false);notify(j)});
   snapshot(job);record(a,true);return job;
  }catch(e){
   a={...a,status:signal.aborted?'cancelled':'error',updated:Date.now(),error:signal.aborted?'已暂停本轮精读。':(e as Error).message};
   record(a,true);throw e;
  }
 };
}
