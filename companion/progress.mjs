const MAX_SUMMARY=12000;
function storeSummary(job,id,parts){let remaining=Math.max(0,MAX_SUMMARY-[...job.summaries.entries()].filter(([key])=>key!==id).flatMap(([,v])=>v).reduce((n,s)=>n+s.length,0));job.summaries.set(id,parts.map(s=>{const text=String(s||'').slice(0,remaining);remaining-=text.length;return text}));}
export function setStage(job,stage){job.stage=stage;job.updated=Date.now();}
export function readingProgress(job,method,p){
 if(method==='turn/started')setStage(job,'thinking');
 if(method==='item/started'&&p.item?.type==='reasoning')setStage(job,'thinking');
 // Only the public summary channel is consumed. Raw reasoning content is ignored.
 if(method==='item/reasoning/summaryTextDelta'||method==='item/reasoning/summaryPartAdded'){
  const index=p.summaryIndex;if(!Number.isInteger(index)||index<0||index>=24)return;
  if(!job.summaries.has(p.itemId)&&job.summaries.size>=24)return;
  const parts=job.summaries.get(p.itemId)||[];
  if(method.endsWith('summaryTextDelta'))parts[index]=((parts[index]||'')+String(p.delta||'')).slice(0,MAX_SUMMARY);
  storeSummary(job,p.itemId,parts);setStage(job,'thinking');
 }
 if(method==='item/completed'&&p.item?.type==='reasoning'&&Array.isArray(p.item.summary)){
  if(job.summaries.has(p.item.id)||job.summaries.size<24)storeSummary(job,p.item.id,p.item.summary.slice(0,24));job.updated=Date.now();
 }
}
export function publicProgress(job){return {stage:job.stage,reasoningSummary:[...job.summaries.values()].flat().filter(Boolean).join('\n\n').slice(0,MAX_SUMMARY),activity:job.activity||'',updated:job.updated,completedAt:job.completedAt||null};}
