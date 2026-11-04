'use client';
import {Button} from '@/components/ui/button';
import {useEffect,useState} from 'react';
import {SlidersHorizontal,ChevronDown,Check} from 'lucide-react';
import {taskModelAdvice} from '@/lib/task-models.mjs';
import {useCodex} from './codex-provider';
export type ModelTask='ask'|'summary'|'slides'|'metadata';
type Preset={model:string;effort:string};
export function useTaskModel(task:ModelTask){
 const c=useCodex(),[overrides,setOverrides]=useState<Partial<Record<ModelTask,Preset>>>({});
 useEffect(()=>{const restored:Partial<Record<ModelTask,Preset>>={};for(const key of ['ask','summary','slides','metadata'] as ModelTask[]){try{const p=JSON.parse(localStorage.getItem('paperleaf-task-model-'+key)||'null');if(p&&typeof p.model==='string'&&typeof p.effort==='string')restored[key]=p}catch{}}setOverrides(restored)},[]);
 const preset=overrides[task],selected=c.status?.models.find(m=>m.id===preset?.model),model=selected?.id||c.model,effort=selected?(selected.reasoningEfforts?.some(e=>e.id===preset?.effort)?preset!.effort:''):c.effort;
 function choose(model:string,effort:string){const next={model,effort};setOverrides(v=>({...v,[task]:next}));localStorage.setItem('paperleaf-task-model-'+task,JSON.stringify(next));}
 return{model,effort,custom:!!selected,choose,reset:()=>choose('','')};
}
export default function TaskModelSettings({task,settings,disabled=false}:{task:ModelTask;settings:ReturnType<typeof useTaskModel>;disabled?:boolean}){
 const c=useCodex(),advice=taskModelAdvice(task,c.status?.models||[]),current=c.status?.models.find(m=>m.id===settings.model),effective=settings.effort||current?.defaultEffort||'default';
 const effortNames:Record<string,string>={none:'无',minimal:'极低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最高',ultra:'Ultra',default:'默认'};
 return <details className="task-model-advice translation-speed"><summary><SlidersHorizontal size={14}/><span>{advice.title}</span><ChevronDown size={13}/></summary><p>{advice.description}</p>{!c.ready?<Button variant="ghost" className="text-button" onClick={c.open}>连接 Codex，查看账号支持的模型 ↗</Button>:<><div className="translation-recommendations">{advice.options.map((s:{id:string;name:string;effort:string;label:string})=><Button variant="ghost" type="button" key={s.id} disabled={disabled} onClick={()=>settings.choose(s.id,s.effort)}><span><b>{s.name}</b>{settings.model===s.id&&settings.effort===s.effort?<Check size={13}/>:<small>{s.label}</small>}</span><em>思考强度：{effortNames[s.effort||'default']||s.effort}</em></Button>)}</div>{!advice.options.length&&<p>当前账号未提供上述型号，可继续使用当前模型，或打开 Codex 面板选择。</p>}<div className="translation-current"><span>本功能：{current?.name||settings.model||'默认模型'} · {effortNames[effective]||effective}</span>{settings.custom&&<Button variant="ghost" type="button" disabled={disabled} onClick={settings.reset}>跟随 Codex 设置</Button>}</div><p className="tiny muted">选择仅用于此功能的后续任务。较高思考强度可能更慢、消耗更多额度；重要结论请对照原文核验。</p></>}<a className="text-button" href="https://openai.com/index/practical-guide-building-gpt-6/" target="_blank" rel="noopener noreferrer">OpenAI 模型选择说明 ↗</a></details>;
}
