'use client';
import {Card,CardHeader,CardContent,CardFooter} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {ArrowUpRight,Edit3,MessageCircle,Quote,Trash2} from 'lucide-react';
import {formatDate,type Note} from '@/lib/client';
import Markdown from './markdown';
export default function SavedNoteCard({note:n,onPage,onAsk,onEdit,onDelete}:{note:Note;onPage:(n:number)=>void;onAsk:()=>void;onEdit:()=>void;onDelete:()=>void}){
 return <Card className="saved-note-card" role="article" aria-label={`第 ${n.page} 页的阅读笔记`}>
  <CardHeader><div className="saved-note-meta"><Button variant="ghost" size="sm" onClick={()=>onPage(n.page)}>第 {n.page} 页 <ArrowUpRight size={13}/></Button><time>{formatDate(n.updated||n.created)}</time></div></CardHeader>
  <CardContent>{n.quote&&<details className={'note-source '+n.color} open={n.quote.length<=180}><summary><Quote size={13}/><span>查看原文摘录</span><span>{n.quote.length} 字</span></summary><blockquote>{n.quote}</blockquote></details>}{n.text?<Markdown text={n.text} pages={[n.page]} onPage={onPage} className="saved-note-prose"/>:<p className="note-only-excerpt">已收藏原文摘录，可补充想法或请 GPT 解释。</p>}</CardContent>
  <CardFooter><Button variant="secondary" size="sm" onClick={onAsk}><MessageCircle size={14}/>追问 GPT</Button><Button variant="ghost" size="sm" onClick={onEdit}><Edit3 size={14}/>编辑</Button><Button variant="ghost" size="icon-sm" className="note-delete" aria-label={`删除第 ${n.page} 页的笔记`} title="删除笔记" onClick={onDelete}><Trash2 size={14}/></Button></CardFooter>
 </Card>;
}
