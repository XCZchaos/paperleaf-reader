'use client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {InputGroup,InputGroupTextarea} from '@/components/ui/input-group';
import {Field,FieldLabel} from '@/components/ui/field';
import {Message,MessageContent} from '@/components/ui/message';
import {Bubble,BubbleContent} from '@/components/ui/bubble';
import {MessageScrollerProvider,MessageScroller,MessageScrollerViewport,MessageScrollerContent,MessageScrollerItem,MessageScrollerButton} from '@/components/ui/message-scroller';
import {readingContextKey,readingContextSelection,contextLabel} from '@/lib/reading-context.mjs';
import {useEffect,useRef,useState} from 'react';
import {Send,Square,Plus,History,Copy,NotebookPen,Download,X,MessageCircle} from 'lucide-react';
import {api,download,formatDate,type Paper,type Note} from '@/lib/client';
import {runCodexTask} from '@/lib/codex-client';
import {conversationContext} from '@/lib/chat-context.mjs';
import type {CodexJob,PageText,ResearchResult,ReadingContext} from '@/lib/ai-types';
import type {TranslationSource} from './translation';
import {useCodex} from './codex-provider';
import Markdown from './markdown';
import TaskModelSettings,{useTaskModel} from './task-model-settings';
import TaskProgress from './task-progress';
type Props={paper:Paper;page:number;totalPages:number;source:TranslationSource|null;getPages:(a:number,b:number)=>Promise<PageText[]>;onPage:(n:number)=>void;onSaved:(n:Note)=>void;notify:(s:string)=>void;demo:boolean;seed?:ResearchResult|null;readingContext?:ReadingContext|null;onBusy?:(value:boolean)=>void};
export default function ChatPanel({paper,page,totalPages,source,getPages,onPage,onSaved,notify,demo,seed,onBusy,readingContext}:Props){
 const settings=useTaskModel('ask');
 const [attachedContext,setAttachedContext]=useState<ReadingContext|null>(readingContext||null);
 const contextQuery=readingContext?'&context='+encodeURIComponent(readingContextKey(readingContext)):'';
 const draftKey=`paperleaf-chat-draft-${paper.id}-${readingContextKey(readingContext)||'general'}`;
 const c=useCodex(),[messages,setMessages]=useState<ResearchResult[]>([]),[catalog,setCatalog]=useState<ResearchResult[]>([]),[conversation,setConversation]=useState(''),[question,setQuestion]=useState(''),[quote,setQuote]=useState(''),[scope,setScope]=useState(readingContext?'range':'page'),[from,setFrom]=useState(readingContext?.page||page),[to,setTo]=useState(readingContext?.page||page),[running,setRunning]=useState(false),[loading,setLoading]=useState(!demo),[job,setJob]=useState<CodexJob|null>(null),[current,setCurrent]=useState<{question:string;selection:string}|null>(null),[error,setError]=useState(''),[pending,setPending]=useState<ResearchResult|null>(null),[historyOpen,setHistoryOpen]=useState(false),[more,setMore]=useState(false),[moreCatalog,setMoreCatalog]=useState(false),[saving,setSaving]=useState(false),[draftLoaded,setDraftLoaded]=useState(false);
 const controller=useRef<AbortController|null>(null),mounted=useRef(true),loadVersion=useRef(0),textarea=useRef<HTMLTextAreaElement|null>(null),questionRef=useRef(question),quoteRef=useRef(quote);questionRef.current=question;quoteRef.current=quote;
 const maxMessages=Number(c.status?.version?.split('.')[1]||0)>=4?40:8,context=conversationContext(messages,maxMessages);
 const groups=[...new Map([...catalog].reverse().filter(r=>r.kind==='ask').map(r=>[r.conversationId||r.id,r])).values()].sort((a,b)=>b.created-a.created);
 async function openConversation(id:string,older=false){
  const version=++loadVersion.current;setLoading(true);setError('');
  try{const oldest=messages[0],cursor=older&&oldest?`&before=${oldest.created}&beforeId=${oldest.id}`:'';const rows=await api<ResearchResult[]>(`/api/research?paper=${paper.id}&conversation=${encodeURIComponent(id)}${cursor}`);if(!mounted.current||version!==loadVersion.current)return;
   const ordered=[...rows].reverse();if(!older)setAttachedContext(readingContext||rows[0]?.readingContext||null);setMessages(ms=>older?[...ordered,...ms.filter(m=>!rows.some(r=>r.id===m.id))]:ordered);setConversation(id);setMore(rows.length===50);setHistoryOpen(false);setJob(null);setCurrent(null);setPending(null);
   if(!older&&!quoteRef.current){const latest=rows[0];if(latest){setScope('range');setFrom(latest.pages[0]);setTo(latest.pages.at(-1)!);}}
  }catch(e){if(mounted.current)setError('对话读取失败：'+(e as Error).message)}finally{if(mounted.current&&version===loadVersion.current)setLoading(false)}
 }
 useEffect(()=>{mounted.current=true;const version=loadVersion.current;setDraftLoaded(false);if(!demo){api<ResearchResult[]>(`/api/research?paper=${paper.id}${contextQuery}`).then(async rows=>{if(!mounted.current||version!==loadVersion.current)return;setCatalog(rows);setMoreCatalog(rows.length===50);const latest=rows.find(r=>r.kind==='ask');if(latest)await openConversation(latest.conversationId||latest.id);else setLoading(false)}).catch(e=>{if(mounted.current){setError(e.message);setLoading(false)}});}else setLoading(false);return()=>{mounted.current=false;controller.current?.abort();loadVersion.current++}},[paper.id]);
 useEffect(()=>{if(source){quoteRef.current=source.text;setQuote(source.text);setScope('range');setFrom(source.page);setTo(source.page);setQuestion('请解释这段原文：它在说什么，为什么这样做？');textarea.current?.focus()}},[source?.stamp]);
 useEffect(()=>{if(!seed||running)return;if(demo){setMessages([seed]);setConversation(seed.conversationId||seed.id)}else void openConversation(seed.conversationId||seed.id)},[seed?.id]);
 // Restore only the composer draft. Conversation messages always come from the API.
 useEffect(()=>{if(loading||draftLoaded)return;setDraftLoaded(true);if(!source&&!questionRef.current){try{setQuestion(sessionStorage.getItem(draftKey)||'')}catch{}}},[loading,draftLoaded,paper.id]);
 useEffect(()=>{if(draftLoaded){try{sessionStorage.setItem(draftKey,question)}catch{}}},[question,draftLoaded,paper.id]);
 useEffect(()=>{onBusy?.(running||!!pending||loading);return()=>onBusy?.(false)},[running,pending,loading]);
 async function persist(record:ResearchResult){
  if(demo){setPending(null);return record;}
  const saved=await api<ResearchResult>('/api/research',{method:'POST',body:JSON.stringify(record)});
  if(mounted.current){setMessages(ms=>ms.map(m=>m.id===saved.id?saved:m));setCatalog(rs=>[saved,...rs.filter(r=>r.id!==saved.id)]);setPending(null);}return saved;
 }
 async function send(){
  if(running||loading||pending||!question.trim())return;if(!c.ready){c.open();return;}
  const ctrl=new AbortController();controller.current=ctrl;const asked=question.trim(),selection=readingContextSelection(attachedContext,quote);setRunning(true);setError('');setJob(null);setCurrent({question:asked,selection});
  try{
   const start=scope==='all'?1:scope==='page'?page:from,end=scope==='all'?totalPages:scope==='page'?page:to;
   if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>totalPages||end<start)throw Error('请输入有效的页码范围');
   const pages=await getPages(start,end);if(ctrl.signal.aborted)return;if(!pages.some(p=>p.text.trim()))throw Error('所选页面未提取到文字，扫描件需要先做 OCR。');
   const result=await runCodexTask({kind:'ask',title:paper.title,pages,question:asked,selection,model:settings.model,effort:settings.effort,history:context.history},ctrl.signal,j=>{if(mounted.current&&!ctrl.signal.aborted)setJob(j)});
   if(!mounted.current||ctrl.signal.aborted)return;
   const record:ResearchResult={id:result.id,paperId:paper.id,kind:'ask',question:asked,selection,readingContext:attachedContext,text:result.text,deck:null,page:start,pages:result.pages,model:result.model,effort:result.effort||'',created:Date.now(),conversationId:conversation||result.id,parentId:messages.at(-1)?.id||'',process:{events:result.events,reasoningSummary:result.reasoningSummary,created:result.created,completedAt:result.completedAt}};
   setMessages(ms=>[...ms,record]);setConversation(record.conversationId!);setPending(record);setQuestion('');setQuote('');setScope('range');setFrom(start);setTo(end);setCurrent(null);setJob(null);
   try{await persist(record)}catch{setError('回答已生成，云端保存失败。请重试保存后继续追问；不会重复调用 GPT。')}

  }catch(e){if(mounted.current){setError(ctrl.signal.aborted?'已停止，问题已保留，可修改后重试。':(e as Error).message);setCurrent(null);setJob(null)}}finally{controller.current=null;if(mounted.current)setRunning(false)}
 }
 async function note(r:ResearchResult){try{if(demo){notify('导入自己的文献后即可保存笔记');return;}if(r.text.length>48000)throw Error('回答较长，请导出保存');const n=await api<Note>('/api/notes',{method:'POST',body:JSON.stringify({paperId:paper.id,page:r.page,quote:r.selection||'',text:`【GPT 问答】${r.question}\n\n${r.text}`,color:'green'})});onSaved(n);notify('已保存为笔记')}catch(e){notify((e as Error).message)}}
 function fresh(){if(running||pending||loading)return;loadVersion.current++;setMessages([]);setConversation('');setMore(false);setQuestion('');setQuote('');setScope(readingContext?'range':'page');setFrom(readingContext?.page||page);setTo(readingContext?.page||page);setAttachedContext(readingContext||null);setJob(null);setCurrent(null);setError('');setHistoryOpen(false);textarea.current?.focus()}
 return <div className="chat-panel">{attachedContext&&<details className="chat-attached-context"><summary>{contextLabel(attachedContext)} · 第 {attachedContext.page} 页{attachedContext.excerpted?' · 已节选':''}</summary>{attachedContext.original&&<blockquote>{attachedContext.original}</blockquote>}<Markdown text={attachedContext.content}/><Button variant="ghost" onClick={()=>onPage(attachedContext.page)}>定位原文 ↗</Button></details>}<div className="chat-toolbar"><span><MessageCircle size={14}/>{messages.length?`${messages.length}${more?'+':''} 轮对话`:'与文献对话'}</span><div><Button variant="ghost" disabled={running||!!pending||loading} onClick={()=>setHistoryOpen(v=>!v)}><History size={14}/>历史</Button><Button variant="ghost" disabled={running||!!pending||loading} onClick={fresh}><Plus size={14}/>新对话</Button></div></div>
 {historyOpen&&<div className="conversation-history"><p>每个对话独立保存，选择后可以继续追问。</p>{groups.map(r=><Button variant="ghost" key={r.conversationId||r.id} onClick={()=>void openConversation(r.conversationId||r.id)}><b>{r.question.slice(0,80)}</b><small>{formatDate(r.created)}</small></Button>)}{!groups.length&&<p>还没有已保存的对话。</p>}{moreCatalog&&<Button variant="ghost" disabled={loading} onClick={async()=>{const r=catalog.at(-1);if(!r)return;try{const rows=await api<ResearchResult[]>(`/api/research?paper=${paper.id}${contextQuery}&before=${r.created}&beforeId=${r.id}`);setCatalog(rs=>[...rs,...rows]);setMoreCatalog(rows.length===50)}catch(e){setError((e as Error).message)}}}>加载更早对话</Button>}</div>}
 {loading&&<p className="tiny muted" role="status">正在恢复云端对话…</p>}
 {!messages.length&&!loading&&!running&&<div className="chat-welcome"><img src="/brand/paperleaf-64.png" width="36" height="36" alt=""/><h3>让每一次追问，都更接近理解。</h3><p>{attachedContext?'已带上原文和'+contextLabel(attachedContext)+'，可以核对理解、解释术语或继续提问。':'围绕同一篇文献持续对话，回答会保存在这里。'}</p><div>{(attachedContext?['请结合原文解释这里的含义','这段理解是否准确，有什么遗漏？']:['这篇论文解决了什么问题？','作者的方法有哪些局限？']).map(q=><Button variant="ghost" key={q} onClick={()=>{setQuestion(q);if(!attachedContext)setScope('all')}}>{q}</Button>)}</div></div>}
 {more&&<Button variant="ghost" className="text-button" disabled={loading} onClick={()=>void openConversation(conversation,true)}>加载更早消息</Button>}
 <MessageScrollerProvider><MessageScroller className="chat-transcript"><MessageScrollerViewport><MessageScrollerContent>{messages.map((r,i)=><MessageScrollerItem messageId={r.id} scrollAnchor className="chat-turn" key={r.id}><Message align="end"><MessageContent><Bubble variant="tinted" align="end"><BubbleContent className="chat-user"><small>你 · {r.kind==='summary'?'精读总结':`第 ${i+1} 轮`}</small><p>{r.question}</p>{r.selection&&<details><summary>引用的原文 · 第 {r.page} 页</summary><blockquote>{r.selection}</blockquote></details>}</BubbleContent></Bubble></MessageContent></Message><Message><MessageContent className="chat-answer"><header><img src="/brand/paperleaf-64.png" alt=""/><b>Paperleaf</b><small>{r.model}</small></header>{r.process&&<TaskProgress job={{id:r.id,kind:r.kind,status:'completed',stage:'completed',text:'',error:'',deck:null,model:r.model,pages:r.pages,...r.process}}/>}<Markdown text={r.text} pages={r.pages} onPage={onPage}/><footer><Button variant="ghost" onClick={async()=>{try{await navigator.clipboard.writeText(r.text);notify('回答已复制')}catch{notify('请手动选择回答复制')}}}><Copy size={13}/>复制</Button><Button variant="ghost" onClick={()=>void note(r)}><NotebookPen size={13}/>存为笔记</Button><span>{pending?.id===r.id?'等待云端保存':demo?'试读会话':'已保存'}</span></footer></MessageContent></Message></MessageScrollerItem>)}
 {current&&<MessageScrollerItem messageId="pending-question" scrollAnchor className="chat-turn"><Message align="end"><MessageContent><Bubble variant="tinted" align="end"><BubbleContent className="chat-user"><small>你</small><p>{current.question}</p></BubbleContent></Bubble></MessageContent></Message><Message><MessageContent className="chat-answer"><TaskProgress job={job} running label={!job?'提取阅读材料…':undefined}/>{job?.text&&<Markdown text={job.text} pages={job.pages} onPage={onPage}/>}</MessageContent></Message></MessageScrollerItem>}</MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton aria-label="跳到最新回答"/></MessageScroller></MessageScrollerProvider>
 {error&&<p className="translation-error" role="alert">{error}</p>}{pending&&<Button variant="outline" className="button full" disabled={saving} onClick={async()=>{setSaving(true);try{await persist(pending);setError('')}catch(e){setError((e as Error).message)}finally{setSaving(false)}}}>重试保存回答</Button>}
 <TaskModelSettings task="ask" settings={settings} disabled={running}/><div className="chat-composer"><label className="scope-label">本轮阅读范围<select aria-label="对话阅读范围" value={scope} disabled={running} onChange={e=>setScope(e.target.value)}><option value="page">当前页（{page}）</option><option value="all">全文（{totalPages} 页）</option><option value="range">指定页码</option></select></label>{scope==='range'&&<div className="scope-range"><Input type="number" min={1} max={totalPages} value={from} aria-label="对话起始页" disabled={running} onChange={e=>setFrom(Number(e.target.value))}/><span>至</span><Input type="number" min={from} max={totalPages} value={to} aria-label="对话结束页" disabled={running} onChange={e=>setTo(Number(e.target.value))}/><span>页</span></div>}
 {quote&&<blockquote className="assistant-quote"><span>{quote}</span><Button variant="ghost" size="icon-sm" className="icon-btn" disabled={running} onClick={()=>setQuote('')} aria-label="移除对话引用"><X size={13}/></Button></blockquote>}
 <Field><FieldLabel htmlFor={"chat-question-"+(readingContextKey(readingContext)||"general")}>继续向 GPT 提问</FieldLabel><InputGroup><InputGroupTextarea id={"chat-question-"+(readingContextKey(readingContext)||"general")} ref={textarea} aria-label="追问 GPT" maxLength={4000} disabled={running||loading} value={question} onChange={e=>setQuestion(e.target.value)} placeholder={messages.length?'继续追问，例如：能结合公式解释这一步吗？':'问一个问题，或划选原文后点击「问 GPT」…'} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();void send()}}}/></InputGroup></Field>
 <div className="chat-composer-bottom"><small>Ctrl / ⌘ + Enter</small>{running?<Button variant="outline" className="button" onClick={()=>controller.current?.abort()}><Square size={13}/>停止</Button>:<Button variant="default" className="button primary" disabled={!question.trim()||loading||!!pending} onClick={()=>void send()}><Send size={14}/>{messages.length?'发送追问':'发送问题'}</Button>}</div>
 <p className="chat-context-note">{messages.length?`本次携带最近 ${context.usedTurns} 轮${context.excerpted?'（长消息已节选）':''}；${context.olderCount||more?'更早记录保存在历史中。':'记录持续保存。'}`:'登录 Codex 后使用账号额度。'} 每次最多读取 16 万字符，扫描页与图表需另行识别。</p></div>
 {!!messages.length&&<Button variant="ghost" className="text-button" onClick={()=>download(`# ${paper.title} · 对话记录\n\n`+messages.map(r=>`## 问：${r.question}\n\n${r.text}\n`).join('\n---\n\n'),'Paperleaf-对话记录.md')}><Download size={13}/>导出当前已加载的对话</Button>}</div>;
}
