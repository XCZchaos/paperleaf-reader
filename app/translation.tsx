'use client';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Languages,Copy,NotebookPen,LoaderCircle,Trash2,ChevronDown,LogIn,MessageCircle,ArrowUpRight,CornerDownLeft,Check,Square,Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {api,type Note,type Paper,download} from '@/lib/client';
import {wordCandidate} from '@/companion/research.mjs';
import {runCodexTask} from '@/lib/codex-client';
import {makeReadingContext} from '@/lib/reading-context.mjs';
import {SelectionSession,selectionLimit,type Fragment,type SelectionEntry} from '@/lib/selection-session.mjs';
import type {PageText,ReadingContext,CodexJob} from '@/lib/ai-types';
import ContextChat from './context-chat';
import Markdown from './markdown';
import TranslationSpeed from './translation-speed';
import FullTranslation from './full-translation';
import TaskProgress from './task-progress';
import {useCodex} from './codex-provider';
import {useStreamFollow} from './use-stream-follow';

export type TranslationSource=Fragment & {stamp:number};
export type TranslationHandle={select:(source:Fragment)=>boolean;toggleCollection:()=>void;isCollecting:()=>boolean};
type Props={paper:Paper;page:number;demo:boolean;onSaved:(n:Note)=>void;notify:(s:string)=>void;getPages:(from:number,to:number)=>Promise<PageText[]>;onPage:(n:number)=>void;getBodyPages:(from:number,to:number)=>Promise<PageText[]>};

const Translation=forwardRef<TranslationHandle,Props>(function Translation({paper,page,demo,onSaved,notify,getPages,onPage,getBodyPages},ref){
 const c=useCodex(),session=useRef(new SelectionSession()).current;
 const [snapshot,setSnapshot]=useState(session.snapshot),[job,setJob]=useState<CodexJob|null>(null),[mode,setMode]=useState<'selection'|'full'>('selection');
 const [followUp,setFollowUp]=useState<ReadingContext|null>(null),[fullBusy,setFullBusy]=useState(false),[chatBusy,setChatBusy]=useState(false);
 const [notice,setNotice]=useState<'busy'|'connection'|null>(null),[error,setError]=useState(''),[original,setOriginal]=useState(''),[editing,setEditing]=useState(false),[saving,setSaving]=useState(false);
 const [translationModel,setTranslationModel]=useState(''),[translationEffort,setTranslationEffort]=useState('');
 const active=useRef<AbortController|null>(null),mounted=useRef(true),otherBusy=useRef(false),panel=useRef<HTMLDivElement>(null);
 otherBusy.current=fullBusy||chatBusy;
 const entry=snapshot.entry,running=entry?.status==='running';
 const follow=useStreamFollow(panel,entry?.text||'',!!running);
 const chosenModel=c.status?.models.find(m=>m.id===translationModel),model=chosenModel?.id||c.model,effort=chosenModel?(chosenModel.reasoningEfforts?.some(e=>e.id===translationEffort)?translationEffort:''):c.effort;
 useEffect(()=>{mounted.current=true;setTranslationModel(localStorage.getItem('paperleaf-translation-model')||'');setTranslationEffort(localStorage.getItem('paperleaf-translation-effort')||'');return()=>{mounted.current=false;active.current?.abort()}},[]);
 function publish(){setSnapshot(session.snapshot)}
 function patch(id:string,changes:Partial<SelectionEntry>){if(mounted.current&&session.patch(id,changes))publish()}
 function chooseTranslation(m:string,e:string){setTranslationModel(m);setTranslationEffort(e);localStorage.setItem('paperleaf-translation-model',m);localStorage.setItem('paperleaf-translation-effort',e)}
 function explain(result:string){
  if(result==='busy')setNotice('busy');
  if(result==='limit')setError(`一次最多翻译 ${selectionLimit.toLocaleString()} 个字符，请缩小选区或关闭本次暂存。`);
  if(result==='duplicate')notify('这段文字已暂存，可继续划选其他内容。');
 }
 function select(source:Fragment){
  const result=session.select(source,otherBusy.current||!!active.current);
  if(result!=='accepted'){explain(result);return false;}
  publish();setMode('selection');setFollowUp(null);setError('');setEditing(false);setJob(null);
  if(!session.snapshot.collecting){if(c.ready)void start();else setNotice('connection');}
  return true;
 }
 function toggleCollection(){
  const result=session.toggle(otherBusy.current||!!active.current);
  if(result!=='accepted'){explain(result);return;}
  publish();setMode('selection');setFollowUp(null);setError('');setEditing(false);setJob(null);
  if(!session.snapshot.collecting&&session.snapshot.entry){if(c.ready)void start();else setNotice('connection');}
 }
 useImperativeHandle(ref,()=>({select,toggleCollection,isCollecting:()=>session.snapshot.collecting}));
 // A pending selection remains only in this window and resumes after login.
 useEffect(()=>{if(c.ready){setNotice(n=>n==='connection'?null:n);if(!otherBusy.current)void start()}},[c.ready,fullBusy,chatBusy]);
 async function start(){
  if(!c.ready||active.current||otherBusy.current)return;
  const next=session.begin();if(!next)return;
  const controller=new AbortController();active.current=controller;publish();setJob(null);
  try{
   const pages:PageText[]=[];
   for(const n of next.pages){pages.push(...await getPages(n,n));if(controller.signal.aborted)return;}
   const result=await runCodexTask({kind:'translate',title:paper.title,pages,selection:next.original,detectVocabulary:!!wordCandidate(next.original),model,effort},controller.signal,j=>{if(mounted.current&&!controller.signal.aborted){setJob(j);patch(next.id,{text:j.text})}});
   if(!controller.signal.aborted)patch(next.id,{text:result.text,status:'done',researchId:result.id,model:result.model,vocabulary:result.vocabulary||null});
  }catch(e){if(!controller.signal.aborted){patch(next.id,{status:'error',error:(e as Error).message});void c.refresh();}}
  finally{if(active.current===controller)active.current=null;}
 }
 function stop(){const current=session.snapshot.entry;active.current?.abort();if(current)patch(current.id,{status:'error',error:'已停止，已收到的译文保留在这里。可以重试或重新划选。'});}
 function clear(){const result=session.clear(otherBusy.current||!!active.current);if(result==='busy'){explain(result);return;}publish();setJob(null);setError('');setOriginal('')}
 function retry(){if(!entry||active.current||otherBusy.current){setNotice('busy');return;}patch(entry.id,{status:'queued',text:'',error:''});if(c.ready)void start();else setNotice('connection')}
 async function saveNote(e:SelectionEntry){
  if(demo){notify('导入自己的 PDF 后即可保存双语笔记');return;}setSaving(true);
  try{const n=await api<Note>('/api/notes',{method:'POST',body:JSON.stringify({paperId:paper.id,page:e.page,text:`【GPT 中文译文 · 第 ${e.pages.join('、')} 页】\n`+e.text,quote:e.original,rects:e.rects,color:'green'})});onSaved(n);notify('双语笔记已保存');}catch(e){notify((e as Error).message)}finally{setSaving(false)}
 }
 async function saveWord(e:SelectionEntry){
  if(!e.vocabulary||!e.researchId||demo)return;setSaving(true);
  try{await api('/api/vocabulary',{method:'POST',body:JSON.stringify({paperId:paper.id,page:e.page,original:e.original,jobId:e.researchId,vocabulary:e.vocabulary,text:e.text})});patch(e.id,{wordSaved:true,wordError:''});notify('已加入单词本')}catch{patch(e.id,{wordError:'单词本保存失败，请重试；不会重新翻译。'})}finally{setSaving(false)}
 }
 function ask(context:ReadingContext){if(running||fullBusy){setNotice('busy');return;}setFollowUp(context)}
 return <>
  <div className="translation-panel gpt-translation selection-workspace" ref={panel}>
   {followUp&&<ContextChat key={followUp.kind+followUp.id} context={followUp} onBusy={setChatBusy} onClose={()=>setFollowUp(null)} paper={paper} page={page} totalPages={paper.pages} getPages={getPages} onPage={onPage} onSaved={onSaved} demo={demo} notify={notify}/>}
   <div hidden={!!followUp}>
    <div className="translation-mode" role="group" aria-label="翻译方式"><Button variant="ghost" aria-pressed={mode==='selection'} className={mode==='selection'?'active':''} onClick={()=>setMode('selection')}>划词翻译</Button><Button variant="ghost" aria-pressed={mode==='full'} className={mode==='full'?'active':''} onClick={()=>setMode('full')}>全文中英对照</Button></div>
    <TranslationSpeed model={model} effort={effort} custom={!!chosenModel} onChoose={chooseTranslation} onReset={()=>chooseTranslation('','')}/>
    <div hidden={mode!=='full'}><FullTranslation getBodyPages={getBodyPages} onFollowUp={ask} onBusy={v=>{otherBusy.current=v||chatBusy;setFullBusy(v)}} blocked={!!running||snapshot.collecting||entry?.status==='queued'} model={model} effort={effort} paper={paper} page={page} demo={demo} getPages={getPages} onPage={onPage} onSaved={onSaved} notify={notify}/></div>
    <section hidden={mode!=='selection'} className="selection-translation" aria-label="划词翻译">
     <header className="selection-heading"><div><span className="eyebrow">READ & UNDERSTAND</span><h3>划过文字，接住理解。</h3></div><Languages size={26}/></header>
     <div className="selection-language-row"><span>English <ArrowUpRight size={13}/> 简体中文</span><Badge variant="outline">{running?'正在翻译':c.ready?'划选即译':'等待连接'}</Badge></div>
     <div className={`cross-page-control ${snapshot.collecting?'is-collecting':''}`}>
      <Button variant={snapshot.collecting?'default':'outline'} size="sm" onClick={toggleCollection} aria-pressed={snapshot.collecting}><kbd>Shift</kbd>{snapshot.collecting?'关闭暂存并翻译':'暂存选文'}</Button>
      <span role="status">{snapshot.collecting?`暂存已开启 · ${snapshot.fragments.length} 段`:'暂存已关闭'}</span>
      <p>{snapshot.collecting?'划选内容只暂存，可以来自同页或多页。关闭 Shift 暂存后立即翻译。':'点按 Shift 暂存选文，再次点按关闭暂存并立即翻译。'}</p>
     </div>
     {!c.ready&&<div className="selection-connect" role="status"><LogIn size={18}/><div><b>{c.connecting?'正在检测 Codex…':'请先连接 Codex'}</b><p>{entry?'已保留当前选区，连接后自动翻译。':'划词翻译使用你登录的 Codex 账号额度。'}</p><Button variant="outline" size="sm" onClick={c.open}>连接 Codex <ArrowUpRight size={13}/></Button></div></div>}
     {error&&<p className="translation-error" role="alert">{error}</p>}
     {snapshot.collecting&&<div className="collected-selections" aria-label="暂存的选文"><div className="collected-heading"><b>暂存原文</b><Button variant="ghost" size="sm" onClick={clear}>取消暂存</Button></div>{snapshot.fragments.length?snapshot.fragments.map((f,i)=><article key={i}><Button variant="ghost" size="sm" onClick={()=>onPage(f.page)}>第 {f.page} 页 <ArrowUpRight size={12}/></Button><p>{f.text}</p></article>):<p className="muted">划选你想暂存的文字；可以继续选取同页或其他页的内容。</p>}</div>}
     {entry&&<article className="bilingual-card current-translation" key={entry.id}>
      <header><div className="translation-pages">{entry.pages.map(n=><Button variant="ghost" size="sm" key={n} onClick={()=>onPage(n)}>第 {n} 页 <ArrowUpRight size={12}/></Button>)}</div><Button variant="ghost" size="icon-sm" aria-label="清空当前翻译" onClick={clear}><Trash2 size={14}/></Button></header>
      <details className="selection-original" open><summary>原文 <small>{entry.original.length.toLocaleString()} 字符</small><ChevronDown size={14}/></summary><blockquote>{entry.original}</blockquote></details>
      <div className="translation-card-rule"><span>中文译文</span>{running&&<Button variant="ghost" size="sm" onClick={stop}><Square size={12}/>停止</Button>}{entry.status==='done'&&<Check size={14}/>}</div>
      {running&&<TaskProgress job={job} running/>}
      {editing?<Textarea aria-label="编辑当前译文" className="bilingual-edit" value={entry.text} onChange={e=>patch(entry.id,{text:e.target.value})}/>:entry.text?<Markdown text={entry.text} streaming={!!running} pages={entry.pages} onPage={onPage}/>:<p className="translation-waiting" role="status">{entry.status==='queued'?'等待连接 Codex，选区已保留。':running?'正在理解这段原文…':'暂未生成译文。'}</p>}
      {entry.status==='error'&&<div className="translation-error" role="alert">{entry.error}<Button variant="outline" size="sm" onClick={retry}>重试翻译</Button></div>}
      {entry.wordError&&<p className="translation-error" role="alert">{entry.wordError}</p>}
      {entry.vocabulary&&<div className="vocabulary-detected"><b>{entry.vocabulary.word}</b><span>{entry.vocabulary.partOfSpeech}</span>{entry.wordSaved?<small>已收录 ✓</small>:<Button variant="ghost" size="sm" disabled={saving||demo} onClick={()=>void saveWord(entry)}>加入单词本</Button>}</div>}
      {entry.status==='done'&&<footer><Button variant="ghost" size="sm" onClick={()=>ask(makeReadingContext('translation',entry.researchId||entry.id,entry.page,entry.original,entry.text))}><MessageCircle size={14}/>追问 GPT</Button><Button variant="ghost" size="sm" onClick={()=>setEditing(v=>!v)}>{editing?'完成编辑':'编辑译文'}</Button><Button variant="ghost" size="sm" onClick={async()=>{try{await navigator.clipboard.writeText(entry.text);notify('译文已复制')}catch{notify('请手动选择译文复制')}}}><Copy size={14}/>复制</Button><Button variant="outline" size="sm" disabled={saving} onClick={()=>void saveNote(entry)}>{saving?<LoaderCircle size={14} className="spin"/>:<NotebookPen size={14}/>}保存双语笔记</Button><Button variant="ghost" size="sm" onClick={()=>download(`# ${paper.title} · 第 ${entry.pages.join('、')} 页\n\n${entry.original}\n\n${entry.text}`,'Paperleaf-双语翻译.md')}><Download size={14}/>导出</Button></footer>}
     </article>}
     {!entry&&!snapshot.collecting&&<div className="selection-empty"><span className="selection-empty-mark">Aa <Languages size={20}/></span><h4>选一段，读懂一段。</h4><p>在论文中划选英文，译文自动出现在这里。<br/>新的选区会替换本次内容。</p></div>}
     <details className="manual-translation"><summary>也可以粘贴文字 <ChevronDown size={14}/></summary><Textarea aria-label="待翻译英文" value={original} maxLength={selectionLimit} onChange={e=>setOriginal(e.target.value)} placeholder="粘贴英文段落…"/><Button variant="outline" size="sm" disabled={!original.trim()} onClick={()=>{if(select({text:original,page,rects:[]}))setOriginal('')}}><CornerDownLeft size={14}/>{snapshot.collecting?'暂存这段文字':'翻译为中文'}</Button></details>
     <p className="selection-privacy">划词译文仅保留在当前窗口，不自动存入云端。需要保留时，请保存为笔记或加入单词本。</p>
    </section>
   </div>
   {running&&!follow.atBottom&&<Button variant="secondary" size="sm" className="stream-follow-button" onClick={follow.scrollToBottom}>查看最新译文 ↓</Button>}
  </div>
  <Dialog open={!!notice} onOpenChange={open=>{if(!open)setNotice(null)}}><DialogContent className="selection-notice"><DialogHeader><DialogTitle>{notice==='busy'?'上一段内容正在翻译，请稍等':'连接 Codex 后开始翻译'}</DialogTitle><DialogDescription>{notice==='busy'?(otherBusy.current?'当前 GPT 任务尚未完成。完成后请重新划选，本次任务不会被中断。':'当前翻译会继续进行，不会被新选区覆盖。完成后请重新划选。'):'已保留你的选区。连接并登录 Codex 后，将自动开始翻译。'}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={()=>setNotice(null)}>{notice==='busy'?'知道了':'稍后连接'}</Button>{notice==='connection'&&<Button onClick={()=>{setNotice(null);c.open()}}><LogIn data-icon="inline-start"/>连接 Codex</Button>}</DialogFooter></DialogContent></Dialog>
 </>;
});
export default Translation;
