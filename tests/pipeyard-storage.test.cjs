const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
async function fixture(){const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createPipeyardApi}=await import('../sources/omp-bot-companion/pipeyard-api.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yard-storage-')),manager=new RanchManager({dir,native:{}});return {dir,manager,createPipeyardApi,api:createPipeyardApi(manager)};}
const request=(api,route,body)=>api.handle({method:body?'POST':'GET',url:'/admin/pipeyard/'+route,body});
test('storage relocation preserves active runs, History, notes and configuration across restart',async()=>{
 const {dir,manager,api,createPipeyardApi}=await fixture();const before=(await request(api,'storage')).body;assert.equal(before.folder,path.join(manager.library.root,'pipeyard'));
 const config={version:1,platforms:[{id:'example',name:'Example',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'}}}],templates:[{id:'report',name:'Report',platformId:'example',color:'#61b7ba'}]};assert.equal((await request(api,'config',config)).status,200);
 const active=(await request(api,'action',{action:'create-local',requestId:'active',title:'Active',color:'#61b7ba'})).body;
 const old=(await request(api,'action',{action:'create-local',requestId:'archive',title:'Archived',color:'#61b7ba'})).body;
 await request(api,'action',{action:'note',id:old.id,text:'Saved result note'});await request(api,'action',{action:'clear',id:old.id});
 const snapshot=(await request(api,'snapshot')).body.runs,folder=path.join(dir,'chosen-storage');
 const moved=await request(api,'storage',{folder,expectedFolder:before.folder});assert.equal(moved.status,200,JSON.stringify(moved.body));assert.equal(moved.body.folder,folder);assert(fs.existsSync(path.join(before.folder,'runs.json')));
 assert.deepEqual((await request(api,'snapshot')).body.runs,snapshot);assert.equal((await request(createPipeyardApi(manager),'storage')).body.folder,folder);
 const reopened=createPipeyardApi(manager);assert.deepEqual((await request(reopened,'snapshot')).body.runs,snapshot);assert.equal((await request(reopened,'config')).body.configPath,path.join(folder,'config.json'));
 assert.equal((await request(reopened,'config')).body.config.templates[0].name,'Report');
 await request(reopened,'action',{action:'note',id:active.id,text:'New folder only'});assert(!fs.readFileSync(path.join(before.folder,'runs.json'),'utf8').includes('New folder only'));assert(fs.readFileSync(path.join(folder,'runs.json'),'utf8').includes('New folder only'));
});
test('storage relocation rejects invalid, occupied and stale destinations without changing records',async()=>{
 const {dir,api}=await fixture(),before=(await request(api,'storage')).body,occupied=path.join(dir,'occupied');fs.mkdirSync(occupied);fs.writeFileSync(path.join(occupied,'keep.txt'),'Keep');
 for(const folder of ['relative',occupied]){const result=await request(api,'storage',{folder,expectedFolder:before.folder});assert.equal(result.status,400);}
 assert.equal((await request(api,'storage',{folder:path.join(dir,'new'),expectedFolder:'stale'})).status,409);
 assert.equal((await request(api,'storage')).body.folder,before.folder);assert.equal(fs.readFileSync(path.join(occupied,'keep.txt'),'utf8'),'Keep');
 assert.equal((await api.handle({method:'GET',url:'/admin/ai/pipeyard/storage'})).status,404);
});
test('storage migration waits for checks, rolls back on pointer failure and never replaces missing custom data',async()=>{
 const {dir,manager,api,createPipeyardApi}=await fixture(),{createPipeyardStorage}=await import('../sources/omp-bot-companion/pipeyard-storage.mjs'),{Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');
 const storage=createPipeyardStorage(manager),service=new Pipeyard({root:storage.root()}),destination=path.join(dir,'new-storage'),body={folder:destination,expectedFolder:storage.root()};
 service.locks.add('check');assert.throws(()=>storage.relocate(service,body),/current Pipeyard/);assert(!fs.existsSync(destination));service.locks.clear();
 fs.mkdirSync(path.join(dir,'pipeyard-storage.json'));assert.throws(()=>storage.relocate(service,body));assert.equal(storage.root(),body.expectedFolder);assert.equal(fs.readdirSync(destination).length,0);fs.rmdirSync(path.join(dir,'pipeyard-storage.json'));
 storage.relocate(service,body);fs.renameSync(path.join(destination,'runs.json'),path.join(destination,'held.json'));
 const result=await request(createPipeyardApi(manager),'snapshot');assert.equal(result.status,400);assert.match(result.body.error,/storage is unavailable/);assert(!fs.existsSync(path.join(destination,'runs.json')));
});
