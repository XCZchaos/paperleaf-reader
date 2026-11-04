import type {Deck} from './ai-types';
export async function createPresentation(deck:Deck,paperTitle:string){
 const {default:PptxGenJS}=await import('pptxgenjs');const pptx=new PptxGenJS();
 pptx.layout='LAYOUT_WIDE';pptx.author='Paperleaf';pptx.subject=paperTitle;pptx.title=deck.title;pptx.company='Personal research';
 pptx.theme={headFontFace:'Microsoft YaHei',bodyFontFace:'Microsoft YaHei'};
 const color={ink:'243A31',muted:'738274',accent:'547553',pale:'EEF3E8',paper:'FAFBF7'};
 deck.slides.forEach((s,i)=>{
   const slide=pptx.addSlide();slide.background={color:color.paper};
   slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:.18,h:7.5,line:{color:color.accent},fill:{color:color.accent}});
   slide.addText(i===0?'PAPERLEAF · 文献汇报':`PAPERLEAF · ${String(i+1).padStart(2,'0')}`,{x:.65,y:.38,w:11.8,h:.3,fontSize:11,color:color.accent,charSpacing:2});
   slide.addText(s.title,{x:.65,y:.95,w:12,h:1.1,fontSize:32,bold:true,color:color.ink,breakLine:false,margin:0,fit:'shrink',valign:'middle'});
   const top=2.3,available=3.9,gap=.15,block=(available-gap*(s.bullets.length-1))/s.bullets.length;
   s.bullets.forEach((bullet,j)=>{
     const y=top+j*(block+gap);
     slide.addShape(pptx.ShapeType.roundRect,{x:.65,y,w:12,h:block,rectRadius:.08,line:{color:color.pale},fill:{color:color.pale}});
     slide.addText(String(j+1).padStart(2,'0'),{x:.9,y:y+.12,w:.6,h:block-.24,fontSize:18,bold:true,color:color.accent,margin:0,valign:'middle'});
     slide.addText(bullet,{x:1.7,y:y+.1,w:10.55,h:block-.2,fontSize:20,color:color.ink,margin:0,breakLine:false,fit:'shrink',valign:'middle',paraSpaceAfter:4});
   });
   const pages=s.pages.length?'PDF 第 '+s.pages.join('、')+' 页':'未标注来源页码 · 请核对';
   slide.addText(paperTitle.slice(0,75),{x:.65,y:6.65,w:9.5,h:.3,fontSize:10,color:color.muted,margin:0,fit:'shrink'});
   slide.addText(pages,{x:.65,y:7.03,w:11,h:.22,fontSize:10,color:color.muted,margin:0});
   slide.addText(`${i+1} / ${deck.slides.length}`,{x:11.7,y:6.98,w:.9,h:.3,fontSize:11,color:color.accent,align:'right',margin:0});
   slide.addNotes(`${s.speakerNotes}\n\n来源文献：${paperTitle}\n${pages}\n本汇报由 GPT 辅助整理，需结合原文核对。`);
 });
 return pptx;
}
export async function preparePresentationDownload(deck:Deck,paperTitle:string){const pptx=await createPresentation(deck,paperTitle);const blob=await pptx.write({outputType:'blob',compression:true}) as Blob;return {url:URL.createObjectURL(blob),name:`${deck.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,80)||'文献汇报'}.pptx`};}
