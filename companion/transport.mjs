export const READING_PROVIDER='paperleaf_chatgpt';
export const READING_PROVIDER_CONFIG='{name="Paperleaf ChatGPT",requires_openai_auth=true,wire_api="responses",supports_websockets=false}';
export const CONNECTION_INFO={transport:'codex-default',label:'Codex 官方默认连接',supportsConnectionChoice:true,adaptiveTransport:true};

export function providerFor(mode){
 if(mode===undefined||mode==='default')return 'openai';
 if(mode==='http-sse')return READING_PROVIDER;
 throw Error('连接方式无效');
}

// Only forward a bounded, normalized diagnosis. Upstream messages can contain
// URLs, proxy credentials or local paths; never store them in reading history.
export function retryDiagnosis(error={}){
 const info=error.codexErrorInfo;
 const code=typeof info==='string'?info:info&&typeof info==='object'?Object.keys(info)[0]:'';
 const rawStatus=info&&typeof info==='object'?info[code]?.httpStatusCode:null;
 const httpStatus=Number.isInteger(rawStatus)&&rawStatus>=400&&rawStatus<=599?rawStatus:null;
 let reason='unknown';
 if(code==='unauthorized'||httpStatus===401||httpStatus===403)reason='auth';
 else if(['usageLimitExceeded','sessionBudgetExceeded'].includes(code))reason='usage-limit';
 else if(code==='rateLimitExceeded'||httpStatus===429)reason='rate-limit';
 else if(['serverOverloaded','internalServerError','flexUnavailable'].includes(code)||(httpStatus>=500&&httpStatus<=599))reason='server';
 else if(httpStatus===408||/timed?\s*out|timeout|超时/i.test(String(error.message||'').slice(0,2000)))reason='timeout';
 else if(['badRequest','modelNotFound','contextWindowExceeded'].includes(code)||(httpStatus>=400&&httpStatus<=499))reason='request';
 else if(code==='responseStreamDisconnected')reason='stream';
 else if(['httpConnectionFailed','responseStreamConnectionFailed'].includes(code))reason='connection';
 const messages={
  request:['请求暂时无法处理','模型或请求参数不可用；若持续失败，请检查阅读范围和所选模型。'],
  auth:['账号授权暂时不可用','Codex 正在尝试恢复授权；若持续失败，请在连接窗口重新登录。'],
  'rate-limit':['服务暂时限制了请求','Codex 会等待后重试。服务未说明具体限制，可在连接窗口查看账号用量。'],
  'usage-limit':['Codex 报告使用上限','请在连接窗口刷新账号用量和重置时间。'],
  server:['模型服务暂时不可用','上游服务返回错误，Codex 正在重试当前任务。'],
  timeout:['响应超时','等待上游响应超时，Codex 正在重试当前任务。'],
  stream:['回答传输中断','模型的回答流在完成前断开，Codex 正在重试同一轮。'],
  connection:['连接未建立','未能建立上游连接，Codex 正在重试；持续出现时请检查网络或代理。'],
  unknown:['Codex 正在重试','上游没有提供可明确分类的原因，暂时无法判断是否为网络问题。']
 };
 const [label,detail]=messages[reason];
 return {reason,label,detail,httpStatus};
}
