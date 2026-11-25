import {argumentSourceLimit,validateBoundaryDecisions} from '../companion/argument.mjs';

// Keep the exact extracted characters and the position where each PDF page starts.
export function validateSources(items,totalPages) {
  if(!Array.isArray(items)||!items.length||items.length>400)throw Error('精读原文不完整或超过 400 段');
  let last=0,chars=0;
  const ids=new Set();
  const sources=items.map(p=>{
    if(!p||typeof p.original!=='string'||!p.original.trim()||!Number.isInteger(p.page)||p.page<1||p.page<last||p.page>totalPages||
      !new RegExp('^p'+p.page+'-[1-9]\\d*$').test(p.id)||ids.has(p.id)||
      (p.endPage!=null&&(!Number.isInteger(p.endPage)||p.endPage<p.page||p.endPage>totalPages)))throw Error('精读原文页码或段落无效');
    const breaks=p.pageBreaks??[];
    let previousPage=p.page,offset=-1;
    if(!Array.isArray(breaks)||breaks.length>totalPages)throw Error('原文跨页位置无效');
    const pageBreaks=breaks.map(b=>{
      if(!b||!Number.isInteger(b.page)||b.page!==previousPage+1||b.page>(p.endPage||p.page)||!Number.isInteger(b.offset)||b.offset<=offset||b.offset<1||b.offset>=p.original.length)throw Error('原文跨页位置无效');
      previousPage=b.page;offset=b.offset;return {page:b.page,offset:b.offset};
    });
    if(pageBreaks.length&&previousPage!==p.endPage)throw Error('原文结束页无效');
    ids.add(p.id);last=p.endPage||p.page;chars+=p.original.length;
    return {id:p.id,page:p.page,...(last>p.page?{endPage:last}:{}),...(pageBreaks.length?{pageBreaks}:{}),original:p.original};
  });
  if(chars>argumentSourceLimit)throw Error('精读原文超过 16 万字符上限');
  return sources;
}

export function reviewInput(layout,paragraphs) {
  const first=layout.findIndex(p=>p.id===paragraphs[0].id);
  const left=layout[first-1],right=layout[first+paragraphs.length];
  return {phase:'segmentation',paragraphs,
    previous:left?{page:left.endPage||left.page,text:left.original.slice(-1200)}:null,
    next:right?{page:right.page,text:right.original.slice(0,1200)}:null};
}

function sliceSource(source,start,end) {
  while(start<end&&/\s/u.test(source.original[start]))start++;
  while(end>start&&/\s/u.test(source.original[end-1]))end--;
  const breaks=source.pageBreaks||[];
  const page=breaks.filter(b=>b.offset<=start).at(-1)?.page||source.page;
  const pageBreaks=breaks.filter(b=>b.offset>start&&b.offset<end).map(b=>({page:b.page,offset:b.offset-start}));
  return {page,endPage:pageBreaks.at(-1)?.page||page,pageBreaks,original:source.original.slice(start,end)};
}

export function applyBoundaryDecisions(layout,decisions) {
  const result=[],counts=new Map();
  for(const [i,d] of decisions.entries()){
    const source=layout[i];
    const cuts=[0,...d.splits.map(a=>source.original.indexOf(a)),source.original.length];
    for(let j=0;j<cuts.length-1;j++){
      const part=sliceSource(source,cuts[j],cuts[j+1]);
      const last=result.at(-1);
      if(!j&&d.before==='join'&&last){
        const start=last.original.length+1,priorPage=last.endPage||last.page;
        const added=part.pageBreaks.map(b=>({page:b.page,offset:b.offset+start}));
        if(priorPage!==part.page)added.unshift({page:part.page,offset:start});
        if(added.length)last.pageBreaks=[...(last.pageBreaks||[]),...added];
        last.original+=' '+part.original;
        if(part.endPage>last.page)last.endPage=part.endPage;
      }else{
        const n=(counts.get(part.page)||0)+1;counts.set(part.page,n);
        result.push({id:'p'+part.page+'-'+n,page:part.page,...(part.endPage>part.page?{endPage:part.endPage}:{}),
          ...(part.pageBreaks.length?{pageBreaks:part.pageBreaks}:{}),original:part.original});
      }
    }
  }
  return result;
}

// The first two fragments normally settle the first paragraph. Older cached
// reviews keep their original batch boundaries so their decisions remain reusable.
function reviewGroups(review, group) {
  if (!review.quickStart) return group(review.layout);
  return [...group(review.layout.slice(0, 2)), ...group(review.layout.slice(2))];
}

export function validateReview(review,totalPages,group) {
  if(!review||!Array.isArray(review.batches))throw Error('缺少 AI 分段记录');
  const layout=validateSources(review.layout,totalPages);
  const normalized={layout,batches:[],...(review.quickStart===true?{quickStart:true}:{})};
  const groups=reviewGroups(normalized,group);
  if(layout.some(p=>p.endPage&&!p.pageBreaks?.length)||review.batches.length>groups.length)throw Error('AI 分段进度与原文不一致');
  const batches=review.batches.map((b,i)=>{
    if(typeof b?.model!=='string'||b.model.length>120)throw Error('缺少分段模型信息');
    return {model:b.model,...validateBoundaryDecisions(b,reviewInput(layout,groups[i]))};
  });
  const decisions=batches.flatMap(b=>b.decisions);
  const complete=batches.length===groups.length;
  const resolved=applyBoundaryDecisions(layout,decisions);
  const upcoming=layout[decisions.length];
  const tail=resolved.at(-1);
  // A decision on the next fragment may still extend the tail, even across a
  // column, page or batch. No later decision can change an earlier paragraph.
  const openTail=tail&&upcoming&&upcoming.page<=(tail.endPage||tail.page)+1;
  const confirmed=openTail?resolved.slice(0,-1):resolved;
  const closedThrough=complete?totalPages:(openTail?tail.page:upcoming.page)-1;
  if(confirmed.length)validateSources(confirmed,totalPages);
  let sources=layout;
  if(complete)sources=validateSources(resolved,totalPages);
  else if(normalized.quickStart&&decisions.length) {
    const provisional=layout.slice(decisions.length).map(p=>({before:'keep',splits:[]}));
    const preview=applyBoundaryDecisions(layout,[...decisions,...provisional]);
    // Pending fragments may still merge. Only the confirmed prefix is bound
    // by the output limit until every boundary has been reviewed.
    sources=preview.length<=400&&preview.reduce((sum,p)=>sum+p.original.length,0)<=argumentSourceLimit
      ?validateSources(preview,totalPages):confirmed.length?validateSources(confirmed,totalPages):layout;
  }
  return {review:{...normalized,batches},sources,confirmed,closedThrough,complete};
}

export async function reviewNextBoundaryBatch({review,totalPages,title,group,runTask,signal,onProgress,model,effort}) {
  const groups=reviewGroups(review,group),i=review.batches.length;
  if(i>=groups.length)return validateReview(review,totalPages,group);
  signal.throwIfAborted();
  const paragraphs=groups[i],input=reviewInput(review.layout,paragraphs);
  const label='正在确认段落 · 第 '+(i+1)+' / '+groups.length+' 批';
  onProgress(null,label);
  const grouped=new Map();
  for(const p of paragraphs)grouped.set(p.page,[...(grouped.get(p.page)||[]),p.original]);
  const pages=Array.from(grouped,([page,parts])=>({page,text:parts.join('\n\n')}));
  const job=await runTask({kind:'argument',title,argument:input,pages,model,effort},signal,j=>onProgress(j,label));
  signal.throwIfAborted();
  const batch={model:job.model||'',...validateBoundaryDecisions(job.argument,input)};
  return validateReview({...review,batches:[...review.batches,batch]},totalPages,group);
}

export async function reviewBoundaries({study,group,onChange,...options}) {
  let next=study;
  let checked=validateReview(next.review,next.totalPages,group);
  while(!checked.complete) {
    checked=await reviewNextBoundaryBatch({...options,review:checked.review,totalPages:next.totalPages,title:next.title,group});
    next={...next,review:checked.review,sources:checked.sources,updated:Date.now()};
    await onChange(next);
  }
  return next;
}
