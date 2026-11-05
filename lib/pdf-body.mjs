import {boundedParagraphs} from './pdf-paragraphs.mjs';
// Coordinates and repeated margins distinguish prose from running furniture.
// This is deliberately conservative; the reader can always choose all PDF text.
export function pdfBodyBlocks(items,pageWidth=0){
 const lines=[];let line=null;
 const flush=()=>{if(line?.text.trim())lines.push(line);line=null};
 for(const i of items){if(typeof i.str!=='string'||!i.str.trim()&&!line)continue;
  // Rotated marginal arXiv labels are not part of the reading order.
  if(Math.abs(i.transform?.[1]||0)>Math.abs(i.transform?.[0]||1)*2)continue;
  const x=Number(i.transform?.[4]||0),y=Number(i.transform?.[5]||0),height=Math.max(1,Math.abs(Number(i.height||i.transform?.[3]||10))),width=Math.abs(Number(i.width||0));
  if(line&&(Math.abs(y-line.y)>Math.max(2,height*.45)||x-line.end>height*4))flush();
  if(!line)line={text:'',x,y,height,end:x};
  line.text+=(line.text&&!/\s$/.test(line.text)&&!/^\s/.test(i.str)&&x-line.end>height*.12?' ':'')+i.str;line.end=Math.max(line.end,x+width);line.height=Math.max(line.height,height);if(i.hasEOL)flush();
 }flush();
 // Some PDFs expose items row-by-row across both columns. Sort each band
 // between full-width headings left-column-first instead of interleaving it.
 if(pageWidth){
  const mid=pageWidth/2,gutter=pageWidth*.025;
  const left=lines.filter(l=>l.x<mid&&l.end<=mid+gutter&&l.text.length>20),right=lines.filter(l=>l.x>=mid-gutter&&l.text.length>20);
  if(left.length>=4&&right.length>=4){
   const wide=lines.filter(l=>l.x<mid-gutter&&l.end>mid+gutter).sort((a,b)=>b.y-a.y);
   const remaining=new Set(lines.filter(l=>!wide.includes(l))),ordered=[];
   const band=(bottom)=>{const rows=[...remaining].filter(l=>l.y>bottom);rows.forEach(l=>remaining.delete(l));rows.sort((a,b)=>(a.x>=mid-gutter?1:0)-(b.x>=mid-gutter?1:0)||b.y-a.y||a.x-b.x);ordered.push(...rows)};
   for(const l of wide){band(l.y+l.height*.5);ordered.push(l)}band(-Infinity);lines.splice(0,lines.length,...ordered);
  }
 }
 const blocks=[];let b=null,prev=null;
 for(const l of lines){const gap=prev?prev.y-l.y:0,indent=prev?l.x-prev.x:0;
  const boundary=prev&&(gap< -prev.height*.7||gap>Math.max(l.height,prev.height)*1.65||indent>Math.max(8,l.height*.8)||indent< -l.height*3||Math.abs(l.height-prev.height)>prev.height*.22);
  if(boundary&&b){blocks.push(b);b=null}
  if(!b)b={text:'',x:l.x,y:l.y,bottom:l.y,height:l.height,end:l.end};
  b.text+=b.text&&/[a-z]-$/.test(b.text)&&/^[a-z]/.test(l.text)?'':b.text?' ':'';
  if(/[a-z]-$/.test(b.text)&&/^[a-z]/.test(l.text))b.text=b.text.slice(0,-1);
  b.text+=l.text;b.bottom=l.y;b.end=Math.max(b.end,l.end);prev=l;
 }if(b)blocks.push(b);return blocks;
}
const canonical=s=>s.toLowerCase().replace(/\d+/g,'#').replace(/\s+/g,' ').trim();
const referenceHeading=s=>/^(?:(?:\d+\.?|[ivx]+\.?)\s+)?(?:references|bibliography|literature cited|参考文献)\s*[:.]?\s*$/i.test(s);
export function extractPaperBody(pages){
 const margins=new Map();for(const p of pages){const seen=new Set();for(const b of p.blocks){if((b.y>p.height*.9||b.bottom<p.height*.08)&&b.text.length<220)seen.add(canonical(b.text))}for(const t of seen)margins.set(t,(margins.get(t)||0)+1)}
 const repeated=new Set([...margins].filter(([,n])=>n>=2&&n>=pages.length*.25).map(([t])=>t));
 let start=null;for(const p of pages.slice(0,3)){const i=p.blocks.findIndex(b=>/^abstract\b\s*[:.—–-]?/i.test(b.text));if(i>=0){start=[p.page,i];break}}
 if(!start)for(const p of pages.slice(0,2)){const i=p.blocks.findIndex(b=>/^(?:1\s*[.\s]\s*)?introduction\b/i.test(b.text));if(i>=0){start=[p.page,i];break}}
 let references=false;
 return pages.map(p=>{const kept=[];let excluded=0,referencePage=false;
  p.blocks.forEach((b,i)=>{const text=b.text.trim(),edge=b.y>p.height*.9||b.bottom<p.height*.08;
   if(start&&(p.page<start[0]||p.page===start[0]&&i<start[1])){excluded++;return}
   if(referenceHeading(text)){references=true;referencePage=true;excluded++;return}
   if(references&&/^(?:appendix(?:\s+[A-Z])?|supplementary (?:material|methods)|[A-Z]\.\s+\w[^.]{0,80})\s*[:.]?$/i.test(text))references=false;
   if(references){referencePage=true;excluded++;return}
   if(edge&&(repeated.has(canonical(text))||/^\s*(?:\d+|page\s+\d+(?:\s+of\s+\d+)?)\s*$/i.test(text))||/^(?:©|copyright\b|permission to make\b|ACM Reference Format\b|https?:\/\/doi\.org\/|arXiv:\s*\d)/i.test(text)||/^(?:Fig(?:ure)?\.?|Table)\s+\d+\s*[.:]/i.test(text)){excluded++;return}
   if(text)kept.push(text);
  });
  // A column change often splits the same sentence. Join only unmistakable
  // continuations; headings, numbered lists and sentence boundaries stay intact.
  const merged=[];for(const t of kept){const previous=merged.at(-1);if(previous&&previous.length>100&&!/[.!?:;。]$/.test(previous)&&/^[a-z]/.test(t)){merged[merged.length-1]=/[a-z]-$/.test(previous)?previous.slice(0,-1)+t:previous+' '+t}else merged.push(t)}
  return{page:p.page,bodyParagraphs:boundedParagraphs(merged),bodyExcluded:excluded,bodyReason:!p.blocks.length?'此页未提取到文字；扫描页需先做 OCR。':!kept.length?referencePage?'参考文献页已从正文翻译中排除。':'此页为标题、作者或非正文内容，已排除。':''};
 });
}
