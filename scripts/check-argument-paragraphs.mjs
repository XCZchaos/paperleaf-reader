import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pdfBodyBlocks,extractPaperBody} from '../lib/pdf-body.mjs';
import {newArgumentStudy,argumentBatches,validateArgumentStudy} from '../lib/argument-study.mjs';
import {validateArgumentInput} from '../companion/argument.mjs';
import {argumentHtml} from '../lib/argument-html.mjs';

const paper={id:'formula-test',title:'Test of paragraph boundaries'};
const line=(str,x,y,width=80,height=10)=>({str,height,width,transform:[height,0,0,height,x,y],hasEOL:true});
const page=(n,items)=>({page:n,height:800,blocks:pdfBodyBlocks(items,600)});
const natural=pages=>newArgumentStudy(paper,extractPaperBody(pages));
const intro='The decoder is trained by minimizing the loss:';
const next='The loss is evaluated at sampled points.';
const sources=[
 page(1,[line('Abstract',35,740),line('An independent paragraph.',35,700),line(intro,35,650),
  line('L =',70,620,15),line('∑',96,625,10),line('x',100,614,5,7),line('f(x)',115,620,25),line('2',142,626,5,7),line('. (4)',185,620,20),
  line(next,35,590),line('A second paragraph begins with a cross-',45,550)]),
 page(2,[line('page continuation before closing.',35,730),line('2 Methods',35,670),line('We collect distinct observations.',35,647),line('The final paragraph stands alone.',45,615)])
];
const study=natural(sources),owner=study.sources.find(p=>p.original.includes('(4)'));
assert(owner.original.includes(intro)&&owner.original.includes(next),owner.original);
assert.match(owner.original,/L = ∑ x f\(x\) 2 \. \(4\)/);
assert.equal(study.sources.filter(p=>p.original.includes('(4)')).length,1);
assert(!owner.original.includes('A second paragraph'));
const cross=study.sources.find(p=>p.endPage);assert.equal(cross.original,'A second paragraph begins with a crosspage continuation before closing.');
assert.equal(cross.page,1);assert.equal(cross.endPage,2);
assert(argumentHtml(study).includes('PDF PAGE 01–02'));assert.equal(validateArgumentStudy(study).sources.find(p=>p.endPage).endPage,2);
assert(study.sources.some(p=>p.original.includes('2 Methods')&&!p.original.includes('crosspage')));
const bullets=newArgumentStudy(paper,[{page:1,bodyParagraphs:['Items are as follows:','• First independent item.','• Second independent item.']}]);
assert.equal(bullets.sources.length,3);
const col=(text,column,y,extra={})=>({text,column,x:column?320:50,y,bottom:y,height:10,atMargin:true,indentedStyle:true,...extra});
const wrap=newArgumentStudy(paper,[{page:1,argumentBodyBlocks:[col('One finished sentence.',0,100,{fullLastLine:true}),col('Another sentence in the same paragraph.',1,700),col('Next clearly indented paragraph.',1,660,{atMargin:false,x:330})]}]);
assert.deepEqual(wrap.sources.map(p=>p.original),['One finished sentence. Another sentence in the same paragraph.','Next clearly indented paragraph.']);
const sparse=newArgumentStudy(paper,[{page:1,bodyParagraphs:['An unfinished sentence']},{page:2,bodyParagraphs:[]},{page:3,bodyParagraphs:['after a scanned page.']}]);
assert.equal(sparse.sources.length,2);assert.equal(sparse.excluded[0].page,2);
const unit='Some very long, genuinely continuous prose. '.repeat(320).trim();
const long=newArgumentStudy(paper,[{page:1,bodyParagraphs:['First paragraph.',unit,'Last paragraph.']}]);
assert.deepEqual(argumentBatches(long.sources).map(b=>b.length),[1,1,1]);assert.equal(long.sources[1].original,unit);
validateArgumentInput({phase:'paragraphs',paragraphs:[long.sources[1]]});
assert.throws(()=>validateArgumentInput({phase:'paragraphs',paragraphs:long.sources.slice(0,2)}));
const legacy=structuredClone(study);delete legacy.paragraphVersion;
assert.equal(validateArgumentStudy(legacy).paragraphVersion,undefined);
assert(!natural([page(1,[line('A finished statement.',35,620),line('A second statement.',45,590)])]).sources.some(p=>p.original.includes('finished')&&p.original.includes('second')));
console.log('PASS: formula glyph reading order, equation label and explanation in one source, page citations, heading/list boundaries, excluded pages, intact long paragraph and legacy records.');
if(process.argv[2]){
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const doc=await getDocument({data:new Uint8Array(await fs.readFile(process.argv[2])),useSystemFonts:true}).promise;
 try{
  const raw=[];for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n),v=p.getViewport({scale:1}),c=await p.getTextContent();raw.push({page:n,height:v.height,blocks:pdfBodyBlocks(c.items,v.width)})}
  const real=natural(raw);const eq=real.sources.filter(p=>p.page===4&&p.original.includes('(4)'));
  assert.equal(eq.length,1);assert(/reconstruction loss:/i.test(eq[0].original));assert(/\(4\).*The loss is minimized/s.test(eq[0].original));
  assert(eq[0].original.indexOf('∑')<eq[0].original.indexOf('(4)'));assert(!eq[0].original.includes('4.2 Physics'));
  if(doc.numPages===12){
   const wrapped=real.sources.filter(p=>p.page===4&&p.original.startsWith('To address this,'));
   assert.equal(wrapped.length,1);assert.match(wrapped[0].original,/neural field-based representations, such as/);
   assert.match(wrapped[0].original,/Symmetric Representation \(Sec\. 4\.1\)\.$/);
   assert(!real.sources.some(p=>p.original.includes('128 (left) and super-resolution')));
   assert(real.sources[0].page===1,'retain unlabelled abstract');
  }
  const groups=argumentBatches(real.sources);
  assert(groups.flat().filter(p=>p.id===eq[0].id).length===1);
  console.log(JSON.stringify({paper:'MIND',pages:doc.numPages,paragraphs:real.sources.length,formula:4,page:4,paragraphId:eq[0].id,checks:'loss definition, sum, number and following explanation in one paragraph; next section separate'}));
 }finally{await doc.destroy()}
}

// The same fixtures cover different fonts, gutter widths and content stream
// orders without relying on a particular title, identifier or page number.
const {inspectArgumentParagraphs}=await import('../lib/argument-study.mjs');
const {pageGutters}=await import('../lib/pdf-columns.mjs');
for(const lanes of [[50],[45,335],[52,228,405]]){
 const width=lanes.length===1?480:lanes.length===2?230:152;
 const items=[];
 for(let row=0;row<8;row++)for(const [column,x] of lanes.entries())items.push(line(`Column ${column+1} continues on line ${row+1}.`,x,680-row*13,width,10));
 const blocks=pdfBodyBlocks(items,615);
 assert.deepEqual(blocks.map(b=>b.column),lanes.map((_,i)=>i),'reading order for '+lanes.length+' columns');
 for(const [i,b] of blocks.entries())assert(!b.text.includes(`Column ${(i+1)%lanes.length+1} `)||lanes.length===1);
}
assert.deepEqual(pageGutters([],615),[]);
const withFont=(text,x,y,w,h,font)=>({...line(text,x,y,w,h),fontName:font});
const sideCaption=[withFont('Figure 8: The measured specimen',30,650,104,8,'caption'),withFont('is shown under load.',30,640,98,8,'caption')];
const prose=[withFont('The specimen changes its shape',150,667,145,10,'body'),withFont('when the applied field increases,',150,655,145,10,'body'),withFont('and its response becomes continu-',150,643,145,10,'body'),withFont('ous under repeated measurements.',30,630,265,10,'body')];
for(const input of [[...sideCaption,...prose],[...prose,...sideCaption].sort((a,b)=>b.transform[5]-a.transform[5])]){
 const pages=extractPaperBody([{page:1,height:800,blocks:pdfBodyBlocks(input,600)}]);
 const body=newArgumentStudy(paper,pages),all=newArgumentStudy(paper,pages,'all');
 assert.equal(body.sources.length,1);
 assert.match(body.sources[0].original,/increases, and its response becomes continuous under repeated/);
 assert(!body.sources[0].original.includes('shown under load'));
 assert.equal(all.sources.filter(p=>p.original.startsWith('Figure 8:')&&p.original.endsWith('under load.')).length,1);
 assert(!all.sources.some(s=>s.original.includes('under load.')&&s.original.includes('applied field')));
}
const references=extractPaperBody([{page:1,height:800,blocks:[col('Body text reports a finding.',0,725),col('[1] A. Author, Journal 12 (2001).',0,680),col('[2] B. Author, Journal 15 (2002).',0,658),col('[3] C. Author, Journal 16 (2003).',0,635),col('p. 321.',0,613),col('Appendix A',0,590),col('Supplementary results follow.',0,560)]}]);
assert.deepEqual(references[0].bodyParagraphs,['Body text reports a finding.','Appendix A','Supplementary results follow.']);
const flagged=inspectArgumentParagraphs(['. (8)','terms on the left,','6 7 8 9 controls','A short but complete claim.','Figure 1: Some data','• One bullet'].map((original,i)=>({id:'p1-'+(i+1),page:1,original})));
assert.deepEqual(flagged.map(x=>x.id),['p1-1','p1-2','p1-3']);
console.log('PASS: independent 1/2/3-column layouts, wrapped caption/prose with both source orders, intact words, independent captions in all-text mode, headingless bibliography and flagged fragments.');
