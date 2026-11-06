'use client';
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';

/** Follow the actual scroll owner only while the reader is already at its end. */
export function useStreamFollow(root:RefObject<HTMLElement|null>,text:string,running:boolean){
 const pinned=useRef(true),userPaused=useRef(false),previousTop=useRef(0),active=useRef(running),[atBottom,setAtBottom]=useState(true);
 active.current=running;
 useEffect(()=>{
  const el=root.current;if(!el)return;
  const onScroll=()=>{const distance=el.scrollHeight-el.scrollTop-el.clientHeight;
   if(userPaused.current&&distance<8&&el.scrollTop>previousTop.current+1)userPaused.current=false;
   previousTop.current=el.scrollTop;const next=!userPaused.current&&distance<80;pinned.current=next;setAtBottom(next)};
  onScroll();el.addEventListener('scroll',onScroll,{passive:true});
  // Wheel/keys mark intent before a resize observer or a streamed render can run.
  const wheel=(e:WheelEvent)=>{if(e.deltaY<0){userPaused.current=true;pinned.current=false;setAtBottom(false)}};
  const key=(e:KeyboardEvent)=>{if(['ArrowUp','PageUp','Home'].includes(e.key)){userPaused.current=true;pinned.current=false;setAtBottom(false)}};
  el.addEventListener('wheel',wheel,{passive:true});el.addEventListener('keydown',key);
  let frame=0;const observer=new MutationObserver(()=>{if(!active.current||!pinned.current)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(pinned.current&&!userPaused.current)el.scrollTop=el.scrollHeight})});observer.observe(el,{subtree:true,childList:true,characterData:true});
  return()=>{observer.disconnect();cancelAnimationFrame(frame);el.removeEventListener('scroll',onScroll);el.removeEventListener('wheel',wheel);el.removeEventListener('keydown',key)};
 },[root]);
 useLayoutEffect(()=>{
  const el=root.current;if(!el)return;
  if(pinned.current&&text){el.scrollTop=el.scrollHeight;setAtBottom(true)}
 },[text,running,root]);
 function scrollToBottom(){const el=root.current;if(el){userPaused.current=false;pinned.current=true;setAtBottom(true);el.scrollTop=el.scrollHeight}}
 return {atBottom,scrollToBottom};
}
