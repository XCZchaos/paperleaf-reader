import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import ts from 'typescript';
const root=process.cwd(),sql=new DatabaseSync(':memory:'),session=new AsyncLocalStorage(),files=new Map();
for(const file of (await fs.readdir('drizzle')).filter(s=>s.endsWith('.sql')).sort())sql.exec(await fs.readFile(path.join('drizzle',file),'utf8'));
const DB={prepare(query){return{bind(...params){const statement=sql.prepare(query);return{first:async()=>statement.get(...params)||null,all:async()=>({results:statement.all(...params)}),run:async()=>statement.run(...params)}}}},batch:async stmts=>Promise.all(stmts.map(s=>s.run()))};
const BUCKET={put:async(key,data)=>files.set(key,new Uint8Array(data)),delete:async key=>files.delete(key),get:async key=>{const data=files.get(key);return data?{body:new Response(data).body,size:data.length}:null;}};
let providerCalls=0;
const context=vm.createContext({Request,Response,Headers,File,FormData,Blob,TextEncoder,TextDecoder,crypto,URL,AbortSignal,console,Date,fetch:async()=>{providerCalls++;return Response.json({responseStatus:200,responseData:{translatedText:'该方法提高了模型性能。'}})}});
const cache=new Map();
async function moduleFor(file){if(cache.has(file))return cache.get(file);let mod;
 if(file==='cloudflare:workers'){mod=new vm.SyntheticModule(['env'],function(){this.setExport('env',{DB,BUCKET,PAPERLEAF_PASSWORD_PEPPER:'automated-fixture-only-pepper-never-used-in-production'})},{context});}
 else if(file==='next/headers'){mod=new vm.SyntheticModule(['headers'],function(){this.setExport('headers',async()=>session.getStore().headers)},{context});}
 else if(file==='next/navigation'){mod=new vm.SyntheticModule(['redirect'],function(){this.setExport('redirect',()=>{throw Error('redirect')})},{context});}
 else{const source=await fs.readFile(file,'utf8');const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;mod=new vm.SourceTextModule(output,{identifier:file,context});}
 cache.set(file,mod);await mod.link(async(spec,ref)=>{if(spec==='cloudflare:workers'||spec.startsWith('next/'))return moduleFor(spec);const full=spec.startsWith('@/')?path.join(root,spec.slice(2)):path.resolve(path.dirname(ref.identifier),spec);return moduleFor(path.extname(full)?full:full+'.ts')});await mod.evaluate();return mod;
}
const jars=new Map();
const routes={};for(const [name,file] of Object.entries({account:'app/api/account/route.ts',reading:'app/api/reading-state/route.ts',papers:'app/api/papers/route.ts',paper:'app/api/papers/[id]/route.ts',file:'app/api/papers/[id]/file/route.ts',notes:'app/api/notes/route.ts',collections:'app/api/collections/route.ts',research:'app/api/research/route.ts',translate:'app/api/translate/route.ts'}))routes[name]=(await moduleFor(path.join(root,file))).namespace;
async function call(route,method='GET',{owner='test-owner',device='browser',body,id,query='',origin,cookie}={}){const headers={};if(owner){headers['oai-authenticated-user-id']=owner;headers['oai-authenticated-user-email']=owner+'@test.invalid'}if(origin)headers.origin=origin;const key=owner+':'+device;const stored=cookie??jars.get(key);if(stored)headers.cookie=stored;const request=new Request('https://test.local/api/'+route+query,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const response=await session.run(request,()=>routes[route][method](request,{params:Promise.resolve({id})}));const updated=response.headers.get('set-cookie');if(updated)jars.set(key,updated.split(';')[0]);return response;}
async function data(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
await data(await call('papers','GET',{owner:null}),401);
await data(await call('papers'),401);
assert.equal((await data(await call('account','GET',{owner:null}))).platformSignedIn,false);
assert.equal((await data(await call('account'))).hasAccount,false);
const password='Fixture-password-1!';
const registration={action:'register',username:'Reader.One',displayName:'Reader One',password,confirmPassword:password,remember:true};
await data(await call('account','POST',{body:registration,origin:'https://evil.invalid'}),403);
await data(await call('account','POST',{body:{...registration,password:'short',confirmPassword:'short'}}),400);
// Existing records keep their Sites owner, so registration does not migrate or discard them.
sql.prepare('INSERT INTO collections (id,owner,name,created) VALUES (?,?,?,?)').run('pre-account','test-owner','Pre-account collection',1);
const registered=await call('account','POST',{body:registration});
assert.match(registered.headers.get('set-cookie'),/^__Host-paperleaf-session=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
const account=await data(registered);assert.equal(account.account.username,'reader.one');assert.match(account.recoveryCode,/^[a-f0-9]{64}$/);
const storedAccount=sql.prepare('SELECT * FROM accounts WHERE owner=?').get('test-owner');assert.notEqual(storedAccount.password_hash,password);assert.notEqual(storedAccount.recovery_hash,account.recoveryCode);assert.equal(storedAccount.password_hash.length,64);
assert.equal((await data(await call('collections')))[0].name,'Pre-account collection');
await data(await call('account','POST',{body:registration}),400);
await data(await call('account','POST',{owner:'another-owner',body:registration}),400);
await data(await call('account','POST',{owner:'another-owner',body:{...registration,username:'reader.two'}}));
// A new device needs both platform identity and the independent Paperleaf session.
await data(await call('papers','GET',{device:'desktop'}),401);
await data(await call('account','POST',{device:'desktop',body:{action:'login',username:'reader.one',password,remember:true}}));
assert.equal((await data(await call('account','GET',{device:'desktop'}))).account.id,'test-owner');
const browserCookie=jars.get('test-owner:browser');
await data(await call('papers','GET',{owner:'another-owner',cookie:browserCookie}),401);

await data(await call('collections','POST',{body:{name:'Test topic'},origin:'https://evil.invalid'}),403);
const collection=await data(await call('collections','POST',{body:{name:'Test topic'}}));assert(collection.id);
const pdf=await fs.readFile('public/guide.pdf');
function upload(){const f=new FormData();f.append('file',new File([pdf],'guide.pdf',{type:'application/pdf'}));f.append('title','Testing a real PDF');f.append('pages','3');f.append('collection',collection.id);for(const [key,value] of Object.entries({authors:'Alice Example; Bob Example',year:'2026',journal:'Fixture Journal',doi:'10.1234/fixture',abstract:'A fixture abstract.',tags:'["测试"]',filename:'2026 - Alice Example - Testing a real PDF.pdf',metadataSource:'gpt'}))f.append(key,value);return f;}
const p=await data(await call('papers','POST',{body:upload()}));assert.equal(p.pages,3);assert.equal(p.title,'Testing a real PDF');assert.equal(files.size,1);
assert.equal(p.authors,'Alice Example; Bob Example');assert.equal(p.year,'2026');assert.equal(p.journal,'Fixture Journal');assert.equal(p.doi,'10.1234/fixture');assert.equal(p.abstract,'A fixture abstract.');assert.equal(p.originalFilename,'guide.pdf');assert.equal(p.metadataSource,'gpt');assert.deepEqual(p.tags,['测试']);
const duplicate=await data(await call('papers','POST',{body:upload()}));assert.equal(duplicate.duplicate,true);assert.equal(duplicate.id,p.id);
const bad=new FormData();bad.append('file',new File(['not actually a pdf'],'bad.pdf'));await data(await call('papers','POST',{body:bad}),400);
const served=await call('file','GET',{id:p.id});assert.equal(served.status,200);assert.equal(Buffer.compare(Buffer.from(await served.arrayBuffer()),pdf),0);
assert(served.headers.get('content-disposition').endsWith(encodeURIComponent(p.filename)));
const renamed=await data(await call('paper','PATCH',{id:p.id,body:{filename:'2026: corrected/name',journal:'Corrected Journal',abstract:'Edited abstract.'}}));assert.equal(renamed.filename,'2026_ corrected_name.pdf');assert.equal(renamed.originalFilename,'guide.pdf');assert.equal(renamed.journal,'Corrected Journal');assert.equal(renamed.abstract,'Edited abstract.');
const n=await data(await call('notes','POST',{body:{paperId:p.id,text:'A verified research note',quote:'An excerpt',rects:[[.1,.2,.3,.05]],page:2,color:'green'}}));assert.equal(n.page,2);
const list=await data(await call('papers'));assert.equal(list[0].noteCount,1);
assert.equal((await data(await call('papers','GET',{owner:'another-owner'}))).length,0);
await data(await call('paper','PATCH',{owner:'another-owner',id:p.id,body:{title:'bad'}}),404);
await data(await call('file','GET',{owner:'another-owner',id:p.id}),404);
await data(await call('notes','PATCH',{owner:'another-owner',body:{id:n.id,text:'bad'}}),404);
await data(await call('notes','POST',{owner:'another-owner',body:{paperId:p.id,text:'bad'}}),404);
const updated=await data(await call('paper','PATCH',{id:p.id,body:{page:100,favorite:true,tags:['test'],status:'reading',opened:true}}));assert.equal(updated.page,3);assert.equal(updated.favorite,true);
await data(await call('notes','PATCH',{body:{id:n.id,text:'Updated note'}}));const notes=await data(await call('notes','GET',{query:'?paper='+p.id}));assert.equal(notes[0].text,'Updated note');assert.equal(notes[0].rects.length,1);
await data(await call('translate','POST',{body:{text:'This method improves model performance.'}}),410);assert.equal(providerCalls,0);
const researchInput={id:crypto.randomUUID(),paperId:p.id,kind:'ask',question:'What is the method?',text:'Test answer [p.2]',pages:[1,2,3],page:2,model:'test-model'};
const research=await data(await call('research','POST',{body:researchInput}));assert.equal(research.page,2);
await data(await call('research','POST',{body:researchInput}));assert.equal((await data(await call('research','GET',{query:'?paper='+p.id}))).length,1);
assert.equal((await data(await call('research','GET',{owner:'another-owner',query:'?paper='+p.id}))).length,0);
await data(await call('research','POST',{owner:'another-owner',body:researchInput}),404);
await data(await call('research','POST',{body:{...researchInput,id:crypto.randomUUID(),pages:[4]}}),400);
const validDeck={title:'Fixture',subtitle:'Test only',slides:[{title:'Method',bullets:['Fixture bullet'],speakerNotes:'Test notes',pages:[2]}]};
await data(await call('research','POST',{body:{...researchInput,id:crypto.randomUUID(),kind:'slides',deck:validDeck}}));
await data(await call('research','POST',{body:{...researchInput,id:crypto.randomUUID(),kind:'slides',deck:{...validDeck,slides:[{...validDeck.slides[0],pages:[9]}]}}}),400);
await data(await call('research','DELETE',{owner:'another-owner',query:'?id='+research.id}));assert.equal((await data(await call('research','GET',{query:'?paper='+p.id}))).length,2);

assert.equal((await data(await call('papers','GET',{device:'desktop'})))[0].id,p.id);
const draft={text:'A draft that follows the account',quote:'Original text',rects:[[.1,.2,.3,.1]],page:2,edit:null,color:'green'};
await data(await call('reading','PATCH',{body:{paperId:p.id,kind:'draft',value:draft}}));
const remote=await data(await call('reading','GET',{device:'desktop',query:'?paper='+p.id}));assert.equal(remote.draft.value.text,draft.text);assert.equal(remote.draft.value.rects.length,1);
assert.deepEqual(await data(await call('reading','GET',{owner:'another-owner',query:'?paper='+p.id})),{});
await data(await call('reading','PATCH',{owner:'another-owner',body:{paperId:p.id,kind:'draft',value:draft}}),404);
await data(await call('reading','PATCH',{body:{paperId:p.id,kind:'draft',value:{...draft,page:99}}}),400);
await data(await call('reading','PATCH',{device:'desktop',body:{paperId:p.id,kind:'draft',value:{...draft,text:'Edited on desktop'}}}));
assert.equal((await data(await call('reading','GET',{query:'?paper='+p.id}))).draft.value.text,'Edited on desktop');
const translation={id:crypto.randomUUID(),original:'a'.repeat(8000),text:'A translated passage',status:'done',page:1,rects:[],researchId:crypto.randomUUID(),model:'fixture',error:''};
await data(await call('reading','PATCH',{body:{paperId:p.id,kind:'translation',value:[translation]}}));
assert.equal((await data(await call('reading','GET',{device:'desktop',query:'?paper='+p.id}))).translation.value[0].text,translation.text);
await data(await call('reading','PATCH',{body:{paperId:p.id,kind:'translation',value:[{...translation,text:'a'.repeat(80001)}]}}),400);
const translated={...researchInput,id:translation.researchId,kind:'translate',question:translation.original,text:translation.text,pages:[1],page:1};
await data(await call('research','POST',{body:translated}));await data(await call('research','POST',{body:translated}));
const translations=await data(await call('research','GET',{device:'desktop',query:'?paper='+p.id+'&kind=translate'}));assert.equal(translations.length,1);assert.equal(translations[0].question.length,8000);
assert.equal((await data(await call('research','GET',{query:'?paper='+p.id}))).length,2);
await data(await call('notes','DELETE',{query:'?id='+n.id}));assert.equal((await data(await call('notes'))).length,0);
await data(await call('notes','POST',{body:{paperId:p.id,text:'Cascade cleanup check',page:1}}));await data(await call('paper','DELETE',{id:p.id}));assert.equal(files.size,0);assert.equal((await data(await call('notes'))).length,0);assert.equal((await data(await call('papers'))).length,0);
assert.equal((await data(await call('research','GET',{query:'?paper='+p.id}))).length,0);

assert.equal(sql.prepare('SELECT count(*) AS n FROM reading_states').get().n,0);
await data(await call('account','POST',{body:{action:'logout'}}));
await data(await call('papers'),401);await data(await call('papers','GET',{device:'desktop'}));
for(let i=0;i<5;i++)await data(await call('account','POST',{body:{action:'login',username:'reader.one',password:'wrong'}}),400);
await data(await call('account','POST',{body:{action:'login',username:'reader.one',password}}),429);
sql.prepare('UPDATE accounts SET blocked_until=? WHERE owner=?').run(Date.now()-1,'test-owner');
await data(await call('account','POST',{body:{action:'login',username:'reader.one',password}}));
const staleDesktop=jars.get('test-owner:desktop');const changedPassword='Fixture-changed-2!';
const changed=await data(await call('account','POST',{body:{action:'password',currentPassword:password,newPassword:changedPassword,confirmPassword:changedPassword,remember:true}}));
assert.notEqual(changed.recoveryCode,account.recoveryCode);
await data(await call('papers','GET',{cookie:staleDesktop}),401);
await data(await call('account','POST',{device:'desktop',body:{action:'recover',username:'reader.one',recoveryCode:account.recoveryCode,newPassword:password,confirmPassword:password}}),400);
await data(await call('account','POST',{device:'desktop',body:{action:'recover',username:'reader.one',recoveryCode:changed.recoveryCode,newPassword:password,confirmPassword:password}}));
await data(await call('papers'),401);
const recoveredSession=jars.get('test-owner:desktop');await data(await call('account','POST',{device:'desktop',body:{action:'logoutAll'}}));
await data(await call('papers','GET',{cookie:recoveredSession}),401);
await data(await call('account','POST',{body:{action:'login',username:'reader.one',password}}));
sql.prepare('UPDATE account_sessions SET expires=0 WHERE owner=?').run('test-owner');await data(await call('papers'),401);
console.log('PASS: password registration/login, secure session cookies, pre-account data preservation, recovery rotation, failed-login throttling, multi-device sessions and revocation, session owner isolation, cloud draft/translation sync and deletion cascade.');
console.log('PASS: PDF upload/download, metadata and filename preservation, duplicates, reading progress, note CRUD, research persistence, and PPT citation validation.');
console.log('In-memory SQLite and real WebCrypto tests; no real user account or GPT quota was used.');
