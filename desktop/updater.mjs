import path from 'node:path';
import {mkdir,open,rename,rm,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const versionPattern=/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
const hashPattern=/^[a-f0-9]{64}$/;
export function newerVersion(a,b){
 if(!versionPattern.test(a)||!versionPattern.test(b))throw Error('版本号格式不正确');
 const av=a.split('.').map(Number),bv=b.split('.').map(Number);
 for(let i=0;i<3;i++)if(av[i]!==bv[i])return av[i]>bv[i];return false;
}
export function validateRelease(data){
 if(!data||!versionPattern.test(data.version)||typeof data.date!=='string'||!Array.isArray(data.notes)||data.notes.length>30||data.notes.some(n=>typeof n!=='string'||n.length>1000))throw Error('更新说明格式不正确');
 const a=data.artifact;
 if(!a||a.platform!=='win32-x64'||!Number.isSafeInteger(a.size)||a.size<1||a.size>1024**3||!hashPattern.test(a.sha256)||!Array.isArray(a.chunks)||!a.chunks.length||a.chunks.length>64)throw Error('安装包信息不完整');
 let total=0;const paths=new Set();
 for(const c of a.chunks){
  const expected=new RegExp('^/desktop-updates/'+data.version.replaceAll('.','\\.')+'/[a-f0-9]{64}\\.part$');
  if(!c||!expected.test(c.path)||paths.has(c.path)||!hashPattern.test(c.sha256)||!c.path.endsWith('/'+c.sha256+'.part')||!Number.isSafeInteger(c.size)||c.size<1||c.size>20*1024**2)throw Error('安装包分片不受信任');
  paths.add(c.path);total+=c.size;
 }
 if(total!==a.size)throw Error('安装包大小不一致');
 return {version:data.version,date:data.date,notes:data.notes,artifact:a};
}

// The renderer can only request fixed actions. URLs, paths and executable arguments
// are owned here; authenticated HTTPS requests use the same Electron session.
export class DesktopUpdater{
 constructor({version,site,dataDir,fetch,launch,platform=process.platform,arch=process.arch}){
  Object.assign(this,{version,site,dataDir,fetch,launch,platform,arch});
  this.state={status:'idle',currentVersion:version,release:null,progress:0,downloaded:0,error:'',checkedAt:null};
  this.release=null;this.controller=null;this.file=null;
 }
 snapshot(){return structuredClone(this.state)}
 set(values){Object.assign(this.state,values);return this.snapshot()}
 async check(){
  if(['checking','downloading','installing'].includes(this.state.status))return this.snapshot();
  if(this.state.status==='ready')return this.snapshot();
  this.set({status:'checking',error:''});
  try{
   const response=await this.fetch(this.site+'/desktop-update.json',{credentials:'include',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
   if(!response.ok||!response.headers.get('content-type')?.includes('json'))throw Error('请先登录云端阅读空间，然后重试检查更新');
   const body=await response.text();if(body.length>100000)throw Error('更新信息过大');
   this.release=validateRelease(JSON.parse(body));
   return this.set({status:newerVersion(this.release.version,this.version)?'available':'current',release:{version:this.release.version,date:this.release.date,notes:this.release.notes,size:this.release.artifact.size},checkedAt:Date.now(),progress:0,downloaded:0});
  }catch(e){return this.set({status:'error',error:e.message||'检查失败，请检查网络后重试'})}
 }
 async download(){
  if(this.state.status==='downloading'||this.state.status==='ready')return this.snapshot();
  if(!this.release||!newerVersion(this.release.version,this.version))throw Error('请先检查更新');
  if(this.platform!=='win32'||this.arch!=='x64')throw Error('此安装包仅支持 Windows x64');
  const release=this.release,dir=path.join(this.dataDir,'updates');
  const destination=path.join(dir,`Paperleaf-Setup-${release.version}-Windows-x64.exe`),partial=destination+'.partial';
  const controller=new AbortController();this.controller=controller;
  this.set({status:'downloading',error:'',progress:0,downloaded:0});
  let handle;
  try{
   await mkdir(dir,{recursive:true});await rm(partial,{force:true});
   handle=await open(partial,'wx',0o600);
   const hash=createHash('sha256');let total=0;
   for(const chunk of release.artifact.chunks){
    const response=await this.fetch(this.site+chunk.path,{credentials:'include',redirect:'error',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])});
    if(!response.ok||!response.body)throw Error('下载失败，请检查登录状态和网络');
    const partHash=createHash('sha256');let count=0;
    for await(const bytes of response.body){
     controller.signal.throwIfAborted();count+=bytes.byteLength;total+=bytes.byteLength;
     if(count>chunk.size||total>release.artifact.size)throw Error('下载内容大小异常');
     partHash.update(bytes);hash.update(bytes);
     let offset=0;while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset);offset+=bytesWritten;}
     this.set({downloaded:total,progress:Math.floor(total/release.artifact.size*100)});
    }
    if(count!==chunk.size||partHash.digest('hex')!==chunk.sha256)throw Error('下载校验失败，请重新下载');
   }
   if(total!==release.artifact.size||hash.digest('hex')!==release.artifact.sha256)throw Error('安装包校验失败');
   await handle.sync();await handle.close();handle=null;
   await rename(partial,destination);this.file=destination;
   return this.set({status:'ready',progress:100});
  }catch(e){
   await handle?.close().catch(()=>{});await rm(partial,{force:true}).catch(()=>{});
   return this.set({status:controller.signal.aborted?'available':'error',error:controller.signal.aborted?'下载已取消，可重新下载':e.message,progress:0,downloaded:0});
  }finally{this.controller=null}
 }
 cancel(){this.controller?.abort();return this.snapshot()}
 async install(){
  if(this.state.status!=='ready'||!this.file||!this.release)throw Error('请先完成安装包下载');
  this.set({status:'installing',error:''});
  try{
   // Recheck bytes immediately before launching, including modifications on disk.
   const handle=await open(this.file,'r');const hash=createHash('sha256');let size=0;
   try{for await(const bytes of handle.createReadStream()){hash.update(bytes);size+=bytes.length;}}finally{await handle.close().catch(()=>{})}
   if(size!==this.release.artifact.size||hash.digest('hex')!==this.release.artifact.sha256)throw Error('安装包已变化，请重新下载');
   await this.launch(this.file);return this.snapshot();
  }catch(e){this.file=null;return this.set({status:'error',error:e.message})}
 }
 async request(action){
  if(action==='state')return this.snapshot();
  if(action==='check')return this.check();
  // Long downloads run independently while the UI polls progress.
  if(action==='download'){void this.download().catch(e=>this.set({status:'error',error:e.message}));return this.snapshot()}
  if(action==='cancel')return this.cancel();
  if(action==='install')return this.install();
  throw Error('不支持的更新操作');
 }
}
