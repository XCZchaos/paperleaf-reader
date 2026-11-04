import {identity,fail} from '@/lib/server';
export async function POST(req:Request){try{await identity(req);return Response.json({error:'翻译已升级为本机 Codex GPT 翻译，请在阅读器中连接并登录 Codex。'},{status:410,headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
