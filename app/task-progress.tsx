'use client';
import {useEffect,useState} from 'react';
import {Brain,Check,ChevronDown,LoaderCircle} from 'lucide-react';
import type {CodexJob} from '@/lib/ai-types';
import Markdown from './markdown';
const stages:Record<string,string>={preparing:'连接 Codex',thinking:'理解文献',writing:'生成回答',finalizing:'整理结果',completed:'已完成',error:'生成中断',cancelled:'已停止'};
export default function TaskProgress({job,label,running=false}:{job:CodexJob|null;label?:string;running?:boolean}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(!running)return;setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[running,job?.id]);
 if(!job&&!running)return null;
 const stage=job?.stage||job?.status||'preparing',summary=job?.reasoningSummary,seconds=job?Math.max(0,Math.floor(((running?now:job.completedAt||job.updated||now)-job.created)/1000)):0;
 return <section className={`task-progress ${running?'is-running':''}`} aria-label="GPT 生成进度"><div className="task-progress-title"><span>{running?<LoaderCircle size={15} className="spin"/>:stage==='completed'?<Check size={15}/>:<Brain size={15}/>}<b role="status">{label||stages[stage]||'处理中'}</b></span><small>{job&&`${seconds<60?seconds+' 秒':Math.floor(seconds/60)+' 分 '+seconds%60+' 秒'}`}</small></div>
 <div className="task-stages" aria-hidden="true">{['preparing','thinking','writing','completed'].map((s,i)=><span key={s} className={s===stage?'current':i<['preparing','thinking','writing','completed'].indexOf(stage)?'finished':''}>{stages[s]}</span>)}</div>
 {job?.activity&&running&&<p className="task-activity">{job.activity}</p>}
 <details className="reasoning-summary"><summary><Brain size={14}/>思考摘要 <span>{summary?'查看摘要':running?'等待模型提供':'本次未提供'}</span><ChevronDown size={13}/></summary>{summary?<Markdown text={summary}/>:<p className="tiny muted">模型提供的思考摘要会显示在这里。部分模型或任务只返回正文。</p>}</details>
 {job?.text&&running&&<small className="task-output-count">已生成 {job.text.length.toLocaleString()} 字符</small>}
 </section>;
}
