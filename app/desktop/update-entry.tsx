'use client';

import {useEffect,useState} from 'react';
import {RefreshCw,Monitor} from 'lucide-react';
import {desktopBridge} from '@/lib/desktop';
export default function UpdateEntry(){
 const [version,setVersion]=useState(''),[available,setAvailable]=useState(false);
 useEffect(()=>{const bridge=desktopBridge();if(!bridge)return;setVersion(bridge.version);if(!bridge.update)return;let active=true;const read=()=>bridge.update!('state').then(s=>{if(active)setAvailable(['available','downloading','ready'].includes(s.status))}).catch(()=>{});void read();const timer=setInterval(read,15000);return()=>{active=false;clearInterval(timer)}},[]);
 return <a className={`nav-item desktop-update-entry ${available?'has-update':''}`} href="/desktop">{available?<RefreshCw size={17}/>:<Monitor size={17}/>}<span>{available?'发现新版 · 查看更新':version?'版本与更新':'下载桌面版'}</span><small>{version?'v'+version:'↗'}</small></a>;
}
