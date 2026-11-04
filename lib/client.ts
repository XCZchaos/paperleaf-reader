export type Paper={id:string;title:string;authors:string;year:string;tags:string[];collection:string;status:'unread'|'reading'|'done';favorite:boolean;page:number;pages:number;filename:string;size:number;created:number;updated:number;opened:number;noteCount?:number;duplicate?:boolean;journal?:string;doi?:string;abstract?:string;originalFilename?:string;metadataSource?:string};
export type Note={id:string;paperId:string;paperTitle?:string;text:string;quote:string;page:number;color:string;rects:number[][];created:number;updated:number};
export type Collection={id:string;name:string};
export async function api<T=any>(url:string,options?:RequestInit):Promise<T>{const res=await fetch(url,{...options,signal:options?.signal||AbortSignal.timeout(options?.body instanceof FormData?120000:20000),headers:{...(options?.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options?.headers}});if(!res.headers.get('content-type')?.includes('application/json'))throw new Error('访问验证已过期，请刷新页面重新登录');const data:any=await res.json();if(!res.ok){if(res.status===401&&!url.startsWith('/api/account'))window.dispatchEvent(new Event('paperleaf-account-expired'));throw new Error(data.error||'连接失败，请重试');}return data;}
export async function pdfLib(){const lib=await import('pdfjs-dist');lib.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.mjs';return lib;}
export const pdfOptions={cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',isEvalSupported:false};
export const statusLabel={unread:'待阅读',reading:'阅读中',done:'已读完'};
export const formatDate=(v:number)=>new Date(v).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});
export const formatSize=(v:number)=>v>1024*1024?`${(v/1024/1024).toFixed(1)} MB`:`${Math.round(v/1024)} KB`;
export function download(text:string,name:string,type='text/markdown;charset=utf-8'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
export function exportNotes(p:Paper,notes:Note[]){download(`# ${p.title}\n\n${p.authors||''}${p.year?' · '+p.year:''}\n\n标签：${p.tags.join('、')||'无'}\n\n---\n\n`+notes.map(n=>`## 第 ${n.page} 页 · ${formatDate(n.created)}\n\n${n.quote?'> '+n.quote.replace(/\n/g,'\n> ')+'\n\n':''}${n.text}\n`).join('\n---\n\n'),`${p.title.replace(/[\\/:*?"<>|]/g,'_')}-阅读笔记.md`);}

export async function flushPendingCloudCopies(){
 let keys:string[]=[];try{keys=Object.keys(localStorage)}catch{return}
 for(const key of keys){const match=/^paperleaf-cloud-(.+)-(draft|translation)$/.exec(key);if(!match)continue;let copy:any;try{copy=JSON.parse(localStorage.getItem(key)||'null')}catch{continue}if(!copy?.pending)continue;
  try{await api('/api/reading-state',{method:'PATCH',body:JSON.stringify({paperId:match[1],kind:match[2],value:copy.value})});try{localStorage.setItem(key,JSON.stringify({...copy,pending:false}))}catch{}}
  catch(e){if((e as Error).message==='文献或笔记不存在'){localStorage.removeItem(key);continue}throw Error('还有记录尚未同步，请联网后再退出。'+(e as Error).message)}
 }
}
