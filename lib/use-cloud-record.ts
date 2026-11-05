'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from './client';

// A pending local copy survives a network failure. Successful cloud copies win
// on reopen, without comparing clocks on different computers.
export function useCloudRecord<T>({paperId,kind,value,restore,demo=false}:{paperId:string;kind:'draft'|'translation'|'annotations';value:T;restore:(value:T)=>void;demo?:boolean}){
 const key=`paperleaf-cloud-${paperId}-${kind}`,serialized=JSON.stringify(value);
 const restoreRef=useRef(restore);restoreRef.current=restore;
 const mounted=useRef(true),synced=useRef(serialized),pending=useRef<string|null>(null),sending=useRef(false);
 const [ready,setReady]=useState(false),[status,setStatus]=useState('正在读取云端记录…');
 function cache(data:string,isPending:boolean){try{localStorage.setItem(key,JSON.stringify({value:JSON.parse(data),pending:isPending}))}catch{}}
 async function flush(){
  if(demo||sending.current||pending.current===null)return;
  sending.current=true;
  try{while(pending.current!==null){const data:string=pending.current;
   if(mounted.current)setStatus('正在保存到云端…');
   await api('/api/reading-state',{method:'PATCH',body:JSON.stringify({paperId,kind,value:JSON.parse(data)})});
   synced.current=data;
   if(pending.current===data){pending.current=null;cache(data,false)}
   if(mounted.current)setStatus('已保存到云端');
  }}catch(e){if(mounted.current)setStatus('云端未同步，已保留本机副本：'+(e as Error).message)}finally{sending.current=false}
 }
 const flushRef=useRef(flush);flushRef.current=flush;
 useEffect(()=>{mounted.current=true;let active=true;
  (async()=>{let local:any=null;try{local=JSON.parse(localStorage.getItem(key)||'null')}catch{}
   // Migrate the previous browser-only draft and translation queue.
   if(!local&&kind!=='annotations')try{const oldKey=kind==='draft'?`paperleaf-draft-${paperId}`:`paperleaf-translation-session-${paperId}`;const old=JSON.parse(localStorage.getItem(oldKey)||sessionStorage.getItem(oldKey)||'null');if(old)local={value:old.value??old,pending:true};localStorage.removeItem(oldKey);sessionStorage.removeItem(oldKey)}catch{}
   let selected:T|undefined=local?.value,cloudRead=false;
   if(!demo)try{const cloud=await api<Record<string,{value:T}>>(`/api/reading-state?paper=${paperId}`);cloudRead=true;if(!local?.pending&&cloud[kind])selected=cloud[kind].value;if(active)setStatus('云端记录已载入')}catch(e){if(active)setStatus('云端读取失败，暂用本机副本：'+(e as Error).message)}
   if(!active)return;
   if(selected!==undefined){const data=JSON.stringify(selected);synced.current=data;restoreRef.current(selected);cache(data,!!local?.pending);if(local?.pending)pending.current=data}
   if(demo)setStatus('试读草稿保留在本机');else if(cloudRead&&!selected)setStatus('输入后自动保存到云端');
   setReady(true);
  })();
  const online=()=>void flushRef.current();window.addEventListener('online',online);
  return()=>{active=false;mounted.current=false;window.removeEventListener('online',online);void flushRef.current()};
 },[key]);
 useEffect(()=>{if(!ready)return;if(serialized!==synced.current){pending.current=serialized;cache(serialized,true)}if(demo){cache(serialized,false);return}if(pending.current===null)return;setStatus('正在等待同步…');const timer=setTimeout(()=>void flushRef.current(),700);return()=>clearTimeout(timer)},[serialized,ready]);
 return {ready,status,isPending:!demo&&(serialized!==synced.current||pending.current!==null),flush:()=>flushRef.current()};
}
