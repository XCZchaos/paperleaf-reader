import {identity,db,bucket,fail,json,body,str,normalize} from '@/lib/server';
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const owner=await identity(req),{id}=await params;const p=await db().prepare('SELECT * FROM papers WHERE id=? AND owner=?').bind(id,owner).first();if(!p)throw new Error('NOT_FOUND');
 const b=await body(req);const sets:string[]=[],values:unknown[]=[];
 for(const k of ['title','authors','year','collection','journal','doi','abstract','filename'])if(k in b){let value=str(b[k],k==='year'?20:k==='abstract'?2000:k==='authors'?1000:k==='filename'?200:500);if(k==='title'&&!value.trim())throw new Error('标题不能为空');if(k==='filename'){value=value.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_');if(!value.trim())throw Error('文件名不能为空');if(!/\.pdf$/i.test(value))value+='.pdf';}sets.push(`${k}=?`);values.push(value);}
 if('metadataSource'in b&&b.metadataSource==='gpt'){sets.push('metadata_source=?');values.push('gpt');}
 if('status'in b&&['unread','reading','done'].includes(b.status)){sets.push('status=?');values.push(b.status);}
 if('favorite'in b){sets.push('favorite=?');values.push(b.favorite?1:0);}
 if('page'in b){sets.push('page=?');values.push(Math.max(1,Math.min(Number(p.pages),Math.floor(Number(b.page)||1))));}
 if('opened'in b){sets.push('opened=?');values.push(Date.now());}
 if('tags'in b){sets.push('tags=?');values.push(JSON.stringify(Array.isArray(b.tags)?b.tags.slice(0,20).map((x:unknown)=>str(x,50)).filter(Boolean):[]));}
 sets.push('updated=?');values.push(Date.now());await db().prepare(`UPDATE papers SET ${sets.join(',')} WHERE id=? AND owner=?`).bind(...values,id,owner).run();
 return json(normalize((await db().prepare('SELECT * FROM papers WHERE id=? AND owner=?').bind(id,owner).first())!));
}catch(e){return fail(e);}}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){try{const owner=await identity(req),{id}=await params;const p=await db().prepare('SELECT id FROM papers WHERE id=? AND owner=?').bind(id,owner).first();if(!p)throw new Error('NOT_FOUND');await bucket().delete(`${owner}/${id}.pdf`);await db().batch([db().prepare('DELETE FROM notes WHERE paper_id=? AND owner=?').bind(id,owner),db().prepare('DELETE FROM research WHERE paper_id=? AND owner=?').bind(id,owner),db().prepare('DELETE FROM reading_states WHERE paper_id=? AND owner=?').bind(id,owner),db().prepare('DELETE FROM papers WHERE id=? AND owner=?').bind(id,owner)]);return json({ok:true});}catch(e){return fail(e);}}
