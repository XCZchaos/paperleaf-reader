import {validateReadingContext,readingContextKey} from '@/lib/reading-context.mjs';
import {identity,db,fail,json,body,str} from '@/lib/server';
function normalize(r:Record<string,unknown>){return {...r,paperId:r.paper_id,readingContext:JSON.parse(String(r.reading_context||'null')),conversationId:r.conversation_id||r.id,parentId:r.parent_id||'',selection:r.selection||'',effort:r.effort||'',process:JSON.parse(String(r.process||'null')),deck:JSON.parse(String(r.deck)),pages:JSON.parse(String(r.pages))}}
import {validateDeck} from '@/companion/research.mjs';
const validId=(s:unknown)=>typeof s==='string'&&/^[-\w]{16,64}$/.test(s);
export async function GET(req:Request){try{
 const owner=await identity(req),params=new URL(req.url).searchParams,paper=params.get('paper'),kind=params.get('kind'),conversation=params.get('conversation');if(!paper)throw Error('缺少文献标识');
 let query='SELECT * FROM research WHERE owner=? AND paper_id=?',args:unknown[]=[owner,paper];
 if(conversation){query+=' AND (conversation_id=? OR id=?)';args.push(conversation,conversation);}else if(kind==='translate')query+=" AND kind='translate'";else query+=" AND kind<>'translate'";
 const contextKey=params.get('context');if(contextKey){if(!/^(note|draft|translation|paragraph):[-\w]{1,64}$/.test(contextKey))throw Error('追问内容标识无效');query+=' AND context_key=?';args.push(contextKey);}
 const before=params.get('before'),beforeId=params.get('beforeId');if(before&&beforeId){if(!/^\d+$/.test(before)||!validId(beforeId))throw Error('历史记录游标无效');query+=' AND (created<? OR (created=? AND id<?))';args.push(Number(before),Number(before),beforeId);}
 query+=' ORDER BY created DESC,id DESC LIMIT 50';const r=await db().prepare(query).bind(...args).all();return json(r.results.map(normalize));
}catch(e){return fail(e)}}
function cleanProcess(p:any){
 if(!p||typeof p!=='object')return null;let budget=24000;
 const events=(Array.isArray(p.events)?p.events:[]).slice(-48).filter((e:any)=>e&&['stage','commentary','plan','retry'].includes(e.kind)).map((e:any)=>{const text=str(e.text,Math.min(4000,budget));budget-=text.length;return{id:str(e.id,100),kind:e.kind,title:str(e.title,120),text,at:Number.isFinite(e.at)?e.at:Date.now(),done:!!e.done}});
 return{events,reasoningSummary:str(p.reasoningSummary,12000),created:Number.isFinite(p.created)?p.created:Date.now(),completedAt:Number.isFinite(p.completedAt)?p.completedAt:null};
}
export async function POST(req:Request){try{
 const owner=await identity(req),b=await body(req);const p=await db().prepare('SELECT pages FROM papers WHERE owner=? AND id=?').bind(owner,str(b.paperId)).first();if(!p)throw Error('NOT_FOUND');
 if(!['ask','summary','slides','translate'].includes(b.kind)||typeof b.text!=='string'||!b.text.trim()||b.text.length>80000)throw Error('生成内容无效或过长');
 if(!Array.isArray(b.pages)||!b.pages.length||b.pages.length>1000||b.pages.some((v:unknown)=>!Number.isInteger(v)||Number(v)<1||Number(v)>Number(p.pages)))throw Error('来源页码无效');
 const deck=b.kind==='slides'?validateDeck(b.deck,b.pages):null;
 if(!validId(b.id))throw Error('任务标识无效');
 const existing=await db().prepare('SELECT * FROM research WHERE id=?').bind(b.id).first();if(existing){if(existing.owner!==owner||existing.paper_id!==b.paperId)throw Error('NOT_FOUND');return json(normalize(existing));}
 const conversationId=b.conversationId||b.id,parentId=b.parentId||'',readingContext=b.readingContext?validateReadingContext(b.readingContext,Number(p.pages)):null,contextKey=readingContextKey(readingContext);
 if(readingContext&&b.kind!=='ask')throw Error('仅问答可关联笔记或译文');
 if(!validId(conversationId))throw Error('对话标识无效');
 if(parentId){if(!validId(parentId)||b.kind!=='ask')throw Error('追问来源无效');const parent=await db().prepare('SELECT * FROM research WHERE id=? AND owner=? AND paper_id=?').bind(parentId,owner,b.paperId).first();if(!parent||!['ask','summary'].includes(String(parent.kind))||(parent.conversation_id||parent.id)!==conversationId)throw Error('追问来源不存在或不属于当前对话');if((parent.context_key||'')!==contextKey)throw Error('追问上下文不属于当前对话');}
 else if(conversationId!==b.id)throw Error('新对话标识与首条消息不一致');
 const r={id:b.id,owner,paperId:b.paperId,kind:b.kind,question:str(b.question,b.kind==='translate'?8000:4000),text:b.text,deck,page:Math.max(1,Math.min(Number(p.pages),Math.floor(Number(b.page)||1))),pages:b.pages,model:str(b.model,120),created:Date.now(),conversationId,parentId,selection:str(b.selection,8000),effort:str(b.effort,40),process:cleanProcess(b.process),readingContext};
 await db().prepare('INSERT INTO research (id,owner,paper_id,kind,question,text,deck,page,pages,model,created,conversation_id,parent_id,selection,effort,process,context_key,reading_context) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(r.id,owner,r.paperId,r.kind,r.question,r.text,JSON.stringify(deck),r.page,JSON.stringify(r.pages),r.model,r.created,r.conversationId,r.parentId,r.selection,r.effort,JSON.stringify(r.process),contextKey,JSON.stringify(readingContext)).run();return json(r);
}catch(e){return fail(e)}}
export async function DELETE(req:Request){try{const owner=await identity(req),id=new URL(req.url).searchParams.get('id');await db().prepare('DELETE FROM research WHERE owner=? AND id=?').bind(owner,id).run();return json({ok:true})}catch(e){return fail(e)}}
