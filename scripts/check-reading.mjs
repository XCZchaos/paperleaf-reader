import assert from 'node:assert/strict';
import {pdfParagraphs,boundedParagraphs,paragraphsFromText} from '../lib/pdf-paragraphs.mjs';
import {conversationContext} from '../lib/chat-context.mjs';
const line=(str,x,y,width=200,height=10)=>({str,transform:[height,0,0,height,x,y],height,width,hasEOL:true});
assert.deepEqual(pdfParagraphs([line('A multi-',20,700),line('column paper.',20,687),line('Next paragraph.',32,665),line('In the right column.',300,700),line('This continues.',300,687)]),['A multicolumn paper.','Next paragraph.','In the right column. This continues.']);
assert.deepEqual(pdfParagraphs([]),[]);
assert.deepEqual(pdfParagraphs([line('Heading',20,700,70,16),line('Paragraph under heading.',20,675)]),['Heading','Paragraph under heading.']);
assert.deepEqual(paragraphsFromText('This is one.\nNext line.\n\nNew paragraph.'),['This is one. Next line.','New paragraph.']);
const long=Array.from({length:5000},(_,i)=>`word${i}`).join(' '),chunks=boundedParagraphs([long]);assert(chunks.every(p=>p.length<=6000));assert.equal(chunks.join(' '),long);
const records=Array.from({length:31},(_,i)=>({question:'Question '+i,selection:i===30?'chosen evidence':'',text:'Answer '+i}));let result=conversationContext(records);assert.equal(result.usedTurns,20);assert.equal(result.olderCount,11);assert.equal(result.history[0].text,'Question 11');assert(result.history.at(-2).text.includes('chosen evidence'));assert.equal(result.history.at(-1).text,'Answer 30');
result=conversationContext([...records,{question:'long',text:'x'.repeat(80000)}]);assert(result.excerpted);assert(result.history.every(m=>m.text.length<=12000));assert(result.history.reduce((n,m)=>n+m.text.length,0)<=48000);assert.equal(result.history.length%2,0);assert.equal(conversationContext(records,8).history.length,8);
console.log('PASS: layout-aware paragraph extraction, column boundaries, hyphen repair, bounded long paragraphs, recent paired conversation context, long-answer excerpts and legacy bridge budget.');

const {translationSuggestions}=await import('../lib/translation-models.mjs');const suggestions=translationSuggestions([{id:'gpt-6-luna',name:'Luna',reasoningEfforts:[{id:'low'}]},{id:'gpt-6.1-sol',name:'Sol',reasoningEfforts:[{id:'medium'}]},{id:'other',name:'Other'}]);assert.deepEqual(suggestions.map(s=>s.id),['gpt-6-luna','gpt-6.1-sol']);assert.equal(suggestions[0].effort,'low');assert.equal(suggestions[1].effort,'');assert.deepEqual(translationSuggestions([]),[]);console.log('PASS: translation suggestions only include account-available models and supported reasoning effort.');

const {taskModelAdvice}=await import('../lib/task-models.mjs');const models=[{id:'gpt-6.1-sol',name:'Sol',reasoningEfforts:[{id:'medium'},{id:'low'}]},{id:'gpt-6-astra',name:'Astra',reasoningEfforts:[{id:'high'}]},{id:'gpt-6-luna',name:'Luna',reasoningEfforts:[{id:'low'}]}];assert.equal(taskModelAdvice('metadata',models).options[0].id,'gpt-6-luna');for(const task of ['ask','summary','slides']){const options=taskModelAdvice(task,models).options;assert.equal(options[0].effort,'medium');assert.equal(options.find(o=>o.id==='gpt-6-astra').effort,'high');assert(options.every(o=>models.some(m=>m.id===o.id)))}console.log('PASS: per-feature recommendations honor account model capabilities.');

const {pdfBodyBlocks,extractPaperBody}=await import('../lib/pdf-body.mjs');
const block=(text,y=650)=>({text,x:50,y,bottom:y,height:10,end:550});
const body=extractPaperBody([
 {page:1,height:800,blocks:[block('Paper title',760),block('Alice, Example University',720),block('Abstract',680),block('We develop a new method.',650),block('1 Introduction',600),block('The body must remain intact [1].',570),block('Figure 1: illustration',480),block('1',20)]},
 {page:2,height:800,blocks:[block('Paper title',760),block('2 Methods',680),block('We report a 27% improvement; references to earlier work matter.',650),block('References',300),block('[1] Alice. A study. 2025.',270),block('2',20)]},
 {page:3,height:800,blocks:[block('Paper title',760),block('[2] Bob. More citations. 2024.',650)]},
 {page:4,height:800,blocks:[block('Appendix A',700),block('Additional derivation.',650)]}
]);
assert.deepEqual(body[0].bodyParagraphs,['Abstract','We develop a new method.','1 Introduction','The body must remain intact [1].']);
assert.deepEqual(body[1].bodyParagraphs,['2 Methods','We report a 27% improvement; references to earlier work matter.']);
assert.equal(body[2].bodyParagraphs.length,0);assert.match(body[2].bodyReason,/参考文献/);assert.deepEqual(body[3].bodyParagraphs,['Appendix A','Additional derivation.']);
assert.deepEqual(extractPaperBody([{page:1,height:800,blocks:[block('An article without recognizable headings.')]}])[0].bodyParagraphs,['An article without recognizable headings.']);
assert.deepEqual(pdfBodyBlocks([line('An indented paragraph',32,700),line('continues at the margin.',20,687),line('Next paragraph.',32,670)]).map(b=>b.text),['An indented paragraph continues at the margin.','Next paragraph.']);
assert.equal(pdfBodyBlocks([line('A multi-',20,700),line('column method.',20,687)])[0].text,'A multicolumn method.');
const {makeReadingContext,readingContextSelection,validateReadingContext}=await import('../lib/reading-context.mjs');
const noteContext=makeReadingContext('note','fixture-note',2,'Original evidence.','My interpretation.');assert.match(readingContextSelection(noteContext),/My interpretation/);assert.match(readingContextSelection(noteContext),/Original evidence/);assert.equal(validateReadingContext(noteContext,3).page,2);assert.throws(()=>validateReadingContext(noteContext,1));const excerpt=makeReadingContext('translation','fixture-translation',1,'a'.repeat(9000),'b'.repeat(80000));assert(excerpt.excerpted);assert(readingContextSelection(excerpt,'x'.repeat(8000)).length<=8000);
const {validateAnnotations}=await import('../lib/pdf-annotations.mjs');
const stroke={id:crypto.randomUUID(),page:1,kind:'pen',color:'#9d3c32',width:.003,points:[[.2,.3],[.4,.5]]};const textbox={id:crypto.randomUUID(),page:2,kind:'text',color:'#285a46',x:.1,y:.2,width:.3,height:.1,text:'中文批注',fontSize:.018};assert.deepEqual(validateAnnotations([stroke,textbox],3),[stroke,textbox]);assert.throws(()=>validateAnnotations([stroke,{...textbox,x:.9}],3));assert.throws(()=>validateAnnotations([{...stroke,points:[[Infinity,0]]}],3));assert.throws(()=>validateAnnotations([stroke,stroke],3));assert.throws(()=>validateAnnotations([{...textbox,text:'x'.repeat(5001)}],3));
console.log('PASS: body recognition, repeated margins, front matter/reference exclusion, appendix recovery, indented paragraphs, context bounds and annotation geometry validation.');
const interleaved=[];for(let i=0;i<4;i++){interleaved.push(line(`Left column has continuing content ${i}`,45,700-i*13,240));interleaved.push(line(`Right column has continuing content ${i}`,320,700-i*13,240))}const columns=pdfBodyBlocks(interleaved,612);assert.equal(columns.length,2);assert(columns[0].text.includes('content 3'));assert(!columns[0].text.includes('Right'));assert(columns[1].text.startsWith('Right'));
console.log('PASS: interleaved two-column PDF lines are restored to column reading order.');
