import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createBridge,spawnCodexProfile,SITE} from '../companion/server.mjs';
import {CodexRPC} from '../companion/rpc.mjs';
export function validateDesktopRequest(route,options={}){
 const method=options.method||'GET';
 const allowed=method==='GET'&&(route==='/status'||route==='/status?refresh=1'||/^\/jobs\/[a-zA-Z0-9-]{16,64}$/.test(route))||method==='POST'&&(['/login','/login/cancel','/logout','/jobs'].includes(route)||/^\/jobs\/[a-zA-Z0-9-]{16,64}\/cancel$/.test(route));
 if(!allowed||typeof route!=='string')throw Error('不支持的阅读操作');
 if(options.body!==undefined&&(typeof options.body!=='string'||Buffer.byteLength(options.body)>1200000))throw Error('阅读请求过大');
 if(method==='POST')JSON.parse(options.body||'{}');return {method,body:method==='POST'?options.body||'{}':undefined};
}
export function validOAuthURL(value){try{const u=new URL(value);return u.protocol==='https:'&&['auth.openai.com','chatgpt.com'].includes(u.hostname)&&!u.username&&!u.password}catch{return false}}
export class DesktopRuntime{
 constructor({dataDir,binaryPath,getAccount,openExternal,spawnProfile=spawnCodexProfile}){Object.assign(this,{dataDir,binaryPath,getAccount,openExternal,spawnProfile});this.bridge=null;this.owner='';this.starting=null;this.generation=0;}
 async disconnect(){this.generation++;const old=this.bridge;this.bridge=null;this.owner='';if(old)await old.close();}
 async ensure(){
  let account;try{account=await this.getAccount()}catch(e){await this.disconnect();throw e}if(!account?.id){await this.disconnect();throw Error('请先登录 Paperleaf 云端账号');}
  if(this.bridge&&this.owner===account.id)return this.bridge;
  if(this.starting){await this.starting;return this.ensure();}
  const owner=account.id;
  this.starting=(async()=>{
   await this.disconnect();const version=this.generation;
   const root=path.join(this.dataDir,'codex-profiles',createHash('sha256').update(owner).digest('hex'));
   const workdir=path.join(root,'reading'),profile=path.join(root,'account');await mkdir(workdir,{recursive:true,mode:0o700});await mkdir(profile,{recursive:true,mode:0o700});
   const child=this.spawnProfile(workdir,profile,{binaryPath:this.binaryPath,credentialStore:'auto'}),rpc=new CodexRPC(child);
   try{await rpc.initialize();if(version!==this.generation)throw Error('账号连接已关闭，请重试');
    const bridge=createBridge({rpc,workdir,port:0});await new Promise((resolve,reject)=>{bridge.server.once('error',reject);bridge.server.listen(0,'127.0.0.1',resolve)});
    if(version!==this.generation){await bridge.close();throw Error('账号连接已关闭，请重试');}
    this.bridge=bridge;this.owner=owner;rpc.once('closed',()=>{if(this.bridge===bridge){this.bridge=null;this.owner='';bridge.server.close();}});return bridge;
   }catch(e){rpc.close();throw e;}
  })();
  try{return await this.starting}finally{this.starting=null}
 }
 async request(route,options){
  const request=validateDesktopRequest(route,options),b=await this.ensure();
  const response=await fetch(`http://127.0.0.1:${b.server.address().port}${route}`,{...request,headers:{Origin:SITE,'X-Paperleaf-Token':b.token,'Content-Type':'application/json'},signal:AbortSignal.timeout(route==='/login'?65000:25000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Codex 请求失败');
  if(route==='/login'){if(!validOAuthURL(data.authUrl))throw Error('无法识别登录页面');await this.openExternal(data.authUrl);return {started:true};}
  return data;
 }
}
