'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {desktopBridge} from '@/lib/desktop';
import Workspace from './workspace';
import {CodexProvider} from './codex-provider';
import {AccountProvider} from './account-provider';

// The website is the download surface. Existing desktop versions retain their
// same-origin cloud session and enter the reader through their isolated preload.
export default function DesktopEntry({downloadPage}:{downloadPage:ReactNode}){
 const [desktop,setDesktop]=useState<boolean|null>(null);
 useEffect(()=>setDesktop(!!desktopBridge()),[]);
 if(desktop===null)return <main className="desktop-entry-loading" role="status">正在打开 Paperleaf…</main>;
 return desktop?<AccountProvider><CodexProvider><Workspace/></CodexProvider></AccountProvider>:downloadPage;
}
