import {createHash} from 'node:crypto';

const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Only an exact continuation of the last saved turn may inherit its in-memory
// thread. A changed paper, scope, account, model or truncated history starts fresh.
export function chatScope(request,owner,model,effort,provider){
 if(request.kind!=='ask'||!request.paperId)return null;
 return fingerprint([owner,request.paperId,request.conversationId||request.id,request.title,
  request.pages,model,effort,provider]);
}

export class IdleChatThreads{
 constructor(unsubscribe){this.entries=new Map();this.unsubscribe=unsubscribe;}
 take(id,scope,history){
  const entry=this.entries.get(id);
  if(!entry||entry.scope!==scope||entry.history!==fingerprint(history))return null;
  clearTimeout(entry.expiry);this.entries.delete(id);
  return entry.threadId;
 }
 remember(job){
  if(this.entries.size>=6)this.drop(this.entries.keys().next().value);
  const expiry=setTimeout(()=>this.drop(job.id),10*60*1000);
  expiry.unref();
  this.entries.set(job.id,{threadId:job.threadId,scope:job.chatScope,
   history:fingerprint([...job.chatHistory,{role:'assistant',text:job.text}]),expiry});
 }
 drop(id){
  const entry=this.entries.get(id);
  if(!entry)return;
  this.entries.delete(id);clearTimeout(entry.expiry);this.unsubscribe(entry.threadId);
 }
 clear(){for(const id of this.entries.keys())this.drop(id);}
 forgetThread(threadId){
  for(const [id,entry] of this.entries)if(entry.threadId===threadId)this.drop(id);
 }
}
