// Fetch the already-built release installer; never rebuild or execute it here.
// The source manifest pins the complete EXE and the updater verifies each chunk.
import fs from 'node:fs/promises';
import path from 'node:path';
import {DesktopUpdater} from '../desktop/updater.mjs';
const release=JSON.parse(await fs.readFile('desktop/release.json','utf8'));
if(process.env.RELEASE_TAG&&process.env.RELEASE_TAG!==`v${release.version}`)throw Error('Release tag and pinned installer metadata differ');
const dataDir=path.resolve('work/release-download');
const updater=new DesktopUpdater({version:'0.0.0',site:'https://paperleaf-xcz-reader.shamboo2003.chatgpt.site',dataDir,platform:'win32',arch:'x64',fetch:(...args)=>fetch(...args),launch:async()=>{throw Error('This script never executes installers')}});
const state=await updater.check();
if(state.status!=='available')throw Error(state.error||'Published installer manifest is unavailable');
if(updater.release.version!==release.version||updater.release.artifact.sha256!==release.sha256)throw Error('Hosted installer does not match the source release');
const result=await updater.download();if(result.status!=='ready')throw Error(result.error||'Installer download did not complete');
const destination=path.resolve('work/installer',path.basename(updater.file));await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(updater.file,destination);
console.log(JSON.stringify({installer:destination,version:release.version,sha256:release.sha256,bytes:updater.release.artifact.size}));
