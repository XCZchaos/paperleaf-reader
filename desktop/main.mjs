import {app,BrowserWindow,Menu,ipcMain,session,shell,dialog} from 'electron';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DesktopUpdater} from './updater.mjs';
import {fileURLToPath} from 'node:url';
import {DesktopRuntime} from './runtime.mjs';
import {SITE} from '../companion/server.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url));
let window,runtime,updater,quitting=false;
app.setName('Paperleaf');
const permittedAuthHosts=new Set(['chatgpt.com','auth.openai.com','auth0.openai.com','accounts.google.com','login.microsoftonline.com','login.live.com','appleid.apple.com']);
function permittedNavigation(url){try{const u=new URL(url);return u.protocol==='https:'&&(u.origin===SITE||permittedAuthHosts.has(u.hostname))}catch{return false}}
function trusted(event){if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||new URL(event.senderFrame.url).origin!==SITE)throw Error('请求来源不受支持');}
if(!app.requestSingleInstanceLock()){app.quit()}else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.whenReady().then(()=>{
  const cloud=session.fromPartition('persist:paperleaf-cloud');
  cloud.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));cloud.setPermissionCheckHandler(()=>false);
  runtime=new DesktopRuntime({dataDir:app.getPath('userData'),binaryPath:path.join(process.resourcesPath,'codex','bin',process.platform==='win32'?'codex.exe':'codex'),openExternal:url=>shell.openExternal(url),getAccount:async()=>{
   try{const response=await cloud.fetch(SITE+'/api/account',{credentials:'include',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();const state=await response.json();return state.account;}catch{throw Error('无法验证云端账号，请检查网络并重新登录 Paperleaf');}
  }});
  updater=new DesktopUpdater({version:app.getVersion(),site:SITE,dataDir:app.getPath('userData'),fetch:(...args)=>cloud.fetch(...args),launch:async file=>{
   await runtime.disconnect();
   await new Promise((resolve,reject)=>{const child=spawn(file,[],{detached:true,stdio:'ignore',windowsHide:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve()})});
   quitting=true;app.exit(0);
  }});
  ipcMain.handle('paperleaf:update',(event,action)=>{trusted(event);return updater.request(action)});
  ipcMain.handle('paperleaf:codex',(event,route,options)=>{trusted(event);return runtime.request(route,options)});
  ipcMain.handle('paperleaf:disconnect',event=>{trusted(event);return runtime.disconnect()});
  window=new BrowserWindow({width:1380,height:920,minWidth:1000,minHeight:680,title:'Paperleaf',backgroundColor:'#f7f8f2',show:false,webPreferences:{preload:path.join(directory,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,partition:'persist:paperleaf-cloud',spellcheck:false}});
  window.once('ready-to-show',()=>window.show());
  let lastCheck=0;window.webContents.on('did-finish-load',()=>{try{if(new URL(window.webContents.getURL()).origin===SITE&&Date.now()-lastCheck>21600000){lastCheck=Date.now();void updater.check();}}catch{}});
  window.webContents.on('will-navigate',(event,url)=>{if(!permittedNavigation(url)){event.preventDefault();return;}if(new URL(url).origin!==SITE)void runtime.disconnect();});
  window.webContents.on('will-redirect',(event,url)=>{if(!permittedNavigation(url))event.preventDefault()});
  window.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(u.protocol==='https:'&&(u.origin===SITE||u.hostname==='chatgpt.com'||u.hostname==='learn.chatgpt.com'||u.hostname==='developers.openai.com'))void shell.openExternal(url);}catch{}return {action:'deny'};});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  cloud.on('will-download',(_event,item,contents)=>{if(contents!==window.webContents)return;item.setSaveDialogOptions({title:'保存 Paperleaf 文件',defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))});item.once('done',(_event,state)=>{if(state==='interrupted')void dialog.showMessageBox(window,{type:'error',message:'下载未完成',detail:'请检查网络或保存位置，然后重试。'});});});
  window.webContents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(!isMainFrame||code===-3||quitting)return;window.show();void dialog.showMessageBox(window,{type:'error',message:'无法连接 Paperleaf 云端',detail:'请检查网络。PDF 和已保存的记录仍在云端，重新连接后可以继续。',buttons:['重试','关闭'],defaultId:0,cancelId:1}).then(r=>r.response===0?window.loadURL(SITE):app.quit());});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Paperleaf',submenu:[{label:'重新连接云端',click:()=>window.loadURL(SITE)},{type:'separator'},{label:'检查更新与版本说明',click:()=>{void window.loadURL(SITE+'/desktop');void updater.check()}},{label:'关于 Paperleaf',click:()=>dialog.showMessageBox(window,{message:'Paperleaf '+app.getVersion(),detail:'文献与记录云端同步 · Codex 本机运行\nWindows 安装版，无需 Node.js 或配对码。\n账号资料与 Codex 授权分开管理。'})},{role:'quit',label:'退出'}]},{label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},{label:'视图',submenu:[{role:'reload',label:'刷新'},{role:'resetZoom',label:'实际大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'},{role:'togglefullscreen',label:'全屏'}]}]));
  void window.loadURL(SITE);
 }).catch(()=>{dialog.showErrorBox('Paperleaf 启动失败','请重新下载安装包并安装后启动 Paperleaf。');app.quit();});
 app.on('before-quit',event=>{if(quitting)return;quitting=true;event.preventDefault();updater?.cancel();const timer=setTimeout(()=>app.exit(0),4000);Promise.resolve(runtime?.disconnect()).finally(()=>{clearTimeout(timer);app.exit(0)});});
 app.on('window-all-closed',()=>app.quit());
}
