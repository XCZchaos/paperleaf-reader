'use client';
import {makeReadingContext} from '@/lib/reading-context.mjs';
import {Button} from '@/components/ui/button';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,Play,Pause,RotateCcw,Download,ChevronLeft,ChevronRight,NotebookPen,Check,RefreshCw,MessageCircle} from 'lucide-react';
import {Progress} from '@/components/ui/progress';
import {api,download,type Paper,type Note} from '@/lib/client';
import {desktopBridge} from '@/lib/desktop';
import {useAccount} from './account-provider';
import {newArgumentStudy,argumentBatches,validateArgumentStudy} from '@/lib/argument-study.mjs';
import {readArgumentCache} from '@/lib/argument-cache';
import {reviewNextBoundaryBatch} from '@/lib/argument-segmentation.mjs';
import type {BoundaryReview} from '@/lib/argument-types';
import {runCodexTask,requireSegmentationBridge} from '@/lib/codex-client';
import {boundedParagraphs,paragraphsFromText} from '@/lib/pdf-paragraphs.mjs';
import type {CodexJob,PageText,ReadingContext} from '@/lib/ai-types';
import {useCodex} from './codex-provider';
import Markdown from './markdown';
import TaskProgress from './task-progress';
type Entry={id:string;paperId:string;page:number;ordinal:number;original:string;text:string;status:'queued'|'running'|'done'|'error'|'skipped';error:string;model:string;updated:number};
type Snapshot={hasLegacy?:boolean;stats:{total:number;done:number;queued:number;running:number;error:number;skipped:number};preparedPages:number[];entries:Entry[]};
type Neighbor={page:number;original:string;text?:string};
type Claim={entry:Entry;lease:string;before?:Neighbor|null;after?:Neighbor|null};
type PlanState={complete:boolean;review?:BoundaryReview|null};

function paragraphContext(claim:Claim,priorText:string) {
 const pages=new Map<number,string[]>();
 function add(page:number,text:string){pages.set(page,[...(pages.get(page)||[]),text]);}
 if(claim.before){
  add(claim.before.page,'上段原文：'+claim.before.original);
  if(claim.before.text)add(claim.before.page,'上段译文（供术语参考）：'+claim.before.text);
 }
 if(priorText)add(claim.entry.page,'本段前文译文：'+priorText.slice(-500));
 if(claim.after)add(claim.after.page,'下段原文：'+claim.after.original);
 if(!pages.size)add(claim.entry.page,'');
 return [...pages].map(([page,lines])=>({page,text:lines.join('\n')}));
}
const empty:Snapshot={stats:{total:0,done:0,queued:0,running:0,error:0,skipped:0},preparedPages:[],entries:[]};
export default function FullTranslation({paper,page,demo,getPages,onPage,onSaved,notify,model,effort,getBodyPages,onFollowUp,onBusy,blocked}:{getBodyPages:(a:number,b:number)=>Promise<PageText[]>;onFollowUp:(c:ReadingContext)=>void;onBusy:(v:boolean)=>void;blocked:boolean;model:string;effort:string;paper:Paper;page:number;demo:boolean;getPages:(a:number,b:number)=>Promise<PageText[]>;onPage:(n:number)=>void;onSaved:(n:Note)=>void;notify:(s:string)=>void}){
 const [extraction,setExtraction]=useState('body-ai');
 const semantic=extraction==='body-ai'||extraction==='all-ai';
 const {account}=useAccount();
 const [reviewProgress,setReviewProgress]=useState('');
 const c=useCodex(),[view,setView]=useState(page),[data,setData]=useState<Snapshot>(empty),[running,setRunning]=useState(false),[pausing,setPausing]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[job,setJob]=useState<CodexJob|null>(null),[active,setActive]=useState<Entry|null>(null),[pending,setPending]=useState<(Claim&{text:string;model:string})|null>(null),[exporting,setExporting]=useState(false),[retrying,setRetrying]=useState(false);
 const backgroundReview=useRef<AbortController|null>(null);
 const settings=useRef({model,effort});settings.current={model,effort};
 const mounted=useRef(true),controller=useRef<AbortController|null>(null),pauseRequested=useRef(false),viewRef=useRef(view),loadId=useRef(0),cache=useRef(new Map<string,PageText[]>());viewRef.current=view;
 useEffect(()=>{onBusy(running||!!pending);return()=>onBusy(false)},[running,pending]);
 async function refresh(target=viewRef.current){if(demo)return empty;const id=++loadId.current;const result=await api<Snapshot>(`/api/full-translation?paper=${paper.id}&page=${target}&mode=${extraction}`);if(mounted.current&&id===loadId.current&&viewRef.current===target)setData(result);return result;}
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort()}},[]);
 useEffect(()=>{if(demo)return;setLoading(true);refresh(view).catch(e=>{if(mounted.current)setError(e.message)}).finally(()=>{if(mounted.current)setLoading(false)})},[view,paper.id,extraction]);
 async function pagesFor(n:number){const key=extraction+':'+n;if(!cache.current.has(key)){const pages=await(extraction==='body-v2'||semantic?getBodyPages(n,n):getPages(n,n));cache.current.set(key,pages);}return cache.current.get(key)!;}
 async function patch(payload:object){return api('/api/full-translation',{method:'PATCH',body:JSON.stringify({paperId:paper.id,mode:extraction,...payload})});}
 async function complete(p:Claim&{text:string;model:string}){await patch({action:'complete',id:p.entry.id,lease:p.lease,text:p.text,model:p.model});if(mounted.current){setPending(null);setActive(null);setJob(null);}await refresh();}
 async function start(){
  if(controller.current||running||pending||retrying||blocked)return;if(demo){notify('请先导入自己的 PDF，再使用全文翻译。');return;}if(!c.ready){c.open();return;}
  const ctrl=new AbortController();controller.current=ctrl;pauseRequested.current=false;setPausing(false);setRunning(true);setError('');setMessage('正在恢复云端进度…');let claimed:Claim|null=null;
  let ahead:Promise<void>|null=null,reviewError:Error|null=null,serial=false;
  let initialView=viewRef.current;
  const stopBackground=()=>backgroundReview.current?.abort();
  ctrl.signal.addEventListener('abort',stopBackground,{once:true});
  try{
   const snapshot=await refresh();const prepared=new Set(snapshot.preparedPages);
   let needsReview=semantic&&prepared.size<paper.pages;
   let review:BoundaryReview|null|undefined;
   async function prepareNext(background=false,signal=ctrl.signal){
    requireSegmentationBridge(desktopBridge()?.version||c.status?.version);
    if(!account?.id)throw Error('请先登录 Paperleaf');
    if(review===undefined){
     const saved=await api<PlanState>(`/api/full-translation?paper=${paper.id}&mode=${extraction}&plan=1`);
     if(saved.complete){needsReview=false;return;}
     review=saved.review;
     if(!review){
      const key=account.id+':full-translation:'+extraction;
      const legacy=await readArgumentCache(key,paper.id).catch(()=>null);
      if(legacy)review=validateArgumentStudy(legacy,paper.pages).review;
      if(!review){
       setMessage('正在读取 PDF 版式，准备确认开头的段落…');
       const pages=await getBodyPages(1,paper.pages);
       review=newArgumentStudy(paper,pages,extraction==='body-ai'?'body':'all').review!;
      }
     }
    }
    if(signal.aborted||pauseRequested.current)return;
    const checked=await reviewNextBoundaryBatch({review,title:paper.title,totalPages:paper.pages,group:argumentBatches,...settings.current,
     signal,runTask:runCodexTask,onProgress:(j:CodexJob|null,label:string)=>{
      if(!mounted.current||signal.aborted)return;
      if(background){if(!j)setReviewProgress('正在确认后续段落');}
      else{setMessage(label);setJob(j);}
     }
    });
    signal.throwIfAborted();
    const saved=await api<PlanState>('/api/full-translation',{method:'POST',body:JSON.stringify({action:'prepareAIProgress',paperId:paper.id,mode:extraction,review:checked.review})});
    review=saved.review||checked.review;
    needsReview=!saved.complete;
    if(mounted.current){
     const reviewedCount=review!.batches.reduce((n,b)=>n+b.decisions.length,0);
     setReviewProgress(needsReview?`已核对 ${reviewedCount} / ${review!.layout.length} 个原文片段`:'全文分段已完成');
     if(!background)setJob(null);
    }
    await refresh();
   }
   function prepareAhead(){
    if(ahead||serial||!needsReview||ctrl.signal.aborted||pauseRequested.current)return;
    const background=new AbortController();
    backgroundReview.current=background;
    ahead=prepareNext(true,background.signal).catch((reason:Error)=>{
     if(background.signal.aborted)return;
     // Another local task may occupy the second slot. Fall back to a single
     // request after the current translation. Surface remote/model errors once.
     serial=true;
     if(!reason.message.includes('已有任务正在生成'))reviewError=reason;
    }).finally(()=>{if(backgroundReview.current===background)backgroundReview.current=null;});
   }
   for(let n=1;!semantic&&n<=paper.pages;n++){
    if(ctrl.signal.aborted||pauseRequested.current)break;if(prepared.has(n))continue;
    setMessage(extraction==='body-v2'?`正在识别正文与段落 · 第 ${n} / ${paper.pages} 页`:`正在分段 · 第 ${n} / ${paper.pages} 页`);const pages=await pagesFor(n);if(ctrl.signal.aborted)break;
    const paragraphs=extraction==='body-v2'?(pages[0]?.bodyParagraphs??pages[0]?.paragraphs??[]):pages[0]?.paragraphs??paragraphsFromText(pages[0]?.text||'');
    await api('/api/full-translation',{method:'POST',body:JSON.stringify({action:'prepare',paperId:paper.id,mode:extraction,page:n,paragraphs,skipReason:pages[0]?.bodyReason})});await refresh();
   }
   while(!ctrl.signal.aborted&&!pauseRequested.current){
    if(reviewError)throw reviewError;
    claimed=await api<Claim|null>('/api/full-translation',{method:'POST',body:JSON.stringify({action:'claim',paperId:paper.id,mode:extraction})});
    if(!claimed){if(ahead){await ahead;ahead=null;continue;}if(needsReview){await prepareNext();continue;}const latest=await refresh();setMessage(latest.stats.running?'其他窗口有翻译任务正在处理，可刷新查看。':latest.stats.error?'部分段落失败，可重试失败段落。':latest.stats.skipped?'可翻译段落已完成；已跳过无正文或无可提取文字的页面。':'全文翻译已完成。');break;}
    if(ctrl.signal.aborted||pauseRequested.current){await patch({action:'release',id:claimed.entry.id,lease:claimed.lease});claimed=null;break;}
    const current=claimed;setActive(current.entry);setJob(null);setMessage(`正在翻译 · 第 ${current.entry.page} 页，第 ${current.entry.ordinal+1} 段`);
    if(initialView===1&&viewRef.current===1&&snapshot.stats.done===0&&current.entry.page!==1){
     initialView=0;
     setView(current.entry.page);
    }else initialView=0;
    const sourcePages=semantic?null:await pagesFor(current.entry.page);
    const pieces=boundedParagraphs([current.entry.original]);
    const texts:string[]=[];let usedModel='';const translationSettings={...settings.current};
    for(const [part,selection] of pieces.entries()){
     if(part&&semantic)await patch({action:'renew',id:current.entry.id,lease:current.lease});
     const prefix=texts.join('');
     const pages=sourcePages||paragraphContext(current,prefix);
     const result=await runCodexTask({kind:'translate',translationMode:'paragraph',title:paper.title,pages,selection,...translationSettings},ctrl.signal,j=>{
      if(!mounted.current||ctrl.signal.aborted)return;
      setJob(prefix?{...j,text:prefix+j.text}:j);
      if(j.retrying||j.retryCount)serial=true;
      if(semantic&&!current.after&&j.text?.trim())prepareAhead();
     });
     texts.push(result.text);usedModel=result.model;
    }
    const result={text:texts.join(''),model:usedModel};
    const completed={...current,text:result.text,model:result.model};if(mounted.current)setPending(completed);
    try{await complete(completed);claimed=null;}catch(e){claimed=null;setError('译文已生成，但云端保存失败。请重试保存后继续，避免重复消耗额度。');break;}
   }
   if(pauseRequested.current){setMessage('已暂停，已完成的段落保存在云端。');await refresh();}
  }catch(e){
   if(claimed){try{await patch({action:ctrl.signal.aborted?'release':'fail',id:claimed.entry.id,lease:claimed.lease,error:(e as Error).message})}catch{}}
   if(mounted.current){if(ctrl.signal.aborted&&pauseRequested.current){setError('');setMessage('已暂停，已判别的批次可继续使用。')}else setError(ctrl.signal.aborted?'翻译已停止。':(e as Error).message);await refresh().catch(()=>{});}
  }finally{stopBackground();if(ahead)await ahead;ctrl.signal.removeEventListener('abort',stopBackground);controller.current=null;if(mounted.current){setRunning(false);setPausing(false);setActive(null);setJob(null);}}
 }
 async function retry(id?:string){if(running||pending||retrying||blocked)return;setRetrying(true);try{await patch({action:'retry',id});await refresh();setError('');setMessage('失败段落已重新加入队列，点击继续翻译。')}catch(e){setError((e as Error).message)}finally{setRetrying(false)}}
 async function exportAll(){setExporting(true);try{let sections:string[]=[];for(let n=1;n<=paper.pages;n++){const result=await api<Snapshot>(`/api/full-translation?paper=${paper.id}&page=${n}&mode=${extraction}`);for(const e of result.entries)if(e.status==='done')sections.push(`## 第 ${n} 页 · 段落 ${e.ordinal+1}\n\n${e.original}\n\n${e.text}`);}download(`# ${paper.title} · 全文中英对照\n\n${sections.join('\n\n---\n\n')}`,'Paperleaf-全文中英对照.md');notify('已导出已完成的中英对照')}catch(e){setError((e as Error).message)}finally{setExporting(false)}}
 async function note(e:Entry){try{const n=await api<Note>('/api/notes',{method:'POST',body:JSON.stringify({paperId:paper.id,page:e.page,quote:e.original,text:'【GPT 中文译文】\n'+e.text,color:'green'})});onSaved(n);notify('已保存双语笔记')}catch(e){notify((e as Error).message)}}
 function navigate(n:number){setView(n);onPage(n)}
 const {stats}=data,prepared=data.preparedPages.length===paper.pages,finished=prepared&&stats.done===stats.total&&stats.running===0;
 return <section className="full-translation"><div className="full-translation-intro"><div className="translation-book"><BookOpen size={22}/></div><span className="eyebrow">READ IN TWO LANGUAGES</span><h3>一段原文，一段理解。</h3><p>每确认一段完整原文，就可以开始翻译。<br/>随时暂停，下次从已保存的位置继续。</p></div>
 <label className="translation-extraction-label">识别范围<select aria-label="全文翻译识别范围" disabled={running||!!pending||loading} value={extraction} onChange={e=>{setExtraction(e.target.value);setReviewProgress('');setData(empty);setMessage('');setError('')}}><option value="body-ai">AI 自然段 · 论文正文</option><option value="all-ai">AI 自然段 · 全部文字</option><option value="body-v2">版式分段 · 正文与已有译文</option><option value="all-v2">版式分段 · 全部文字与已有译文</option>{data.hasLegacy&&<option value="legacy">查看之前的全文翻译</option>}</select><small>确认好的自然段优先翻译。可能跨页的续句会等下一段确认后一起翻译。跨页续段显示在起始页。AI 模式上限为 16 万字符、400 段，各模式分别保存。</small></label><div className="full-translation-status"><div><b>{stats.done}<span> / {stats.total||'—'} 段</span></b><small>{prepared?'翻译进度':semantic&&reviewProgress?reviewProgress:'已分段 '+data.preparedPages.length+' / '+paper.pages+' 页'}</small></div><Progress value={stats.done/(stats.total||1)*100} aria-label="全文翻译进度"/><div className="full-translation-buttons">{running?<Button variant="default" className="button primary" disabled={pausing} onClick={()=>{pauseRequested.current=true;backgroundReview.current?.abort();setPausing(true)}}><Pause size={14}/>{pausing?'保存当前进度后暂停…':'暂停后续翻译'}</Button>:<Button variant="default" className="button primary" disabled={!!pending||retrying||finished||loading||blocked} onClick={()=>void start()}>{finished?<Check size={14}/>:<Play size={14}/>} {finished?'全部已翻译':(data.preparedPages.length||stats.total||reviewProgress)?'继续全文翻译':'开始全文翻译'}</Button>}<Button variant="ghost" size="icon-sm" className="icon-btn" disabled={loading} aria-label="刷新全文翻译状态" title="刷新云端进度" onClick={()=>{void refresh().catch(e=>setError(e.message))}}><RefreshCw size={15}/></Button></div>{stats.error>0&&<Button variant="ghost" className="text-button" disabled={running||!!pending||retrying} onClick={()=>void retry()}><RotateCcw size={13}/>重试 {stats.error} 个失败段落</Button>}{stats.skipped>0&&<p className="tiny muted">{stats.skipped} 页已跳过，可在下方查看具体原因。</p>}</div>
 <p className="full-translation-message" role="status">{message||(demo?'导入自己的 PDF 后即可开始。':'译文逐段保存到云端，仅你可见。')}</p>{error&&<p className="translation-error" role="alert">{error}</p>}
 {pending&&!running&&<div className="translation-error"><p>第 {pending.entry.page} 页的译文尚未保存。</p><Button variant="ghost" onClick={async()=>{try{await complete(pending);setError('');setMessage('译文已保存，可以继续翻译。')}catch(e){setError((e as Error).message)}}}>重试保存，不重新翻译</Button><Button variant="ghost" onClick={()=>download(`${pending.entry.original}\n\n${pending.text}`,'Paperleaf-待保存译文.md')}>先导出这一段</Button></div>}
 {running&&job&&!active&&<TaskProgress job={job} running label="正在确认自然段"/>}
 {running&&active&&<div className="current-full-task"><Button variant="ghost" className="text-button" onClick={()=>navigate(active.page)}>正在处理第 {active.page} 页 · 跳转查看 ↗</Button><TaskProgress job={job} running/></div>}
 <nav className="bilingual-page-nav" aria-label="双语对照页码"><Button variant="ghost" size="icon-sm" className="icon-btn" aria-label="上一页对照" disabled={view<=1} onClick={()=>navigate(view-1)}><ChevronLeft size={16}/></Button><label>第 <select aria-label="全文翻译页码" value={view} onChange={e=>navigate(Number(e.target.value))}>{Array.from({length:paper.pages},(_,i)=><option value={i+1} key={i+1}>{i+1}</option>)}</select> / {paper.pages} 页</label><Button variant="ghost" size="icon-sm" className="icon-btn" aria-label="下一页对照" disabled={view>=paper.pages} onClick={()=>navigate(view+1)}><ChevronRight size={16}/></Button><Button variant="ghost" className="text-button" onClick={()=>onPage(view)}>定位原文 ↗</Button></nav>
 <div className="parallel-paragraphs">{data.entries.map(e=><article className="parallel-paragraph" key={e.id}><header><b>段落 {e.ordinal+1}</b><span>{e.status==='done'?'已保存':e.status==='error'?'待重试':e.status==='skipped'?'已跳过':active?.id===e.id&&running?'正在翻译':e.status==='running'?'处理中':'等待翻译'}</span></header><div className="parallel-pair"><div className="parallel-original"><small>ENGLISH</small><p>{e.original||e.error}</p></div><div className="parallel-chinese"><small>中文译文</small>{e.status==='done'?<Markdown text={e.text}/>:active?.id===e.id&&job?.text?<Markdown text={job.text} streaming/>:<p className="translation-placeholder">{e.status==='error'?e.error:e.status==='skipped'?e.error:'译文将在这里与原文逐段对应。'}</p>}</div></div>{e.status==='done'&&<footer><Button variant="ghost" disabled={running||!!pending||blocked} onClick={()=>onFollowUp(makeReadingContext('paragraph',e.id,e.page,e.original,e.text))}><MessageCircle size={13}/>追问 GPT</Button><Button variant="ghost" onClick={()=>void note(e)}><NotebookPen size={13}/>保存双语笔记</Button><Button variant="ghost" onClick={()=>onPage(e.page)}>原文第 {e.page} 页 ↗</Button></footer>}{e.status==='error'&&<footer><Button variant="ghost" disabled={running||!!pending||retrying} onClick={()=>void retry(e.id)}>重试此段</Button></footer>}</article>)}</div>
 {!data.entries.length&&<div className="translation-empty"><BookOpen size={27}/><p>{loading?'正在读取这一页的对照…':'开始全文翻译后，这一页的段落会显示在这里。'}</p></div>}
 {!!stats.done&&<Button variant="outline" className="button full" disabled={exporting} onClick={()=>void exportAll()}><Download size={14}/>{exporting?'正在整理…':'导出全文中英对照'}</Button>}
 <p className="translation-disclosure">使用已登录 Codex 的账号额度。保留原文含义、数值、公式和引用标记，不以摘要替代翻译。AI 分段会使用同一账号额度。超长自然段分次翻译后在同一段显示。扫描页、图片和未提取的公式不会自动识别。</p></section>;
}
