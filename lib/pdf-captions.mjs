// Restrict a caption to its own text lane before column reading order is restored.
const label = /^(?:(?:fig(?:ure)?|tab(?:le)?|scheme|plate|chart)\.?\s*(?:S?\d+(?:[.\-]\d+)*[a-z]?|[IVX]+)|[图表]\s*[S\d一二三四五六七八九十]+)\s*/i;
export function captionStart(text) {
 const m = text.trim().match(label);
 if (!m) return false;
 const rest = text.trim().slice(m[0].length);
 return !rest || /^[.:：．|｜—–]/u.test(rest);
}
const endsSentence = text => /[.!?。！？]["”')\]]?$/u.test(text.trim());
const sameFont = (a,b) => !a.font || !b.font || a.font === b.font;
const joinLine = (a,b) => /[a-z]-$/.test(a) && /^[a-z]/.test(b) ? a.slice(0,-1)+b : a+' '+b;

// Return each original prose line untouched. Combining non-contiguous caption
// lines here works for both content-stream order and baseline-interleaved PDFs.
export function collectCaptions(lines) {
 const sorted = [...lines].sort((a,b)=>b.y-a.y||a.x-b.x);
 const consumed = new Set(), replacements = new Map();
 for (let i=0;i<sorted.length;i++) {
  const first=sorted[i];
  if (consumed.has(first)||!captionStart(first.text)) continue;
  let last=first, text=first.text.trim(), right=first.end;
  for (let j=i+1;j<sorted.length;j++) {
   const row=sorted[j], h=first.height, gap=last.y-row.y;
   if (gap>h*1.9) break;
   if (gap<h*.55||consumed.has(row)||row.x<first.x-h*1.5||row.x>first.x+h*3) continue;
   if (captionStart(row.text)||!sameFont(first,row)||Math.abs(row.height-h)>h*.14) break;
   // The next indented or much wider normal-size line is often the body
   // returning below a float, even when the publisher reused the same font.
   if (endsSentence(text)&&(row.x>first.x+h*.65||row.end>right+h*3||gap>h*1.44)) break;
   if (endsSentence(text)&&(!first.font||/^[A-Z]/.test(row.text))&&Math.abs(row.x-first.x)<h*.55) break;
   text=joinLine(text,row.text.trim());right=Math.max(right,row.end);
   consumed.add(row);last=row;
  }
  replacements.set(first,{...first,text,end:right,bottom:last.y,caption:true});
 }
 return lines.filter(l=>!consumed.has(l)).map(l=>replacements.get(l)||l);
}
