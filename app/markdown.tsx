'use client';
import ReactMarkdown, {defaultUrlTransform} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Repair common model typography without touching code or the saved source.
export function readableMarkdown(source:string){
 return source.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part,i)=>i%2?part:part.replace(/\\\[([\s\S]*?)\\\]/g,(_,x)=>`\n$$\n${x.trim()}\n$$\n`).replace(/\\\((.*?)\\\)/g,(_,x)=>`$${x}$`).replace(/\*\*([^*\n]+)\*\*/g,(_,x)=>`**${x.trim()}**`)).join('');
}
function citations(){return (tree:any)=>{
 const walk=(node:any)=>{if(['code','inlineCode','math','inlineMath','link','image','html'].includes(node.type)||!node.children)return;
 node.children=node.children.flatMap((child:any)=>{if(child.type!=='text'){walk(child);return [child]}
 const out:any[]=[];let pos=0;for(const m of child.value.matchAll(/\[p\.\s*(\d+)\]/gi)){if(m.index>pos)out.push({type:'text',value:child.value.slice(pos,m.index)});out.push({type:'link',url:`paperleaf-page:${m[1]}`,children:[{type:'text',value:m[0]}]});pos=m.index+m[0].length;}if(pos<child.value.length)out.push({type:'text',value:child.value.slice(pos)});return out;});};walk(tree);
};}
export default function Markdown({text,pages=[],onPage,className=''}:{text:string;pages?:number[];onPage?:(n:number)=>void;className?:string}){
 return <div className={`markdown-body ${className}`}><ReactMarkdown skipHtml remarkPlugins={[remarkGfm,remarkMath,citations]} rehypePlugins={[[rehypeKatex,{trust:false,strict:'ignore',throwOnError:false,maxExpand:1000}]]} urlTransform={url=>/^paperleaf-page:\d+$/.test(url)?url:defaultUrlTransform(url)} components={{
 a:({href,children})=>{const match=href?.match(/^paperleaf-page:(\d+)$/);if(match){const page=Number(match[1]);return onPage&&pages.includes(page)?<button className="citation-pill" onClick={()=>onPage(page)} aria-label={`跳转至第 ${page} 页`}>第 {page} 页 ↗</button>:<span>{children}</span>;}return href&&/^https?:\/\//i.test(href)?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>;},
 table:({children})=><div className="markdown-table" tabIndex={0} role="region" aria-label="回答表格"><table>{children}</table></div>,
 img:({alt})=><span className="markdown-image-alt">{alt||'图片'}</span>,
 }} >{readableMarkdown(text)}</ReactMarkdown></div>;
}
