import {argumentSchema,validateBoundaryDecisions,validateArgumentBatch,validateArgumentOverview} from './argument.mjs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {mkdir,chmod} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chatScope,IdleChatThreads} from './chat-threads.mjs';
import {CodexRPC} from './rpc.mjs';
import {setStage,readingProgress,publicProgress,progressEvent} from './progress.mjs';
import {READING_PROVIDER,READING_PROVIDER_CONFIG,CONNECTION_INFO,providerFor,retryDiagnosis} from './transport.mjs';
import {validateRequest,promptFor,instructions,slideSchema,validateDeck,metadataSchema,validateMetadata,wordTranslationSchema,validateWordTranslation} from './research.mjs';

export const SITE='https://paperleaf-xcz-reader.shamboo2003.chatgpt.site';
export const PORT=17624;
const active=j=>['preparing','running'].includes(j.status);
const safeError=e=>String(e?.message||'Codex 请求失败').replace(/Bearer\s+\S+|sk-\S+/gi,'[已隐藏]').slice(0,500);
function errorForTurn(error){
 const diagnosis=retryDiagnosis(error||{});
 if(['stream','connection','timeout'].includes(diagnosis.reason))return diagnosis.label+(diagnosis.httpStatus?'（HTTP '+diagnosis.httpStatus+'）':'')+'。这轮未完成，可在「连接 Codex」里用同一模型测试连接方式。';
 if(diagnosis.reason==='rate-limit'||diagnosis.reason==='usage-limit')return diagnosis.label+(diagnosis.httpStatus?'（HTTP '+diagnosis.httpStatus+'）':'')+'。进度已保留，可在连接窗口查看用量后继续。';
 return safeError(error);
}
const publicJob=j=>({id:j.id,kind:j.kind,status:j.status,text:j.kind==='argument'||j.detectVocabulary&&j.status!=='completed'?'':j.text,argument:j.argument||null,vocabulary:j.vocabulary||null,error:j.error,deck:j.deck,metadata:j.metadata||null,model:j.model,effort:j.effort||null,pages:j.pages,created:j.created,...publicProgress(j)});

export function createBridge({rpc,workdir,token=randomBytes(32).toString('base64url'),origin=SITE,port=PORT}) {
  const jobs=new Map(),cancelledIds=new Map(); let login=null,modelCache=[],modelTime=0,accountKey='',rates=null,rateTime=0,rateAttempt=0,rateWarning='',ratesById=null,quotaOwner='',ordinaryUsageAllowed=null;
  const unsubscribe=threadId=>{void rpc.request('thread/unsubscribe',{threadId}).catch(()=>{});};
  const idleChats=new IdleChatThreads(unsubscribe);
  let preferHttpUntil=0,accountGeneration=0;
  function resetSessions(){
    accountGeneration++;preferHttpUntil=0;idleChats.clear();
  }
  function finish(j,status,error='') {
    if(!active(j))return;
    j.status=status;j.error=error;j.completedAt=Date.now();setStage(j,status);clearTimeout(j.timer);
    if(j.kind==='argument'&&error)progressEvent(j,'terminal','stage',status==='cancelled'?'本轮精读已停止':'本轮精读失败',error);
    if(j.threadId){
      if(status==='completed'&&j.chatScope&&j.accountGeneration===accountGeneration)idleChats.remember(j);
      else unsubscribe(j.threadId);
    }
    delete j.chatHistory;delete j.pendingEvents;
  }
  async function cancel(j) {
    if(!active(j))return;
    j.cancelled=true;
    if(j.threadId&&j.turnId)await rpc.request('turn/interrupt',{threadId:j.threadId,turnId:j.turnId}).catch(()=>{});
    finish(j,'cancelled','已停止生成，未完成的内容不作为结果保存');
  }
  rpc.on('notification',({method,params:p})=>{
    if(method==='account/login/completed')login={...login,done:true,success:!!p.success,error:p.success?'':'登录未完成，请重试'};
    if(method==='thread/closed'&&p?.threadId)idleChats.forgetThread(p.threadId);
    if(method==='account/updated'){if(!p.authMode)resetSessions();modelTime=0;rateTime=0;rateAttempt=0;rates=null;ratesById=null;ordinaryUsageAllowed=null;}
    if(method==='account/rateLimits/updated'&&quotaOwner){const snapshot=p.rateLimits;if(snapshot){rates={...rates,...Object.fromEntries(Object.entries(snapshot).filter(([,v])=>v!=null))};if(snapshot.limitId)ratesById={...ratesById,[snapshot.limitId]:{...ratesById?.[snapshot.limitId],...snapshot}};rateTime=Date.now();}}
    for(const j of jobs.values()) {
      if(!active(j)||!j.threadId||j.threadId!==p?.threadId)continue;
      if(j.pendingEvents){
        // turn/start may emit events before returning the new turn ID.
        if(p.turnId||p.turn?.id)j.pendingEvents.push([method,p]);
        continue;
      }
      handleEvent(j,method,p);
    }
  });
  function handleEvent(j,method,p){
    if(!active(j))return;
    const turnId=p.turnId||p.turn?.id;
    if(j.turnId&&turnId&&j.turnId!==turnId)return;
    readingProgress(j,method,p);
    if(method==='error'&&p.willRetry&&j.adaptiveDefault&&j.accountGeneration===accountGeneration){
      const reason=j.lastRetry?.reason;
      if(reason==='stream'||reason==='connection'){
        j.transportFailures=(j.transportFailures||0)+1;
        if(j.transportFailures===2){
          preferHttpUntil=Date.now()+10*60*1000;
          progressEvent(j,'transport-next','stage','后续请求将暂用 HTTP 流式连接','本轮由 Codex 继续重试。下一次自动连接将使用 HTTP，模型和账号保持一致。');
        }
      }else j.transportFailures=0;
    }
    if(method==='turn/started')j.turnId=p.turn.id;
    if(method==='item/started'&&p.item.type==='agentMessage')j.items.set(p.item.id,{text:'',phase:p.item.phase});
    if(method==='item/agentMessage/delta'){
      if(p.delta&&!j.firstResponseAt)j.firstResponseAt=Date.now();
      const old=j.items.get(p.itemId)||{text:'',phase:null};old.text+=p.delta;j.items.set(p.itemId,old);
      if(old.phase==='commentary'){j.activity=old.text.slice(-600);progressEvent(j,'commentary-'+p.itemId,'commentary','阅读进展',old.text,false);}else{j.text=old.text.slice(0,100000);setStage(j,'writing');if(j.kind==='argument')progressEvent(j,'output','stage','正在接收结构化结果',`已收到 ${old.text.length.toLocaleString()} 字符`,false);}
      if(old.text.length>100000){void cancel(j);j.error='输出超过长度限制，请缩小阅读范围';}
    }
    if(method==='item/completed'&&p.item.type==='agentMessage'){
      if(p.item.text&&!j.firstResponseAt)j.firstResponseAt=Date.now();
      j.items.set(p.item.id,{text:p.item.text,phase:p.item.phase});
      if(p.item.phase==='commentary'){j.activity=p.item.text.slice(-600);progressEvent(j,'commentary-'+p.item.id,'commentary','阅读进展',p.item.text,true);}else{j.text=p.item.text.slice(0,100000);setStage(j,'writing');}
      if(j.kind==='argument'&&p.item.phase!=='commentary')progressEvent(j,'output','stage','已接收结构化结果',`共 ${p.item.text.length.toLocaleString()} 字符`);
    }
    if(method==='item/started'&&!['userMessage','agentMessage','reasoning','plan','contextCompaction'].includes(p.item.type)){
      progressEvent(j,'tool-blocked','stage','工具请求已阻止','文献阅读仅处理你提供的文字。');void cancel(j);j.error='阅读任务尝试调用工具，已停止。请重新提问并仅依据原文。';
    }
    if(method==='turn/completed'){
      if(j.cancelled){finish(j,'cancelled','已停止生成');return;}
      if(p.turn.status!=='completed'){finish(j,p.turn.status==='interrupted'?'cancelled':'error',errorForTurn(p.turn.error));return;}
      const finals=[...j.items.values()].filter(x=>x.phase==='final_answer');
      const messages=finals.length?finals:[...j.items.values()].filter(x=>x.phase!=='commentary');
      j.text=messages.map(x=>x.text).join('\n\n');
      if(!j.text.trim()){finish(j,'error','Codex 未返回完整正文，请重新尝试');return;}
      setStage(j,'finalizing');
      try{
        if(j.kind==='argument'){
          const value=JSON.parse(j.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
          if(j.argumentInput.phase==='segmentation'){
            j.argument=validateBoundaryDecisions(value,j.argumentInput);
            progressEvent(j,'verified','stage','已核对 AI 分段决定',j.argument.decisions.length+' 个原文片段已逐一对应');
          }else if(j.argumentInput.phase==='paragraphs'){
            j.argument=validateArgumentBatch(value,j.argumentInput.paragraphs);
            const count=j.argument.paragraphs.reduce((n,p)=>n+p.highlights.length,0);
            progressEvent(j,'verified','stage','Paperleaf 已核对逐段结果',`${j.argument.paragraphs.length} 段译文与批注 · ${count} 处原文高亮匹配 · ${j.argument.skippedHighlights} 处高亮跳过`);
          }else{
            j.argument=validateArgumentOverview(value,j.argumentInput.sources);
            progressEvent(j,'verified','stage','Paperleaf 已核对总览引用',`${Object.keys(j.argument).length} 项论证分析已通过来源校验`);
          }
        }
        if(j.detectVocabulary){const parsed=validateWordTranslation(JSON.parse(j.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')),j.selection);j.text=parsed.text;j.vocabulary=parsed.vocabulary;}
        if(j.kind==='metadata')j.metadata=validateMetadata(JSON.parse(j.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')));
        if(j.kind==='slides'){
          const raw=j.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
          j.deck=validateDeck(JSON.parse(raw),j.pages);
          if(j.deck.slides.length!==j.slideCount)throw Error('生成页数与要求不一致，请重试');
        }
        finish(j,'completed');
      }catch(e){finish(j,'error',safeError(e));}
    }
    if(method==='error'&&!p.willRetry)finish(j,'error',errorForTurn(p.error));
  }
  rpc.on('blocked',p=>{for(const j of jobs.values())if(active(j)&&j.threadId===p.params?.threadId){void cancel(j);j.error='阅读助手不执行本机工具操作，任务已停止';}});
  rpc.on('closed',message=>{resetSessions();for(const j of jobs.values())finish(j,'error',message)});
  async function account(){const {account}=await rpc.request('account/read',{refreshToken:false});const a=account?.type==='chatgpt'?{email:account.email,plan:account.planType}:null;const key=a?`${a.email}|${a.plan}`:'';if(key!==quotaOwner){resetSessions();quotaOwner=key;rates=null;ratesById=null;rateTime=0;rateAttempt=0;rateWarning='';ordinaryUsageAllowed=null;}return a;}
  async function readRates(force=false){
    if(!force&&Date.now()-rateAttempt<60000)return;
    rateAttempt=Date.now();const owner=quotaOwner;
    try{const response=await rpc.request('account/rateLimits/read',{},6000);if(owner!==quotaOwner)return;rates=response.rateLimits||null;ratesById=response.rateLimitsByLimitId||null;ordinaryUsageAllowed=response.ordinaryUsageAllowed??null;rateTime=Date.now();rateWarning='';}
    catch{if(owner===quotaOwner)rateWarning='额度刷新失败，请稍后重试。'+(rates?'下方保留上次数据。':'');}
  }
  async function models(a){
    const key=a?.email+'|'+a?.plan;
    if(key!==accountKey||Date.now()-modelTime>60000){
      const list=[];let cursor;
      for(let i=0;i<10;i++){const r=await rpc.request('model/list',{limit:50,includeHidden:false,...(cursor?{cursor}:{})});list.push(...r.data);if(!r.nextCursor)break;cursor=r.nextCursor;}
      modelCache=list.filter(m=>!m.hidden).map(m=>({id:m.model,name:m.displayName,default:!!m.isDefault,reasoningEfforts:(m.supportedReasoningEfforts||[]).filter(x=>typeof x.reasoningEffort==='string').slice(0,20).map(x=>({id:x.reasoningEffort,description:String(x.description||'').slice(0,500)})),defaultEffort:m.defaultReasoningEffort||''}));modelTime=Date.now();accountKey=key;
    }
    return modelCache;
  }
  async function run(j,r){
    try{
      const a=j.account;delete j.account;
      const ownerGeneration=accountGeneration;
      const list=await models(a);if(r.model&&!list.some(m=>m.id===r.model))throw Error('该模型不在当前账号的模型列表中，请重新选择');
      const selected=r.model?list.find(m=>m.id===r.model):list.find(m=>m.default);
      if(r.effort&&!selected?.reasoningEfforts.some(e=>e.id===r.effort))throw Error('当前模型不支持所选思考强度，请在 Codex 面板重新选择');
      j.effort=r.effort||selected?.defaultEffort||null;
      if(j.kind==='argument')progressEvent(j,'model','stage','Paperleaf 已核对账号与模型',`${selected?.id||'账号默认模型'} · 思考强度 ${j.effort||'模型默认'}`);
      if(j.cancelled)return;
      if(ownerGeneration!==accountGeneration)throw Error('Codex 账号已切换，请重新提问');
      const diagnostic=r.kind==='connection-test';
      const useHttp=r.provider===READING_PROVIDER||(r.adaptive&&preferHttpUntil>Date.now());
      const provider=useHttp?READING_PROVIDER:r.provider;
      j.adaptiveDefault=r.adaptive&&!useHttp;j.accountGeneration=accountGeneration;
      j.chatScope=chatScope(r,quotaOwner,selected?.id||r.model,j.effort,provider);
      if(j.chatScope)j.chatHistory=[...r.history,{role:'user',text:r.question+(r.selection?'\n引用原文：'+r.selection:'')}];
      const previous=j.chatScope&&idleChats.take(r.parentId,j.chatScope,r.history);
      const openThread=async()=>{
        const t=await rpc.request('thread/start',{modelProvider:provider,...(r.model?{model:r.model}:{}),cwd:workdir,approvalPolicy:'untrusted',permissions:'paperleaf_reading',ephemeral:true,baseInstructions:diagnostic?'Answer the connection check briefly. Do not use tools.':instructions,...(diagnostic?{}:{developerInstructions:instructions}),serviceName:'paperleaf_reader'});
        j.threadId=t.thread.id;j.model=t.model||r.model||'Codex 默认模型';
      };
      if(previous){j.threadId=previous;j.model=selected?.id||r.model||'Codex 默认模型';}
      else await openThread();
      const startTurn=async continuing=>{
        if(!active(j)||j.cancelled){unsubscribe(j.threadId);return;}
        if(j.accountGeneration!==accountGeneration)throw Error('Codex 账号已切换，请重新提问');
        j.status='running';
        progressEvent(j,'connected','stage',continuing?'沿用本次对话':j.kind==='ask'?'本轮对话已就绪':'本轮任务已就绪',
          j.model+' · '+(useHttp?'HTTP 流式连接':'Codex 默认连接'));
        setStage(j,'thinking');
        if(continuing)j.pendingEvents=[];
        const result=await rpc.request('turn/start',{threadId:j.threadId,...(diagnostic?{}:{summary:'auto'}),...(r.effort?{effort:r.effort}:{}),input:[{type:'text',text:promptFor(r,continuing),text_elements:[]}],approvalPolicy:'untrusted',...(r.kind==='argument'?{outputSchema:argumentSchema(r.argument.phase)}:r.kind==='slides'?{outputSchema:slideSchema(r.slideCount)}:r.kind==='metadata'?{outputSchema:metadataSchema}:r.detectVocabulary?{outputSchema:wordTranslationSchema}:{})},60000);
        j.turnId=result.turn.id;
        const events=j.pendingEvents||[];delete j.pendingEvents;
        for(const [method,params] of events)handleEvent(j,method,params);
        if(j.cancelled)await rpc.request('turn/interrupt',{threadId:j.threadId,turnId:j.turnId}).catch(()=>{});
      };
      try{await startTurn(!!previous);}catch(e){
        // Only an explicit missing thread guarantees no turn was accepted.
        if(!previous||!active(j)||j.cancelled||!/^(?:thread (?:not found|not loaded)|unknown thread|no thread found|thread [0-9a-f-]+ (?:not found|is not loaded))\b/i.test(String(e.message)))throw e;
        delete j.pendingEvents;delete j.threadId;unsubscribe(previous);await openThread();await startTurn(false);
      }
    }catch(e){finish(j,'error',safeError(e));}
  }
  function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  async function read(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1200000)throw Error('请求过大，请缩小阅读范围');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
  const server=http.createServer(async(req,res)=>{
    const host=req.headers.host;
    const currentPort=server.address()?.port||port;
    if(host!==`127.0.0.1:${currentPort}`){send(res,403,{error:'不支持的本机地址'});return;}
    if(req.headers.origin!==origin){send(res,403,{error:'仅允许已配置的 Paperleaf 网站连接'});return;}
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Paperleaf-Token');
    res.setHeader('Access-Control-Allow-Private-Network','true');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const supplied=String(req.headers['x-paperleaf-token']||'');
    if(Buffer.byteLength(supplied)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))){send(res,401,{error:'配对码无效或已过期，请使用连接程序显示的新配对码'});return;}
    const u=new URL(req.url,'http://127.0.0.1');
    if(req.method==='POST'&&!String(req.headers['content-type']).startsWith('application/json')){send(res,415,{error:'请求格式不支持'});return;}
    try {
      if(req.method==='GET'&&u.pathname==='/status'){
        const a=await account();let m=[],warning='';
        if(a){try{m=await models(a)}catch{warning='模型列表暂时不可用，可以使用 Codex 默认模型'}
          await readRates(u.searchParams.get('refresh')==='1');}
        send(res,200,{connected:true,account:a,models:m,rateLimits:a?rates:null,rateLimitsByLimitId:a?ratesById:null,rateLimitsUpdatedAt:a?rateTime:null,rateLimitsWarning:a?rateWarning:'',ordinaryUsageAllowed:a?ordinaryUsageAllowed:null,login:login?{done:login.done,success:login.success,error:login.error}:null,warning,connection:CONNECTION_INFO,version:'1.5.5'});return;
      }
      if(req.method==='POST'&&u.pathname==='/login'){
        if([...jobs.values()].some(active)){send(res,409,{error:'请先停止当前生成任务，再登录其他账号'});return;}
        if(login?.loginId&&!login.done)await rpc.request('account/login/cancel',{loginId:login.loginId}).catch(()=>{});
        resetSessions();const result=await rpc.request('account/login/start',{type:'chatgpt'},60000);
        const authURL=new URL(result.authUrl);
        if(authURL.protocol!=='https:'||!['auth.openai.com','chatgpt.com'].includes(authURL.hostname))throw Error('Codex 返回了无法识别的登录地址');
        login={loginId:result.loginId,done:false,success:false,error:''};send(res,200,{authUrl:result.authUrl});return;
      }
      if(req.method==='POST'&&u.pathname==='/login/cancel'){
        if(login?.loginId&&!login.done)await rpc.request('account/login/cancel',{loginId:login.loginId});login=null;send(res,200,{ok:true});return;
      }
      if(req.method==='POST'&&u.pathname==='/logout'){
        await Promise.all([...jobs.values()].filter(active).map(cancel));
        resetSessions();await rpc.request('account/logout');login=null;rates=null;modelTime=0;rateTime=0;send(res,200,{ok:true});return;
      }
      if(req.method==='POST'&&u.pathname==='/jobs'){
        const input=await read(req);const r=validateRequest(input);r.provider=providerFor(input.connectionMode);r.adaptive=r.provider==='openai'&&input.adaptiveConnection===true;const hash=createHash('sha256').update(JSON.stringify(r)).digest('hex');
        const currentAccount=await account();if(!currentAccount){send(res,401,{error:'请先登录 Codex / ChatGPT 账号'});return;}
        const existing=jobs.get(r.id);
        if(existing){if(existing.hash!==hash)throw Error('任务标识重复，请重新提交');send(res,200,publicJob(existing));return;}
        if([...jobs.values()].filter(active).length>=2){send(res,429,{error:'已有任务正在生成，请等待或停止后重试'});return;}
        if(cancelledIds.has(r.id)){send(res,200,{id:r.id,status:'cancelled',text:'',error:'已停止生成'});return;}
        for(const [id,j] of jobs)if(!active(j)&&(Date.now()-j.created>1800000||jobs.size>=30))jobs.delete(id);
        const j={account:currentAccount,argumentInput:r.argument,detectVocabulary:r.detectVocabulary,selection:r.selection,id:r.id,kind:r.kind,status:'preparing',text:'',error:'',deck:null,model:r.model||'',pages:r.pages.map(p=>p.page),created:Date.now(),updated:Date.now(),stage:'preparing',summaries:new Map(),events:[],activity:'',items:new Map(),hash,slideCount:r.slideCount};
        j.timer=setTimeout(()=>{void cancel(j);j.error='生成超过 5 分钟已停止，请缩小范围或更换模型';},300000);
        progressEvent(j,'source','stage','已读取文献',`${r.pages.length} 页 · ${r.pages.reduce((n,p)=>n+p.text.length,0).toLocaleString()} 字符`);jobs.set(j.id,j);send(res,202,publicJob(j));void run(j,r);return;
      }
      const match=u.pathname.match(/^\/jobs\/([a-zA-Z0-9-]{16,64})(\/cancel)?$/);
      if(match){const j=jobs.get(match[1]);if(!j&&req.method==='POST'&&match[2]){for(const [id,t] of cancelledIds)if(Date.now()-t>300000||cancelledIds.size>100)cancelledIds.delete(id);cancelledIds.set(match[1],Date.now());send(res,200,{id:match[1],status:'cancelled',text:'',error:'已停止生成'});return;}if(!j){send(res,404,{error:'任务已过期或连接程序已重启，请重新生成'});return;}
        if(req.method==='GET'&&!match[2]){send(res,200,publicJob(j));return;}
        if(req.method==='POST'&&match[2]){await cancel(j);send(res,200,publicJob(j));return;}
      }
      send(res,404,{error:'接口不存在'});
    }catch(e){send(res,400,{error:safeError(e)});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return {server,token,jobs,cancel,close:async()=>{resetSessions();await Promise.all([...jobs.values()].filter(active).map(cancel));rpc.close();server.close();}};
}

export function spawnCodexProfile(workdir,codexDataDir,options={}){
  const require=createRequire(import.meta.url);const cli=options.binaryPath?null:path.join(path.dirname(require.resolve('@openai/codex/package.json')),'bin','codex.js');
  // A dedicated child-process profile keeps Paperleaf separate from the user's CLI login,
  // MCP servers, hooks, and project files. Nothing reads or copies another profile's tokens.
  const childEnv={...process.env,CODEX_HOME:codexDataDir};
  delete childEnv.OPENAI_API_KEY;delete childEnv.CODEX_API_KEY;
  // Do not attach this independent reader to a parent Codex execution session.
  for(const name of ['CODEX_EXEC_SERVER_REMOTE_BASE_URL','CODEX_ENVIRONMENT_ID','CODEX_SESSION_ID','CODEX_THREAD_ID','CODEX_TOOL_CALL_ID'])delete childEnv[name];
  // Windows' standard-user sandbox cannot enforce denied read roots. Use a
  // portable read-only policy, disable project instruction discovery and all tools.
  // No unrestricted/no-sandbox fallback is permitted.
  const disabled=['shell_snapshot','remote_control','shell_tool','unified_exec','code_mode_host','apps','plugins','remote_plugin','hooks','browser_use','computer_use','multi_agent','multi_agent_v2','view_image','image_generation','skill_search','sleep_tool'];
  const args=[...(cli?[cli]:[]),'app-server','--listen','stdio://','-c','default_permissions="paperleaf_reading"','-c','permissions.paperleaf_reading.filesystem={":root"="read"}','-c','permissions.paperleaf_reading.network.enabled=false','-c','project_doc_max_bytes=0','-c','web_search="disabled"','-c',`cli_auth_credentials_store="${options.credentialStore==='auto'?'auto':'file'}"`,'-c','features.skip_host_skill_discovery=true',...disabled.flatMap(f=>['-c',`features.${f}=false`])];
  args.push('-c','model_provider="openai"','-c',`model_providers.${READING_PROVIDER}=${READING_PROVIDER_CONFIG}`);
  return spawn(options.binaryPath||process.execPath,args,{cwd:workdir,env:childEnv,stdio:['pipe','pipe','pipe'],windowsHide:true});
}

export async function startCompanion(){
  if(Number(process.versions.node.split('.')[0])<22)throw Error('请先安装 Node.js 22 或更新版本');
  const dataDir=path.join(homedir(),'.paperleaf-codex');
  const codexDataDir=path.join(dataDir,'account'),workdir=path.join(dataDir,'reading');
  await mkdir(codexDataDir,{recursive:true,mode:0o700});await mkdir(workdir,{recursive:true,mode:0o700});
  await chmod(dataDir,0o700).catch(()=>{});
  const child=spawnCodexProfile(workdir,codexDataDir);
  const rpc=new CodexRPC(child);await rpc.initialize();
  const bridge=createBridge({rpc,workdir});
  await new Promise((resolve,reject)=>{bridge.server.once('error',reject);bridge.server.listen(PORT,'127.0.0.1',resolve)}).catch(e=>{rpc.close();throw e;});
  console.log('\nPaperleaf Codex 连接程序已启动。请保留此窗口。\n');
  console.log('1. 在这台电脑的 Chrome / Edge 打开：\n'+SITE+'/#paperleaf-connect='+bridge.token+'\n');
  console.log('2. 如浏览器询问，请允许网站访问本地网络。');
  console.log('3. 在网站的“连接 Codex”中登录你的 ChatGPT 账号。\n');
  console.log('手动配对码（只在此网站填写）：\n'+bridge.token+'\n');
  console.log('账号凭据保存在本机独立目录：'+codexDataDir);
  console.log('按 Ctrl+C 退出。');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void bridge.close().finally(()=>process.exit(0));});
  return bridge;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  startCompanion().catch(e=>{console.error(e.code==='EADDRINUSE'?'连接程序已在运行，或端口 17624 被占用。请关闭旧窗口后重试。':safeError(e));process.exitCode=1;});
}
