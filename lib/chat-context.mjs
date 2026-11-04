// Keep complete recent Q/A pairs. Older messages remain in cloud history.
const excerpt=(text,limit)=>text.length<=limit?text:text.slice(0,Math.floor(limit*.7))+'\n[较长消息已节选；完整内容保存在历史中]\n'+text.slice(-(Math.floor(limit*.3)-50));
export function conversationContext(records,maxMessages=40){
 const chosen=[];let budget=48000,excerpted=false;
 for(const r of [...records].reverse()){
  if(chosen.length*2>=maxMessages)break;
  const original=r.question+(r.selection?'\n引用原文：'+r.selection:'');
  const user=excerpt(original,12000),assistant=excerpt(r.text,12000);
  if(user.length+assistant.length>budget)break;
  excerpted ||= user!==original||assistant!==r.text;budget-=user.length+assistant.length;
  chosen.unshift([{role:'user',text:user},{role:'assistant',text:assistant}]);
 }
 return{history:chosen.flat(),usedTurns:chosen.length,olderCount:Math.max(0,records.length-chosen.length),excerpted};
}
