const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
async function setup(){const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'pipeyard-delete-'));let calls=0;const options={root,fetchImpl:async()=>{calls++;throw Error('No remote calls permitted.')}};return {yard:new Pipeyard(options),reload:()=>new Pipeyard(options),calls:()=>calls,root};}
test('deleting History removes local data permanently and prevents replaying its creation request',async()=>{
 const {yard,reload,calls,root}=await setup(),input={requestId:'original-request',title:'Private local title',color:'#67a9a6'},run=await yard.execute('create-local',input);
 await assert.rejects(()=>yard.execute('delete',{id:run.id,confirmed:true,expectedUpdatedAt:run.updatedAt}),/History|archive/i);
 await yard.execute('note',{id:run.id,text:'Private local note'});const archived=await yard.execute('clear',{id:run.id}),body={id:run.id,confirmed:true,expectedUpdatedAt:archived.updatedAt};
 await assert.rejects(()=>yard.execute('delete',{...body,expectedUpdatedAt:0}),/changed/i);yard.locks.add(run.id);await assert.rejects(()=>yard.execute('delete',body),/busy/i);yard.locks.clear();
 assert.deepEqual(await yard.execute('delete',body),{id:run.id,deleted:true});assert.equal(yard.snapshot().runs.length,0);assert.equal(calls(),0);
 const next=reload();assert.equal(next.snapshot().runs.length,0);assert.deepEqual(await next.execute('delete',body),{id:run.id,deleted:true});await assert.rejects(()=>next.execute('create-local',input),/deleted/i);
 await assert.rejects(()=>next.execute('launch',{templateId:'any',requestId:'original-request',input:{}}),/deleted/i);
 const saved=fs.readFileSync(path.join(root,'runs.json'),'utf8');assert.doesNotMatch(saved,/Private local|original-request/);
});
