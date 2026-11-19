import assert from 'node:assert/strict';
import {validateArgumentInput,validateBoundaryDecisions,argumentSchema} from '../companion/argument.mjs';
import {validateRequest,promptFor} from '../companion/research.mjs';
import {newArgumentStudy,reviewArgumentStudy,validateArgumentStudy,generateArgumentStudy,inspectArgumentParagraphs} from '../lib/argument-study.mjs';
import {reviewInput} from '../lib/argument-segmentation.mjs';
import {fixtureBatch,fixtureOverview} from './check-argument.mjs';

const pages=[{page:1,bodyParagraphs:Array.from({length:10},(_,i)=>'Independent experimental observation '+(i+1)+' was reported.')},
 {page:2,bodyParagraphs:['This sentence completes the previous argument. A separate trial used room temperature.','More measurements corroborate the trial.']}];
const base=newArgumentStudy({id:'semantic',title:'Synthetic layout'},pages);
assert.equal(inspectArgumentParagraphs(base.sources).length,0,'the AI must check even completely unflagged source');
const keep=p=>({id:p.id,before:'keep',splits:[],reason:''});
const phases=[],calls=[];
let snapshot=base;
const runTask=async input=>{
 const data=validateRequest({...input,id:crypto.randomUUID()}),a=data.argument;phases.push(a.phase);
 if(a.phase!=='segmentation')return {model:'fixture',argument:a.phase==='paragraphs'?fixtureBatch(a.paragraphs):fixtureOverview(a.sources)};
 calls.push(a);
 assert(argumentSchema(a.phase).required.includes('decisions'));assert(promptFor(data).includes('previous'));
 const decisions=a.paragraphs.map(p=>p.id==='p2-1'?{id:p.id,before:'join',splits:['A separate trial used'],reason:'承接上一段，随后描述独立实验'}:p.id==='p2-2'?{id:p.id,before:'uncertain',splits:[],reason:'实验对象未明确'}:keep(p));
 return {model:'fixture',argument:validateBoundaryDecisions({decisions},a)};
};
const ctrl=new AbortController();
const opts={study:base,signal:ctrl.signal,onProgress:()=>{},runTask,onChange:async s=>{snapshot=validateArgumentStudy(s);ctrl.abort();}};
await assert.rejects(()=>generateArgumentStudy(opts),{name:'AbortError'});
assert.equal(snapshot.review.batches.length,1);assert.equal(snapshot.batches.length,0);
const reviewed=await reviewArgumentStudy({...opts,study:snapshot,signal:new AbortController().signal,onChange:s=>snapshot=validateArgumentStudy(s)});
assert.equal(calls.length,2);assert(calls[0].next.text.startsWith('This sentence'));assert(calls[1].previous.text.includes('10 was reported.'));
assert.deepEqual(phases,['segmentation','segmentation']);assert.equal(reviewed.sources.length,12);
const split=reviewed.sources.find(p=>p.original.startsWith('A separate trial'));assert.equal(split.page,2);
const joined=reviewed.sources.find(p=>p.endPage);assert.equal(joined.page,1);assert.equal(joined.endPage,2);assert(joined.original.endsWith('the previous argument.'));
assert.equal(reviewed.sources.map(p=>p.original).join('').replace(/\s/g,''),base.sources.map(p=>p.original).join('').replace(/\s/g,''));
const result=await generateArgumentStudy({...opts,study:reviewed,signal:new AbortController().signal,onChange:async()=>{}});
assert.equal(calls.length,2);assert.equal(result.batches.flatMap(b=>b.result.paragraphs)[9].original,joined.original);
assert.equal(result.review.batches.at(-1).decisions.at(-1).before,'uncertain');
const first=reviewInput(base.sources,[base.sources[0]]);
for(const wrong of [[],[{...keep(first.paragraphs[0]),id:'p9-9'}],[{...keep(first.paragraphs[0]),before:'join',reason:'no parent'}],[{...keep(first.paragraphs[0]),splits:['Fabricated citation'],reason:'test'}]]){
 assert.throws(()=>validateBoundaryDecisions({decisions:wrong},first));
}
const duplicate=validateArgumentInput({phase:'segmentation',paragraphs:[{id:'p1-1',page:1,original:'A repeated word. A repeated word.'}]});
assert.throws(()=>validateBoundaryDecisions({decisions:[{id:'p1-1',before:'keep',splits:['repeated word'],reason:'ambiguous'}]},duplicate));
const gap=validateArgumentInput({phase:'segmentation',previous:{page:1,text:'before the scan'},paragraphs:[{id:'p3-1',page:3,original:'Text after the scan.'}]});
assert.throws(()=>validateBoundaryDecisions({decisions:[{id:'p3-1',before:'join',splits:[],reason:'test'}]},gap));
assert.throws(()=>validateArgumentStudy({...reviewed,sources:reviewed.sources.map((p,i)=>i?p:{...p,original:'changed'})}));
const cross=newArgumentStudy({id:'split',title:'Crosspage'},[{page:1,bodyParagraphs:['The definition continues']},{page:2,bodyParagraphs:['here as expected. Another intervention began later.']}]);
assert.equal(cross.sources.length,1);const x=cross.sources[0];assert.equal(x.original.slice(x.pageBreaks[0].offset,x.pageBreaks[0].offset+4),'here');
const divided=await reviewArgumentStudy({...opts,study:cross,signal:new AbortController().signal,onChange:()=>{},runTask:async()=>({model:'fixture',argument:{decisions:[{id:x.id,before:'keep',splits:['Another intervention'],reason:'实验切换'}]}})});
assert.deepEqual(divided.sources.map(p=>[p.page,p.endPage]),[[1,2],[2,undefined]]);
console.log('PASS: complete AI coverage, exact split anchors, joins across batches/pages, uncertain boundaries, lossless text and page mapping, pause/resume, invalid decisions and translation/overview ordering. Model decisions in this test are fixtures.');
