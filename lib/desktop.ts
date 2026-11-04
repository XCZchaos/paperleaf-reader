export type DesktopBridge={version:string;request:(path:string,options:{method:string;body?:string})=>Promise<any>;disconnect:()=>Promise<void>};
declare global {interface Window {paperleafDesktop?:DesktopBridge}}
export const desktopBridge=()=>typeof window==='undefined'?undefined:window.paperleafDesktop;
