'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,ReactNode} from 'react';
import type {CodexStatus} from '@/lib/ai-types';
import {bridgeCall,pairKey} from '@/lib/codex-client';
import CodexConnection from './codex-connection';
import {desktopBridge} from '@/lib/desktop';
type State={status:CodexStatus|null;error:string;connecting:boolean;ready:boolean;model:string;setModel:(s:string)=>void;autoTranslate:boolean;setAutoTranslate:(v:boolean)=>void;open:()=>void;refresh:()=>Promise<void>;pair:(token:string)=>Promise<void>;disconnect:()=>void};
const Context=createContext<State|null>(null);
export function useCodex(){const value=useContext(Context);if(!value)throw Error('CodexProvider missing');return value;}
export function CodexProvider({children}:{children:ReactNode}){
 const [status,setStatus]=useState<CodexStatus|null>(null),[error,setError]=useState(''),[connecting,setConnecting]=useState(false),[show,setShow]=useState(false),[model,setModelValue]=useState(''),[autoTranslate,setAuto]=useState(false);const refreshing=useRef(false),generation=useRef(0);
 const refresh=useCallback(async()=>{if(refreshing.current||(!desktopBridge()&&!sessionStorage.getItem(pairKey)))return;refreshing.current=true;setConnecting(true);const version=generation.current;try{const data=await bridgeCall<CodexStatus>('/status');if(version!==generation.current)return;setStatus(data);setError('');setModelValue(prev=>data.models.some(m=>m.id===prev)?prev:data.models.find(m=>m.default)?.id||'');}catch(e){if(version!==generation.current)return;setStatus(null);setError((e as Error).message)}finally{refreshing.current=false;setConnecting(false)}},[]);
 useEffect(()=>{const hash=new URLSearchParams(location.hash.slice(1));const token=hash.get('paperleaf-connect');if(token&&/^[\w-]{43}$/.test(token)){sessionStorage.setItem(pairKey,token);history.replaceState(null,'',location.pathname+location.search);setShow(true);}setModelValue(localStorage.getItem('paperleaf-model')||'');setAuto(localStorage.getItem('paperleaf-auto-translate')==='true');void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},15000);return()=>clearInterval(timer)},[refresh]);
 const setModel=(v:string)=>{setModelValue(v);localStorage.setItem('paperleaf-model',v)};
 const setAutoTranslate=(v:boolean)=>{setAuto(v);localStorage.setItem('paperleaf-auto-translate',String(v))};
 const pair=async(token:string)=>{if(!/^[\w-]{43}$/.test(token.trim()))throw Error('请复制连接程序显示的完整配对码');sessionStorage.setItem(pairKey,token.trim());generation.current++;await refresh()};
 const disconnect=()=>{generation.current++;sessionStorage.removeItem(pairKey);setStatus(null);setError('');setAutoTranslate(false);};
 return <Context.Provider value={{status,error,connecting,ready:!!status?.account,model,setModel,autoTranslate,setAutoTranslate,open:()=>setShow(true),refresh,pair,disconnect}}>{children}{show&&<CodexConnection close={()=>setShow(false)}/>}</Context.Provider>;
}
