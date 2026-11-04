import {identity,db,fail,json,body,str} from '@/lib/server';
import {validateDeck} from '@/companion/research.mjs';
function normalize(r:Record<string,unknown>){return {...r,paperId:r.paper_id,deck:JSON.parse(String(r.deck)),pages:JSON.parse(String(r.pages))}}
export async function GET(req:Request){try{const owner=await identity(req),params=new URL(req.url).searchParams,paper=params.get('paper'),kind=params.get('kind');if(!paper)throw Error('缺少文献标识');const query=kind==='translate'?'SELECT * FROM research WHERE owner=? AND paper_id=? AND kind=\'translate\' ORDER BY created DESC LIMIT 50':'SELECT * FROM research WHERE owner=? AND paper_id=? AND kind<>\'translate\' ORDER BY created DESC LIMIT 50';const r=await db().prepare(query).bind(owner,paper).all();return json(r.results.map(normalize))}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 const owner=await identity(req),b=await body(req);const p=await db().prepare('SELECT pages FROM papers WHERE owner=? AND id=?').bind(owner,str(b.paperId)).first();if(!p)throw Error('NOT_FOUND');
 if(!['ask','summary','slides','translate'].includes(b.kind)||typeof b.text!=='string'||!b.text.trim()||b.text.length>80000)throw Error('生成内容无效或过长');
 if(!Array.isArray(b.pages)||!b.pages.length||b.pages.length>1000||b.pages.some((v:unknown)=>!Number.isInteger(v)||Number(v)<1||Number(v)>Number(p.pages)))throw Error('来源页码无效');
 const deck=b.kind==='slides'?validateDeck(b.deck,b.pages):null;
 if(typeof b.id!=='string'||!/^[-\w]{16,64}$/.test(b.id))throw Error('任务标识无效');
 const existing=await db().prepare('SELECT * FROM research WHERE id=?').bind(b.id).first();if(existing){if(existing.owner!==owner||existing.paper_id!==b.paperId)throw Error('NOT_FOUND');return json(normalize(existing));}
 const r={id:b.id,owner,paperId:b.paperId,kind:b.kind,question:str(b.question,b.kind==='translate'?8000:4000),text:b.text,deck,page:Math.max(1,Math.min(Number(p.pages),Math.floor(Number(b.page)||1))),pages:b.pages,model:str(b.model,120),created:Date.now()};
 await db().prepare('INSERT INTO research (id,owner,paper_id,kind,question,text,deck,page,pages,model,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(r.id,owner,r.paperId,r.kind,r.question,r.text,JSON.stringify(deck),r.page,JSON.stringify(r.pages),r.model,r.created).run();return json(r);
 }catch(e){return fail(e)}}
export async function DELETE(req:Request){try{const owner=await identity(req),id=new URL(req.url).searchParams.get('id');await db().prepare('DELETE FROM research WHERE owner=? AND id=?').bind(owner,id).run();return json({ok:true})}catch(e){return fail(e)}}
