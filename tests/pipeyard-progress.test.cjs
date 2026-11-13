const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('registration retains the first status JSON even for an already completed run',async()=>{
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pipe-register-response-'));
 const yard=new Pipeyard({root,fetchImpl:async()=>new Response(JSON.stringify({id:'done',status:'succeeded',custom:{report:'ready'}}))});
 yard.configure({version:1,platforms:[{id:'example',name:'Example',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'}}}],templates:[{id:'one',name:'One',platformId:'example',color:'#61b7ba'}]});
 const run=await yard.execute('register',{templateId:'one',externalId:'done'});
 assert.equal(run.progressResponse?.data.custom.report,'ready');assert.equal(run.progressResponse.source,'status');
 assert.deepEqual(new Pipeyard({root}).snapshot().runs[0].progressResponse,run.progressResponse);
});
async function fixture({progress=true}={}){
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');
 let time=100000,calls=0,fail=false,wait=null,data={percent:34,custom:{items:[{name:'first',ok:true}],detail:'sample-secret'},api_key:'hidden'};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pipeyard-progress-'));
 const yard=new Pipeyard({root,now:()=>time,env:{PIPE_TEST:'sample-secret'},fetchImpl:async url=>{calls++;if(wait)await wait;if(url.endsWith('/progress')){if(fail)return new Response('{}',{status:429,headers:{'Retry-After':'60'}});return new Response(JSON.stringify(data));}return new Response(JSON.stringify({id:'remote',status:'running',progress:12,custom:['status detail']}));}});
 yard.configure({version:1,platforms:[{id:'local',name:'Local',baseUrl:'https://example.test',credential:{env:'PIPE_TEST'},operations:{status:{method:'GET',path:'/runs/{runId}'},...(progress?{progress:{method:'GET',path:'/runs/{runId}/progress'}}:{})},fields:{progress:'percent'}}],templates:[{id:'one',name:'One',platformId:'local',color:'#61b7ba',intervalMinutes:1,waitMinutes:10}]});
 const run=await yard.execute('register',{templateId:'one',externalId:'remote'});
 return {yard,root,id:run.id,get calls(){return calls;},advance:n=>time+=n,change:value=>data=value,fail:()=>fail=true,block:p=>wait=p};
}
test('check-due honors interval, pause, expiry, archive and Retry-After; manual check does not renew budget',async()=>{
 const f=await fixture(),deadline=f.yard.runs[0].deadline;
 await f.yard.execute('check-due',{id:f.id});assert.equal(f.calls,1);
 f.advance(60001);await f.yard.execute('check-due',{id:f.id});assert.equal(f.calls,3);
 await f.yard.execute('check-due',{id:f.id});assert.equal(f.calls,3);
 await f.yard.execute('pause-tracking',{id:f.id});f.advance(60001);await f.yard.execute('check-due',{id:f.id});assert.equal(f.calls,3);
 await f.yard.execute('refresh',{id:f.id});assert.equal(f.calls,5);assert.equal(f.yard.runs[0].deadline,deadline);assert.equal(f.yard.runs[0].tracking,'paused');
 await f.yard.execute('resume-tracking',{id:f.id,minutes:10});f.advance(600001);const before=f.calls;await f.yard.execute('check-due',{id:f.id});assert.equal(f.calls,before);
 f.yard.runs[0].deadline=99999999;f.yard.runs[0].tracking='active';f.yard.runs[0].archived=true;await f.yard.execute('check-due',{id:f.id});assert.equal(f.calls,before);f.yard.runs[0].archived=false;
 f.fail();await f.yard.execute('refresh',{id:f.id});const failed=f.calls;await f.yard.execute('check-due',{id:f.id});await f.yard.execute('refresh',{id:f.id});assert.equal(f.calls,failed);
});
test('due checks and background polling never duplicate an in-flight check',async()=>{
 const f=await fixture();f.advance(60001);let unblock;f.block(new Promise(r=>unblock=r));
 const running=f.yard.execute('check-due',{id:f.id});const saved=await f.yard.execute('check-due',{id:f.id});assert.equal(saved.id,f.id);await f.yard.tick();assert.equal(f.calls,2);unblock();await running;assert.equal(f.calls,3);
});
test('flexible progress JSON persists, redacts secrets, and retains last successful response after failure',async()=>{
 const f=await fixture();let run=await f.yard.execute('refresh',{id:f.id});
 assert.equal(run.progress,34);assert.equal(run.progressResponse.source,'progress');assert.equal(run.progressResponse.data.custom.items[0].ok,true);assert.equal(run.progressResponse.data.custom.detail,'[redacted]');assert.equal(run.progressResponse.data.api_key,undefined);
 const saved=run.progressResponse;const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');assert.deepEqual(new Pipeyard({root:f.root}).snapshot().runs[0].progressResponse,saved);assert(!fs.readFileSync(path.join(f.root,'runs.json'),'utf8').includes('sample-secret'));
 f.advance(1000);f.fail();run=await f.yard.execute('refresh',{id:f.id});assert.deepEqual(run.progressResponse,saved);assert.match(run.lastError,/Progress details unavailable/);
});
test('response review is local, tied to content revision, and rejects a stale agent',async()=>{
 const f=await fixture();let run=await f.yard.execute('refresh',{id:f.id}),responseId=run.progressResponse.id;
 const calls=f.calls;run=await f.yard.execute('review-progress',{id:f.id,responseId,author:'Scout',summary:'Investigated the result.'});assert.equal(f.calls,calls);assert.equal(run.progressResponse.review.author,'Scout');assert.equal(run.notes.at(-1).responseId,responseId);assert.equal(run.status,'running');
 f.advance(1000);run=await f.yard.execute('refresh',{id:f.id});assert.equal(run.progressResponse.id,responseId);assert.equal(run.progressResponse.review.author,'Scout');assert.equal(run.progressResponse.fetchedAt,101000);
 f.change([{stage:'custom',percent:70},false,null]);run=await f.yard.execute('refresh',{id:f.id});assert(Array.isArray(run.progressResponse.data));assert.notEqual(run.progressResponse.id,responseId);assert.equal(run.progressResponse.review,null);
 await assert.rejects(f.yard.execute('review-progress',{id:f.id,responseId,author:'Scout',summary:'Old assessment'}),/changed|superseded/i);
 for(const bad of [{author:''},{summary:''},{summary:'x'.repeat(4001)}])await assert.rejects(f.yard.execute('review-progress',{id:f.id,responseId:run.progressResponse.id,author:'Scout',summary:'Summary',...bad}));
 f.change(null);run=await f.yard.execute('refresh',{id:f.id});assert.equal(run.progressResponse.data,null);
});
test('status-only platforms save a correctly labelled JSON fallback',async()=>{
 const f=await fixture({progress:false});const run=await f.yard.execute('refresh',{id:f.id});assert.equal(run.progressResponse.source,'status');assert.deepEqual(run.progressResponse.data.custom,['status detail']);
});

test('clearing active work hides it and suspends automatic checks without remote calls or changing its status',async()=>{
 const f=await fixture();const initial=f.yard.snapshot().runs[0],calls=f.calls;
 const hidden=await f.yard.execute('clear',{id:f.id});assert.equal(hidden.archived,true);assert.equal(hidden.status,initial.status);assert.equal(hidden.deadline,initial.deadline);assert.equal(f.calls,calls);
 f.advance(61000);await f.yard.tick();await f.yard.execute('check-due',{id:f.id});assert.equal(f.calls,calls);
 const restored=await f.yard.execute('restore',{id:f.id});assert.equal(restored.archived,false);assert.equal(restored.deadline,initial.deadline);await f.yard.tick();assert.equal(f.calls,calls+2);
});
