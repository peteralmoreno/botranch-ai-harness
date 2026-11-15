const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
async function fixture(fn){const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createPipeyardApi}=await import('../sources/omp-bot-companion/pipeyard-api.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yard-managers-'));const manager=new RanchManager({dir,native:{}}),api=createPipeyardApi(manager);const call=(action,body={},ai=false)=>api.handle({method:'POST',url:'/admin/'+(ai?'ai/':'')+'pipeyard/action',body:{action,...body}});await fn({manager,api,call,dir,RanchManager});}
test('Pipeyard gets two separate persisted AI manager slots and a farmer role',()=>fixture(async({manager,call,dir,RanchManager})=>{
 for(let i=0;i<6;i++)manager.saveProfile({nickname:'Bot '+i,color:i,folder:dir});
 const first=await call('create-manager');assert.equal(first.status,200);assert.equal(first.body.nickname,'William');assert.equal(first.body.role,'pipeyard-manager');assert.equal(first.body.design,'farmer');assert.equal(first.body.slot,6);
 assert.equal((await call('create-manager',{nickname:'Willow'})).status,200);assert.equal((await call('create-manager')).status,400);
 const restored=new RanchManager({dir,native:{}});assert.deepEqual(restored.profiles.filter(p=>p.role==='pipeyard-manager').map(p=>p.slot),[6,7]);assert.equal(restored.residents().filter(p=>p.role!=='pipeyard-manager').length,6);
 assert.match(restored.effectiveRole(first.body).instructions,/estimate-progress/);
 const p=restored.profiles.find(p=>p.id===first.body.id);restored.setMembership(p.id,false,p.revision);assert.equal(restored.setMembership(p.id,true,p.revision).slot,6);
}));
test('handoffs are permission gated, retry-safe, assigned and persisted with the run',()=>fixture(async({manager,call,api,dir,RanchManager})=>{
 const created=await call('create-manager');assert.equal(created.status,200);const bot=created.body;
 const local=await call('create-local',{requestId:'sample',title:'Example run',color:'#67a9a6'});const id=local.body.id;
 assert.equal((await call('handoff',{id},true)).status,403);manager.setAiAccess('operate');
 const one=await call('handoff',{id,brief:'Check results and write a summary.'},true);assert.equal(one.status,200);const two=await call('handoff',{id},true);assert.equal(two.body.taskId,one.body.taskId);assert.equal(manager.tasks.length,1);
 const task=manager.tasks[0];assert.equal(task.assignedProfileId,bot.id);assert.equal(task.releasedForPickup,true);assert.equal(task.pipeyardRunId,id);assert.match(task.instructions,/Check results/);assert.match(task.instructions,/Do not wait/);
 const snapshot=await api.handle({method:'GET',url:'/admin/pipeyard/snapshot'});assert.equal(snapshot.body.runs[0].managerAssignment.taskId,task.id);assert.equal(snapshot.body.managers.length,1);
 assert.equal(new RanchManager({dir,native:{}}).tasks[0].pipeyardRunId,id);
 const other=(await call('create-manager',{nickname:'Willow'})).body;
 task.attempts=[{state:'running',profileId:bot.id}];assert.equal((await call('handoff',{id,managerId:other.id})).status,400);
}));
test('managers ignore shared Ranch work; yard checks deduplicate without permitting silent AI creation',()=>fixture(async({manager,call,dir})=>{
 const bot=(await call('create-manager')).body;assert.equal((await call('create-manager',{},true)).status,403);
 const task={id:'ordinary',projectFolder:dir,instructions:'Do work',status:'todo',releasedForPickup:true,attempts:[]};assert.equal(manager.stickyEligible(task,bot,{currentProfileId:bot.id}),false);
 const one=await call('check-yard',{managerId:bot.id}),two=await call('check-yard',{managerId:bot.id});assert.equal(one.status,200);assert.equal(one.body.taskId,two.body.taskId);assert.equal(manager.tasks.length,1);
}));
test('pending transfers stay one task; manager provenance cannot be forged and shared pickup cannot take it',()=>fixture(async({manager,call,dir})=>{
 const first=(await call('create-manager')).body,second=(await call('create-manager')).body;
 const local=(await call('create-local',{requestId:'transfer',title:'Review me',color:'#67a9a6'})).body;
 const one=(await call('handoff',{id:local.id,managerId:first.id,brief:'First pass'})).body;
 const two=(await call('handoff',{id:local.id,managerId:second.id,brief:'Check final results'})).body;assert.equal(two.taskId,one.taskId);assert.equal(manager.tasks.length,1);assert.equal(manager.tasks[0].assignedProfileId,second.id);assert.match(manager.tasks[0].instructions,/Check final/);
 const check=(await call('check-yard',{managerId:first.id})).body;assert.notEqual(manager.tasks.find(t=>t.id===check.taskId).projectFolder,manager.tasks[0].projectFolder);
 const ordinary=manager.saveProfile({nickname:'Ordinary',color:3,folder:dir,autoPickup:true});const task=manager.tasks[0];task.assignedProfileId=null;assert.equal(manager.stickyEligible(task,ordinary,{currentProfileId:ordinary.id}),false);await assert.rejects(()=>manager.dispatchTask(task.id,ordinary.id,task.revision),/Pipeline Manager/);
 const forged=manager.saveTask({title:'Ordinary',instructions:'Test',projectFolder:dir,expectedRevision:manager.taskRevision,pipeyardRunId:local.id,pipeyardManagerTask:'handoff'});assert.equal(forged.pipeyardRunId,null);
}));
test('a manager handoff dispatches a real AI session with scoped instructions and keeps human review on transfer',()=>fixture(async({manager,call})=>{
 const first=(await call('create-manager')).body,second=(await call('create-manager')).body;
 const run=(await call('create-local',{requestId:'ai-session',title:'Results',color:'#67a9a6'})).body;await call('handoff',{id:run.id,managerId:first.id});const task=manager.tasks[0];task.humanReview=true;
 await call('handoff',{id:run.id,managerId:second.id});assert.equal(task.humanReview,true);const current=manager.tasks[0];assert.equal(current.humanReview,true);let launched;
 manager.native={checks:async()=>[],launch:async(profile,execution,mode,history,attempt)=>{launched={profile,attempt,mode};return {pid:12345,started:1};}};
 await manager.dispatchTask(current.id,second.id,current.revision);assert.equal(launched.profile.role,'pipeyard-manager');assert.match(launched.profile.roleInstructions,/estimate-progress/);assert.match(launched.profile.roleInstructions,new RegExp(second.id));assert.equal(launched.attempt.taskId,current.id);assert.equal(current.pipeline,null);
}));
test('retrying a held review reports the hold without silently releasing it',()=>fixture(async({manager,call})=>{
 const owner=(await call('create-manager')).body;const first=(await call('check-yard',{managerId:owner.id})).body;const task=manager.tasks.find(t=>t.id===first.taskId);task.releasedForPickup=false;
 const retry=(await call('check-yard',{managerId:owner.id})).body;assert.equal(retry.taskId,first.taskId);assert.equal(retry.releasedForPickup,false);assert.match(retry.message,/held on the Board/);assert.equal(manager.tasks.length,1);
}));
test('a starting review is reported as active rather than held',()=>fixture(async({manager,call})=>{
 const owner=(await call('create-manager')).body;await call('check-yard',{managerId:owner.id});const task=manager.tasks[0];task.releasedForPickup=false;task.attempts=[{state:'awaiting-runtime',profileId:owner.id}];
 const retry=(await call('check-yard',{managerId:owner.id})).body;assert.equal(retry.attemptState,'awaiting-runtime');assert.match(retry.message,/starting or active/);assert.doesNotMatch(retry.message,/held/);
}));

test('manager wandering stays bounded, freezes when paused, and resumes from the same position',async()=>{
 const {stepManagerWalk}=await import('../sources/omp-bot-companion/setup/pipeyard-ranch.mjs');const pose={x:120,y:100,wait:0},bounds={width:800,height:430,actorWidth:104,actorHeight:120};
 for(let i=0;i<120;i++)stepManagerWalk(pose,bounds,1/60,()=>.8);assert(pose.x>120);assert(pose.y>100);assert(pose.x<=684&&pose.y<=298);
 pose.paused=true;const at={x:pose.x,y:pose.y};for(let i=0;i<100;i++)stepManagerWalk(pose,bounds,1/60,()=>.1);assert.deepEqual({x:pose.x,y:pose.y},at);assert.equal(pose.walking,false);
 stepManagerWalk(pose,{...bounds,width:350,height:300},1/60);assert(pose.x<=234&&pose.y<=168);pose.paused=false;for(let i=0;i<120;i++)stepManagerWalk(pose,bounds,1/60,()=>.2);assert.notDeepEqual({x:pose.x,y:pose.y},at);
});
