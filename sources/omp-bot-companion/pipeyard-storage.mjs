import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// The pointer belongs to this companion installation, not to a portable bot home.
export function createPipeyardStorage(manager){
 const file=path.join(manager.dir,'pipeyard-storage.json');
 let configured='';
 if(fs.existsSync(file)){
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  if(saved.version!==1||typeof saved.folder!=='string'||!path.isAbsolute(saved.folder))throw Error('Invalid Pipeyard storage settings. Restore pipeyard-storage.json.');
  configured=saved.folder;
 }
 const root=()=>configured||path.join(manager.library.root,'pipeyard');
 const view=()=>({folder:root(),defaultFolder:path.join(manager.library.root,'pipeyard'),custom:!!configured,format:'json',runsFile:path.join(root(),'runs.json'),configFile:path.join(root(),'config.json')});
 function relocate(service,body){
  if(!body||Object.keys(body).some(k=>!['folder','expectedFolder'].includes(k))||typeof body.folder!=='string'||!body.folder.trim()||body.folder.length>4096||/[\x00-\x1f]/.test(body.folder)||!path.isAbsolute(body.folder.trim()))throw Error('Choose an absolute Pipeyard storage folder.');
  if(body.expectedFolder!==root()){const error=Error('Pipeyard storage changed. Reload Settings before saving.');error.status=409;throw error;}
  if(service.busy){const error=Error('Wait for the current Pipeyard check or action before changing storage.');error.status=409;throw error;}
  const destination=path.resolve(body.folder.trim()),source=fs.realpathSync(service.root);
  if(fs.existsSync(destination)&&fs.realpathSync(destination)===source)return view();
  if(fs.existsSync(destination)&&(!fs.statSync(destination).isDirectory()||fs.readdirSync(destination).length))throw Error('Choose an empty folder. Existing files will not be overwritten.');
  // All writes are synchronous: no polling/action can interleave with this switch.
  service.persist();
  fs.mkdirSync(destination,{recursive:true});
  const written=[],temporary=file+'.'+randomUUID()+'.tmp';
  try{
   for(const name of ['runs.json','config.json']){
    const target=path.join(destination,name);
    fs.writeFileSync(target,fs.existsSync(path.join(source,name))?fs.readFileSync(path.join(source,name)):JSON.stringify(service.config,null,2),{flag:'wx',mode:0o600});written.push(target);
   }
   fs.writeFileSync(temporary,JSON.stringify({version:1,folder:destination})+'\n',{flag:'wx',mode:0o600});
   fs.renameSync(temporary,file);
  }catch(error){
   for(const target of [...written,temporary])try{fs.unlinkSync(target);}catch{}
   throw error;
  }
  configured=destination;
  // Retarget the live service without replaying startup migrations or remote calls.
  service.root=destination;service.stateFile=path.join(destination,'runs.json');service.configFile=path.join(destination,'config.json');
  return {...view(),previousFolder:source};
 }
 function available(){if(configured&&['runs.json','config.json'].some(name=>!fs.existsSync(path.join(configured,name))))throw Error('The configured Pipeyard storage is unavailable. Reconnect its drive or restore its files before continuing.');}
 return {root,view,relocate,available};
}
