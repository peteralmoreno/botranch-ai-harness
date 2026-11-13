const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
async function fixture(){
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'pipe-connections-'));let calls=[],fail=false,wait=null;
 const yard=new Pipeyard({root,now:()=>100000,env:{PIPE_SECRET:'hidden-secret'},fetchImpl:async(url,opts)=>{calls.push({url,opts});if(wait)await wait;if(fail)throw Error('offline');return new Response(JSON.stringify({id:url.split('/').at(-1),status:'running',progress:12,result:{remote:true}}));}});
 yard.configure({version:1,platforms:[{id:'one',name:'One',baseUrl:'https://example.test',credential:{env:'PIPE_SECRET'},operations:{status:{method:'GET',path:'/runs/{runId}'},trigger:{method:'POST',path:'/runs'}}}],templates:[]});
 const template={id:'report',name:'Report',platformId:'one',color:'#b51f43'};
 return {yard,root,template,calls,fail:()=>fail=true,block:p=>wait=p};
}
test('agent template save validates known platforms and publishes accurate scoped limits',async()=>{
 const f=await fixture();const t=await f.yard.execute('save-template',{template:f.template});assert.equal(t.id,'report');assert.equal(f.calls.length,0);
 assert.equal(f.yard.snapshot().limits.demo.visibleRuns,6);assert.equal(f.yard.snapshot().limits.live.runCount,null);assert.equal(f.yard.snapshot().limits.live.templates,200);
 await assert.rejects(f.yard.execute('save-template',{template:{...f.template,platformId:'missing'}}));await assert.rejects(f.yard.execute('save-template',{template:{...f.template,intervalMinutes:2}}));assert.equal(f.yard.snapshot().templates.length,1);
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');assert.equal(new Pipeyard({root:f.root}).snapshot().templates[0].id,'report');
 f.yard.config.templates=Array.from({length:200},(_,i)=>({...t,id:'t'+i}));await assert.rejects(f.yard.execute('save-template',{template:f.template}),/200|limit/i);
});
test('metadata remains local and identity edits verify before clearing stale progress while preserving notes and UUID',async()=>{
 const f=await fixture();await f.yard.execute('save-template',{template:f.template});let run=await f.yard.execute('register',{templateId:'report',externalId:'old',metadata:{links:{platform:'https://example.test/runs/old'},token:'remove',context:'hidden-secret'}});
 assert.equal(run.metadata.token,undefined);assert.equal(run.metadata.context,'[redacted]');await f.yard.execute('note',{id:run.id,text:'Saved note'});await f.yard.execute('refresh',{id:run.id});await f.yard.execute('estimate-progress',{id:run.id,percent:50,reason:'Old data',author:'Scout'});await f.yard.execute('pause-tracking',{id:run.id});
 const before=f.calls.length;let updated=await f.yard.execute('update-run',{id:run.id,title:'Renamed',metadata:{owner:'PM'}});assert.equal(f.calls.length,before);assert.equal(updated.title,'Renamed');assert.deepEqual(updated.metadata,{owner:'PM'});
 updated=await f.yard.execute('update-run',{id:run.id,externalId:'new'});assert.equal(updated.id,run.id);assert.equal(updated.externalId,'new');assert.equal(updated.notes[0].text,'Saved note');assert.equal(updated.tracking,'paused');assert.equal(updated.deadline,run.deadline);assert.equal(updated.progressEstimate,null);assert.equal(updated.connectionHistory.at(-1).externalId,'old');assert.equal(updated.progressResponse.data.id,'new');assert(f.calls.every(c=>c.opts.method==='GET'));
 const existing=await f.yard.execute('register',{templateId:'report',externalId:'other'});await assert.rejects(f.yard.execute('update-run',{id:run.id,externalId:existing.externalId}),/already tracked/i);
 f.fail();await assert.rejects(f.yard.execute('update-run',{id:run.id,externalId:'bad',title:'Must not save',metadata:{bad:true}}));const saved=f.yard.snapshot().runs.find(r=>r.id===run.id);assert.equal(saved.externalId,'new');assert.equal(saved.title,'Renamed');assert.deepEqual(saved.metadata,{owner:'PM'});
});
test('metadata validates size and participates in launch idempotency without being sent remotely',async()=>{
 const f=await fixture();await f.yard.execute('save-template',{template:f.template});await assert.rejects(f.yard.execute('register',{templateId:'report',externalId:'a',metadata:[]}));await assert.rejects(f.yard.execute('register',{templateId:'report',externalId:'a',metadata:{x:'x'.repeat(32768)}}));
 await f.yard.execute('launch',{templateId:'report',requestId:'first',metadata:{localOnly:7}});assert(!f.calls[0].opts.body.includes('localOnly'));await assert.rejects(f.yard.execute('launch',{templateId:'report',requestId:'first',metadata:{localOnly:8}}),/reused|different/i);
});
test('concurrent connection edits cannot bind the same platform ID twice',async()=>{
 const f=await fixture();await f.yard.execute('save-template',{template:f.template});const a=await f.yard.execute('register',{templateId:'report',externalId:'a'}),b=await f.yard.execute('register',{templateId:'report',externalId:'b'});let release;f.block(new Promise(r=>release=r));const first=f.yard.execute('update-run',{id:a.id,externalId:'same'});await assert.rejects(f.yard.execute('update-run',{id:b.id,externalId:'same'}),/busy/i);release();await first;assert.equal(f.yard.snapshot().runs.filter(r=>r.externalId==='same').length,1);
});

test('local placeholders persist without requests and connect by verified ID preserving notes and identity',async()=>{
 const f=await fixture();let run=await f.yard.execute('create-local',{requestId:'local-one',title:'Future report',color:'#b51f43'});assert.equal(f.calls.length,0);assert.equal(run.localOnly,true);assert.equal(run.status,'ready');assert.equal(run.checkDue,false);const id=run.id;
 assert.equal((await f.yard.execute('create-local',{requestId:'local-one',title:'Future report',color:'#b51f43'})).id,id);
 await f.yard.execute('note',{id,text:'Keep these instructions'});await f.yard.tick();assert.equal(f.calls.length,0);
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');assert.equal(new Pipeyard({root:f.root}).snapshot().runs[0].localOnly,true);
 await f.yard.execute('save-template',{template:f.template});run=await f.yard.execute('connect-local',{id,templateId:'report',externalId:'existing-42'});assert.equal(run.id,id);assert.equal(run.localOnly,false);assert.equal(run.status,'running');assert.equal(run.color,'#b51f43');assert.equal(run.notes[0].text,'Keep these instructions');assert.equal(f.calls.length,1);assert.equal(f.calls[0].opts.method,'GET');assert.equal(run.externalId,'existing-42');
 const another=await f.yard.execute('create-local',{requestId:'local-two',title:'Another',color:'#61b7ba'});await assert.rejects(f.yard.execute('connect-local',{id:another.id,templateId:'report',externalId:'existing-42'}),/already tracked/);assert.equal(f.yard.snapshot().runs[1].localOnly,true);
 await assert.rejects(f.yard.execute('create-local',{requestId:'bad',title:'Bad',color:'javascript:red'}),/color/i);
 const failed=await f.yard.execute('create-local',{requestId:'failed',title:'Unconnected',color:'#61b7ba'});f.fail();await assert.rejects(f.yard.execute('connect-local',{id:failed.id,templateId:'report',externalId:'offline'}));const unchanged=f.yard.snapshot().runs.find(r=>r.id===failed.id);assert.equal(unchanged.localOnly,true);assert.equal(unchanged.externalId,'');
});


test('appearance changes persist without remote requests or changing pipeline behavior',async()=>{
 const f=await fixture();await f.yard.execute('save-template',{template:f.template});const run=await f.yard.execute('register',{templateId:'report',externalId:'appearance'}),before=f.calls.length;
 const result=await f.yard.execute('set-appearance',{id:run.id,color:'#b51f43',shape:'orchestrator'});
 assert.equal(result.color,'#b51f43');assert.equal(result.shape,'orchestrator');assert.equal(result.status,run.status);assert.equal(result.externalId,run.externalId);assert.equal(f.calls.length,before);
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');const saved=new Pipeyard({root:f.yard.root}).snapshot().runs[0];assert.equal(saved.shape,'orchestrator');assert.equal(saved.color,'#b51f43');
 for(const body of [{shape:'javascript'},{color:'red'},{},{shape:'quick',externalId:'other'}])await assert.rejects(f.yard.execute('set-appearance',{id:run.id,...body}));
 assert.equal(f.yard.snapshot().runs[0].shape,'orchestrator');
});
