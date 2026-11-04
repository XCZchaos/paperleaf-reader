// Suggestions are a task fit, not a latency benchmark. Show only model/list IDs.
// Sources: https://openai.com/index/practical-guide-building-gpt-6/
// https://developers.openai.com/api/docs/models/gpt-5.4-mini
// Older Luna availability/positioning is supplied by the account's model list.
const recommendations=[
 {id:'gpt-6-luna',label:'快速阅读首选',detail:'轻量模型，适合划词与全文初译'},
 {id:'gpt-5.4-mini',label:'轻量备选',detail:'适合大量、清晰的段落翻译'},
 {id:'gpt-5.6-luna',label:'旧版轻量备选',detail:'账号提供时，可尝试比较速度'},
 {id:'gpt-6.1-sol',label:'兼顾术语质量',detail:'适合术语较多的段落，配合低思考强度'},
 {id:'gpt-6-sol',label:'均衡备选',detail:'适合较复杂句子，配合低思考强度'},
];
export function translationSuggestions(models){return recommendations.flatMap(rec=>{const model=models.find(m=>m.id===rec.id);if(!model)return[];const effort=['low','minimal','none'].find(e=>model.reasoningEfforts?.some(x=>x.id===e))||'';return [{...rec,name:model.name,effort}]}).slice(0,3);}
