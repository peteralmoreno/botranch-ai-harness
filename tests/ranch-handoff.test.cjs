const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

async function fixture(t,native={}){
 const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranch-handoff-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const manager=new RanchManager({dir,native,now:()=>100000});
 manager.scheduleAutoPickup=()=>{};
 const profile=manager.saveProfile({nickname:'Brick',folder:dir,color:0,autoPickup:true});
 const task=input=>manager.saveTask({title:'Check project',projectFolder:dir,instructions:'Inspect and report.',assignedProfileId:profile.id,expectedRevision:manager.taskRevision,...input});
 return {manager,profile,task,dir};
}
function stamp(file){fs.utimesSync(file,1000,1000);return fs.statSync(file).mtimeMs;}

test('archiving released assigned work keeps the board readable and excludes it from queue reasons',async t=>{
 const {manager:m,task}=await fixture(t);m.pickupPaused=false;
 const first=task({releasedForPickup:true});
 assert.equal(m.archiveTask(first.id,first.revision).waitingReason,'');
 assert.equal(m.view().tasks[0].waitingReason,'');
 const second=task({releasedForPickup:true,title:'Second'}),third=task({releasedForPickup:true,title:'Third'});
 assert.equal(m.publicTask(m.tasks.find(x=>x.id===second.id)).waitingReason,'');
 assert.match(m.publicTask(m.tasks.find(x=>x.id===third.id)).waitingReason,/Waiting behind: Second/);
 assert.equal(m.view().tasks.find(x=>x.id===first.id).waitingReason,'');
});

test('unchanged portable exports keep timestamps while changed records and missing exports are saved',async t=>{
 const {manager:m,profile,task}=await fixture(t);const item=task({});
 const botFile=path.join(m.library.root,'bots',profile.id,'profile.json'),taskFile=path.join(m.library.root,'tasks',item.id+'.json');
 const botTime=stamp(botFile),taskTime=stamp(taskFile);m.persist();
 assert.equal(fs.statSync(botFile).mtimeMs,botTime);assert.equal(fs.statSync(taskFile).mtimeMs,taskTime);
 m.tasks[0].title='Updated';m.persist();
 assert.equal(JSON.parse(fs.readFileSync(taskFile,'utf8')).title,'Updated');assert.equal(fs.statSync(botFile).mtimeMs,botTime);
 m.profiles[0].nickname='New name';m.persist();assert.equal(JSON.parse(fs.readFileSync(botFile,'utf8')).nickname,'New name');
 fs.unlinkSync(taskFile);m.persist();assert.equal(JSON.parse(fs.readFileSync(taskFile,'utf8')).title,'Updated');
});

test('failed portable export retries and changing home writes all records and completion handovers',async t=>{
 const {manager:m,profile,task,dir}=await fixture(t);const item=task({}),record=m.tasks[0];
 const taskFile=path.join(m.library.root,'tasks',item.id+'.json');
 fs.mkdirSync(taskFile+'.tmp');record.title='Retry export';assert.throws(()=>m.persist());fs.rmdirSync(taskFile+'.tmp');m.persist();
 assert.equal(JSON.parse(fs.readFileSync(taskFile,'utf8')).title,'Retry export');
 record.attempts=[{id:'completed-attempt',state:'completed',profileId:profile.id,projectFolder:dir,summary:'Verified work.'}];m.persist();
 const handover=path.join(m.library.root,'handovers','completed-attempt.md');assert.match(fs.readFileSync(handover,'utf8'),/Verified work/);
 const oldTime=stamp(taskFile);m.persist();assert.equal(fs.statSync(taskFile).mtimeMs,oldTime);
 const home=path.join(dir,'new-home');m.setHome(home);
 assert.equal(JSON.parse(fs.readFileSync(path.join(home,'tasks',item.id+'.json'),'utf8')).title,'Retry export');
 assert.ok(fs.existsSync(path.join(home,'bots',profile.id,'profile.json')));assert.match(fs.readFileSync(path.join(home,'handovers','completed-attempt.md'),'utf8'),/Verified work/);
});

test('manual reopen starts fresh unique histories while resume of a live terminal only focuses it',async t=>{
 const launches=[];let live=false,focuses=0;
 const native={checks:async()=>[],status:async()=>live?'live':'closed',focus:async()=>{focuses++;return 'focused';},close:async()=>{live=false;return 'closed';},launch:async(_p,_r,mode,history)=>{launches.push({mode,history});live=true;return {pid:123,started:'638000000000000000'};}};
 const {manager:m,profile:p}=await fixture(t,native);
 await m.action(p.id,'resume');fs.writeFileSync(path.join(launches[0].history,'old-session.txt'),'Keep history');
 await m.action(p.id,'resume');assert.equal(focuses,1);assert.equal(launches.length,1);
 await m.action(p.id,'new',true);m.profiles[0].contextEpoch=7;await m.action(p.id,'new',true);await m.action(p.id,'new',true);
 assert.ok(launches.every(x=>x.mode==='new'));assert.equal(new Set(launches.map(x=>x.history)).size,4);
 assert.ok(launches.every(x=>x.history.startsWith(path.join(m.library.root,'sessions',p.id)+path.sep)));
 assert.equal(fs.readFileSync(path.join(launches[0].history,'old-session.txt'),'utf8'),'Keep history');
});

test('reopening a dead task terminal before reconciliation preserves an explicitly retryable interruption',async t=>{
 const native={checks:async()=>[],status:async()=> 'closed',launch:async()=>({pid:123,started:'638000000000000000'})};
 const {manager:m,profile:p,task}=await fixture(t,native);const item=task({});
 const attempt=await m.dispatchTask(item.id,p.id,item.revision);
 await m.action(p.id,'resume');
 const interrupted=m.tasks[0];assert.equal(interrupted.status,'blocked');assert.equal(interrupted.attempts[0].state,'unresolved');
 assert.equal(interrupted.attempts[0].id,attempt.id);
 const retry=await m.prepareTaskRetry(item.id,interrupted.revision);assert.equal(retry.status,'todo');assert.equal(retry.attempts[0].state,'failed');
});

test('role and reporting instructions reach the supported OMP systemPrompt result without losing base segments',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranch-role-prompt-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const roleFile=path.join(dir,'agent.md');fs.writeFileSync(roleFile,'Act as the project reviewer.');
 const values={OMP_BOT_ROLE_FILE:roleFile,OMP_BOT_ROLE_MODEL:'auto',OMP_BOT_PROFILE_ID:'brick',OMP_BOT_LAUNCH_ID:'launch',OMP_BOT_RUNTIME_TOKEN:'c'.repeat(64),OMP_BOT_TASK_ID:'',OMP_BOT_ATTEMPT_ID:'',OMP_BOT_DISPATCH_TOKEN:''},saved={};
 for(const [key,value]of Object.entries(values)){saved[key]=process.env[key];process.env[key]=value;}
 try{
  const {default:extension}=await import('../sources/omp-bot-companion/extension.mjs');const handlers=new Map();extension({on:(event,handler)=>handlers.set(event,handler),registerTool:()=>{},registerCommand:()=>{}});
  const base=['Base work rules.','Project rules.'];const result=await handlers.get('before_agent_start')({systemPrompt:base},{});
  assert.ok(Array.isArray(result.systemPrompt));assert.deepEqual(result.systemPrompt.slice(0,2),base);
  assert.match(result.systemPrompt.at(-1),/Act as the project reviewer/);assert.match(result.systemPrompt.at(-1),/ranch_status/);assert.equal(base.length,2);
  const stringResult=await handlers.get('before_agent_start')({systemPrompt:'Older base prompt.'},{});assert.equal(stringResult.systemPrompt[0],'Older base prompt.');
 }finally{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('an uncertain launch recovered from its binding remains retryable after reopening',async t=>{
 let fail=true;
 const native={checks:async()=>[],status:async()=> 'closed',launch:async()=>{if(fail)throw Object.assign(Error('Launch timed out'),{uncertain:true});return {pid:456,started:'638000000000000001'};}};
 const {manager:m,profile:p,task}=await fixture(t,native);const item=task({});
 await assert.rejects(()=>m.dispatchTask(item.id,p.id,item.revision),/timed out/);
 const old=m.runs[p.id];fs.writeFileSync(old.bindingFile,JSON.stringify({pid:123,started:'638000000000000000'}));
 await m.reconcile();assert.equal(m.tasks[0].attempts[0].state,'unresolved');
 fail=false;await m.action(p.id,'resume');
 assert.notEqual(m.runs[p.id].launchId,old.launchId);
 const retry=await m.prepareTaskRetry(item.id,m.tasks[0].revision);assert.equal(retry.status,'todo');assert.equal(retry.attempts[0].state,'failed');
});
