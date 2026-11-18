'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,BookOpen,Download,FileCode2,CloudUpload,CloudDownload,LoaderCircle,Pause,Play,Settings2,RotateCcw,ArrowRight,Check,AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Field,FieldLabel,FieldDescription,FieldGroup} from '@/components/ui/field';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {Progress} from '@/components/ui/progress';
import ReadingDialog from './ui-dialog';
import TaskModelSettings,{useTaskModel} from './task-model-settings';
import TaskProgress from './task-progress';
import {useCodex} from './codex-provider';
import {useAccount} from './account-provider';
import {api,download,type Paper} from '@/lib/client';
import type {CodexJob,PageText} from '@/lib/ai-types';
import type {ArgumentStudy} from '@/lib/argument-types';
import {newArgumentStudy,generateArgumentStudy,studyComplete,studyParagraphs,validateArgumentStudy,argumentBatches} from '@/lib/argument-study.mjs';
import {argumentHtml} from '@/lib/argument-html.mjs';
import {argumentDimensions} from '@/companion/argument.mjs';
import {loadArgumentFonts} from '@/lib/argument-fonts';
import {readArgumentCache,writeArgumentCache} from '@/lib/argument-cache';
import {runCodexTask} from '@/lib/codex-client';
import {desktopBridge} from '@/lib/desktop';

export default function ArgumentStudyWorkspace({paper,getBodyPages,onClose,demo=false}:{paper:Paper;getBodyPages:(a:number,b:number)=>Promise<PageText[]>;onClose:()=>void;demo?:boolean}){
 const c=useCodex(),{account}=useAccount(),settings=useTaskModel('argument');
 const [study,setStudy]=useState<ArgumentStudy|null>(null),[course,setCourse]=useState(''),[mode,setMode]=useState<'body'|'all'>('body'),[loading,setLoading]=useState(true),[running,setRunning]=useState(false),[error,setError]=useState(''),[localStatus,setLocalStatus]=useState(''),[cloudStatus,setCloudStatus]=useState(''),[etag,setEtag]=useState<string|null|undefined>(),[saving,setSaving]=useState(false),[controls,setControls]=useState(true),[job,setJob]=useState<CodexJob|null>(null),[label,setLabel]=useState(''),[fonts,setFonts]=useState<Record<string,string>>({}),[fontError,setFontError]=useState(''),[preview,setPreview]=useState('');
 const current=useRef(study);current.current=study;
 const mounted=useRef(true),controller=useRef<AbortController|null>(null),frame=useRef<HTMLIFrameElement>(null),scroll=useRef(0),cacheQueue=useRef<Promise<unknown>>(Promise.resolve());
 const owner=account?.id||(demo?'demo':'');
 const completed=studyComplete(study),done=studyParagraphs(study).length;
 const withCourse=useMemo(()=>study?{...study,course}:null,[study,course]);
 const html=useMemo(()=>withCourse?argumentHtml(withCourse,fonts):'',[withCourse,fonts]);
 useEffect(()=>{try{scroll.current=frame.current?.contentWindow?.scrollY||0}catch{}if(!html){setPreview('');return;}const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));setPreview(url);return()=>URL.revokeObjectURL(url)},[html]);
 async function fontLoad(){try{const value=await loadArgumentFonts();if(mounted.current){setFonts(value);setFontError('')}}catch(e){if(mounted.current)setFontError((e as Error).message)}}
 async function remember(value:ArgumentStudy){
  if(!owner)return;
  cacheQueue.current=cacheQueue.current.catch(()=>{}).then(()=>writeArgumentCache(owner,value));
  try{await cacheQueue.current;if(mounted.current)setLocalStatus('进度已保存在本机')}catch{if(mounted.current)setLocalStatus('本机保存失败，请先导出或保存到云端，关闭窗口可能丢失进度。')}
 }
 async function commit(value:ArgumentStudy){if(mounted.current)setStudy(value);await remember(value)}
 useEffect(()=>{
  mounted.current=true;let active=true;void fontLoad();
  (async()=>{
   let local:ArgumentStudy|null=null;
   try{if(owner){const saved=await readArgumentCache(owner,paper.id);if(saved)local=validateArgumentStudy(saved,paper.pages)}}catch{if(active)setLocalStatus('本机旧记录无法读取，可从云端载入或重新生成。')}
   let cloud:ArgumentStudy|null=null;
   if(!demo)try{const data=await api<{study:ArgumentStudy|null;etag:string|null}>(`/api/argument-study?paper=${paper.id}`);cloud=data.study?validateArgumentStudy(data.study,paper.pages):null;if(active){setEtag(data.etag);setCloudStatus(cloud?'有已保存的云端版本':'尚未保存到云端')}}catch(e){if(active)setCloudStatus('云端暂不可用：'+(e as Error).message)}
   if(!active)return;
   const saved=local||cloud;
   if(saved){setStudy(saved);setCourse(saved.course);setMode(saved.mode);setControls(!studyComplete(saved));setLoading(false);if(!local)void remember(saved);return;}
   try{const pages=await getBodyPages(1,paper.pages);if(active){const next=newArgumentStudy(paper,pages);setStudy(next);await remember(next)}}catch(e){if(active)setError((e as Error).message)}finally{if(active)setLoading(false)}
  })();
  return()=>{active=false;mounted.current=false;controller.current?.abort()};
 },[paper.id,owner]);
 useEffect(()=>{if(!study||study.course===course)return;const t=setTimeout(()=>{const value={...study,course,updated:Date.now()};setStudy(value);void remember(value)},500);return()=>clearTimeout(t)},[course,study]);
 useEffect(()=>{if(!running)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload)},[running]);
 async function prepare(nextMode=mode){
  if(running||loading)return;
  if(done&&!confirm('重新提取会替换本机的精读结果。建议先导出 HTML 或保存到云端。继续？'))return;
  setLoading(true);setError('');setJob(null);
  try{const pages=await getBodyPages(1,paper.pages);if(!mounted.current)return;const next=newArgumentStudy(paper,pages,nextMode,course);setMode(nextMode);await commit(next)}catch(e){if(mounted.current)setError((e as Error).message)}finally{if(mounted.current)setLoading(false)}
 }
 async function generate(){
  if(running||!study)return;
  if(!c.ready){c.open();return;}
  const native=desktopBridge();if(native&&Number(native.version.split('.')[1])<5&&Number(native.version.split('.')[0])===1){setError('此功能需要 Paperleaf 1.5.0 或更新版本。请在桌面下载页检查更新后使用。');return;}
  const ctrl=new AbortController();controller.current=ctrl;setRunning(true);setError('');setJob(null);
  try{
   await generateArgumentStudy({study:{...study,course},runTask:runCodexTask,signal:ctrl.signal,model:settings.model,effort:settings.effort,onChange:commit,onProgress:(j,message)=>{if(mounted.current&&!ctrl.signal.aborted){setJob(j);setLabel(message)}}});
   if(mounted.current){setLabel('全部段落与论证总览已完成');setControls(false)}
  }catch(e){if(mounted.current){setError(ctrl.signal.aborted?'':(e as Error).message);setLabel(ctrl.signal.aborted?'已暂停，已完成批次保留；继续时从未完成处开始。':'当前批次未完成，已完成段落保留，可继续重试。')}}
  finally{if(mounted.current){setRunning(false);setJob(j=>j&&['preparing','running'].includes(j.status)?{...j,status:ctrl.signal.aborted?'cancelled':'error',completedAt:Date.now()}:j)}controller.current=null}
 }
 async function saveCloud(){
  if(!withCourse||demo||saving)return;setSaving(true);setError('');
  try{let revision=etag;if(revision===undefined){const data=await api<{etag:string|null}>(`/api/argument-study?paper=${paper.id}`);setEtag(data.etag);if(data.etag){setError('云端已有精读版本。请先载入并核对，或导出当前结果。');return;}revision=null}
   const r=await api<{etag:string}>('/api/argument-study',{method:'PUT',body:JSON.stringify({study:withCourse,etag:revision})});setEtag(r.etag);setCloudStatus('当前精读已保存到云端');
  }catch(e){setError((e as Error).message)}finally{setSaving(false)}
 }
 async function restoreCloud(){
  if(demo||running||saving)return;if(done&&!confirm('载入云端版本将替换当前本机精读。请先导出需要保留的结果。继续？'))return;
  setSaving(true);setError('');try{const data=await api<{study:ArgumentStudy|null;etag:string|null}>(`/api/argument-study?paper=${paper.id}`);setEtag(data.etag);if(!data.study){setCloudStatus('云端暂无精读记录');return;}const value=validateArgumentStudy(data.study,paper.pages);setCourse(value.course);setMode(value.mode);await commit(value);setCloudStatus('已载入云端版本')}catch(e){setError((e as Error).message)}finally{setSaving(false)}
 }
 function exportHtml(){if(!withCourse)return;const name=paper.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);download(argumentHtml(withCourse,fonts),`${name}-论证精读${completed?'':'-未完成草稿'}.html`,'text/html;charset=utf-8')}
 function close(){controller.current?.abort();if(current.current)void remember({...current.current,course});onClose()}
 return <ReadingDialog title="论文论证精读" className="argument-workspace" onClose={close} busy={running}>
  <header className="argument-workspace-head"><div className="argument-workspace-title"><Button variant="outline" size="sm" onClick={close}><ArrowLeft data-icon="inline-start"/>返回论文</Button><div><span>ARGUMENT STUDY</span><h2>论文论证精读</h2></div></div><div className="argument-workspace-actions"><Button variant="outline" size="sm" disabled={!done} onClick={()=>{setControls(false);frame.current?.focus()}}><FileCode2 data-icon="inline-start"/>打开 HTML</Button><Button variant="ghost" size="sm" aria-expanded={controls} aria-controls="argument-settings" onClick={()=>setControls(v=>!v)}><Settings2 data-icon="inline-start"/>{controls?'收起设置':'精读设置'}</Button><Button variant="outline" size="sm" disabled={!study||saving||running||demo} onClick={()=>void saveCloud()}><CloudUpload data-icon="inline-start"/>{saving?'保存中':'保存到云端'}</Button><Button disabled={!done||!fonts.lora400||running} size="sm" onClick={exportHtml}><Download data-icon="inline-start"/>{completed?'导出完整 HTML':'导出草稿 HTML'}</Button></div></header>
  <div className={`argument-workspace-body ${controls?'has-settings':''}`}>
   <aside id="argument-settings" className="argument-settings" hidden={!controls}>
    <div className="argument-source-title"><span>当前文献</span><h3>{paper.title}</h3><p>{paper.pages} 页 · {paper.authors||'未记录作者'}</p></div>
    <FieldGroup><Field><FieldLabel htmlFor="argument-course">课程信息 <span className="argument-optional">可选</span></FieldLabel><Input id="argument-course" maxLength={200} value={course} disabled={running} onChange={e=>setCourse(e.target.value)} placeholder="如：科研方法 · 第 6 周研讨"/><FieldDescription>显示在 HTML 顶部，可留空用于个人精读。</FieldDescription></Field><Field><FieldLabel htmlFor="argument-scope">分析范围</FieldLabel><select id="argument-scope" value={mode} disabled={loading||running} onChange={e=>void prepare(e.target.value as 'body'|'all')}><option value="body">论文正文（含摘要）</option><option value="all">全部可提取文字</option></select><FieldDescription>正文模式过滤识别到的页眉、图表标题和参考文献；不识别图片与扫描页。</FieldDescription></Field></FieldGroup>
    <TaskModelSettings task="argument" settings={settings} disabled={running}/>
    {loading?<p className="argument-loading"><LoaderCircle className="spin"/>正在提取并核对全文…</p>:study&&<details className="argument-coverage"><summary>检查提取范围 · {study.sources.length} 段 / {argumentBatches(study.sources).length} 批</summary><p>{study.sources.reduce((n,p)=>n+p.original.length,0).toLocaleString()} 字符。完整原文可在右侧预览核对。</p>{study.excluded.map(p=><p key={p.page}>第 {p.page} 页：{p.reason}</p>)}{!study.excluded.length&&<p>所有页面均有可提取文字。</p>}</details>}
    <div className="argument-run-actions">{running?<Button variant="outline" onClick={()=>controller.current?.abort()}><Pause data-icon="inline-start"/>暂停精读</Button>:<Button disabled={loading||!study||completed} onClick={()=>void generate()}>{completed?<Check data-icon="inline-start"/>:<Play data-icon="inline-start"/>}{completed?'精读已完成':!c.ready?'连接 Codex 后生成':done?'继续精读':'开始全文精读'}</Button>}<p>分批翻译并批注，最后整理全文论证。使用已登录 Codex 账号额度；长论文可能需要较长时间。</p></div>
    {!c.ready&&<Alert><BookOpen/><AlertTitle>连接你的阅读搭档</AlertTitle><AlertDescription>生成需要先登录 Codex。已完成的精读仍可预览和导出。<Button variant="link" size="sm" onClick={c.open}>连接 Codex <ArrowRight data-icon="inline-end"/></Button></AlertDescription></Alert>}
    <div className="argument-storage"><p role="status">{localStatus||'完成的批次自动保存在本机。'}</p><p>{demo?'试读结果仅保留在本机。':cloudStatus||'云端不会自动保存此精读，点击「保存到云端」后同步。'}</p><div><Button variant="ghost" size="sm" disabled={demo||saving||running} onClick={()=>void restoreCloud()}><CloudDownload data-icon="inline-start"/>载入云端</Button><Button variant="ghost" size="sm" disabled={loading||running} onClick={()=>void prepare()}><RotateCcw data-icon="inline-start"/>重新提取</Button></div></div>
   </aside>
   <div className="argument-preview-region">
    {(running||label)&&<div className="argument-progress-strip"><div><span>{running?<LoaderCircle className="spin" size={15}/>:completed?<Check size={15}/>:<Pause size={15}/>} {label}</span><small>{done} / {study?.sources.length||0} 段{completed?' · 总览完成':''}</small></div><Progress value={study?(done/study.sources.length)*90+(completed?10:0):0} aria-label="论证精读进度"/>{running&&<details><summary>查看 Codex 进展</summary><TaskProgress job={job} running label={label}/></details>}</div>}
    {error&&<Alert variant="destructive" className="argument-error"><AlertCircle/><AlertTitle>精读尚未完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {fontError&&<Alert className="argument-error"><AlertDescription>{fontError}，预览暂用系统字体。<Button variant="link" onClick={()=>void fontLoad()}>重试载入字体</Button></AlertDescription></Alert>}
    {preview?<iframe ref={frame} title="论文英中对照与逐段论证批注" sandbox="allow-same-origin" src={preview} onLoad={()=>{try{frame.current?.contentWindow?.scrollTo(0,scroll.current)}catch{}}}/>:<div className="argument-empty"><span className="argument-kicker">READ BETWEEN THE LINES</span><h3>读懂文字，<br/>也读懂论证。</h3><p>让原文、译文和思考并肩展开。</p><div className="argument-empty-steps"><div><span>01</span><BookOpen/><b>英中对照</b><p>保留原文，流畅译文紧随其后。</p></div><div><span>02</span><FileCode2/><b>逐段批注</b><p>辨认功能、逻辑角色与论证技巧。</p></div><div><span>03</span><ArrowRight/><b>论证总览</b><p>从研究问题，连接到最终结论。</p></div></div><ul className="argument-mini-legend">{Object.entries(argumentDimensions).map(([k,d])=><li key={k}><i style={{background:d.color}}/>{d.label}</li>)}</ul>{loading&&<p className="argument-loading"><LoaderCircle className="spin"/>准备当前论文…</p>}</div>}
   </div>
  </div>
 </ReadingDialog>;
}
