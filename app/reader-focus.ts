'use client';
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {desktopBridge} from '@/lib/desktop';

const preference='paperleaf-reader-focus';
type Anchor={page:string;fraction:number;horizontal:number};

/** Keep the PDF and side panels mounted; only collapse the reading chrome. */
export function useReaderFocus(viewport:RefObject<HTMLDivElement|null>,width:number,onEnter:()=>void){
 const [focused,setFocused]=useState(false);
 const active=useRef(false),anchor=useRef<Anchor|null>(null),frame=useRef(0);
 const enter=useRef(onEnter);enter.current=onEnter;
 const moveFocus=useRef(false);
 function change(next:boolean){
  if(active.current===next)return;
  const root=viewport.current;
  if(root){
   const top=root.getBoundingClientRect().top;
   const sheet=Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-page]')).find(el=>el.getBoundingClientRect().bottom>top);
   if(sheet){const rect=sheet.getBoundingClientRect();anchor.current={page:sheet.dataset.pdfPage!,fraction:(top-rect.top)/rect.height,horizontal:root.scrollLeft/Math.max(1,root.scrollWidth)};}
  }
  moveFocus.current=!!document.activeElement?.closest('.reader-head,.pdf-tools,.pdf-annotation-tools,.pdf-outline,.pdf-footer,.reader-focus-restore,.panel-resizer');
  active.current=next;setFocused(next);
  if(next)enter.current();
  try{localStorage.setItem(preference,String(next))}catch{}
 }
 function restorePosition(){
  const root=viewport.current,a=anchor.current;
  if(!root||!a)return false;
  const sheet=root.querySelector<HTMLElement>(`[data-pdf-page="${a.page}"]`);
  if(sheet){const rect=sheet.getBoundingClientRect();root.scrollTop+=rect.top-root.getBoundingClientRect().top+a.fraction*rect.height;root.scrollLeft=a.horizontal*root.scrollWidth;}
  return true;
 }
 useLayoutEffect(()=>{
  if(!anchor.current&&!moveFocus.current)return;
  cancelAnimationFrame(frame.current);
  // A collapsed outline changes the viewport before React receives its width.
  // Keep the anchor until the PDF has rendered at that measured width.
  if(viewport.current&&width!==viewport.current.clientWidth)return;
  restorePosition();
  // ResizeObserver updates PDF scale on the next frame when an outline closes.
  frame.current=requestAnimationFrame(()=>{
   restorePosition();
   if(moveFocus.current){viewport.current?.focus({preventScroll:true});moveFocus.current=false;}
   frame.current=requestAnimationFrame(()=>{restorePosition();anchor.current=null});
  });
  return()=>cancelAnimationFrame(frame.current);
 },[focused,width]);
 useEffect(()=>{
  try{if(localStorage.getItem(preference)==='true')change(true)}catch{}
  const bridge=desktopBridge();
  const modalOpen=()=>!!document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]');
  const toggle=()=>{if(!modalOpen())change(!active.current)};
  const unsubscribe=bridge?.onReaderFocusToggle?.(toggle);
  const key=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.repeat||event.ctrlKey||event.metaKey||event.altKey||modalOpen())return;
   if(event.key==='F8'&&!bridge?.onReaderFocusToggle){event.preventDefault();toggle()}
   if(event.key==='Escape'&&active.current&&!(event.target as Element)?.closest('input,textarea,select,[contenteditable],[role="dialog"]')){event.preventDefault();change(false)}
  };
  window.addEventListener('keydown',key);
  return()=>{window.removeEventListener('keydown',key);unsubscribe?.();cancelAnimationFrame(frame.current);void bridge?.setReaderFocus?.(false).catch(()=>{})};
 },[]);
 useEffect(()=>{void desktopBridge()?.setReaderFocus?.(focused).catch(()=>{})},[focused]);
 return {focused,toggle:()=>change(!active.current),restore:()=>change(false),restorePosition};
}
