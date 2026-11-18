'use client';
import {useState} from 'react';
import type {ArgumentAttempt} from '@/lib/argument-activity';
import Markdown from './markdown';

const statusText={preparing:'准备提交',running:'进行中',completed:'已完成',error:'失败',cancelled:'已暂停',interrupted:'记录已中断'};
export default function ArgumentActivity({attempts}:{attempts:ArgumentAttempt[]}) {
 const [selected,setSelected]=useState('');
 const active=attempts.find(a=>a.id===selected)||attempts.at(-1);
 if(!active)return null;
 return <details className="argument-activity">
  <summary>查看 Codex 进展 <small>{attempts.length} 次请求</small></summary>
  <div className="argument-activity-body">
   <label>查看请求 <select aria-label="选择精读请求" value={attempts.some(a=>a.id===selected)?selected:''} onChange={e=>setSelected(e.target.value)}>
    <option value="">跟随最新请求</option>
    {attempts.map((a,i)=><option key={a.id} value={a.id}>{i+1}. {a.label} · {statusText[a.status]}</option>)}
   </select></label>
   <div className="argument-activity-heading"><strong>{active.label}</strong><span>{statusText[active.status]}</span></div>
   <p>{active.scope}</p>
   {active.model&&<p>模型 {active.model}{active.effort?' · 思考强度 '+active.effort:''}</p>}
   <ol className="argument-events" aria-label="本次请求的活动记录">
    <li><time>+0 秒</time><div><strong>Paperleaf 已准备请求</strong></div></li>
    {active.events.map(e=><li key={e.id}><time>+{Math.max(0,Math.floor((e.at-active.created)/1000))} 秒</time><div><strong>{e.title}</strong>{e.text&&(e.kind==='commentary'?<Markdown text={e.text}/>:<p>{e.text}</p>)}</div></li>)}
   </ol>
   {active.summary&&<section className="argument-summary"><strong>Codex 公开摘要</strong><Markdown text={active.summary}/></section>}
   {active.error&&<p className="argument-trace-error">{active.error}</p>}
  </div>
 </details>;
}
