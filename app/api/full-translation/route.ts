import {identity,db,fail,json,body,str} from '@/lib/server';
function normalize(r:any){return{id:r.id,paperId:r.paper_id,page:r.page,ordinal:r.ordinal,original:r.original,text:r.text,status:r.status,error:r.error,model:r.model,updated:r.updated};}
async function owned(owner:string,paper:unknown){const p=await db().prepare('SELECT pages FROM papers WHERE owner=? AND id=?').bind(owner,str(paper)).first();if(!p)throw Error('NOT_FOUND');return p;}
export async function GET(req:Request){try{
 const owner=await identity(req),params=new URL(req.url).searchParams,paper=params.get('paper'),p=await owned(owner,paper),page=Number(params.get('page')||1);
 if(!Number.isInteger(page)||page<1||page>Number(p.pages))throw Error('页码无效');
 const counts=await db().prepare('SELECT status,COUNT(*) AS count FROM translation_paragraphs WHERE owner=? AND paper_id=? GROUP BY status').bind(owner,paper).all();
 const stats:Record<string,number>={queued:0,running:0,done:0,error:0,skipped:0};for(const row of counts.results)stats[String(row.status)]=Number(row.count);stats.total=stats.queued+stats.running+stats.done+stats.error;
 const prepared=await db().prepare('SELECT DISTINCT page FROM translation_paragraphs WHERE owner=? AND paper_id=? ORDER BY page').bind(owner,paper).all();
 const rows=await db().prepare('SELECT * FROM translation_paragraphs WHERE owner=? AND paper_id=? AND page=? ORDER BY ordinal').bind(owner,paper,page).all();
 return json({stats,preparedPages:prepared.results.map(x=>Number(x.page)),entries:rows.results.map(normalize)});
}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 const owner=await identity(req),b=await body(req),p=await owned(owner,b.paperId),paper=b.paperId;
 if(b.action==='prepare'){
  if(!Number.isInteger(b.page)||b.page<1||b.page>Number(p.pages)||!Array.isArray(b.paragraphs)||b.paragraphs.length>200||b.paragraphs.some((x:unknown)=>typeof x!=='string'||!x.trim()||x.length>6000)||b.paragraphs.join('').length>120000)throw Error('段落内容或页码无效');
  const paragraphs=b.paragraphs.length?b.paragraphs:[''];
  await db().batch(paragraphs.map((text:string,i:number)=>db().prepare('INSERT INTO translation_paragraphs (id,owner,paper_id,page,ordinal,original,status,error,updated) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,paper_id,page,ordinal) DO NOTHING').bind(crypto.randomUUID(),owner,paper,b.page,i,text,text?'queued':'skipped',text?'':'此页未提取到文字；扫描页需先做 OCR。',Date.now())));
  return json({ok:true});
 }
 if(b.action==='claim'){
  const now=Date.now(),token=crypto.randomUUID();
  await db().prepare("UPDATE translation_paragraphs SET status='queued',lease_token='',lease_until=0 WHERE owner=? AND paper_id=? AND status='running' AND lease_until<?").bind(owner,paper,now).run();
  const row=await db().prepare("UPDATE translation_paragraphs SET status='running',lease_token=?,lease_until=?,updated=? WHERE id=(SELECT id FROM translation_paragraphs WHERE owner=? AND paper_id=? AND status='queued' ORDER BY page,ordinal LIMIT 1) AND status='queued' RETURNING *").bind(token,now+10*60*1000,now,owner,paper).first();
  return json(row?{entry:normalize(row),lease:token}:null);
 }
 throw Error('不支持的翻译操作');
}catch(e){return fail(e)}}
export async function PATCH(req:Request){try{
 const owner=await identity(req),b=await body(req);await owned(owner,b.paperId);
 if(b.action==='retry'){
  const suffix=b.id?' AND id=?':'',args=b.id?[owner,b.paperId,b.id]:[owner,b.paperId];
  await db().prepare("UPDATE translation_paragraphs SET status='queued',error='',lease_token='',lease_until=0 WHERE owner=? AND paper_id=? AND status='error'"+suffix).bind(...args).run();return json({ok:true});
 }
 if(!['complete','fail','release'].includes(b.action)||typeof b.lease!=='string'||!b.lease)throw Error('翻译状态无效');
 if(b.action==='complete'&&(typeof b.text!=='string'||!b.text.trim()||b.text.length>24000))throw Error('译文为空或过长');
 const status=b.action==='complete'?'done':b.action==='fail'?'error':'queued';
 const row=await db().prepare("UPDATE translation_paragraphs SET status=?,text=?,error=?,model=?,updated=?,lease_token='',lease_until=0 WHERE id=? AND owner=? AND paper_id=? AND status='running' AND lease_token=? RETURNING id").bind(status,b.action==='complete'?b.text:'',b.action==='fail'?str(b.error,1000):'',str(b.model,120),Date.now(),str(b.id),owner,b.paperId,b.lease).first();
 if(!row){const saved=await db().prepare('SELECT status,text,model FROM translation_paragraphs WHERE id=? AND owner=? AND paper_id=?').bind(str(b.id),owner,b.paperId).first();if(b.action==='complete'&&saved?.status==='done'&&saved.text===b.text&&saved.model===str(b.model,120))return json({ok:true});throw Error('此段已由其他任务接管，请刷新译文状态');}return json({ok:true});
}catch(e){return fail(e)}}
