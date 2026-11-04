'use client';
import {useEffect,useRef,useState} from 'react';
export function usePanelSize(key:string,initial:number,min:number,max:number){
 const [size,setSize]=useState(initial);
 useEffect(()=>{try{const stored=localStorage.getItem(key),n=Number(stored);if(stored&&Number.isFinite(n))setSize(Math.min(max,Math.max(min,n)))}catch{}},[key,min,max]);
 const update=(n:number)=>{const next=Math.round(Math.min(max,Math.max(min,n)));setSize(next);try{localStorage.setItem(key,String(next))}catch{}};
 return [size,update] as const;
}
export default function ResizeHandle({label,value,min,max,initial,onChange,reverse=false}:{label:string;value:number;min:number;max:number;initial:number;onChange:(n:number)=>void;reverse?:boolean}){
 const start=useRef<{x:number;value:number;id:number}|null>(null);
 const finish=()=>{start.current=null;document.documentElement.classList.remove('resizing-panel')};
 useEffect(()=>()=>document.documentElement.classList.remove('resizing-panel'),[]);
 return <div className="panel-resizer" role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0} title="拖动调整宽度 · 双击恢复默认 · 方向键微调" onDoubleClick={()=>onChange(initial)} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();start.current={x:e.clientX,value,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);document.documentElement.classList.add('resizing-panel')}} onPointerMove={e=>{const s=start.current;if(s&&e.pointerId===s.id)onChange(s.value+(e.clientX-s.x)*(reverse?-1:1))}} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();onChange(e.key==='Home'?min:e.key==='End'?max:e.key==='Enter'?initial:value+(e.key==='ArrowRight'?1:-1)*(reverse?-1:1)*(e.shiftKey?40:10))}}}><span/></div>;
}
