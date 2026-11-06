'use client';
import {useEffect,useRef,useState} from 'react';
export function usePanelSize(key:string,initial:number,min:number,max:number){
 const [size,setSize]=useState(initial);
 useEffect(()=>{try{const stored=localStorage.getItem(key),n=Number(stored);if(stored&&Number.isFinite(n))setSize(Math.min(max,Math.max(min,n)))}catch{}},[key,min,max]);
 const update=(n:number)=>{const next=Math.round(Math.min(max,Math.max(min,n)));setSize(next);try{localStorage.setItem(key,String(next))}catch{}};
 return [size,update] as const;
}
export default function ResizeHandle({label,value,min,max,initial,onChange,reverse=false,orientation='vertical',className=''}:{label:string;value:number;min:number;max:number;initial:number;onChange:(n:number)=>void;reverse?:boolean;orientation?:'vertical'|'horizontal';className?:string}){
 const start=useRef<{position:number;value:number;id:number;node:HTMLElement}|null>(null);
 const horizontal=orientation==='horizontal';
 const finish=()=>{const previous=start.current;start.current=null;if(previous?.node.hasPointerCapture(previous.id))previous.node.releasePointerCapture(previous.id);document.documentElement.classList.remove('resizing-panel','resizing-row')};
 useEffect(()=>{window.addEventListener('blur',finish);return()=>{finish();window.removeEventListener('blur',finish)}},[]);
 return <div className={`panel-resizer ${horizontal?'row-resizer':''} ${className}`} role="separator" aria-label={label} aria-orientation={orientation} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0} title={`拖动调整${horizontal?'高度':'宽度'} · 双击恢复默认 · 方向键微调`} onDoubleClick={()=>onChange(initial)} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();start.current={position:horizontal?e.clientY:e.clientX,value,id:e.pointerId,node:e.currentTarget};e.currentTarget.setPointerCapture(e.pointerId);document.documentElement.classList.add(horizontal?'resizing-row':'resizing-panel')}} onPointerMove={e=>{const s=start.current;if(s&&e.pointerId===s.id)onChange(s.value+((horizontal?e.clientY:e.clientX)-s.position)*(reverse?-1:1))}} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onKeyDown={e=>{const negative=horizontal?'ArrowUp':'ArrowLeft',positive=horizontal?'ArrowDown':'ArrowRight';if([negative,positive,'Home','End','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();onChange(e.key==='Home'?min:e.key==='End'?max:e.key==='Enter'?initial:value+(e.key===positive?1:-1)*(reverse?-1:1)*(e.shiftKey?40:10))}}}><span/></div>;
}
