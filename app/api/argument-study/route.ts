import {identity,db,bucket,fail,json,str} from '@/lib/server';
import {validateArgumentStudy} from '@/lib/argument-study.mjs';

async function paperFor(owner:string,id:unknown){
 if(typeof id!=='string'||!/^[-\w]{1,64}$/.test(id))throw Error('文献标识无效');
 const p=await db().prepare('SELECT id,pages FROM papers WHERE owner=? AND id=?').bind(owner,id).first();
 if(!p)throw Error('NOT_FOUND');return p;
}
export async function GET(req:Request){try{
 const owner=await identity(req),paper=await paperFor(owner,new URL(req.url).searchParams.get('paper'));
 const file=await bucket().get(`${owner}/${paper.id}.argument.json`);
 return json(file?{study:validateArgumentStudy(await file.json(),Number(paper.pages)),etag:file.etag}:{study:null,etag:null});
}catch(e){return fail(e)}}
export async function PUT(req:Request){try{
 const owner=await identity(req),text=await req.text();if(text.length>2500000)throw Error('精读结果过大，请使用 HTML 导出保存');
 const b=JSON.parse(text),paper=await paperFor(owner,b.study?.paperId),study=validateArgumentStudy(b.study,Number(paper.pages));
 if(b.etag!==null&&(typeof b.etag!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(b.etag)))throw Error('请先读取云端精读状态');
 const file=await bucket().put(`${owner}/${paper.id}.argument.json`,JSON.stringify(study),{
  httpMetadata:{contentType:'application/json;charset=utf-8'},
  onlyIf:b.etag?{etagMatches:b.etag}:{etagDoesNotMatch:'*'},
 });
 if(!file)return Response.json({error:'云端已被另一台设备更新。请先载入云端版本，或导出当前结果后再处理。'},{status:409,headers:{'Cache-Control':'no-store'}});
 return json({etag:file.etag});
}catch(e){return fail(e)}}
