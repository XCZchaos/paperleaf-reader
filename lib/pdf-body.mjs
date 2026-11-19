import {boundedParagraphs} from './pdf-paragraphs.mjs';
import {pageGutters} from './pdf-columns.mjs';
import {captionStart,collectCaptions} from './pdf-captions.mjs';
import {groupEquationLines} from './argument-paragraphs.mjs';
// Coordinates and repeated margins distinguish prose from running furniture.
// This is deliberately conservative; the reader can always choose all PDF text.
export function pdfBodyBlocks(items,pageWidth=0){
 let lines=[],line=null;
 const flush=()=>{if(line?.text.trim())lines.push(line);line=null};
 for(const i of items){if(typeof i.str!=='string'||!i.str.trim()&&!line)continue;
  // Rotated marginal arXiv labels are not part of the reading order.
  if(Math.abs(i.transform?.[1]||0)>Math.abs(i.transform?.[0]||1)*2)continue;
  const x=Number(i.transform?.[4]||0),y=Number(i.transform?.[5]||0),height=Math.max(1,Math.abs(Number(i.height||i.transform?.[3]||10))),width=Math.abs(Number(i.width||0));
  const inlineScript=line&&/[a-z]{2}/i.test(line.text)&&height<line.height*.85&&Math.abs(y-line.y)<line.height*.72&&Math.abs(x-line.end)<line.height*.6;
  if(line&&!inlineScript&&(Math.abs(y-line.y)>Math.max(2,height*.45)||x-line.end>height*4))flush();
  if(!line)line={text:'',x,y,height,end:x,font:i.fontName||''};
  line.text+=(line.text&&!/\s$/.test(line.text)&&!/^\s/.test(i.str)&&x-line.end>height*.12?' ':'')+i.str;line.end=Math.max(line.end,x+width);line.height=Math.max(line.height,height);if(i.hasEOL)flush();
 }flush();
 lines=collectCaptions(lines);
 // Some PDFs expose items row-by-row across both columns. Sort each band
 // between full-width headings left-column-first instead of interleaving it.
 const gutters=pageGutters(lines,pageWidth);
 const columnOf=l=>gutters.filter(cut=>l.x>=cut-1).length;
 lines=groupEquationLines(lines,columnOf);
 if(gutters.length){
  const spans=l=>gutters.some(cut=>l.x<cut-2&&l.end>cut+2);
  const wide=lines.filter(spans).sort((a,b)=>b.y-a.y);
  const remaining=new Set(lines.filter(l=>!spans(l))),ordered=[];
  const band=bottom=>{
   const rows=[...remaining].filter(l=>l.y>bottom);
   for(const l of rows)remaining.delete(l);
   rows.sort((a,b)=>columnOf(a)-columnOf(b)||b.y-a.y||a.x-b.x);
   ordered.push(...rows);
  };
  for(const l of wide){band(l.y+l.height*.5);ordered.push(l)}
  band(-Infinity);lines=ordered;
 }
 // Estimate column margins from prose, excluding labels and display math.
 const edges=new Map();
 for(let col=0;col<=gutters.length;col++){
  const rows=lines.filter(l=>columnOf(l)===col&&!l.caption&&!l.displayMath&&l.text.length>30);
  if(rows.length<5)continue;
  const left=rows.map(l=>l.x).sort((a,b)=>a-b)[Math.floor(rows.length*.1)];
  const right=rows.map(l=>l.end).sort((a,b)=>b-a)[Math.floor(rows.length*.1)];
  const indented=rows.some(l=>l.x-left>=l.height*.55&&l.x-left<=l.height*2);
  edges.set(col,{left,right,indented});
 }
 const blocks=[],captions=[];let b=null,prev=null;
 for(const [order,l] of lines.entries()){
  if(l.caption){
   captions.push({text:l.text,x:l.x,y:l.y,bottom:l.bottom,height:l.height,end:l.end,column:columnOf(l),caption:true,order});
   continue;
  }
  const gap=prev?prev.y-l.y:0,indent=prev?l.x-prev.x:0;
  const floatingReturn=prev&&indent< -l.height*3&&gap>0&&gap<l.height*1.7&&
   Math.abs(l.end-prev.end)<l.height*2.5&&lines.some(c=>c.caption&&columnOf(c)===columnOf(l)&&
    c.x<prev.x&&c.end<=prev.x+l.height&&Math.abs(c.bottom-prev.y)<2.6*l.height);
  const boundary=prev&&(referenceHeading(l.text)||referenceHeading(prev.text)||columnOf(prev)!==columnOf(l)||l.displayMath||prev.displayMath||gap< -prev.height*.7||gap>Math.max(l.height,prev.height)*1.65||indent>Math.max(8,l.height*.8)||indent< -l.height*3&&!floatingReturn||Math.abs(l.height-prev.height)>prev.height*.22);
  if(boundary&&b){blocks.push(b);b=null}
  const column=columnOf(l),edge=edges.get(column);
  if(!b)b={order,text:'',x:l.x,y:l.y,bottom:l.y,height:l.height,end:l.end,column,atMargin:!!edge&&Math.abs(l.x-edge.left)<l.height*.5,indentedStyle:!!edge?.indented};
  b.fullLastLine=!!edge&&Math.abs(edge.right-l.end)<l.height*1.6;
  b.text+=b.text&&/[a-z]-$/.test(b.text)&&/^[a-z]/.test(l.text)?'':b.text?' ':'';
  if(/[a-z]-$/.test(b.text)&&/^[a-z]/.test(l.text))b.text=b.text.slice(0,-1);
  b.text+=l.text;b.bottom=l.y;b.end=Math.max(b.end,l.end);prev=l;
 }if(b)blocks.push(b);
 return [...blocks,...captions].sort((a,b)=>a.order-b.order).map(({order,...block})=>block);
}
const canonical=s=>s.toLowerCase().replace(/\d+/g,'#').replace(/\s+/g,' ').trim();
const referenceHeading=s=>/^(?:(?:\d+\.?|[ivx]+\.?)\s+)?(?:references|bibliography|literature cited|参考文献)\s*[:.]?\s*$/i.test(s);
const frontLabel=/^(?:CCS Concepts|Additional Key Words|(?:Author )?Key[ -]?words|Index Terms|PACS(?: numbers)?|DOI)\s*[:：]/i;
const frontMatter=/^(?:Authors?[’']? Contact Information|This work is licensed|(?:Author )?Affiliations?\s*[:：]|Copyright\b|Department of |\d+\s+Department of |Received\b|\(Received\b)/i;
const proseStart=s=>s.length>=110&&(s.match(/[A-Za-z]{2,}/g)||[]).length>=17&&
 /\b(?:is|are|was|were|we|can|has|have|present|plays?|describe|demonstrate|report|observed|detect(?:ed)?)\b/i.test(s)&&!frontMatter.test(s);
function bodyStart(pages) {
 for(const p of pages.slice(0,3)){
  const i=p.blocks.findIndex(b=>/^(?:abstract\b|摘\s*要)\s*[:：.—–-]?/i.test(b.text));
  if(i>=0)return [p.page,i];
 }
 for(const p of pages.slice(0,2)){
  const intro=p.blocks.findIndex(b=>/^(?:(?:1|I)[.\s]+)?introduction\b/i.test(b.text));
  const marker=p.blocks.findIndex(b=>frontLabel.test(b.text.trim()));
  if(marker>=0&&(intro<0||marker<intro)){
   const lead=p.blocks.slice(0,marker).findIndex(b=>!b.caption&&proseStart(b.text));
   if(lead>=0)return [p.page,lead];
  }
  if(intro>=0)return [p.page,intro];
 }
 const first=pages[0];
 if(first){
  const aff=first.blocks.findIndex(b=>b.y>first.height*.62&&/\b(?:university|department of|institute of|corresponding author)\b/i.test(b.text));
  const lead=aff<0?-1:first.blocks.findIndex((b,i)=>i>aff&&!b.caption&&proseStart(b.text));
  if(lead>=0)return [first.page,lead];
 }
 return null;
}
// Some journals omit a References heading. Three numbered entries, bibliographic
// dates and an author-style first entry distinguish the list from in-text citations.
function startsBibliography(blocks,index) {
 const first=blocks[index].text.trim();
 if(!/^\[1\]\s+(?:[A-Z]\.|[A-Z][\p{L}'’-]+,)/u.test(first))return false;
 const sample=blocks.slice(index,index+12).map(b=>b.text).join(' ');
 return /\[2\][\s\S]*\[3\]/.test(sample)&&/\b(?:18|19|20)\d{2}\b/.test(sample);
}
export function extractPaperBody(pages){
 const margins=new Map();for(const p of pages){const seen=new Set();for(const b of p.blocks){if((b.y>p.height*.9||b.bottom<p.height*.08)&&b.text.length<220)seen.add(canonical(b.text))}for(const t of seen)margins.set(t,(margins.get(t)||0)+1)}
 const repeated=new Set([...margins].filter(([,n])=>n>=2&&n>=pages.length*.25).map(([t])=>t));
 const start=bodyStart(pages);
 let references=false;
 return pages.map(p=>{const kept=[],argumentBodyBlocks=[];let excluded=0,referencePage=false;
  p.blocks.forEach((b,i)=>{const text=b.text.trim(),edge=b.y>p.height*.9||b.bottom<p.height*.08;
   if(start&&(p.page<start[0]||p.page===start[0]&&i<start[1])){excluded++;return}
   if(referenceHeading(text)||p.page>=pages.length*.45&&startsBibliography(p.blocks,i)){references=true;referencePage=true;excluded++;return}
   if(references&&(/^(?:appendix(?:\s+[a-z0-9]+)?|supplementary (?:material|methods))(?:\s*[:.\-–—]\s*[^.]{1,80})?\s*[:.]?$/i.test(text)||/^[A-Z]\.\s+(?:Additional|Experimental|Proof|Derivation|Training|Implementation|Supplementary|Data|Methods)\b[^.,;0-9]{0,65}$/.test(text)))references=false;
   if(references){referencePage=true;excluded++;return}
   if(p===pages[0]&&(frontLabel.test(text)||/^(?:Authors?[’']? Contact Information|This work is licensed|(?:Author )?Affiliations?\s*[:：])/i.test(text))){excluded++;return}
   if(edge&&(repeated.has(canonical(text))||/^\s*(?:\d+|page\s+\d+(?:\s+of\s+\d+)?)\s*$/i.test(text))||/^(?:©|copyright\b|permission to make\b|ACM Reference Format\b|https?:\/\/doi\.org\/|arXiv:\s*\d)/i.test(text)||b.caption||captionStart(text)){excluded++;return}
   if(text){kept.push(text);argumentBodyBlocks.push(b);}
  });
  // A column change often splits the same sentence. Join only unmistakable
  // continuations; headings, numbered lists and sentence boundaries stay intact.
  const merged=[];for(const t of kept){const previous=merged.at(-1);if(previous&&previous.length>100&&!/[.!?:;。]$/.test(previous)&&/^[a-z]/.test(t)){merged[merged.length-1]=/[a-z]-$/.test(previous)?previous.slice(0,-1)+t:previous+' '+t}else merged.push(t)}
  return{page:p.page,bodyParagraphs:boundedParagraphs(merged),argumentBodyBlocks,argumentAllBlocks:p.blocks,bodyExcluded:excluded,bodyReason:!p.blocks.length?'此页未提取到文字；扫描页需先做 OCR。':!kept.length?referencePage?'参考文献页已从正文翻译中排除。':'此页为标题、作者或非正文内容，已排除。':''};
 });
}
