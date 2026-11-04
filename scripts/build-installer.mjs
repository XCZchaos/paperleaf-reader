import {build,Platform,Arch} from 'electron-builder';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const {version}=JSON.parse(await fs.readFile('desktop/package.json','utf8'));
const packageDir=path.join(root,'work/desktop/release/Paperleaf-win32-x64');
const shipped=[],dirs=[];
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isDirectory()){await walk(file);dirs.push(path.relative(packageDir,file));}else shipped.push(path.relative(packageDir,file));
}}
await walk(packageDir);
const nsisPath=p=>p.split(path.sep).join('\\').replaceAll('$','$$').replaceAll('"','$\\"');
await fs.writeFile('desktop/uninstall-files.nsh',shipped.map(p=>`Delete "$INSTDIR\\${nsisPath(p)}"`).concat(dirs.map(p=>`RMDir "$INSTDIR\\${nsisPath(p)}"`)).join('\n')+'\n');
const files=await build({
  targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),
  prepackaged:path.join(root,'work/desktop/release/Paperleaf-win32-x64'),
  publish:'never',
  config:{
    appId:'com.paperleaf.reader',productName:'Paperleaf',electronVersion:'45.2.2',
    directories:{app:'work/desktop/app',output:'work/desktop/installer'},
    extraMetadata:{version},
    artifactName:'Paperleaf-Setup-${version}-Windows-x64.${ext}',
    win:{signExecutable:false,signAndEditExecutable:false},
    nsis:{script:'desktop/installer.nsi',differentialPackage:false,oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,
      createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'Paperleaf',
      uninstallDisplayName:'Paperleaf',deleteAppDataOnUninstall:false,
      installerLanguages:['zh_CN','en_US'],language:'2052',displayLanguageSelector:false}
  }
});
console.log(JSON.stringify({version,files}));
