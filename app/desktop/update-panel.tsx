'use client';
import {Button} from '@/components/ui/button';
import {useEffect,useState} from 'react';
import {RefreshCw,Download,CheckCircle2,ArrowUpRight,Monitor,LoaderCircle} from 'lucide-react';
import {desktopBridge,type UpdateState} from '@/lib/desktop';
import release from '@/desktop/release.json';
export default function UpdatePanel(){
 const [state,setState]=useState<UpdateState|null>(null),[native,setNative]=useState(false),[legacy,setLegacy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const bridge=desktopBridge();setNative(!!bridge);setLegacy(!!bridge&&!bridge.update);if(!bridge?.update)return;let active=true;const read=()=>bridge.update!('state').then(s=>{if(active)setState(s)}).catch(()=>{});void read();const timer=setInterval(read,1000);return()=>{active=false;clearInterval(timer)}},[]);
 async function action(value:'check'|'download'|'cancel'|'install'){setError('');try{const result=await desktopBridge()?.update?.(value);if(result)setState(result)}catch(e){setError((e as Error).message)}}
 const status=state?.status||'idle',busy=['checking','downloading','installing'].includes(status);
 const heading={idle:'检查桌面版更新',checking:'正在检查新版本…',available:'有新版本可以安装',current:'你已是最新版本',downloading:'正在下载新版',ready:'下载完成，可以安装',installing:'正在启动安装向导…',error:'暂时无法完成更新'}[status];
 return <section className="update-panel" id="updates"><div className="update-heading"><div className="update-icon">{status==='current'||status==='ready'?<CheckCircle2 size={24}/>:<Monitor size={24}/>}</div><div><span className="eyebrow">KEEP YOUR READING FLOW</span><h2>{native?heading:'每一次更新，让阅读更顺手'}</h2><p>{native?`当前版本 ${state?.currentVersion||desktopBridge()?.version} · Windows x64`:`最新版本 ${release.version} · Windows 10 / 11 x64`}</p></div>{native&&!legacy&&<Button variant="outline" className="button" disabled={busy||status==='ready'} onClick={()=>action('check')}><RefreshCw size={16} className={status==='checking'?'spin':''}/>{status==='checking'?'检查中':'检查更新'}</Button>}</div>
 {(state?.error||error)&&<p className="update-error" role="alert">{error||state?.error}</p>}
 {legacy&&<p className="update-error">此旧版尚不支持应用内更新。请先下载并安装 v{release.version}，之后可在这里检查、下载和安装新版。</p>}
 <div className="release-heading"><b>v{state?.release?.version||release.version} 更新内容</b><span>{state?.release?.date||release.date}</span></div>
 <ul className="release-notes">{(state?.release?.notes||release.notes).map((note:string)=><li key={note}>{note}</li>)}</ul>
 {status==='downloading'&&<div className="update-progress" role="status"><div><span>下载 {Math.round((state?.downloaded||0)/1024**2)} / {Math.round((state?.release?.size||0)/1024**2)} MB</span><b>{state?.progress}%</b></div><progress value={state?.progress||0} max={100}/><Button variant="ghost" className="text-button" onClick={()=>action('cancel')}>取消下载</Button></div>}
 <div className="update-footer"><p>{status==='ready'?'安装包校验通过。请先保存正在编辑的内容；安装会退出阅读器。':'更新保留本机登录与云端文献。下载后会自动校验安装包。'}</p>{native&&!legacy?(status==='available'||(status==='error'&&state?.release&&state.release.version!==state.currentVersion))?<Button variant="default" className="button primary" onClick={()=>action('download')}><Download size={16}/>下载新版本</Button>:status==='ready'?<Button variant="default" className="button primary" onClick={()=>action('install')}>退出并安装</Button>:status==='installing'?<LoaderCircle size={18} className="spin"/>:null:<a className="button primary" href={release.downloadUrl} target="_blank" rel="noreferrer"><Download size={16}/>下载安装包<ArrowUpRight size={14}/></a>}</div>
 {state?.checkedAt&&<p className="update-check-time">上次检查：{new Date(state.checkedAt).toLocaleString('zh-CN')}</p>}
 </section>;
}
