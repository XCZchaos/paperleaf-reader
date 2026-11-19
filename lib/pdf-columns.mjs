// A reading gutter needs several aligned baselines with prose on both sides.
// Score only that vertical band so a wide title or abstract can span columns.
export function pageGutters(lines,width) {
 if (!width) return [];
 const rows=lines.filter(l=>!l.caption&&l.text.trim().length>=18&&l.end-l.x>width*.08);
 if(rows.length<8)return [];
 const step=Math.max(3,width/140),scores=[];
 for(let cut=width*.16;cut<width*.84;cut+=step){
  const left=rows.filter(l=>l.end<=cut+1&&l.end>=cut-width*.095);
  const right=rows.filter(l=>l.x>=cut-1&&l.x<=cut+width*.075);
  if(left.length<4||right.length<4)continue;
  const byY=left.slice().sort((a,b)=>a.y-b.y),aligned=[];
  let k=0;
  for(const r of right.slice().sort((a,b)=>a.y-b.y)){
   while(k+1<byY.length&&Math.abs(byY[k+1].y-r.y)<=Math.abs(byY[k].y-r.y))k++;
   const near=byY[k];
   if(Math.abs(near.y-r.y)<=Math.max(r.height,near.height)*1.15)aligned.push(r);
  }
  if(aligned.length<4)continue;
  const ys=aligned.map(l=>l.y),bottom=Math.min(...ys),top=Math.max(...ys);
  if(top-bottom<aligned[0].height*3)continue;
  const crossing=rows.filter(l=>l.y>=bottom&&l.y<=top&&l.x<cut-2&&l.end>cut+2).length;
  const support=Math.min(aligned.length,left.length);
  if(crossing>support*.32)continue;
  // Prefer the empty centre of a gutter over the first glyph in either lane.
  const leftEnd=left.map(l=>l.end).sort((a,b)=>b-a)[Math.floor(left.length*.15)];
  const rightStart=right.map(l=>l.x).sort((a,b)=>a-b)[Math.floor(right.length*.15)];
  scores.push({cut,score:support/(1+crossing*.7)-Math.abs(cut-(leftEnd+rightStart)/2)/width});
 }
 const cuts=[];
 for(const item of scores.sort((a,b)=>b.score-a.score)){
  if(cuts.every(cut=>Math.abs(item.cut-cut)>=width*.2))cuts.push(item.cut);
  if(cuts.length===2)break;
 }
 return cuts.sort((a,b)=>a-b);
}
