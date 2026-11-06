export type UpdateState={status:'idle'|'checking'|'available'|'current'|'downloading'|'ready'|'installing'|'error';currentVersion:string;release:{version:string;date:string;notes:string[];size:number}|null;progress:number;downloaded:number;error:string;checkedAt:number|null};
export type DesktopBridge={version:string;request:(path:string,options:{method:string;body?:string})=>Promise<any>;disconnect:()=>Promise<void>;update?:(action:'state'|'check'|'download'|'cancel'|'install')=>Promise<UpdateState>;setReaderFocus?:(enabled:boolean)=>Promise<void>;onReaderFocusToggle?:(callback:()=>void)=>()=>void};
declare global {interface Window {paperleafDesktop?:DesktopBridge}}
export const desktopBridge=()=>typeof window==='undefined'?undefined:window.paperleafDesktop;
