import {platformIdentity,db,body,str,fail,json} from '@/lib/server';
import {sessionAccount,publicAccount,passwordValid,passwordHash,randomToken,digest,same,createSession,cookie,tokenFrom} from '@/lib/account-auth';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export async function GET(req:Request){try{const u=await getChatGPTUser();if(!u)return json({platformSignedIn:false,hasAccount:false,account:null});const row=await db().prepare('SELECT username FROM accounts WHERE owner=?').bind(u.userId).first();return json({platformSignedIn:true,hasAccount:!!row,username:row?.username||'',account:publicAccount(await sessionAccount(req,u.userId,db()))});}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 const owner=await platformIdentity(req),b=await body(req),action=str(b.action),now=Date.now();
 const row=await db().prepare('SELECT * FROM accounts WHERE owner=?').bind(owner).first();
 if(action==='register'){
  if(row)throw Error('此空间已有 Paperleaf 账号，请登录或使用恢复码重置密码');
  const username=str(b.username,40).trim().toLowerCase();if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username))throw Error('用户名需为 3–40 位字母、数字、下划线或短横线');
  passwordValid(b.password);if(b.password!==b.confirmPassword)throw Error('两次输入的密码不一致');
  if(await db().prepare('SELECT owner FROM accounts WHERE username=?').bind(username).first())throw Error('该用户名已被使用');
  const salt=randomToken(),hash=await passwordHash(b.password,salt),recoveryCode=randomToken();
  try{await db().prepare('INSERT INTO accounts (owner,username,display_name,password_salt,password_hash,recovery_hash,created,updated,failed_attempts,blocked_until) VALUES (?,?,?,?,?,?,?,?,0,0)').bind(owner,username,str(b.displayName,60).trim()||username,salt,hash,await digest(recoveryCode),now,now).run();}catch{throw Error('账号已存在或用户名被使用，请刷新后重试')}
  return Response.json({account:{id:owner,username,displayName:str(b.displayName,60).trim()||username,created:now},recoveryCode},{headers:{'Set-Cookie':await createSession(owner,!!b.remember,db()),'Cache-Control':'no-store'}});
 }
 if(!row)throw Error('请先注册 Paperleaf 账号');
 if(action==='logout'){
  const token=tokenFrom(req);if(token)await db().prepare('DELETE FROM account_sessions WHERE owner=? AND token_hash=?').bind(owner,await digest(token)).run();return Response.json({ok:true},{headers:{'Set-Cookie':cookie(''),'Cache-Control':'no-store'}});
 }
 if(action==='logoutAll'){
  if(!await sessionAccount(req,owner,db()))throw Error('ACCOUNT_AUTH');await db().prepare('DELETE FROM account_sessions WHERE owner=?').bind(owner).run();return Response.json({ok:true},{headers:{'Set-Cookie':cookie(''),'Cache-Control':'no-store'}});
 }
 if(Number(row.blocked_until)>now)throw Error('RATE_LIMIT');
 if(!['login','password','recover'].includes(action))throw Error('不支持的账号操作');
 let valid=false;
 if(action==='recover')valid=typeof b.recoveryCode==='string'&&same(await digest(b.recoveryCode.replace(/\s/g,'').toLowerCase()),String(row.recovery_hash))&&str(b.username,40).trim().toLowerCase()===row.username;
 else{const password=action==='password'?b.currentPassword:b.password;if(typeof password==='string'&&password.length<=128)valid=same(await passwordHash(password,String(row.password_salt)),String(row.password_hash));if(action==='login')valid=valid&&str(b.username,40).trim().toLowerCase()===row.username;else if(!await sessionAccount(req,owner,db()))throw Error('ACCOUNT_AUTH');}
 if(!valid){await db().prepare('UPDATE accounts SET failed_attempts=CASE WHEN blocked_until>0 THEN 1 ELSE failed_attempts+1 END,blocked_until=CASE WHEN blocked_until=0 AND failed_attempts>=4 THEN ? ELSE 0 END WHERE owner=?').bind(now+15*60000,owner).run();throw Error(action==='recover'?'用户名或恢复码不正确':'用户名或密码不正确');}
 let recoveryCode:string|undefined;
 if(action==='password'||action==='recover'){
  passwordValid(b.newPassword);if(b.newPassword!==b.confirmPassword)throw Error('两次输入的新密码不一致');const salt=randomToken();recoveryCode=randomToken();
  await db().batch([db().prepare('UPDATE accounts SET password_salt=?,password_hash=?,recovery_hash=?,updated=? WHERE owner=?').bind(salt,await passwordHash(b.newPassword,salt),await digest(recoveryCode),now,owner),db().prepare('DELETE FROM account_sessions WHERE owner=?').bind(owner)]);
 }
 await db().prepare('UPDATE accounts SET failed_attempts=0,blocked_until=0 WHERE owner=?').bind(owner).run();
 return Response.json({account:publicAccount(row),...(recoveryCode?{recoveryCode}:{})},{headers:{'Set-Cookie':await createSession(owner,!!b.remember,db()),'Cache-Control':'no-store'}});
}catch(e){return fail(e)}}
