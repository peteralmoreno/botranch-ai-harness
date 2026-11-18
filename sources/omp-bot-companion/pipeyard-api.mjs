import {PipeyardManagers} from './pipeyard-managers.mjs';
import path from 'node:path';
import fs from 'node:fs';
import {Pipeyard} from './pipeyard.mjs';
import creatureStore from './creature-store.cjs';
import {pipeyardCatalog} from './pipeyard-catalog.mjs';
import {createPipeyardStorage} from './pipeyard-storage.mjs';

function boardRuns(manager){return manager.tasks.filter(t=>t.pipeline&&t.pipelineRun).map(t=>{
 const p=t.pipelineRun;return {id:'board-'+t.id,source:'board',taskId:t.id,title:t.title,templateName:'Board Pipeline',platformName:'Board-managed',platformId:'board',externalId:p.jobId||'',color:/^#[a-f0-9]{6}$/i.test(t.family?.color||'')?t.family.color:'#a8a0cd',description:'Owned by the Board. Open its task to operate this pipeline.',status:p.status||'unknown',tracking:['succeeded','failed'].includes(p.status)?'finished':p.sleeping||p.stopped?'paused':'active',message:p.message||'',progress:null,input:{},result:p.result||null,stages:[],platformNotes:[],notes:[],events:[],capabilities:[],archived:!!t.archived,createdAt:p.startedAt||t.createdAt,lastCheckedAt:p.lastCheckedAt||p.lastChecked||null,lastError:p.lastError||'',deadline:p.deadline||null,nextCheckAt:p.nextCheckAt||null};
});}
export function createPipeyardApi(manager){
 let service;
 let storageService;const storage=()=>storageService||=(createPipeyardStorage(manager));
 const stewards=new PipeyardManagers(manager);
 const yard=()=>{storage().available();const root=storage().root();if(!service||service.root!==root){if(service?.busy)throw Error('Pipeyard is busy; wait before changing home.');service=new Pipeyard({root,now:manager.now});}return service;};
 return {
  get busy(){return service?.busy||false;},
  async tick(){if(!service&&(!manager.library?.root||!fs.existsSync(path.join(storage().root(),'runs.json'))))return;await yard().tick();},
  async handle({method,url,body}){
   const ai=url.startsWith('/admin/ai/pipeyard/'),prefix=ai?'/admin/ai/pipeyard/':'/admin/pipeyard/',route=url.slice(prefix.length);
   try{
    if(!ai&&method==='GET'&&route==='storage')return {status:200,body:storage().view()};
    if(!ai&&method==='POST'&&route==='storage')return {status:200,body:storage().relocate(yard(),body)};
    if(!ai&&['creatures','ranch-creatures'].includes(route)&&['GET','POST'].includes(method)){const scope=manager.library.root;if(method==='POST'&&body?.scope!==scope)return {status:409,body:{error:'Bot home changed. Reload the yard before saving animals.'}};const store=creatureStore.createCreatureStore(path.join(scope,route==='ranch-creatures'?'ranch':'pipeyard','creatures.json'),{empty:route==='ranch-creatures'});return {status:200,body:{...(method==='GET'?store.read():store.save(body)),scope}};}
    if(method==='GET'&&route==='catalog')return {status:200,body:pipeyardCatalog};
    if(method==='GET'&&route==='snapshot'){const snapshot=yard().snapshot();return {status:200,body:{...snapshot,...stewards.snapshot([...snapshot.runs,...boardRuns(manager).map(r=>({...r,shape:'standard',...yard().boardAppearances[r.id]}))])}};}
    if(!ai&&method==='POST'&&route==='test-connection')return {status:200,body:await yard().testConnection(body)};
    if(!ai&&method==='POST'&&route==='preview')return {status:200,body:{preview:yard().preview(body)}};
    if(!ai&&method==='GET'&&route==='config')return {status:200,body:yard().configuration()};
    if(!ai&&method==='POST'&&route==='config')return {status:200,body:body?.reload===true?yard().reload():yard().configure(body)};
    if(method==='POST'&&route==='action'){
     const {action,...input}=body||{};
     if(ai&&['create-manager','start-manager'].includes(action))return {status:403,body:{error:'Create managers through the Pipeyard controls or Factory.'}};
     if(ai){const mode=manager.aiState?.access;if(mode!=='operate'&&!(['inspect','organize'].includes(mode)&&pipeyardCatalog.permissions.inspect.includes(action))&&!(mode==='organize'&&pipeyardCatalog.permissions.organize.includes(action)))return {status:403,body:{error:'This action requires '+(pipeyardCatalog.permissions.organize.includes(action)?'Organize':'Operate')+' access in AI Sync.'}};}
     if(action==='start-manager'){const p=stewards.profiles().find(p=>p.id===input.managerId);if(!p)throw Error('Choose an active Pipeyard manager.');return {status:200,body:await manager.action(p.id,'resume')};}
     if(action==='create-manager')return {status:200,body:stewards.create(input)};
     if(['handoff','check-yard'].includes(action))return {status:200,body:stewards.handoff(input,yard().snapshot().runs,action==='check-yard')};
     if(action==='delete'&&manager.tasks.some(t=>t.pipeyardRunId===input.id&&((!t.archived&&t.status!=='done')||manager.taskLocks.has(t.id)||t.attempts?.some(a=>['dispatching','awaiting-runtime','claimed','running','unresolved'].includes(a.state)))))throw Error('Finish or archive the unfinished manager review before deleting this pipeline.');
     if(action==='set-appearance'&&String(input.id).startsWith('board-')){const run=boardRuns(manager).find(r=>r.id===input.id);if(!run)throw Error('Unknown Board pipeline.');return {status:200,body:{...run,...yard().setBoardAppearance(input)}};}
     if(input.taskId&&!manager.tasks.some(t=>t.id===input.taskId))throw Error('Unknown linked Board task.');
     return {status:200,body:await yard().execute(action,input)};
    }
    return {status:404,body:{error:'Unknown Pipeyard route.'}};
   }catch(error){return {status:error.status===409?409:400,body:{error:error instanceof SyntaxError?'Pipeyard configuration or state contains invalid JSON.':error.message,...(error.code==='PIPEYARD_SETTINGS_CHANGED'?{code:error.code}:{}),...(error.code==='PIPEYARD_BUSY'?{code:error.code,retryable:true}:{}),...(error.code==='PIPEYARD_LIMIT'?{code:error.code,limit:error.limit}:{})}};}
  }
 };
}
