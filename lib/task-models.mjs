// Account-filtered task-fit suggestions, informed by the official model guide.
// https://openai.com/index/practical-guide-building-gpt-6/
// Effort is intersected with model/list, never inferred from model generation.
const fast=[['gpt-6-luna','轻量首选','low'],['gpt-5.4-mini','轻量备选','low'],['gpt-5.6-luna','旧版轻量备选','low'],['gpt-6.1-sol','信息较复杂时','low']];
const definitions={
 metadata:{title:'识别标题与作者，轻量模型通常就够用',description:'提取书目信息优先选择低思考强度；首页版式复杂或信息混杂时，可用 Sol 再核对。',models:fast},
 ask:{title:'按问题难度选择阅读搭档',description:'概念解释可先用 Sol · 中；推导、多段证据对比或复杂方法分析，可尝试 Astra · 高。',models:[['gpt-6.1-sol','日常问答','medium'],['gpt-6-astra','深入分析','high'],['gpt-6-luna','简单概念解释','low'],['gpt-6-sol','均衡备选','medium']]},
 summary:{title:'精读总结：兼顾覆盖与证据',description:'一般文献先用 Sol · 中；梳理复杂方法、贡献与局限时，可尝试 Astra · 高。',models:[['gpt-6.1-sol','常规精读','medium'],['gpt-6-astra','复杂文献深读','high'],['gpt-6-sol','均衡备选','medium']]},
 slides:{title:'汇报 PPT：结构清晰，证据可追溯',description:'整理组会汇报先用 Sol · 中；需要深入讨论方法与实验逻辑时，可尝试 Astra · 高。',models:[['gpt-6.1-sol','组会汇报','medium'],['gpt-6-astra','深入汇报','high'],['gpt-6-sol','均衡备选','medium']]}
};
export function taskModelAdvice(task,models){
 const rule=definitions[task];if(!rule)return{title:'模型建议',description:'',options:[]};
 const options=rule.models.flatMap(([id,label,target])=>{const m=models.find(m=>m.id===id);if(!m)return[];const order=target==='high'?['high','medium','low']:target==='medium'?['medium','low']:['low','minimal','none'];const effort=order.find(e=>m.reasoningEfforts?.some(x=>x.id===e))||'';return[{id,name:m.name,label,effort}] }).slice(0,3);
 return{title:rule.title,description:rule.description,options};
}
