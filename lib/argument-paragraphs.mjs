// Reconstruct logical paragraphs before assigning IDs or sending any batches.
// Keep distinct source blocks unless there is evidence of a continuation.
const numberedLabel = /^[.,;:，。\s]*(?:\(\s*\d+(?:[.\-]\d+)*(?:[a-z])?\s*\)|\[\d+[a-z]?\])[.,;:\s]*$/i;
const symbols = /[=≠≈≡≤≥∑∏∫∂∇√∞∈⊂∥‖∀⊗→−×±α-ωΑ-Ω\u2100-\u214f\u{1d400}-\u{1d7ff}]/u;
const numberPrefix = /^(?:\d+(?:\.\d+)*\.?|[IVX]+\.)\s+(?=\p{Lu})/u;
const sectionNames = /^(?:abstract|introduction|methods?|results?|discussion|conclusions?|references|bibliography|acknowledg(?:e)?ments?|appendix(?:\s+[A-Z])?|supplementary (?:material|methods))\s*[:.]?$/i;
const listItem = /^(?:[•●▪◦]|[-–]\s+|\([a-z\d]{1,3}\)\s+\p{Lu}|\d+[.)]\s+[a-z])/u;
const explanatory = /^(?:where(?:in)?|in which|with|such that|denot(?:ing|es)|here|and where|with respect to|(?:the|this|each|both) (?:loss|term|sum|equation|expression|parameter|variable|quantity|objective)s?)\b/i;
const closed = /[.!?。！？](?:[”’"'\])}]+)?$/u;
const leadingContinuation = /^(?:[a-z]|[,;:)=\]≥≤+−])/;
const clearIndent = (b,prior) => b && prior && Number.isFinite(b.x)&&Number.isFinite(prior.x) && b.y<prior.bottom && b.x-prior.x>Math.max(5,b.height*.55);
const words = text => text.match(/[A-Za-z]{3,}/g)||[];

function heading(text) {
 if(sectionNames.test(text))return true;
 if(text.length>120||/[.!?;:][\s]|[!?;:=]|[,.]$/.test(text))return false;
 if(numberPrefix.test(text))return true;
 const parts=text.split(/\s+/);
 return parts.length>=2&&parts.length<=9&&parts.every(w=>/^[A-Z][A-Za-z-]+$/.test(w)||/^(?:of|for|in|to|a|an|the|and|with|on|from|via)$/i.test(w))&&!symbols.test(text);
}

export function mathBlock(text) {
 if(numberedLabel.test(text))return true;
 const lex=words(text);
 if(symbols.test(text)&&lex.filter(w=>! /^(?:sin|cos|tan|log|exp|arg|min|max|lim|diag|det|norm|sum|frac|decoder|encoder)$/i.test(w)).length<3)return true;
 return text.length<125&&lex.length===0&&/^[\p{L}\p{N}\p{M}\p{Sm}\p{So}\s.,:;()[\]{}|_^'’/-]+$/u.test(text);
}

// PDF.js emits math glyphs in content-stream order. Sorting a summation's
// baseline, subscript and superscript by Y would move the label ahead of it.
export function groupEquationLines(lines,columnAt) {
 const result=[];let group=null,previous=null;
 for(const line of lines){
  const math=mathBlock(line.text.trim());
  const nearby=group&&columnAt(group)===columnAt(line)&&Math.abs(line.y-group.y)<=Math.max(group.height,line.height)*1.8;
  if(math&&nearby&&!/\(\s*\d+[a-z]?\s*\)\s*[.,]?$/i.test(previous.text.trim())){
   group.text=join(group.text.trimEnd(),line.text.trim());
   group.x=Math.min(group.x,line.x);group.end=Math.max(group.end,line.end);
   group.height=Math.max(group.height,line.height);
  }else{
   group=math?{...line,displayMath:true}:null;
   result.push(group||line);
  }
  previous=line;
 }
 return result;
}

function join(left,right) {
 if(/[a-z]-$/.test(left)&&/^[a-z]/.test(right))return left.slice(0,-1)+right;
 return left+(/^[.,;:!?)](?!\s*\()/u.test(right)?'':' ')+right;
}

export function naturalArgumentParagraphs(pages,mode='body') {
 const sources=[],excluded=[];let prior=null;
 for(const page of pages){
  const chosen=mode==='body'?page.argumentBodyBlocks:page.argumentAllBlocks;
  const fallback=mode==='body'?page.bodyParagraphs:page.paragraphs;
  const blocks=(chosen??(fallback||[]).map(text=>({text}))).filter(b=>typeof b.text==='string'&&b.text.trim());
  if(!blocks.length){excluded.push({page:page.page,reason:page.bodyReason||'此页未提取到可读正文。扫描页需先做 OCR。'});prior=null;continue;}
  let index=0;
  for(let i=0;i<blocks.length;i++){
   const block=blocks[i],text=block.text.trim(),last=sources.at(-1);
   const numberTitle=/^\d+(?:\.\d+)*\.?$/.test(text)&&blocks[i+1]&&heading(blocks[i+1].text.trim());
   const isHeading=numberTitle||heading(text),isMath=!isHeading&&mathBlock(text);
   const adjacent=prior&&(prior.page===page.page||prior.page===page.page-1&&i===0);
   const list=listItem.test(text);
   const sectionStart=numberPrefix.test(text)||sectionNames.test(text);
   const changedColumn=adjacent&&(prior.page!==page.page||prior.block.column!==block.column);
   let continuation=false;
   if(adjacent&&!list){
    if(isHeading)continuation=prior.numberTitle;
    else if(sectionStart)continuation=false;
    else if(prior.heading)continuation=true;
    else if(isMath)continuation=prior.math||!closed.test(prior.text)||numberedLabel.test(text)||/\b(?:equation|given by|defined as|as follows|loss)\s*[.:]$/i.test(prior.text);
    else if(prior.math)continuation=explanatory.test(text)||leadingContinuation.test(text)||prior.unanchored;
    else if(changedColumn&&prior.block.fullLastLine&&block.atMargin&&block.indentedStyle)continuation=true;
    else if(!closed.test(prior.text)&&!/[;:]$/.test(prior.text)){
     const wrapped=leadingContinuation.test(text)||/[a-z]-$/.test(prior.text)||/^(?:[A-Z]{2,}\b|[A-Z]\s*[=(])/.test(text);
     continuation=wrapped&&(!clearIndent(block,prior.block)||/[a-z]-$/.test(prior.text));
    }
   }
   if(continuation&&last){
    last.original=prior.heading&&!prior.numberTitle?last.original+'\n'+text:join(last.original,text);
    if(page.page>last.page)last.endPage=page.page;
   }else{
    sources.push({id:`p${page.page}-${++index}`,page:page.page,original:text});
   }
   prior={text,page:page.page,block,math:isMath,heading:isHeading,numberTitle,unanchored:isMath&&(!continuation||prior?.unanchored)};
  }
 }
 return {sources,excluded};
}
