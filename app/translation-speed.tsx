'use client';
import {Button} from '@/components/ui/button';
import {Gauge,ChevronDown,Check} from 'lucide-react';
import {translationSuggestions} from '@/lib/translation-models.mjs';
import {useCodex} from './codex-provider';
export default function TranslationSpeed({model,effort,custom,onChoose,onReset}:{model:string;effort:string;custom:boolean;onChoose:(model:string,effort:string)=>void;onReset:()=>void}){
 const c=useCodex(),suggestions=translationSuggestions(c.status?.models||[]),selected=c.status?.models.find(m=>m.id===model),effective=effort||selected?.defaultEffort||'default';
 const labels:Record<string,string>={none:'无',minimal:'极低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最高',ultra:'Ultra',default:'默认'};
 return <details className="translation-speed"><summary><Gauge size={15}/><span>翻译太慢？选择更轻量的模型</span><ChevronDown size={13}/></summary><p>日常翻译可先选轻量模型，并使用「低」思考强度。复杂术语或长难句可以再换更强模型复核。</p>
 {!c.ready?<Button variant="ghost" className="text-button" onClick={c.open}>连接 Codex，查看你的可用模型 ↗</Button>:<>{suggestions.length>0?<div className="translation-recommendations">{suggestions.map(s=><Button variant="ghost" key={s.id} onClick={()=>onChoose(s.id,s.effort)}><span><b>{s.name}</b>{model===s.id&&effort===s.effort?<Check size={13}/>:<small>{s.label}</small>}</span><em>{s.detail}{s.effort?' · 低思考强度':''}</em></Button>)}</div>:<p>当前账号没有这些轻量型号，可在 Codex 面板选择当前模型支持的较低思考强度。</p>}
 <div className="translation-current"><span>当前翻译：{selected?.name||model||'默认模型'} · 思考强度 {labels[effective]||effective}</span>{custom&&<Button variant="ghost" onClick={onReset}>跟随 Codex 设置</Button>}</div><p className="tiny muted">快捷选择仅用于后续翻译；当前段继续使用开始时的设置。实际速度还受文本长度、网络和服务负载影响。</p></>}
 <a className="text-button" href="https://openai.com/index/practical-guide-building-gpt-6/" target="_blank" rel="noopener noreferrer">OpenAI 模型选择说明 ↗</a></details>;
}
