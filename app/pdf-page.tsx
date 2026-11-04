'use client';
import {useEffect,useRef,useState} from 'react';
import type {RefObject} from 'react';
import type {PDFDocumentProxy,RenderTask,TextLayer} from 'pdfjs-dist';
import {LoaderCircle,RotateCw} from 'lucide-react';
import {pdfLib,type Note} from '@/lib/client';

export default function PdfPage({doc,number,width,zoom,root,notes,single=false}:{doc:PDFDocumentProxy;number:number;width:number;zoom:number;root:RefObject<HTMLDivElement|null>;notes:Note[];single?:boolean}){
 const sheet=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),textLayer=useRef<HTMLDivElement>(null);
 const [near,setNear]=useState(single),[natural,setNatural]=useState({width:612,height:792}),[busy,setBusy]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const scale=Math.min(1.65,Math.max(.3,(width-48)/natural.width))*zoom;
 useEffect(()=>{
  if(single){setNear(true);return;}const el=sheet.current;if(!el)return;
  const observer=new IntersectionObserver(entries=>setNear(entries[0].isIntersecting),{root:root.current,rootMargin:'900px 0px'});
  observer.observe(el);return()=>observer.disconnect();
 },[root,single]);
 useEffect(()=>{
  if(!near||!width)return;let cancelled=false,render:RenderTask|undefined,layer:TextLayer|undefined;
  const c=canvas.current,container=textLayer.current;if(!c||!container)return;
  setBusy(true);setError('');
  (async()=>{
   try{
    const page=await doc.getPage(number);if(cancelled)return;
    const size=page.getViewport({scale:1});
    if(size.width!==natural.width||size.height!==natural.height){setNatural({width:size.width,height:size.height});return;}
    const view=page.getViewport({scale});const dpr=Math.min(window.devicePixelRatio||1,2);
    c.width=Math.floor(view.width*dpr);c.height=Math.floor(view.height*dpr);c.style.width=`${view.width}px`;c.style.height=`${view.height}px`;
    render=page.render({canvas:c,canvasContext:c.getContext('2d')!,viewport:view,transform:dpr===1?undefined:[dpr,0,0,dpr,0,0]});
    await render.promise;if(cancelled)return;
    const lib=await pdfLib(),content=await page.getTextContent();if(cancelled)return;
    layer=new lib.TextLayer({textContentSource:content,container,viewport:view});await layer.render();
    if(!cancelled)setBusy(false);
   }catch(e){if(!cancelled&&!(e instanceof Error&&e.name==='RenderingCancelledException')){setError('这一页未能加载');setBusy(false);}}
  })();
  return()=>{cancelled=true;render?.cancel();layer?.cancel();container.replaceChildren();c.width=0;c.height=0;};
 },[doc,number,near,width,scale,natural.width,natural.height,retry]);
 return <section className="pdf-page-wrap" data-page-number={number} aria-label={`第 ${number} 页`}>
  <div className="pdf-page-label"><span>PAGE {String(number).padStart(2,'0')}</span><span>{number} / {doc.numPages}</span></div>
  <div ref={sheet} className="pdf-sheet" data-pdf-page={number} style={{width:natural.width*scale,height:natural.height*scale,'--scale-factor':scale,'--total-scale-factor':scale} as React.CSSProperties}>
   <canvas ref={canvas} aria-label={`PDF 第 ${number} 页`}/>
   <div className="saved-highlights">{notes.filter(n=>n.page===number).flatMap(n=>(n.rects||[]).map((r,i)=><div title={n.text||n.quote} key={n.id+i} className={`pdf-highlight ${n.color}`} style={{left:`${r[0]*100}%`,top:`${r[1]*100}%`,width:`${r[2]*100}%`,height:`${r[3]*100}%`}}/>))}</div>
   <div ref={textLayer} className="textLayer"/>
   {busy&&!error&&<div className="page-loading"><LoaderCircle className="spin" size={20}/><span>第 {number} 页</span></div>}
   {error&&<div className="page-loading"><p>{error}</p><button className="button" onClick={()=>setRetry(r=>r+1)}><RotateCw size={15}/>重新加载</button></div>}
  </div>
 </section>;
}
