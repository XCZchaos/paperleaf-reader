'use client';
import {useRef,type ReactNode} from 'react';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';

export default function ReadingDialog({title,children,className='',onClose,busy=false}:{title:string;children:ReactNode;className?:string;onClose:()=>void;busy?:boolean}){
 const previousFocus=useRef<HTMLElement|null>(typeof document!=='undefined'?document.activeElement as HTMLElement:null);
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}><DialogContent className={`paperleaf-dialog modal ${className}`} showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={e=>{e.preventDefault();queueMicrotask(()=>{if(previousFocus.current?.isConnected)previousFocus.current.focus()})}} onEscapeKeyDown={e=>{e.stopPropagation();if(busy)e.preventDefault()}} onInteractOutside={e=>{if(busy)e.preventDefault()}}><DialogTitle className="sr-only">{title}</DialogTitle>{children}</DialogContent></Dialog>;
}
