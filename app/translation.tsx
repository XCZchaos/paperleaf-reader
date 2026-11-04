'use client';
import {useEffect,useRef,useState} from 'react';
import {Languages,Copy,NotebookPen,LoaderCircle,Pause,Play,Trash2,ChevronDown,LogIn,Plus} from 'lucide-react';
import {api,Note,Paper,download} from '@/lib/client';
import {runCodexTask} from '@/lib/codex-client';
import type {PageText,ResearchResult} from '@/lib/ai-types';
import {useCodex} from './codex-provider';
import {useCloudRecord} from '@/lib/use-cloud-record';
export type TranslationSource={text:string;rects:number[][];page:number;stamp:number;append?:boolean};
type Entry={id:string;original:string;text:string;page:number;rects:number[][];status:'queued'|'running'|'done'|'error';error:string;researchId?:string;model?:string;historyError?:string};
export default function Translation({source,paper,page,demo,onSaved,notify,getPages,onPage}:{source:TranslationSource|null;paper:Paper;page:number;demo:boolean;onSaved:(n:Note)=>void;notify:(s:string)=>void;getPages:(from:number,to:number)=>Promise<PageText[]>;onPage:(n:number)=>void}){
 const c=useCodex(),[original,setOriginal]=useState(''),[entries,setEntries]=useState<Entry[]>([]),[continuous,setContinuous]=useState(false),[paused,setPaused]=useState(false),[tick,setTick]=useState(0),[error,setError]=useState(''),[saving,setSaving]=useState(''),[history,setHistory]=useState<ResearchResult[]>([]);
 const active=useRef<AbortController|null>(null),mounted=useRef(true),entriesRef=useRef(entries);entriesRef.current=entries;
 const cloud=useCloudRecord({paperId:paper.id,kind:'translation',demo,value:entries,restore:(saved)=>{if(!Array.isArray(saved))return;setEntries(saved.filter(x=>typeof x?.original==='string'&&typeof x?.text==='string'&&Number.isInteger(x?.page)&&x.page>0&&x.page<=paper.pages).slice(0,30).map(x=>({...x,status:x.status==='running'?'error':x.status,error:x.status==='running'?'上次翻译已中断，请按需重试':x.error})));setPaused(true)}});
 useEffect(()=>{mounted.current=true;setContinuous(localStorage.getItem('paperleaf-continuous')==='true');if(!demo)api<ResearchResult[]>(`/api/research?paper=${paper.id}&kind=translate`).then(r=>{if(mounted.current)setHistory(r)}).catch(e=>{if(mounted.current)setError('翻译历史读取失败：'+e.message)});return()=>{mounted.current=false;active.current?.abort()}},[]);
 async function saveHistory(entry:Entry){if(demo||!entry.researchId)return;try{const record=await api<ResearchResult>('/api/research',{method:'POST',body:JSON.stringify({id:entry.researchId,paperId:paper.id,kind:'translate',question:entry.original,text:entry.text,page:entry.page,pages:[entry.page],model:entry.model||''})});if(mounted.current){setHistory(h=>[record,...h.filter(x=>x.id!==record.id)].slice(0,50));setEntries(es=>es.map(e=>e.id===entry.id?{...e,historyError:''}:e));}}catch(e){if(mounted.current)setEntries(es=>es.map(x=>x.id===entry.id?{...x,historyError:'译文已生成，但历史保存失败；可重试保存，不重复调用 GPT。'}:x));}}
 function enqueue(text:string,p=page,rects:number[][]=[],append=continuous){
   if(!cloud.ready){setError('正在恢复翻译记录，请稍候再试');return;}
   if(!c.ready){setOriginal(text);c.open();return;}
   if(!text.trim())return;if(text.length>8000){setError('每次最多翻译 8000 个字符，请缩小所选段落');return;}
   if(append&&entriesRef.current.some(x=>x.original===text&&x.page===p)){notify('这个段落已在连续翻译中');return;}
   if(append&&entriesRef.current.length>=30){setError('已保留 30 个段落，请导出或保存后清空');return;}
   if(!append)active.current?.abort();
   const entry:Entry={id:crypto.randomUUID(),original:text,text:'',page:p,rects,status:'queued',error:''};
   setError('');setOriginal('');setEntries(es=>append?[...es,entry]:[entry]);
 }
 useEffect(()=>{if(source)enqueue(source.text,source.page,source.rects,source.append||continuous)},[source?.stamp]);
 useEffect(()=>{
   if(!cloud.ready||active.current||paused||!c.ready)return;
   const next=entries.find(x=>x.status==='queued');if(!next)return;
   const controller=new AbortController();active.current=controller;
   setEntries(es=>es.map(x=>x.id===next.id?{...x,status:'running'}:x));
   (async()=>{try{
     const pages=await getPages(next.page,next.page);if(controller.signal.aborted)return;
     const prior=entriesRef.current.slice(0,entriesRef.current.findIndex(e=>e.id===next.id)).filter(e=>e.status==='done').slice(-1).flatMap(e=>[{role:'user',text:e.original},{role:'assistant',text:e.text}]).filter(e=>e.text.length<=12000);
     const result=await runCodexTask({kind:'translate',title:paper.title,pages,selection:next.original,model:c.model,history:prior},controller.signal,j=>{if(!mounted.current||controller.signal.aborted)return;setEntries(es=>es.map(x=>x.id===next.id?{...x,text:j.text}:x))});
     if(mounted.current&&!controller.signal.aborted){const completed:Entry={...next,text:result.text,status:'done',researchId:result.id,model:result.model};setEntries(es=>es.map(x=>x.id===next.id?completed:x));void saveHistory(completed);}
   }catch(e){if(mounted.current&&!controller.signal.aborted){setEntries(es=>es.map(x=>x.id===next.id?{...x,status:'error',error:(e as Error).message}:x));setPaused(true);}}
   finally{if(active.current===controller)active.current=null;if(mounted.current)setTick(n=>n+1);}})();
 },[entries,paused,c.ready,tick,cloud.ready]);
 function stop(){active.current?.abort();setPaused(true);setEntries(es=>es.map(x=>x.status==='running'?{...x,status:'error',error:'已停止，内容可能不完整；重试会重新发起翻译'}:x));}
 async function save(e:Entry){if(demo){notify('导入自己的 PDF 后即可保存双语笔记');return;}setSaving(e.id);try{const n=await api<Note>('/api/notes',{method:'POST',body:JSON.stringify({paperId:paper.id,page:e.page,text:'【GPT 中文译文】\n'+e.text,quote:e.original,rects:e.rects,color:'green'})});onSaved(n);notify('双语笔记已保存')}catch(e){notify((e as Error).message)}finally{setSaving('')}}
 const pending=entries.filter(e=>e.status==='queued').length,running=entries.some(e=>e.status==='running'),done=entries.filter(e=>e.status==='done').length;
 return <div className="translation-panel gpt-translation"><div className="translation-languages"><span>English</span><span>→</span><b>简体中文</b><span className="gpt-label">GPT</span></div><div className="translation-switches"><label><input type="checkbox" role="switch" aria-label="自动划词翻译" checked={c.autoTranslate} onChange={e=>{if(!c.ready){c.open();return;}c.setAutoTranslate(e.target.checked)}}/>自动划译</label><label title="保留前面的翻译，继续添加后续选中的段落"><input type="checkbox" role="switch" aria-label="连续翻译" checked={continuous} onChange={e=>{if(e.target.checked&&!c.ready){c.open();return;}setContinuous(e.target.checked);if(e.target.checked)c.setAutoTranslate(true);localStorage.setItem('paperleaf-continuous',String(e.target.checked))}}/>连续翻译</label></div><p className="translation-hint">{continuous?'连续选择多个段落，译文会依次追加。按住 Shift 划词也可追加。':'选中英文后点击「GPT 翻译」，或开启自动划译。'}</p>
 {!c.ready&&<div className="ai-login-card"><LogIn size={24}/><b>登录后，开始 GPT 翻译</b><p>使用你的 Codex 账号可用额度。</p><button className="button primary" onClick={c.open}>连接并登录 Codex</button></div>}
 <details className="manual-translation" open={!!original}><summary>粘贴或修改待翻译文字 <ChevronDown size={14}/></summary><textarea aria-label="待翻译英文" value={original} maxLength={8000} onChange={e=>setOriginal(e.target.value)} placeholder="粘贴英文段落…"/><button className="button primary small" disabled={!original.trim()} onClick={()=>enqueue(original)}><Plus size={14}/>{continuous?'加入连续翻译':'翻译为中文'}</button></details>
 {error&&<div className="translation-error" role="alert">{error}</div>}
 {!!entries.length&&<div className="translation-queue-bar"><span>{done} / {entries.length} 段完成{pending?` · 待译 ${pending}`:''}</span><div><button className="icon-btn" aria-label={paused?'继续连续翻译':'暂停后续翻译'} title={paused?'继续':'完成当前段后暂停'} onClick={()=>setPaused(v=>!v)}>{paused?<Play size={15}/>:<Pause size={15}/>}</button><button className="icon-btn" aria-label="清空翻译" onClick={()=>{if(!confirm('清空当前翻译？请先保存需要保留的笔记。'))return;active.current?.abort();setEntries([]);setPaused(false);}}><Trash2 size={15}/></button></div></div>}
 {paused&&<p className="queue-paused">{running?'当前段完成后暂停后续翻译':'已暂停'}<button onClick={()=>setPaused(false)}>继续</button></p>}
 <div className="bilingual-list">{entries.map((e,i)=><article className="bilingual-card" key={e.id}><header><button onClick={()=>onPage(e.page)}>第 {e.page} 页 ↗</button><span>段落 {i+1}</span></header><blockquote>{e.original}</blockquote><div className="translation-card-rule"><span>GPT 译文</span>{e.status==='running'&&<><LoaderCircle size={12} className="spin"/><button onClick={stop}>停止</button></>}</div>{e.status==='done'?<textarea aria-label={`第 ${i+1} 段译文`} className="bilingual-edit" value={e.text} onChange={v=>setEntries(es=>es.map(x=>x.id===e.id?{...x,text:v.target.value}:x))}/>:<p className="ai-text">{e.text||(e.status==='queued'?'等待翻译…':'正在理解原文…')}</p>}{e.status==='error'&&<div className="translation-error">{e.error}<button onClick={()=>{setEntries(es=>es.map(x=>x.id===e.id?{...x,status:'queued',text:'',error:''}:x));setPaused(false)}}>重试此段</button></div>}{e.historyError&&<div className="translation-error">{e.historyError}<button onClick={()=>void saveHistory(e)}>重试保存历史</button></div>}{e.status==='done'&&<footer><button onClick={async()=>{try{await navigator.clipboard.writeText(e.text);notify('译文已复制')}catch{notify('请手动选择译文复制')}}}><Copy size={13}/>复制</button><button disabled={saving===e.id} onClick={()=>void save(e)}>{saving===e.id?<LoaderCircle size={13} className="spin"/>:<NotebookPen size={13}/>}保存双语笔记</button></footer>}</article>)}</div>
 {!entries.length&&c.ready&&<div className="translation-empty"><Languages size={32}/><h4>选一段，读懂一段</h4><p>连续翻译会保留前面的中英对照，<br/>让阅读沿着你的思路继续。</p></div>}
 {done>0&&<button className="button full" onClick={()=>download(`# ${paper.title} · 双语阅读\n\n`+entries.filter(x=>x.status==='done').map(e=>`## 第 ${e.page} 页\n\n${e.original}\n\n${e.text}\n`).join('\n---\n\n'),'Paperleaf-双语翻译.md')}>导出已完成的中英对照</button>}<p className="translation-disclosure" role="status">{cloud.status}{cloud.isPending&&<button onClick={()=>void cloud.flush()}>重试同步</button>}</p><details className="research-history"><summary>云端翻译历史 · {history.length}</summary>{history.map(r=><article className="translation-history-entry" key={r.id}><button className="citation-pill" onClick={()=>onPage(r.page)}>第 {r.page} 页 ↗</button><blockquote>{r.question}</blockquote><p>{r.text}</p></article>)}</details><p className="translation-disclosure">所选文字与所在页上下文交给本机 Codex 处理。译文与翻译会话自动保存到云端，也可以整理成双语笔记。</p></div>;
}
