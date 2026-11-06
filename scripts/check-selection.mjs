import assert from 'node:assert/strict';
import {SelectionSession,selectionLimit} from '../lib/selection-session.mjs';
import {streamPollDelay,streamJobChanged} from '../lib/job-stream.mjs';
const source=(text,page=1)=>({text,page,rects:[[.1,.2,.3,.04]]});
const s=new SelectionSession();
assert.equal(s.select(source('First paragraph.')),'accepted');
assert.equal(s.snapshot.entry.status,'queued');
// No connection: retain and replace the pending selection without starting GPT.
s.select(source('Latest paragraph.',2));assert.equal(s.snapshot.entry.original,'Latest paragraph.');
const first=s.begin();assert.equal(s.busy,true);assert.equal(s.begin(),null);
assert.equal(s.select(source('Do not interrupt.',3)),'busy');assert.equal(s.toggle(),'busy');assert.equal(s.clear(),'busy');assert.equal(s.snapshot.entry.id,first.id);
s.patch(first.id,{text:'Translated',status:'done'});assert.equal(s.busy,false);
s.select(source('Replacement.',1));assert.equal(s.snapshot.entry.text,'');assert.equal(s.snapshot.entry.original,'Replacement.');
assert.equal(s.patch(first.id,{text:'Late output from stale task'}),false);
// Shift toggles one collection that spans pages, never launches on each fragment.
s.toggle();assert.equal(s.snapshot.collecting,true);assert.equal(s.snapshot.entry,null);
s.select(source('A paragraph begins',2));assert.equal(s.begin(),null);
assert.equal(s.select(source('A paragraph begins',2)),'duplicate');
s.select(source('and continues on the next page.',3));assert.equal(s.snapshot.fragments.length,2);
s.toggle();assert.equal(s.snapshot.collecting,false);assert.deepEqual(s.snapshot.entry.pages,[2,3]);assert.equal(s.snapshot.entry.original,'A paragraph begins\n\nand continues on the next page.');assert.deepEqual(s.snapshot.entry.rects,[]);
const cross=s.begin();assert.equal(cross.pages.length,2);s.patch(cross.id,{status:'error',error:'offline'});s.patch(cross.id,{status:'queued'});assert.equal(s.begin().id,cross.id);
s.patch(cross.id,{status:'done'});s.clear();assert.equal(s.snapshot.entry,null);
s.toggle();s.toggle();assert.equal(s.snapshot.entry,null);assert.equal(s.snapshot.collecting,false);
assert.equal(s.select(source('x'.repeat(selectionLimit+1))),'limit');assert.equal(s.snapshot.entry,null);
s.toggle();s.select(source('x'.repeat(selectionLimit-1)));assert.equal(s.select(source('more',2)),'limit');assert.equal(s.snapshot.fragments.length,1);assert.equal(s.toggle(true),'busy');assert.equal(s.snapshot.collecting,true);
const job={id:'1',status:'running',stage:'writing',text:'Hello',updated:1,events:[]};
assert.equal(streamJobChanged(job,{...job}),false);assert.equal(streamJobChanged(job,{...job,text:'World'}),true);assert.equal(streamJobChanged(job,{...job,status:'completed'}),true);assert.equal(streamJobChanged(job,{...job,events:[{id:'x'}]}),true);
assert.equal(streamPollDelay(job,true),220);assert.equal(streamPollDelay(job,false),550);assert.equal(streamPollDelay({...job,retrying:true},true),1000);assert.equal(streamPollDelay(job,true,true),1200);
console.log('PASS: pending login, automatic start gate, in-flight rejection, replacement, cross-page Shift collection, duplicate and size limits, stale output guard, adaptive streaming and unchanged-poll deduplication.');
