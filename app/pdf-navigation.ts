'use client';
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
export type PdfTool='select'|'hand'|'pen'|'text'|'eraser';
const editable='input,textarea,select,button,a,[contenteditable=true],[role=dialog]';
export function usePdfNavigation(root:RefObject<HTMLDivElement|null>,onPan:()=>void){
 const [zoom,setZoom]=useState(1),[tool,setTool]=useState<PdfTool>('select'),[space,setSpace]=useState(false),[dragging,setDragging]=useState(false);
 const latest=useRef({zoom,tool,space,onPan});latest.current={zoom,tool,space,onPan};
 const suppress=useRef(0),anchor=useRef<{page:string;x:number;y:number;clientX:number;clientY:number}|null>(null);
 const gesture=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null),hover=useRef(false);
 useEffect(()=>{try{if(localStorage.getItem('paperleaf-pdf-tool')==='hand')setTool('hand')}catch{}},[]);
 function chooseTool(value:PdfTool){setTool(value);try{localStorage.setItem('paperleaf-pdf-tool',value)}catch{}}
 function changeZoom(value:number,point?:{x:number;y:number}){
  const el=root.current;if(!el)return;const next=Math.max(.5,Math.min(2.5,Math.round(value*100)/100));if(next===latest.current.zoom)return;
  const box=el.getBoundingClientRect(),x=point?.x??box.left+el.clientWidth/2,y=point?.y??box.top+el.clientHeight/2;
  const sheets=Array.from(el.querySelectorAll<HTMLElement>('[data-pdf-page]'));
  const sheet=sheets.find(s=>{const r=s.getBoundingClientRect();return y>=r.top&&y<=r.bottom})||sheets.reduce<HTMLElement|null>((best,s)=>!best||Math.abs(s.getBoundingClientRect().top-y)<Math.abs(best.getBoundingClientRect().top-y)?s:best,null);
  if(sheet){const r=sheet.getBoundingClientRect();anchor.current={page:sheet.dataset.pdfPage!,x:(x-r.left)/r.width,y:(y-r.top)/r.height,clientX:x,clientY:y}}
  latest.current.zoom=next;setZoom(next);
 }
 useLayoutEffect(()=>{const a=anchor.current,el=root.current;if(!a||!el)return;const sheet=el.querySelector<HTMLElement>(`[data-pdf-page="${a.page}"]`);if(sheet){const r=sheet.getBoundingClientRect();el.scrollLeft+=r.left+r.width*a.x-a.clientX;el.scrollTop+=r.top+r.height*a.y-a.clientY;}anchor.current=null},[zoom]);
 useEffect(()=>{
  const el=root.current;if(!el)return;
  const wheel=(e:WheelEvent)=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?el.clientHeight:1);changeZoom(latest.current.zoom*Math.exp(-Math.max(-120,Math.min(120,delta))*.002),{x:e.clientX,y:e.clientY})};
  const enter=()=>{hover.current=true},leave=()=>{hover.current=false};
  const end=()=>{gesture.current=null;setDragging(false);suppress.current=Date.now()+180};
  const down=(e:PointerEvent)=>{if(e.pointerType==='touch'||(e.target as Element).closest(editable)||!(e.button===1||e.button===0&&(latest.current.tool==='hand'||latest.current.space)))return;e.preventDefault();e.stopPropagation();el.setPointerCapture(e.pointerId);gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};setDragging(true);suppress.current=Date.now()+1000;window.getSelection()?.removeAllRanges();latest.current.onPan()};
  const move=(e:PointerEvent)=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;e.preventDefault();el.scrollLeft=g.left-(e.clientX-g.x);el.scrollTop=g.top-(e.clientY-g.y)};
  const up=(e:PointerEvent)=>{if(gesture.current?.id!==e.pointerId)return;e.preventDefault();if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);end()};
  const keydown=(e:KeyboardEvent)=>{if(e.code!=='Space'||e.ctrlKey||e.metaKey||e.altKey||(e.target as Element).closest(editable)||!(hover.current||el.contains(document.activeElement)))return;e.preventDefault();latest.current.space=true;setSpace(true)};
  const keyup=(e:KeyboardEvent)=>{if(e.code==='Space'){latest.current.space=false;setSpace(false)}};
  const blur=()=>{latest.current.space=false;setSpace(false);end()};
  el.addEventListener('wheel',wheel,{passive:false});el.addEventListener('pointerenter',enter);el.addEventListener('pointerleave',leave);el.addEventListener('pointerdown',down,true);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',end);window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
  return()=>{el.removeEventListener('wheel',wheel);el.removeEventListener('pointerenter',enter);el.removeEventListener('pointerleave',leave);el.removeEventListener('pointerdown',down,true);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.removeEventListener('lostpointercapture',end);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur)};
 },[root]);
 return{zoom,changeZoom,tool,chooseTool,panning:tool==='hand'||space,dragging,selectionSuppressed:()=>tool!=='select'||space||!!gesture.current||Date.now()<suppress.current};
}
