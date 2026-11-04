'use client';
import {RefreshCw} from 'lucide-react';
import type {CodexStatus,RateWindow} from '@/lib/ai-types';
function duration(minutes:number|null|undefined,fallback:string){if(!minutes)return fallback;if(minutes%1440===0)return `${minutes/1440} 天窗口`;if(minutes%60===0)return `${minutes/60} 小时窗口`;return `${minutes} 分钟窗口`;}
function UsageWindow({window,label}:{window:RateWindow|null|undefined;label:string}){
 if(!window||!Number.isFinite(window.usedPercent))return <p className="tiny muted">{label}额度暂未提供</p>;
 const remaining=Math.max(0,Math.min(100,100-window.usedPercent));
 return <div className="usage-window"><div><span>{duration(window.windowDurationMins,label)}</span><b>{Math.round(remaining)}% <small>剩余</small></b></div><progress aria-label={`${label}剩余额度`} value={remaining} max={100}/><small>{window.resetsAt&&Number.isFinite(window.resetsAt)?`重置：${new Date(window.resetsAt*1000).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}`:'重置时间暂未提供'}</small></div>;
}
export default function AccountUsage({status,busy,refresh}:{status:CodexStatus|null;busy:boolean;refresh:()=>void}){
 const buckets=status?.rateLimitsByLimitId&&Object.keys(status.rateLimitsByLimitId).length?Object.entries(status.rateLimitsByLimitId).slice(0,20):status?.rateLimits?[['codex',status.rateLimits] as const]:[];
 return <section className="account-usage" aria-label="Codex 账号额度"><header><div><b>账号额度</b><p>Codex 返回的用量窗口</p></div><button className="button small" disabled={busy} onClick={refresh}><RefreshCw size={13} className={busy?'spin':''}/>{busy?'刷新中…':'刷新额度'}</button></header>
 {buckets.map(([id,bucket])=><div className="usage-bucket" key={id}><h4>{bucket.limitName||(id==='codex'?'Codex':id)}</h4><div className="usage-windows"><UsageWindow window={bucket.primary} label="短期"/><UsageWindow window={bucket.secondary} label="长期"/></div>{bucket.credits?.unlimited?<p className="tiny muted">额外 credits：不限量</p>:bucket.credits?.hasCredits&&bucket.credits.balance!=null?<p className="tiny muted">额外 credits：{bucket.credits.balance}</p>:null}</div>)}
 {!buckets.length&&<p className="tiny muted">账号尚未返回额度数据。点击刷新重试。</p>}
 {status?.ordinaryUsageAllowed===false&&<p className="translation-error">账号当前无法使用套餐内额度，具体限制以 Codex 返回结果为准。</p>}
 {status?.rateLimitsWarning&&<p className="translation-error" role="status">{status.rateLimitsWarning}</p>}
 <footer>{status?.rateLimitsUpdatedAt?`更新于 ${new Date(status.rateLimitsUpdatedAt).toLocaleTimeString('zh-CN')}`:'额度以账号实际返回结果为准'}<span>剩余百分比不代表可用对话次数</span></footer>
 {status&&Number(status.version.split('.')[1]||0)<3&&<p className="tiny muted">升级桌面版至 1.3.0 后支持即时刷新和完整额度窗口。</p>}
 </section>;
}
