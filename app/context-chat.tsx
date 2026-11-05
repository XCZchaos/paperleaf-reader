'use client';
import {useState,type ComponentProps} from 'react';
import {ArrowLeft,MessageCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import ChatPanel from './chat';
import type {ReadingContext} from '@/lib/ai-types';
import {contextLabel} from '@/lib/reading-context.mjs';
type Props=Omit<ComponentProps<typeof ChatPanel>,'source'|'readingContext'|'onBusy'> & {context:ReadingContext;onClose:()=>void};
export default function ContextChat({context,onClose,...props}:Props){
 const [busy,setBusy]=useState(false);
 return <section className="context-chat" aria-label={contextLabel(context)+'追问'}><header className="context-chat-header"><Button variant="ghost" size="sm" onClick={onClose} disabled={busy}><ArrowLeft size={15}/>返回{context.kind==='note'||context.kind==='draft'?'笔记':'翻译'}</Button><span><MessageCircle size={15}/>GPT 追问</span></header><ChatPanel {...props} source={null} readingContext={context} onBusy={setBusy}/></section>;
}
