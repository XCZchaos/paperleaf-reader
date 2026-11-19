// Verify real public layouts on demand. Supply a directory to reuse the named
// PDFs offline, or run with no arguments to fetch each publisher's copy.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {pdfBodyBlocks,extractPaperBody} from '../lib/pdf-body.mjs';
import {newArgumentStudy,validateArgumentStudy,argumentBatches,inspectArgumentParagraphs} from '../lib/argument-study.mjs';

const samples=[
 {name:'attention',url:'https://proceedings.neurips.cc/paper/7181-attention-is-all-you-need.pdf',sha:'d87d482d5ae7960e2e43d7dd6d21377e60e73e8fce1bf2a01aff7aca8a08c537',pages:11,landmarks:['dominant sequence','best models from the literature'],page:1},
 {name:'bert',url:'https://aclanthology.org/N19-1423.pdf',sha:'987545ffb087f1ece898142c403a516baeabeb70ce19089397fac6f7db12c3d4',pages:16,landmarks:['new language representation model','83.1'],page:1},
 {name:'dropout',url:'https://proceedings.mlr.press/v48/gal16.pdf',sha:'bce8ef24a1ccd970cdf741c37872c0941d879ea0c0b8f30c05efb2b4c346dd28',pages:10,landmarks:['Deep learning tools','deep reinforcement learning'],page:1},
 {name:'ligo',url:'https://arxiv.org/pdf/1602.03837',sha:'e5e864c23d015b69be17e5b5d51b5b462d2829353a867513414b6728f54589c4',pages:16,landmarks:['On September 14','luminosity distance'],page:1},
 {name:'rules',url:'https://journals.plos.org/ploscompbiol/article/file?id=10.1371/journal.pcbi.1003285&type=printable',sha:'35648a3880bdd8bf30e8212a3847b7bd35f504ee5ccbd1ad3856d206acd181db',pages:4,landmarks:['We here present','your future self.'],page:2}
];
for(const sample of samples){
 let data;
 if(process.argv[2])data=await fs.readFile(path.join(process.argv[2],sample.name+'.pdf'));
 else{
  const response=await fetch(sample.url,{signal:AbortSignal.timeout(60000)});
  assert(response.ok,'Public PDF unavailable: '+sample.name);data=Buffer.from(await response.arrayBuffer());
 }
 assert.equal(createHash('sha256').update(data).digest('hex'),sample.sha,'PDF revision changed: '+sample.name);
 const doc=await getDocument({data:new Uint8Array(data),useSystemFonts:true}).promise;
 try{
  assert.equal(doc.numPages,sample.pages);
  const pages=[];
  for(let page=1;page<=doc.numPages;page++){
   const pdfPage=await doc.getPage(page),viewport=pdfPage.getViewport({scale:1});
   const content=await pdfPage.getTextContent();
   pages.push({page,height:viewport.height,blocks:pdfBodyBlocks(content.items,viewport.width)});
  }
  const study=validateArgumentStudy(newArgumentStudy({id:sample.name,title:sample.name},extractPaperBody(pages)));
  const owners=study.sources.filter(p=>p.page===sample.page&&sample.landmarks.every(w=>p.original.includes(w)));
  assert.equal(owners.length,1,'Separated landmarks in '+sample.name);
  assert.deepEqual(argumentBatches(study.sources).flat().map(p=>p.id),study.sources.map(p=>p.id));
  assert(!study.sources.some(p=>/^References(?:\s|$)/i.test(p.original)),'Bibliography appeared in body');
  if(sample.name==='ligo')assert(study.excluded.some(p=>p.page===10),'Unlabelled bibliography retained');
  if(sample.name==='rules')assert.deepEqual([...new Set(pages[1].blocks.map(b=>b.column))].sort(),[0,1,2]);
  console.log(JSON.stringify({paper:sample.name,pages:doc.numPages,paragraphs:study.sources.length,review:inspectArgumentParagraphs(study.sources).length,landmark:owners[0].id}));
 }finally{await doc.destroy()}
}
