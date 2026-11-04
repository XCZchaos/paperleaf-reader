'use client';
import {useEffect,useState} from 'react';
import {Brain,Check,ChevronDown,LoaderCircle,Activity} from 'lucide-react';
import type {CodexJob} from '@/lib/ai-types';
import Markdown from './markdown';
const stages:Record<string,string>={preparing:'连接 Codex',thinking:'理解文献',writing:'生成回答',finalizing:'整理结果',completed:'已完成',error:'生成中断',cancelled:'已停止'};
export default function TaskProgress({job,label,running=false}:{job:CodexJob|null;label?:string;running?:boolean}){
 const [now,setNow]=useState(Date.now()),[expanded,setExpanded]=useState(running);
 useEffect(()=>{setExpanded(running)},[running,job?.id]);
 useEffect(()=>{if(!running)return;setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[running,job?.id]);
 if(!job&&!running)return null;
 const stage=job?.stage||job?.status||'preparing',summary=job?.reasoningSummary,seconds=job?Math.max(0,Math.floor(((running?now:job.completedAt||job.updated||now)-job.created)/1000)):0;
 const events=job?.events||[];
 return <section className={`task-progress ${running?'is-running':''}`} aria-label="GPT 生成进度"><div className="task-progress-title"><span>{running?<span className="spinner-frame"><LoaderCircle size={15} className="spin"/></span>:stage==='completed'?<Check size={15}/>:<Activity size={15}/>}<b role="status">{label||stages[stage]||'处理中'}</b></span><small>{job&&`${seconds<60?seconds+' 秒':Math.floor(seconds/60)+' 分 '+seconds%60+' 秒'}`}</small></div>
 {running&&<div className="task-stages" aria-hidden="true">{['preparing','thinking','writing','completed'].map((s,i)=><span key={s} className={s===stage?'current':i<['preparing','thinking','writing','completed'].indexOf(stage)?'finished':''}>{stages[s]}</span>)}</div>}
 {!!events.length&&<details className="progress-details" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary><Activity size={14}/>阅读进展<span>{events.length} 项</span><ChevronDown size={13}/></summary><ol className="progress-timeline">{events.map(e=><li key={e.id} className={`event-${e.kind}`}><div><b>{e.title}</b><time>+{Math.max(0,Math.floor((e.at-(job?.created||e.at))/1000))}s</time></div>{e.text&&(e.kind==='commentary'?<Markdown text={e.text}/>:<p>{e.text}</p>)}</li>)}</ol></details>}
 {!events.length&&job?.activity&&<p className="task-activity">{job.activity}</p>}
 {running&&job&&now-(job.updated||job.created)>30000&&<p className="tiny muted">Codex 尚未返回新的进度，仍在等待响应。</p>}
 {summary&&<details className="reasoning-summary"><summary><Brain size={14}/>模型提供的思考摘要 <ChevronDown size={13}/></summary><Markdown text={summary}/></details>}
 {job?.text&&running&&<small className="task-output-count">已生成 {job.text.length.toLocaleString()} 字符</small>}
 </section>;
}
