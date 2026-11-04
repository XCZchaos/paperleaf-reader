import {env} from 'cloudflare:workers';
export const SESSION_COOKIE='__Host-paperleaf-session';
const encode=new TextEncoder();
export const hex=(data:ArrayBuffer|Uint8Array)=>Array.from(data instanceof Uint8Array?data:new Uint8Array(data)).map(x=>x.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encode.encode(value)));
export function passwordValid(value:unknown):asserts value is string {if(typeof value!=='string'||value.length<10||value.length>128)throw Error('密码需为 10–128 个字符');}
export async function passwordHash(password:string,salt:string){
 const pepper=(env as unknown as Record<string,string>).PAPERLEAF_PASSWORD_PEPPER;if(!pepper)throw Error('账号服务尚未配置，请稍后重试');
 const hmac=await crypto.subtle.importKey('raw',encode.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const input=await crypto.subtle.sign('HMAC',hmac,encode.encode(password));
 const key=await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encode.encode(salt),iterations:100000},key,256));
}
export function same(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return diff===0;}
export function tokenFrom(req:Request){const token=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1)||'';return /^[a-f0-9]{64}$/.test(token)?token:'';}
export function cookie(token:string,seconds=0){return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${seconds?`; Max-Age=${seconds}`:''}${!token?'; Max-Age=0':''}`;}
export async function sessionAccount(req:Request,owner:string,db:any){const token=tokenFrom(req);if(!token)return null;return await db.prepare('SELECT a.owner,a.username,a.display_name,a.created,s.expires FROM accounts a JOIN account_sessions s ON s.owner=a.owner WHERE s.token_hash=? AND a.owner=? AND s.expires>?').bind(await digest(token),owner,Date.now()).first();}
export function publicAccount(row:any){return row?{id:row.owner,username:row.username,displayName:row.display_name,created:row.created}:null;}
export async function createSession(owner:string,remember:boolean,db:any){const token=randomToken(),now=Date.now(),seconds=(remember?30:1)*86400;await db.batch([db.prepare('DELETE FROM account_sessions WHERE expires<?').bind(now),db.prepare('INSERT INTO account_sessions (token_hash,owner,created,expires) VALUES (?,?,?,?)').bind(await digest(token),owner,now,now+seconds*1000)]);return cookie(token,remember?seconds:0);}
