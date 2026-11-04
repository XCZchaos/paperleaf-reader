import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {PageText,PaperMetadata} from './ai-types';
import {runCodexTask} from './codex-client';
import {validateMetadata,paperFilename} from '@/companion/research.mjs';
export {paperFilename};
export async function identifyPaper(doc:PDFDocumentProxy,model:string,signal:AbortSignal,onProgress:(message:string)=>void):Promise<PaperMetadata>{
 const pages:PageText[]=[];let count=0;
 for(let n=1;n<=Math.min(3,doc.numPages);n++){if(signal.aborted)throw new DOMException('已停止','AbortError');const content=await(await doc.getPage(n)).getTextContent();const text=content.items.map((x:any)=>typeof x.str==='string'?x.str+(x.hasEOL?'\n':' '):'').join('').trim();if(text)pages.push({page:n,text});count+=text.length;}
 if(!pages.length)throw Error('首页没有可提取的文字，扫描件需先 OCR，或关闭智能识别按文件名导入');
 if(count>160000)throw Error('首页文字过长，无法自动识别，请按文件名导入后手动填写');
 const result=await runCodexTask({kind:'metadata',title:'待识别 PDF',pages,model},signal,j=>onProgress(j.status==='preparing'?'Codex 准备识别…':'GPT 正在识别标题、作者与摘要…'));
 return validateMetadata(result.metadata) as PaperMetadata;
}
