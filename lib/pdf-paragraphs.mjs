// Layout-aware extraction in PDF.js reading order. Never ask GPT to reconstruct
// missing scan text. Very long paragraphs are split at sentence/word boundaries.
export function boundedParagraphs(paragraphs,max=6000){
 const out=[];
 for(let text of paragraphs){text=text.trim();while(text.length>max){let cut=Math.max(text.lastIndexOf('. ',max-1),text.lastIndexOf('。',max-1),text.lastIndexOf('; ',max-1));if(cut<max/2)cut=text.lastIndexOf(' ',max);if(cut<max/2)cut=max;else cut++;out.push(text.slice(0,cut).trim());text=text.slice(cut).trim();}if(text)out.push(text);}
 return out;
}
export function paragraphsFromText(text){return boundedParagraphs(String(text||'').split(/\n\s*\n/).map(p=>p.replace(/([a-z])-\n(?=[a-z])/g,'$1').replace(/\s*\n\s*/g,' ').replace(/[ \t]+/g,' ')));}
export function pdfParagraphs(items){
 const lines=[];let line=null;
 const flush=()=>{if(line?.text.trim())lines.push(line);line=null;};
 for(const item of items){
  if(typeof item.str!=='string')continue;
  const x=Number(item.transform?.[4]||0),y=Number(item.transform?.[5]||0),height=Math.max(1,Math.abs(Number(item.height||item.transform?.[3]||10))),width=Math.abs(Number(item.width||0));
  if(line&&Math.abs(y-line.y)>Math.max(2,height*.45))flush();
  if(!line)line={text:'',x,y,height,end:x};
  const gap=x-line.end;line.text+=(line.text&&!/\s$/.test(line.text)&&item.str&&!/^\s/.test(item.str)&&gap>height*.12?' ':'')+item.str;line.end=Math.max(line.end,x+width);line.height=Math.max(line.height,height);
  if(item.hasEOL)flush();
 }
 flush();if(!lines.length)return [];
 const paragraphs=[];let text='',previous=null;
 for(const current of lines){
  const gap=previous?previous.y-current.y:0,indent=previous?current.x-previous.x:0;
  const boundary=previous&&(gap< -previous.height*.7||gap>Math.max(current.height,previous.height)*1.65||Math.abs(indent)>Math.max(8,current.height*.8)||Math.abs(current.height-previous.height)>previous.height*.25);
  if(boundary&&text){paragraphs.push(text);text='';}
  if(text&&/[a-z]-$/.test(text)&&/^[a-z]/.test(current.text))text=text.slice(0,-1)+current.text;
  else text+=(text?' ':'')+current.text;
  previous=current;
 }
 if(text)paragraphs.push(text);
 return boundedParagraphs(paragraphs);
}
