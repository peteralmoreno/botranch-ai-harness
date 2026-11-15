const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
async function fixture(){const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bot-placement-'));return {dir,RanchManager,manager:new RanchManager({dir,native:{}})};}
test('yard assignment is independent of role and survives restart and portable profile import',async()=>{
 const {dir,RanchManager,manager:m}=await fixture();const bot=m.saveProfile({nickname:'Painter',role:'designer',design:'designer',color:0,folder:dir,yard:'pipeyard'});assert.equal(bot.slot,6);assert.equal(bot.yard,'pipeyard');
 const moved=m.saveProfile({...bot,expectedRevision:bot.revision,yard:'ranch'});assert.equal(moved.slot,0);assert.equal(moved.role,'designer');assert.equal(moved.design,'designer');
 const role=m.saveProfile({...moved,expectedRevision:moved.revision,role:'pipeyard-manager'});assert.equal(role.yard,'ranch');assert.equal(role.slot,0);
 const restored=new RanchManager({dir,native:{}});assert.equal(restored.profiles[0].yard,'ranch');assert.equal(restored.library.profiles()[0].yard,'ranch');assert.equal(restored.library.profiles()[0].active,false);
 assert.throws(()=>m.saveProfile({...role,expectedRevision:role.revision,yard:'elsewhere'}),/yard/i);
});
test('yard capacity, Bank admission and busy-transfer checks use placement',async()=>{
 const {dir,manager:m}=await fixture();for(let i=0;i<2;i++)m.saveProfile({nickname:'Pipe '+i,role:'designer',folder:dir,color:i,yard:'pipeyard'});
 const bank=m.saveProfile({nickname:'Waiting',role:'generalist',folder:dir,color:2,yard:'pipeyard',active:false});assert.throws(()=>m.setMembership(bank.id,true,bank.revision),/two/);
 const ranch=m.saveProfile({nickname:'Ranch',role:'pipeyard-manager',folder:dir,color:3,yard:'ranch'});assert.equal(ranch.slot,0);assert.throws(()=>m.saveProfile({...ranch,expectedRevision:ranch.revision,yard:'pipeyard'}),/two/);
 m.setMembership(m.profiles[0].id,false,m.profiles[0].revision);m.tasks.push({id:'busy',status:'doing',attempts:[{profileId:ranch.id,state:'running'}]});assert.throws(()=>m.saveProfile({...ranch,expectedRevision:ranch.revision,yard:'pipeyard'}),/Finish|work/);assert.equal(m.profiles.find(p=>p.id===ranch.id).yard,'ranch');
});
test('legacy defaults migrate once and Pipeyard displays ordinary bots without making them managers',async()=>{
 const {dir,RanchManager,manager:m}=await fixture();const legacy=m.saveProfile({nickname:'William',role:'pipeyard-manager',folder:dir,color:0});assert.equal(legacy.yard,'pipeyard');const other=m.saveProfile({nickname:'Designer',role:'designer',folder:dir,color:1,yard:'pipeyard'});
 const {PipeyardManagers}=await import('../sources/omp-bot-companion/pipeyard-managers.mjs');const snapshot=new PipeyardManagers(m).snapshot([]);assert.deepEqual(snapshot.bots.map(p=>p.id),[legacy.id,other.id]);assert.deepEqual(snapshot.managers.map(p=>p.id),[legacy.id]);
 const saved=JSON.parse(fs.readFileSync(m.file,'utf8'));delete saved.profiles[0].yard;fs.writeFileSync(m.file,JSON.stringify(saved));assert.equal(new RanchManager({dir,native:{}}).profiles[0].yard,'pipeyard');
});
test('desktop IPC accepts only explicit valid yard choices for Factory and profile edits',()=>{
 const {actionRequest}=require('../sources/omp-bot-desktop/window-policy.cjs');const draft={nickname:'Painter',folder:'',role:'designer',color:3,yard:'pipeyard'};
 assert.equal(actionRequest('factory',draft).body.yard,'pipeyard');assert.equal(actionRequest('profile-save',{...draft,id:'p1',expectedRevision:1,yard:'ranch'}).body.yard,'ranch');assert.throws(()=>actionRequest('factory',{...draft,yard:'invalid'}));
});
