import {identity,db,bucket,fail,json,str,normalize} from '@/lib/server';
export async function GET(req:Request){try{const owner=await identity(req);const r=await db().prepare('SELECT p.*, (SELECT COUNT(*) FROM notes n WHERE n.paper_id=p.id AND n.owner=p.owner) as noteCount FROM papers p WHERE owner=? ORDER BY updated DESC').bind(owner).all();return json(r.results.map(normalize));}catch(e){return fail(e);}}
export async function POST(req:Request){try{
 const owner=await identity(req);if(Number(req.headers.get('content-length'))>42*1024*1024)throw new Error('单个 PDF 不能超过 40 MB');
 const f=await req.formData();const file=f.get('file');if(!(file instanceof File)||file.size>40*1024*1024||file.size<5)throw new Error('请选择 40 MB 以内的 PDF');
 const bytes=await file.arrayBuffer();if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw new Error('文件不是有效的 PDF');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const old=await db().prepare('SELECT * FROM papers WHERE owner=? AND hash=?').bind(owner,hash).first();if(old)return json({...normalize(old),duplicate:true});
 const tags=JSON.parse(str(f.get('tags'),2000)||'[]');if(!Array.isArray(tags))throw Error('标签格式错误');
 const filename=(str(f.get('filename'),200)||file.name).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_');
 const id=crypto.randomUUID(),now=Date.now();const p={id,owner,title:str(f.get('title'))||file.name.replace(/\.pdf$/i,''),authors:str(f.get('authors'),1000),year:str(f.get('year'),20),tags:JSON.stringify(tags.slice(0,20).map(x=>str(x,50))),collection:str(f.get('collection')),status:'unread',favorite:0,page:1,pages:Math.max(1,Math.min(100000,Math.floor(Number(f.get('pages'))||1))),filename:/\.pdf$/i.test(filename)?filename:filename+'.pdf',size:file.size,hash,created:now,updated:now,opened:0,journal:str(f.get('journal')),doi:str(f.get('doi'),200),abstract:str(f.get('abstract'),2000),original_filename:str(file.name),metadata_source:f.get('metadataSource')==='gpt'?'gpt':'manual'};
 await bucket().put(`${owner}/${id}.pdf`,bytes,{httpMetadata:{contentType:'application/pdf'}});
 try{await db().prepare('INSERT INTO papers (id,owner,title,authors,year,tags,collection,status,favorite,page,pages,filename,size,hash,created,updated,opened,journal,doi,abstract,original_filename,metadata_source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...Object.values(p)).run();}catch(e){await bucket().delete(`${owner}/${id}.pdf`);throw e;}
 return json({...normalize(p),noteCount:0});
}catch(e){return fail(e);}}
