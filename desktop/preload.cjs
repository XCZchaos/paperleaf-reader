const {contextBridge,ipcRenderer}=require('electron');
if(location.origin==='https://paperleaf-xcz-reader.shamboo2003.chatgpt.site'){
 contextBridge.exposeInMainWorld('paperleafDesktop',Object.freeze({version:'1.4.4',request:(path,options)=>ipcRenderer.invoke('paperleaf:codex',path,options),disconnect:()=>ipcRenderer.invoke('paperleaf:disconnect'),update:action=>ipcRenderer.invoke('paperleaf:update',action),setReaderFocus:enabled=>ipcRenderer.invoke('paperleaf:reader-focus',enabled),onReaderFocusToggle:callback=>{const listener=()=>callback();ipcRenderer.on('paperleaf:toggle-reader-focus',listener);return()=>ipcRenderer.removeListener('paperleaf:toggle-reader-focus',listener)}}));
}
