import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const validVersion=value=>typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value);
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const desktopAppFiles=['main.cjs','preload.cjs','window-policy.cjs','ranch-window.cjs','companion-window.cjs','utility-window.cjs','recovery-controller.cjs','package.json','index.html','renderer.js','recovery.html','recovery.js','ai-sync.html','ai-sync.js','dock.css','icon.png','icon.ico'];
const desktopRuntimeFiles=['botRanch.exe','chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll','dxcompiler.dll','dxil.dll','ffmpeg.dll','icudtl.dat','resources.pak','snapshot_blob.bin','v8_context_snapshot.bin','version','vk_swiftshader.dll','vk_swiftshader_icd.json','vulkan-1.dll','locales/en-US.pak'];
function packageFile(source,file){
 if(typeof file!=='string'||!file||path.isAbsolute(file)||file.includes('\\')||file.split('/').some(p=>!p||p==='..'||p==='.')||/[:\0]/.test(file))throw Error('Invalid release path.');
 const real=fs.realpathSync(path.resolve(source,file)),relative=path.relative(fs.realpathSync(source),real);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!fs.statSync(real).isFile())throw Error('Release path must be a file inside the package.');
 return real;
}
export function validateRelease(source){
 const release=JSON.parse(fs.readFileSync(path.join(source,'release.json'),'utf8'));
 if(!validVersion(release.version)||!Array.isArray(release.files)||!release.files.includes('open-setup.mjs'))throw Error('Invalid botRanch release.');
 const files=new Set();for(const file of release.files){packageFile(source,file);const key=file.toLowerCase();if(files.has(key))throw Error('Duplicate release path.');files.add(key);}
 if(release.desktop||release.files.some(file=>file.startsWith('desktop/'))||fs.existsSync(path.join(source,'desktop'))){
  if(release.desktop?.runtime===false)throw Error('Desktop staging without its runtime is not an installable release.');
  for(const file of [...desktopAppFiles.map(file=>'desktop/resources/app/'+file),...desktopRuntimeFiles.map(file=>'desktop/'+file)])if(!release.files.includes(file))throw Error('Required desktop file missing from release: '+file);
  const pkg=JSON.parse(fs.readFileSync(path.join(source,'desktop/resources/app/package.json'),'utf8'));
  if(pkg.version!==release.version||pkg.main!=='main.cjs')throw Error('Desktop package version or entry point does not match release.');
 }
 if(release.files.includes('ui/manifest.json')&&JSON.parse(fs.readFileSync(path.join(source,'ui/manifest.json'),'utf8')).version!==release.version)throw Error('UI manifest version does not match release.');
 let hashes=release.hashes;
 if(!hashes){
  // Historical full ZIPs carry their integrity data separately. Preserve it on install.
  const sums=path.join(source,'SHA256SUMS.txt');if(!fs.existsSync(sums))throw Error('Release integrity checksums are missing.');
  hashes={};for(const line of fs.readFileSync(sums,'utf8').trim().split(/\r?\n/)){const match=/^([a-f0-9]{64})  (.+)$/.exec(line);if(!match||Object.hasOwn(hashes,match[2]))throw Error('Invalid release checksums.');hashes[match[2]]=match[1];}
  if(hashes['release.json']!==digest(packageFile(source,'release.json')))throw Error('Release manifest checksum mismatch.');
 }
 if(!hashes||typeof hashes!=='object'||Array.isArray(hashes))throw Error('Invalid release integrity checksums.');
 for(const file of release.files)if(!/^[a-f0-9]{64}$/.test(hashes[file]||'')||digest(packageFile(source,file))!==hashes[file])throw Error('Release integrity checksum mismatch: '+file);
 return {...release,hashes:Object.fromEntries(release.files.map(file=>[file,hashes[file]]))};
}
function sameRelease(left,right){return left.version===right.version&&left.files.length===right.files.length&&left.files.every(file=>left.hashes[file]===right.hashes[file]);}
function insideVersions(directory,versions){const real=fs.realpathSync(directory);if(path.dirname(real)!==fs.realpathSync(versions))throw Error('Installed version must stay inside the versions directory.');return real;}
export function installRelease(source,destination){
 const release=validateRelease(source);destination=path.resolve(destination);
 const versionRoot=path.join(destination,'versions');fs.mkdirSync(versionRoot,{recursive:true});const installed=path.join(versionRoot,release.version);
 if(fs.realpathSync(versionRoot)!==path.join(fs.realpathSync(destination),'versions'))throw Error('Versions directory must not redirect outside the install.');
 if(fs.existsSync(installed)){
  if(!sameRelease(release,validateRelease(insideVersions(installed,versionRoot))))throw Error('Existing version contains different release content. Use a new version.');
 }else{
  const staging=fs.mkdtempSync(path.join(versionRoot,'.install-'));
  try{
   for(const file of release.files){const target=path.join(staging,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,file),target);}
   fs.copyFileSync(path.join(source,'release.json'),path.join(staging,'release.json'));
   if(!JSON.parse(fs.readFileSync(path.join(source,'release.json'),'utf8')).hashes)fs.copyFileSync(path.join(source,'SHA256SUMS.txt'),path.join(staging,'SHA256SUMS.txt'));
   if(!sameRelease(release,validateRelease(staging)))throw Error('Staged release integrity mismatch.');
   fs.renameSync(staging,installed);
  }finally{if(fs.existsSync(staging)){insideVersions(staging,versionRoot);if(!path.basename(staging).startsWith('.install-'))throw Error('Invalid staging cleanup path.');fs.rmSync(staging,{recursive:true,force:true});}}
 }
 fs.writeFileSync(path.join(destination,'launcher.mjs'),`import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),{version}=JSON.parse(fs.readFileSync(path.join(root,'current.json'),'utf8'));
if(!/^\\d+\\.\\d+\\.\\d+$/.test(version))throw Error('Invalid installed version');
const release=path.join(root,'versions',version),desktop=path.join(release,'open-desktop.mjs');
if(fs.existsSync(desktop)){const {openDesktop}=await import(pathToFileURL(desktop).href);openDesktop(release);}
else{const child=spawn(process.execPath,[path.join(release,'open-setup.mjs')],{stdio:'inherit',windowsHide:true});child.on('exit',code=>process.exitCode=code||0);child.on('error',error=>{console.error(error.message);process.exitCode=1;});}
`);
 fs.writeFileSync(path.join(destination,'Open botRanch.cmd'),'@echo off\r\nnode "%~dp0launcher.mjs"\r\nif errorlevel 1 pause\r\n');
 fs.writeFileSync(path.join(destination,'launcher-cli.mjs'),`import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),{version}=JSON.parse(fs.readFileSync(path.join(root,'current.json'),'utf8'));
if(!/^\\d+\\.\\d+\\.\\d+$/.test(version))throw Error('Invalid installed version');
const cli=path.join(root,'versions',version,'ranch-cli.mjs');if(!fs.existsSync(cli)){console.error('AI Sync CLI is unavailable in the installed release.');process.exitCode=1;}else{const result=spawnSync(process.execPath,[cli,...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});if(result.error){console.error(result.error.message);process.exitCode=1;}else process.exitCode=result.status??1;}
`);
 fs.writeFileSync(path.join(destination,'botRanch-cli.cmd'),'@echo off\r\nnode "%~dp0launcher-cli.mjs" %*\r\n');
 const pointer=path.join(destination,'current.json');let previous;
 if(fs.existsSync(pointer)){previous=JSON.parse(fs.readFileSync(pointer,'utf8'));if(!validVersion(previous.version))throw Error('Invalid current installed version.');}
 const next={version:release.version};
 const previousVersion=previous?.version===release.version?previous.previousVersion:previous?.version;
 if(validVersion(previousVersion)&&previousVersion!==release.version)next.previousVersion=previousVersion;
 const pending=path.join(destination,'current.'+randomUUID()+'.tmp');
 try{fs.writeFileSync(pending,JSON.stringify(next)+'\n',{flag:'wx'});fs.renameSync(pending,pointer);}finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
 return {directory:destination,launcher:path.join(destination,'Open botRanch.cmd'),icon:path.join(installed,'desktop/resources/app/icon.ico'),version:release.version};
}
export function rollbackRelease(destination){
 const {previousVersion}=JSON.parse(fs.readFileSync(path.join(destination,'current.json'),'utf8'));
 if(!validVersion(previousVersion))throw Error('No previous verified release is recorded.');
 const versions=path.join(destination,'versions'),source=insideVersions(path.join(versions,previousVersion),versions);
 return installRelease(source,destination);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{const source=path.dirname(fileURLToPath(import.meta.url)),destination=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Programs','botRanch'),result=installRelease(source,destination);const shortcut=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(source,'Install-Shortcut.ps1'),'-Target',result.launcher,'-IconPath',result.icon],{windowsHide:true,stdio:'inherit'});if(shortcut.error||shortcut.status!==0)console.error('Installed; shortcut could not be created. Use '+result.launcher);console.log('botRanch '+result.version+' installed at '+result.directory+'\nIf botRanch is already open, choose Quit desktop app from its tray menu first.\nThen open botRanch from the Start menu to use this version.\nInstalling does not replace a running dock. Quitting the dock leaves bot work running.');}catch(error){console.error(error.message);process.exitCode=1;}}
