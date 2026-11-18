import {boundedParagraphs} from './pdf-paragraphs.mjs';
import {validateArgumentBatch,validateArgumentOverview} from '../companion/argument.mjs';

export function prepareArgumentSource(pages,mode='body') {
  const sources=[],excluded=[];
  if(!Array.isArray(pages)||!pages.length||!['body','all'].includes(mode))throw Error('没有可分析的论文正文');
  const seenPages=new Set();let size=0;
  for(const p of pages){
    if(!Number.isInteger(p.page)||p.page<1||p.page>10000||seenPages.has(p.page))throw Error('PDF 页码无效');seenPages.add(p.page);
    const paragraphs=boundedParagraphs((mode==='body'?p.bodyParagraphs:p.paragraphs)||[]);
    if(!paragraphs.length)excluded.push({page:p.page,reason:p.bodyReason||'此页未提取到可读正文。扫描页需先做 OCR。'});
    paragraphs.forEach((original,index)=>{size+=original.length;sources.push({id:`p${p.page}-${index+1}`,page:p.page,original})});
  }
  if(!sources.length)throw Error('未提取到可分析的文字。扫描 PDF 需要先做 OCR，也可尝试“全部文字”模式。');
  if(size>160000||sources.length>400)throw Error('全文超过本次精读上限（16 万字符 / 400 段），请先拆分 PDF 后导入；未发送任何内容给 GPT。');
  return {sources,excluded};
}
export function argumentBatches(sources) {
  const batches=[];let batch=[],size=0;
  for(const p of sources){if(batch.length&&(size+p.original.length>10000||batch.length===10)){batches.push(batch);batch=[];size=0;}batch.push(p);size+=p.original.length;}
  if(batch.length)batches.push(batch);return batches;
}
export function newArgumentStudy(paper,pages,mode='body',course='') {
  return {format:'paperleaf-argument-v1',paperId:paper.id,title:paper.title,authors:paper.authors||'',course:course.trim(),mode,...prepareArgumentSource(pages,mode),totalPages:pages.length,batches:[],overview:null,overviewModel:'',created:Date.now(),updated:Date.now()};
}
export function studyParagraphs(study){return study?.batches.flatMap(b=>b.result.paragraphs)||[];}
export function studyComplete(study){return !!study?.overview&&studyParagraphs(study).length===study.sources.length;}
export function validateArgumentStudy(v,totalPages=10000) {
  if(!v||v.format!=='paperleaf-argument-v1'||typeof v.paperId!=='string'||!/^[-\w]{1,64}$/.test(v.paperId)||typeof v.title!=='string'||!v.title.trim()||v.title.length>500||typeof v.authors!=='string'||v.authors.length>2000||typeof v.course!=='string'||v.course.length>200||!['body','all'].includes(v.mode)||!Number.isInteger(v.totalPages)||v.totalPages<1||v.totalPages>totalPages)throw Error('精读记录格式无效');
  if(!Array.isArray(v.sources)||!v.sources.length||v.sources.length>400)throw Error('精读原文不完整');
  const seen=new Set();let chars=0,last=0;
  const sources=v.sources.map(p=>{
    if(!p||typeof p.original!=='string'||!p.original.trim()||p.original.length>6000||!Number.isInteger(p.page)||p.page<last||p.page<1||p.page>v.totalPages||!new RegExp(`^p${p.page}-[1-9]\\d*$`).test(p.id)||seen.has(p.id))throw Error('精读原文页码或段落无效');
    seen.add(p.id);last=p.page;chars+=p.original.length;return{id:p.id,page:p.page,original:p.original};
  });
  if(chars>160000)throw Error('精读原文超出上限');
  const expected=argumentBatches(sources);
  if(!Array.isArray(v.batches)||v.batches.length>expected.length)throw Error('精读批次不完整');
  const batches=v.batches.map((b,i)=>{
    const ids=expected[i].map(p=>p.id);
    if(!b||JSON.stringify(b.ids)!==JSON.stringify(ids)||typeof b.model!=='string'||b.model.length>120||typeof b.effort!=='string'||b.effort.length>40)throw Error('精读进度与原文不一致');
    const result=validateArgumentBatch(b.result,expected[i]);
    result.skippedHighlights+=Number.isInteger(b.result.skippedHighlights)?Math.max(0,Math.min(80,b.result.skippedHighlights)):0;
    return{ids,result,model:b.model,effort:b.effort};
  });
  if(v.overview&&batches.length!==expected.length)throw Error('段落未完成，不能保存为完整总览');
  if(!Array.isArray(v.excluded)||v.excluded.length>v.totalPages||v.excluded.some(p=>!Number.isInteger(p.page)||p.page<1||p.page>v.totalPages||typeof p.reason!=='string'||p.reason.length>300))throw Error('精读范围说明无效');
  return {format:v.format,paperId:v.paperId,title:v.title,authors:v.authors,course:v.course,mode:v.mode,sources,excluded:v.excluded.map(p=>({page:p.page,reason:p.reason})),totalPages:v.totalPages,batches,overview:v.overview?validateArgumentOverview(v.overview,sources.map(p=>p.id)):null,overviewModel:typeof v.overviewModel==='string'?v.overviewModel.slice(0,120):'',created:Number.isFinite(v.created)?v.created:Date.now(),updated:Number.isFinite(v.updated)?v.updated:Date.now()};
}
export async function generateArgumentStudy({study,runTask,signal,onChange,onProgress,model,effort}) {
  let next=validateArgumentStudy(study);
  const batches=argumentBatches(next.sources),cancelled=()=>{if(signal.aborted)throw new DOMException('已暂停','AbortError');};
  for(let i=next.batches.length;i<batches.length;i++) {
    cancelled();const paragraphs=batches[i];
    const context=`前批最后章节：${next.batches.at(-1)?.result.paragraphs.at(-1)?.section||'未开始'}\n前批摘要：${next.batches.at(-1)?.result.digest||''}`;
    const grouped=new Map();for(const p of paragraphs)grouped.set(p.page,[...(grouped.get(p.page)||[]),p.original]);
    const pages=[...grouped].map(([page,parts])=>({page,text:parts.join('\n\n')}));
    onProgress(null,`逐段精读 · 第 ${i+1} / ${batches.length} 批`);
    const job=await runTask({kind:'argument',title:next.title,argument:{phase:'paragraphs',paragraphs,context},pages,model,effort},signal,j=>onProgress(j,`逐段精读 · 第 ${i+1} / ${batches.length} 批`));
    cancelled();const result=validateArgumentBatch(job.argument,paragraphs);
    result.skippedHighlights+=job.argument.skippedHighlights||0;
    next={...next,batches:[...next.batches,{ids:paragraphs.map(p=>p.id),result,model:job.model||'',effort:job.effort||''}],updated:Date.now()};
    await onChange(next);
  }
  cancelled();if(next.overview)return next;
  // Every completed batch contributes its digest. No silent truncation.
  const outline=next.batches.map((b,i)=>({batch:i+1,sources:b.ids,digest:b.result.digest,sections:[...new Set(b.result.paragraphs.map(p=>p.section))]}));
  const outlineText=JSON.stringify(outline);
  if(outlineText.length>150000)throw Error('分段分析过长，无法合成完整总览；已完成的逐段结果仍可预览和保存。');
  onProgress(null,'汇总全文论证 · 核对主张、证据与反驳');
  const result=await runTask({kind:'argument',title:next.title,argument:{phase:'overview',sources:next.sources.map(p=>p.id),outline:outlineText},pages:[{page:next.sources[0].page,text:outlineText}],model,effort},signal,j=>onProgress(j,'汇总全文论证 · 核对主张、证据与反驳'));
  cancelled();next={...next,overview:validateArgumentOverview(result.argument,next.sources.map(p=>p.id)),overviewModel:result.model||'',updated:Date.now()};await onChange(next);return next;
}
