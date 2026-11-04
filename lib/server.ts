import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import {sessionAccount} from './account-auth';
export async function platformIdentity(req:Request){
 const u=await getChatGPTUser(); if(!u) throw new Error('AUTH');
 if(req.method!=='GET'&&req.method!=='HEAD'){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new Error('ORIGIN');}
 return u.userId;
}
export async function identity(req:Request){const owner=await platformIdentity(req);if(!await sessionAccount(req,owner,db()))throw Error('ACCOUNT_AUTH');return owner;}
export function db(){if(!env.DB)throw new Error('数据库暂不可用');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new Error('文件存储暂不可用');return env.BUCKET;}
export function fail(e:unknown){const m=e instanceof Error?e.message:'请求失败';const status=m==='AUTH'||m==='ACCOUNT_AUTH'?401:m==='ORIGIN'?403:m==='NOT_FOUND'?404:m==='RATE_LIMIT'?429:400;return Response.json({error:m==='AUTH'?'请先完成 ChatGPT 私密网站访问验证':m==='ACCOUNT_AUTH'?'请登录 Paperleaf 账号':m==='NOT_FOUND'?'文献或笔记不存在':m==='ORIGIN'?'请求来源不受支持':m==='RATE_LIMIT'?'尝试次数过多，请 15 分钟后再试':m},{status,headers:{'Cache-Control':'no-store'}});}
export function json(x:unknown){return Response.json(x,{headers:{'Cache-Control':'private, no-store'}});}
export async function body(req:Request){const s=await req.text();if(s.length>150000)throw new Error('内容过长');return JSON.parse(s);}
export function str(v:unknown,max=500){return typeof v==='string'?v.slice(0,max):'';}
export function normalize(row:Record<string,unknown>){return {...row,originalFilename:row.original_filename||row.filename,metadataSource:row.metadata_source||'embedded',tags:JSON.parse(String(row.tags||'[]')),favorite:!!row.favorite};}
