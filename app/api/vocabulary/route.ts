import {identity,db,fail,json,body,str} from '@/lib/server';
import {validateVocabulary,wordCandidate} from '@/companion/research.mjs';
function normalize(r:any){return{id:r.id,word:r.word,details:JSON.parse(r.details),answer:r.answer,sources:JSON.parse(r.sources),mastered:!!r.mastered,encounters:r.encounters,created:r.created,updated:r.updated};}
export async function GET(req:Request){try{
 const owner=await identity(req),p=new URL(req.url).searchParams,q=str(p.get('q'),100).toLowerCase(),status=p.get('status');let where='owner=?',args:unknown[]=[owner];
 if(q){where+=' AND (normalized_word LIKE ? ESCAPE \'\\\' OR details LIKE ? ESCAPE \'\\\')';const match='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(match,match);}
 if(status==='learning'||status==='mastered'){where+=' AND mastered=?';args.push(status==='mastered'?1:0);}
 const count=await db().prepare('SELECT COUNT(*) AS total,SUM(mastered) AS mastered FROM vocabulary WHERE '+where).bind(...args).first();
 const before=p.get('before'),beforeId=p.get('beforeId');if(before&&beforeId){if(!/^\d+$/.test(before)||!/^[-\w]{16,64}$/.test(beforeId))throw Error('单词本游标无效');where+=' AND (updated<? OR (updated=? AND id<?))';args.push(Number(before),Number(before),beforeId);}
 const rows=await db().prepare('SELECT * FROM vocabulary WHERE '+where+' ORDER BY updated DESC,id DESC LIMIT 50').bind(...args).all();return json({entries:rows.results.map(normalize),total:Number(count?.total||0),mastered:Number(count?.mastered||0)});
}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 const owner=await identity(req),b=await body(req),paper=await db().prepare('SELECT title,pages FROM papers WHERE owner=? AND id=?').bind(owner,str(b.paperId)).first();if(!paper)throw Error('NOT_FOUND');
 if(!Number.isInteger(b.page)||b.page<1||b.page>Number(paper.pages)||typeof b.jobId!=='string'||!/^[-\w]{16,64}$/.test(b.jobId))throw Error('单词来源无效');
 const details=validateVocabulary(b.vocabulary,b.original);if(!details)throw Error('GPT 未识别到单词');if(typeof b.text!=='string'||!b.text.trim()||b.text.length>24000)throw Error('单词解释为空或过长');
 const normalized=wordCandidate(details.word).toLowerCase().replaceAll('’',"'"),now=Date.now(),source={id:b.jobId,paperId:b.paperId,title:paper.title,page:b.page,contextMeaning:details.contextMeaning,added:now};
 await db().prepare('INSERT INTO vocabulary (id,owner,word,normalized_word,details,answer,sources,mastered,encounters,created,updated) VALUES (?,?,?,?,?,?,\'[]\',0,0,?,?) ON CONFLICT(owner,normalized_word) DO NOTHING').bind(crypto.randomUUID(),owner,details.word,normalized,JSON.stringify(details),b.text,now,now).run();
 // Atomic JSON append avoids lost occurrences when two devices encounter a word.
 await db().prepare("UPDATE vocabulary SET details=?,answer=?,updated=?,encounters=encounters+1,sources=json_insert(CASE WHEN json_array_length(sources)>=20 THEN json_remove(sources,'$[0]') ELSE sources END,'$[#]',json(?)) WHERE owner=? AND normalized_word=? AND NOT EXISTS (SELECT 1 FROM json_each(vocabulary.sources) WHERE json_extract(value,'$.id')=?)").bind(JSON.stringify(details),b.text,now,JSON.stringify(source),owner,normalized,b.jobId).run();
 return json(normalize(await db().prepare('SELECT * FROM vocabulary WHERE owner=? AND normalized_word=?').bind(owner,normalized).first()));
}catch(e){return fail(e)}}
export async function PATCH(req:Request){try{const owner=await identity(req),b=await body(req);if(typeof b.mastered!=='boolean')throw Error('掌握状态无效');const row=await db().prepare('UPDATE vocabulary SET mastered=? WHERE id=? AND owner=? RETURNING *').bind(b.mastered?1:0,str(b.id),owner).first();if(!row)throw Error('NOT_FOUND');return json(normalize(row))}catch(e){return fail(e)}}
export async function DELETE(req:Request){try{const owner=await identity(req),id=new URL(req.url).searchParams.get('id');await db().prepare('DELETE FROM vocabulary WHERE id=? AND owner=?').bind(id,owner).run();return json({ok:true})}catch(e){return fail(e)}}
