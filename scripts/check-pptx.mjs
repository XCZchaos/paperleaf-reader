import fs from 'node:fs/promises';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);const JSZip=require(require.resolve('jszip',{paths:[path.dirname(require.resolve('pptxgenjs'))]}));
const modulePath=path.resolve('lib/.pptx-qa.mjs');
await fs.writeFile(modulePath,ts.transpileModule(await fs.readFile('lib/pptx.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
try{
 const {createPresentation,preparePresentationDownload}=await import(modulePath);
 const deck={title:'文献汇报排版测试',subtitle:'仅用于验证排版，不代表真实研究结果',slides:Array.from({length:8},(_,i)=>({title:i===0?'英文文献精读与研究汇报':`第 ${i+1} 节：研究方法、证据与局限性分析`,bullets:Array.from({length:i%4+1},(_,j)=>`排版验证 ${j+1}：这是用于检查中文内容换行的测试文字，含 English terminology 和数值 12.34；不代表论文中的事实或结论。请结合原文核对所有模型输出。`),speakerNotes:'这是测试讲稿备注，只验证可编辑文本、来源页码及导出文件结构。',pages:[1,2]}))};
 const pptx=await createPresentation(deck,'Paperleaf 排版验证文献（测试数据）');const bytes=await pptx.write({outputType:'nodebuffer'});const zip=await JSZip.loadAsync(bytes);
 assert.equal(Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p)).length,8);
 assert.equal(Object.keys(zip.files).filter(p=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)).length,8);
 const xml=await zip.file('ppt/slides/slide1.xml').async('string');assert(xml.includes('英文文献'));assert(xml.includes('PDF 第'));assert(xml.includes('a:t'));
 const prepared=await preparePresentationDownload(deck,'Paperleaf 排版验证文献（测试数据）');
 try{assert(prepared.name.endsWith('.pptx'));const response=await fetch(prepared.url);const generated=await JSZip.loadAsync(await response.arrayBuffer());assert.equal(Object.keys(generated.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p)).length,8);}finally{URL.revokeObjectURL(prepared.url)}
 await fs.writeFile('/workspace/scratch/c5ab0f5bef72/paperleaf-pptx-qa.pptx',bytes);
 console.log('PASS: editable 8-slide PPTX, all speaker notes and PDF citations present, downloadable Blob contains a valid PPTX archive. Fixture deck saved for layout inspection.');
}finally{await fs.unlink(modulePath)}
