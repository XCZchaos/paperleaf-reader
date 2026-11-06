const {contextBridge,ipcRenderer}=require('electron');
if(location.origin==='https://paperleaf-xcz-reader.shamboo2003.chatgpt.site'){
 contextBridge.exposeInMainWorld('paperleafDesktop',Object.freeze({version:'1.4.3',request:(path,options)=>ipcRenderer.invoke('paperleaf:codex',path,options),disconnect:()=>ipcRenderer.invoke('paperleaf:disconnect'),update:action=>ipcRenderer.invoke('paperleaf:update',action)}));
}
