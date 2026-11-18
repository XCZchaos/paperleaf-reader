let promise:Promise<Record<string,string>>|null=null;
export function loadArgumentFonts(){
 if(!promise)promise=(async()=>{
  const entries=[['lora400','lora-latin-400-normal.woff2'],['lora600','lora-latin-600-normal.woff2'],['ibm400','ibm-plex-sans-latin-400-normal.woff2'],['ibm600','ibm-plex-sans-latin-600-normal.woff2'],['loraLicense','lora-OFL.txt'],['ibmLicense','ibm-plex-sans-OFL.txt']];
  return Object.fromEntries(await Promise.all(entries.map(async([key,file])=>{
   const r=await fetch('/fonts/'+file,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('离线字体载入失败，请重试');
   if(file.endsWith('.txt'))return[key,await r.text()];
   const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>200000||String.fromCharCode(...bytes.slice(0,4))!=='wOF2')throw Error('离线字体格式无效');
   let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return[key,btoa(binary)];
  })));
 })().catch(e=>{promise=null;throw e});return promise;
}
