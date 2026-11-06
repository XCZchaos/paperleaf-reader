import type {CodexJob,PageText,ResearchKind} from './ai-types';
import {streamPollDelay,streamJobChanged} from './job-stream.mjs';
import {desktopBridge} from './desktop';
export function requireCurrentBridge(version?:string){const v=(version||'0').split('.').map(Number);if((v[0]||0)<1||(v[0]===1&&(v[1]||0)<2))throw Error('请先升级至 Paperleaf 1.2.0 或更新版本，以修复 Windows Codex 沙箱兼容问题。');}
export const bridgeAddress='http://127.0.0.1:17624';
export const pairKey='paperleaf-codex-pair';
export async function bridgeCall<T=any>(path:string,options:RequestInit={}):Promise<T>{
 const desktop=desktopBridge();if(desktop){requireCurrentBridge(desktop.version);if(options.signal?.aborted)throw new DOMException('已停止','AbortError');return desktop.request(path,{method:options.method||'GET',body:typeof options.body==='string'?options.body:undefined});}
 const token=sessionStorage.getItem(pairKey);if(!token)throw Error('请先连接本机 Codex');
 let res:Response;
 try{res=await fetch(bridgeAddress+path,{...options,headers:{'Content-Type':'application/json','X-Paperleaf-Token':token},credentials:'omit',referrerPolicy:'no-referrer',signal:options.signal||AbortSignal.timeout(20000)});}catch(e){if(options.signal?.aborted)throw e;throw Error('无法连接本机程序。请确认它已启动，并允许浏览器访问本地网络（建议使用桌面 Chrome / Edge）。')}
 const data:any=await res.json();if(!res.ok)throw Error(data.error||'Codex 连接失败');if(path.startsWith('/status'))requireCurrentBridge(data.version);return data;
}
export async function runCodexTask(input:{kind:ResearchKind|'metadata';title:string;pages:PageText[];selection?:string;question?:string;history?:{role:string;text:string}[];detectVocabulary?:boolean;translationMode?:'paragraph';slideCount?:number;model?:string;effort?:string},signal:AbortSignal,onProgress:(j:CodexJob)=>void):Promise<CodexJob>{
 const id=crypto.randomUUID();
 let cancellationSent=false;
 const cancel=()=>{if(cancellationSent)return;cancellationSent=true;void bridgeCall(`/jobs/${id}/cancel`,{method:'POST',body:'{}'}).catch(()=>{});};
 signal.addEventListener('abort',cancel,{once:true});
 try{
   if(signal.aborted)throw new DOMException('已停止','AbortError');
   let job=await bridgeCall<CodexJob>('/jobs',{method:'POST',body:JSON.stringify({...input,id}),signal});if(signal.aborted)throw new DOMException('已停止','AbortError');onProgress(job);let changed=true;
   while(job.status==='preparing'||job.status==='running'){
     await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(new DOMException('已停止','AbortError'))};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve()},streamPollDelay(job,changed,typeof document!=='undefined'&&document.visibilityState==='hidden'));signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();});
     const next=await bridgeCall<CodexJob>(`/jobs/${id}`,{signal});if(signal.aborted)throw new DOMException('已停止','AbortError');changed=streamJobChanged(job,next);job=next;if(changed)onProgress(job);
   }
   if(job.status!=='completed')throw Error(job.error||'生成未完成');return job;
 }catch(e){cancel();throw e;}finally{signal.removeEventListener('abort',cancel);}
}
