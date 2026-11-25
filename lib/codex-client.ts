import type {CodexJob,PageText,ResearchKind} from './ai-types';
import {streamPollDelay,streamJobChanged} from './job-stream.mjs';
import {desktopBridge} from './desktop';
export function requireCurrentBridge(version?:string){const v=(version||'0').split('.').map(Number);if((v[0]||0)<1||(v[0]===1&&(v[1]||0)<2))throw Error('请先升级至 Paperleaf 1.2.0 或更新版本，以修复 Windows Codex 沙箱兼容问题。');}
export function requireSegmentationBridge(version?:string){
 const [major=0,minor=0,patch=0]=(version||'').split('.').map(Number);
 if(!(major>1||major===1&&(minor>5||minor===5&&patch>=3)))throw Error('AI 分段需要 Paperleaf 1.5.3 或更新版本。请打开「版本与更新」升级后继续。');
}
export type ConnectionMode='auto'|'default'|'http-sse';
const connectionPreference='paperleaf-codex-connection';
let sessionMode:ConnectionMode='auto';
export function readingConnection():ConnectionMode{
 try{const saved=window.localStorage.getItem(connectionPreference);if(saved==='auto'||saved==='http-sse'||saved==='default')return saved;}catch{}
 return sessionMode;
}
export function chooseReadingConnection(mode:ConnectionMode){
 sessionMode=mode;
 try{window.localStorage.setItem(connectionPreference,mode);}catch{}
}
export const bridgeAddress='http://127.0.0.1:17624';
export const pairKey='paperleaf-codex-pair';
export async function bridgeCall<T=any>(path:string,options:RequestInit={}):Promise<T>{
 const desktop=desktopBridge();if(desktop){requireCurrentBridge(desktop.version);if(options.signal?.aborted)throw new DOMException('已停止','AbortError');return desktop.request(path,{method:options.method||'GET',body:typeof options.body==='string'?options.body:undefined});}
 const token=sessionStorage.getItem(pairKey);if(!token)throw Error('请先连接本机 Codex');
 let res:Response;
 try{res=await fetch(bridgeAddress+path,{...options,headers:{'Content-Type':'application/json','X-Paperleaf-Token':token},credentials:'omit',referrerPolicy:'no-referrer',signal:options.signal||AbortSignal.timeout(20000)});}catch(e){if(options.signal?.aborted)throw e;throw Error('无法连接本机程序。请确认它已启动，并允许浏览器访问本地网络（建议使用桌面 Chrome / Edge）。')}
 const data:any=await res.json();if(!res.ok)throw Error(data.error||'Codex 连接失败');if(path.startsWith('/status'))requireCurrentBridge(data.version);return data;
}
function pollWait(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
   const stop=()=>{clearTimeout(timer);reject(new DOMException('已停止','AbortError'));};
   const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);
   signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
 });
}
export async function runCodexTask(input:{kind:ResearchKind|'metadata'|'argument'|'connection-test';argument?:import('./argument-types').ArgumentInput;title:string;pages:PageText[];selection?:string;question?:string;history?:{role:string;text:string}[];detectVocabulary?:boolean;translationMode?:'paragraph';slideCount?:number;model?:string;effort?:string;paperId?:string;conversationId?:string;parentId?:string},signal:AbortSignal,onProgress:(j:CodexJob)=>void):Promise<CodexJob>{
 const id=crypto.randomUUID();
 let cancellationSent=false;
 const cancel=()=>{if(cancellationSent)return;cancellationSent=true;void bridgeCall(`/jobs/${id}/cancel`,{method:'POST',body:'{}'}).catch(()=>{});};
 signal.addEventListener('abort',cancel,{once:true});
 try{
   if(signal.aborted)throw new DOMException('已停止','AbortError');
   const mode=readingConnection();
   let job=await bridgeCall<CodexJob>('/jobs',{method:'POST',body:JSON.stringify({...input,id,connectionMode:mode==='auto'?'default':mode,adaptiveConnection:mode==='auto'}),signal});if(signal.aborted)throw new DOMException('已停止','AbortError');onProgress(job);let changed=true;
   let readFailures=0;
   while(job.status==='preparing'||job.status==='running'){
     const delay=readFailures?Math.min(4000,500*2**readFailures):streamPollDelay(job,changed,typeof document!=='undefined'&&document.visibilityState==='hidden');
     await pollWait(delay,signal);
     let next:CodexJob;
     try{next=await bridgeCall<CodexJob>(`/jobs/${id}`,{signal});}
     catch(e){
       if(signal.aborted)throw new DOMException('已停止','AbortError');
       if(++readFailures>4||!/云端账号状态暂时无法读取|无法连接本机程序|fetch failed|failed to fetch/i.test((e as Error).message))throw e;
       continue;
     }
     if(signal.aborted)throw new DOMException('已停止','AbortError');
     readFailures=0;changed=streamJobChanged(job,next);job=next;if(changed)onProgress(job);
   }
   if(job.status!=='completed')throw Error(job.error||'生成未完成');return job;
 }catch(e){cancel();throw e;}finally{signal.removeEventListener('abort',cancel);}
}
