const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const load=()=>import('../sources/omp-bot-companion/pipeyard.mjs');
test('local estimates persist, stay local, and defer to platform percentages including zero',async()=>{
 let calls=0,reported=null,status='running';
 const {yard,root,advance}=await fixture(async()=>{calls++;return new Response(JSON.stringify({id:'job',status,progress:reported}));});
 const run=await yard.execute('register',{templateId:'report',externalId:'job'});
 assert.equal(run.displayProgress,null);assert.equal(run.progressSource,'unknown');
 let view=await yard.execute('estimate-progress',{id:run.id,percent:62,reason:'Two stages finished; similar reports spend most time on rendering.',author:'Scout'});
 assert.equal(calls,1);assert.equal(view.progress,null);assert.equal(view.displayProgress,62);assert.equal(view.progressSource,'estimate');assert.equal(view.progressEstimate.author,'Scout');assert.equal(view.progressEstimate.at,100000);
 reported=0;advance(1000);view=await yard.execute('refresh',{id:run.id});assert.equal(view.displayProgress,0);assert.equal(view.progressSource,'platform');assert.equal(view.progressEstimate.percent,62);
 reported=35;view=await yard.execute('refresh',{id:run.id});assert.equal(view.displayProgress,35);
 reported=100;view=await yard.execute('refresh',{id:run.id});assert.equal(view.displayProgress,100);assert.equal(view.status,'running');assert.equal(view.progressSource,'platform');
 reported=null;view=await yard.execute('refresh',{id:run.id});assert.equal(view.displayProgress,62);assert.equal(view.progressSource,'estimate');
 const {Pipeyard}=await load();const restored=new Pipeyard({root}).snapshot().runs[0];assert.deepEqual(restored.progressEstimate,view.progressEstimate);assert.equal(restored.displayProgress,62);
 view=await yard.execute('estimate-progress',{id:run.id,percent:null,reason:'Earlier assumption no longer applies.',author:'Scout'});assert.equal(view.displayProgress,null);assert.equal(view.progressEstimate,null);
 await yard.execute('estimate-progress',{id:run.id,percent:99,reason:'Waiting for confirmation.',author:'Scout'});
 status='done';view=await yard.execute('refresh',{id:run.id});assert.equal(view.displayProgress,100);assert.equal(view.progressSource,'completed');
 await assert.rejects(yard.execute('estimate-progress',{id:run.id,percent:90,reason:'Late update',author:'Scout'}),/finished/i);
});
test('estimates validate input and redact secrets without changing workflow or monitoring',async()=>{
 const {yard}=await fixture(async()=>new Response(JSON.stringify({id:'job',status:'paused'})));
 const run=await yard.execute('register',{templateId:'report',externalId:'job'});
 for(const percent of [-1,100,101,NaN,Infinity,'40'])await assert.rejects(yard.execute('estimate-progress',{id:run.id,percent,reason:'Evidence',author:'Scout'}),/percent/i);
 for(const patch of [{reason:''},{author:''},{reason:'x'.repeat(4001)}])await assert.rejects(yard.execute('estimate-progress',{id:run.id,percent:40,reason:'Evidence',author:'Scout',...patch}));
 const view=await yard.execute('estimate-progress',{id:run.id,percent:40,reason:'private-test-value stage',author:'private-test-value'});
 assert.equal(view.status,'paused');assert.equal(view.deadline,run.deadline);assert.equal(view.nextCheckAt,run.nextCheckAt);assert.equal(view.progress,null);
 assert.ok(!JSON.stringify(view).includes('private-test-value'));assert.ok(view.events.some(e=>e.kind==='estimate'));
});
test('poll errors and failed workflows never turn an estimate into completion',async()=>{
 let fail=false,status='running';const {yard,advance}=await fixture(async()=>{if(fail)throw Error('offline');return new Response(JSON.stringify({id:'job',status,progress:42}));});
 const run=await yard.execute('register',{templateId:'report',externalId:'job'});
 await yard.execute('estimate-progress',{id:run.id,percent:80,reason:'Local observation',author:'Scout'});
 fail=true;let view=await yard.execute('refresh',{id:run.id});assert.equal(view.displayProgress,42);assert.equal(view.progressSource,'platform');assert.ok(view.lastError);assert.equal(view.progressEstimate.percent,80);
 fail=false;status='failed';advance(60001);view=await yard.execute('refresh',{id:run.id});assert.equal(view.status,'failed');assert.equal(view.displayProgress,42);assert.equal(view.tracking,'finished');
 await assert.rejects(yard.execute('estimate-progress',{id:run.id,percent:90,reason:'Outdated check',author:'Scout'}),/finished/);
});
const config=()=>({version:1,platforms:[{id:'demo',name:'Demo',baseUrl:'https://workflows.example.com',credential:{env:'PIPEYARD_TEST_TOKEN'},operations:{trigger:{method:'POST',path:'/runs',body:'{{input}}'},status:{method:'GET',path:'/runs/{runId}'},say:{method:'POST',path:'/runs/{runId}/messages',body:{text:'{{message}}'}}},fields:{id:'id',status:'status',message:'message',progress:'progress',result:'result'},statuses:{running:'running',done:'succeeded',paused:'paused'}}],templates:[{id:'report',name:'Report',platformId:'demo',color:'#61b7ba',description:'Build a report',input:{topic:'daily'},intervalMinutes:5,waitMinutes:60}]});
async function fixture(fetchImpl){const {Pipeyard}=await load();let now=100000;const root=fs.mkdtempSync(path.join(os.tmpdir(),'pipeyard-'));const yard=new Pipeyard({root,now:()=>now,fetchImpl,env:{PIPEYARD_TEST_TOKEN:'private-test-value'}});yard.configure(config());return {yard,root,advance:ms=>now+=ms};}
test('independent runs, duplicate registration, notes and history persist without a bot',async()=>{
 let id=0;const {yard,root}=await fixture(async(u,o)=>new Response(JSON.stringify({id:o.method==='POST'?'run-'+(++id):u.split('/').at(-1),status:'done',message:'Ready',result:{report:'ok'}})));
 const a=await yard.execute('launch',{templateId:'report',requestId:'request-1',input:{topic:'one'}}),b=await yard.execute('launch',{templateId:'report',requestId:'request-2'});
 assert.notEqual(a.id,b.id);assert.equal(id,2);
 assert.equal((await yard.execute('launch',{templateId:'report',requestId:'request-1',input:{topic:'one'}})).id,a.id);assert.equal(id,2);
 await assert.rejects(yard.execute('launch',{templateId:'report',requestId:'request-1',input:{topic:'changed'}}),/different|reused/i);
 assert.equal((await yard.execute('register',{templateId:'report',externalId:a.externalId})).id,a.id);assert.equal(id,2);
 await yard.execute('note',{id:a.id,text:'Reviewed locally'});await yard.execute('clear',{id:a.id});
 const {Pipeyard}=await load(),again=new Pipeyard({root});const restored=again.snapshot().runs.find(r=>r.id===a.id);
 assert.equal(restored.archived,true);assert.equal(restored.notes[0].text,'Reviewed locally');assert.equal(restored.input.topic,'one');
 await again.execute('restore',{id:a.id});assert.equal(again.snapshot().runs.find(r=>r.id===a.id).archived,false);
});
test('uncertain POST is never automatically resubmitted, and can attach a verified ID',async()=>{
 let posts=0;const {yard,advance}=await fixture(async(u,o)=>{if(o.method==='POST'){posts++;throw Error('network');}return new Response(JSON.stringify({id:'found',status:'running'}));});
 const a=await yard.execute('launch',{templateId:'report',requestId:'uncertain-1'});assert.equal(a.status,'unresolved');
 advance(600000);await yard.tick();await yard.execute('launch',{templateId:'report',requestId:'uncertain-1'});assert.equal(posts,1);
 const linked=await yard.execute('link',{id:a.id,externalId:'found'});assert.equal(linked.externalId,'found');assert.equal(posts,1);
});
test('credentials never persist, redirects are disabled, response strings and keys are redacted',async()=>{
 const {yard,root}=await fixture(async(u,o)=>{assert.equal(o.headers.Authorization,'Bearer private-test-value');assert.equal(o.redirect,'error');return new Response(JSON.stringify({id:'job',status:'running',message:'private-test-value',result:{'private-test-value':'private-test-value',apiKey:'hide'}}));});
 await yard.execute('launch',{templateId:'report',requestId:'safe-1'});
 assert.ok(!JSON.stringify(yard.snapshot()).includes('private-test-value'));assert.ok(!fs.readFileSync(path.join(root,'runs.json'),'utf8').includes('private-test-value'));
 assert.throws(()=>yard.configure({...config(),platforms:[{...config().platforms[0],baseUrl:'http://workflows.example.com'}]}),/HTTPS/);
});
test('tracking pause differs from external pause, budgets expire and errors retain last known status',async()=>{
 let fail=false;const {yard,advance}=await fixture(async()=>{if(fail)throw Error('private-test-value');return new Response(JSON.stringify({id:'job',status:'paused',progress:40}));});
 const run=await yard.execute('register',{templateId:'report',externalId:'job'});assert.equal(run.status,'paused');assert.equal(run.tracking,'active');
 await yard.execute('pause-tracking',{id:run.id});assert.equal(yard.snapshot().runs[0].tracking,'paused');
 await yard.execute('resume-tracking',{id:run.id,minutes:10});fail=true;advance(300001);await yard.tick();
 assert.equal(yard.snapshot().runs[0].status,'paused');assert.ok(yard.snapshot().runs[0].lastError);assert.ok(!JSON.stringify(yard.snapshot()).includes('private-test-value'));
 advance(600001);await yard.tick();assert.equal(yard.snapshot().runs[0].tracking,'expired');
});
test('unknown statuses cannot complete work and local notes do not send remote messages',async()=>{
 let calls=0;const {yard}=await fixture(async()=>{calls++;return new Response(JSON.stringify({id:'job',status:'alien'}));});
 const run=await yard.execute('register',{templateId:'report',externalId:'job'});assert.equal(run.status,'unknown');
 await yard.execute('note',{id:run.id,text:'Investigate'});assert.equal(calls,1);const hidden=await yard.execute('clear',{id:run.id});assert.equal(hidden.archived,true);assert.equal(hidden.status,'unknown');assert.equal(calls,1);
 await assert.rejects(yard.execute('approve',{id:run.id,confirmed:true,expectedCostUsd:null}),/support/i);
});
test('configuration validates boundaries and freezes run adapters across edits',async()=>{
 const urls=[];const {yard}=await fixture(async u=>{urls.push(u);return new Response(JSON.stringify({id:'job',status:'running'}));});
 const run=await yard.execute('register',{templateId:'report',externalId:'job'});const changed=config();changed.platforms[0].baseUrl='https://another.example.com';yard.configure(changed);
 await yard.execute('refresh',{id:run.id});assert.equal(urls.at(-1),'https://workflows.example.com/runs/job');
 const evil=config();evil.platforms[0].operations.status.path='https://other.example.com/runs/{runId}';assert.throws(()=>yard.configure(evil),/path|origin/i);
});
test('secret file loading and configurable request/response maps work',async()=>{
 const {Pipeyard}=await load(),root=fs.mkdtempSync(path.join(os.tmpdir(),'pipeyard-file-'));const secretFile=path.join(root,'secret.txt');fs.writeFileSync(secretFile,'file-secret\n');
 const c=config();c.platforms[0].credential={file:secretFile};c.platforms[0].fields={id:'run.key',status:'run.state',message:'run.note'};c.platforms[0].operations.trigger.body={topic:'{{input.topic}}'};
 const yard=new Pipeyard({root:path.join(root,'yard'),fetchImpl:async(u,o)=>{assert.equal(o.headers.Authorization,'Bearer file-secret');assert.deepEqual(JSON.parse(o.body),{topic:'daily'});return new Response(JSON.stringify({run:{key:'42',state:'running',note:'file-secret'}}));}});yard.configure(c);
 const run=await yard.execute('launch',{templateId:'report',requestId:'mapped'});assert.equal(run.externalId,'42');assert.equal(run.message,'[redacted]');
});
test('refresh respects Retry-After and overlapping operations do not duplicate requests',async()=>{
 let calls=0,hold;const {yard,advance}=await fixture(async()=>{calls++;if(calls===1)return new Response(JSON.stringify({id:'job',status:'running'}));if(calls===2)return new Response('{}',{status:429,headers:{'Retry-After':'600'}});return new Promise(resolve=>hold=()=>resolve(new Response(JSON.stringify({id:'job',status:'done'}))));});
 const run=await yard.execute('register',{templateId:'report',externalId:'job'});await yard.execute('refresh',{id:run.id});await yard.execute('refresh',{id:run.id});assert.equal(calls,2);
 advance(600001);const pending=yard.execute('refresh',{id:run.id});await assert.rejects(yard.execute('refresh',{id:run.id}),/busy/i);hold();await pending;assert.equal(calls,3);
});
test('launch retries survive template edits and removal without a second submission',async()=>{
 let posts=0;const {yard}=await fixture(async()=>{posts++;return new Response(JSON.stringify({id:'one',status:'running'}));});
 const run=await yard.execute('launch',{templateId:'report',requestId:'durable-retry',input:{a:1,b:2}});yard.configure({version:1,platforms:[],templates:[]});
 assert.equal((await yard.execute('launch',{templateId:'report',requestId:'durable-retry',input:{b:2,a:1}})).id,run.id);assert.equal(posts,1);
});
test('later polling batches recheck run locks rather than racing manual refresh',async()=>{
 let polling=false;const held=[],counts=new Map();let releaseManual;
 const {yard,advance}=await fixture(async u=>{const id=u.split('/').at(-1);if(!polling)return new Response(JSON.stringify({id,status:'running'}));counts.set(id,(counts.get(id)||0)+1);if(id==='job-4'){if(counts.get(id)===1)return new Promise(r=>releaseManual=()=>r(new Response(JSON.stringify({id,status:'running'}))));return new Response(JSON.stringify({id,status:'running'}));}return new Promise(r=>held.push(()=>r(new Response(JSON.stringify({id,status:'running'})))));});
 for(let i=0;i<5;i++)await yard.execute('register',{templateId:'report',externalId:'job-'+i});polling=true;advance(300001);const ticking=yard.tick(),manual=yard.execute('refresh',{id:yard.runs[4].id});held.forEach(r=>r());await ticking;
 try{assert.equal(counts.get('job-4'),1);}finally{releaseManual();await manual;}
});
test('concurrent reconciliation cannot register the same external run twice',async()=>{
 const pending=[];const {yard}=await fixture(async(u,o)=>{if(o.method==='POST')throw Error('unknown submission');return new Promise(r=>pending.push(()=>r(new Response(JSON.stringify({id:'found',status:'running'})))));});
 const a=await yard.execute('launch',{templateId:'report',requestId:'a'}),b=await yard.execute('launch',{templateId:'report',requestId:'b'});
 const linking=Promise.allSettled([yard.execute('link',{id:a.id,externalId:'found'}),yard.execute('link',{id:b.id,externalId:'found'})]);pending.forEach(resolve=>resolve());const results=await linking;
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(yard.snapshot().runs.filter(r=>r.externalId==='found').length,1);
});
test('approval rechecks remote cost and rejects a stale decision before POST',async()=>{
 let gets=0,posts=0;const {yard}=await fixture(async(u,o)=>{if(o.method==='POST')posts++;else gets++;return new Response(JSON.stringify({id:'job',status:'awaiting-approval',cost_usd:gets===1?5:7}));});
 const c=config();c.platforms[0].operations.approve={method:'POST',path:'/runs/{runId}/approve'};yard.configure(c);
 const run=await yard.execute('register',{templateId:'report',externalId:'job'});assert.equal(run.costUsd,5);
 await assert.rejects(yard.execute('approve',{id:run.id,confirmed:true,expectedCostUsd:5}),/cost|approval/i);assert.equal(posts,0);assert.equal(yard.snapshot().runs[0].costUsd,7);
});
test('redaction happens before truncation so long remote fields cannot expose token prefixes',async()=>{
 const {safe}=await import('../sources/omp-bot-companion/pipeyard-adapter.mjs');
 const secret='secret-1234567890',result=safe('x'.repeat(15990)+secret,[secret]);assert.ok(!result.includes('secret-'));assert.ok(result.length<=16000);
});
test('separate progress responses produce stable milestone history without repeated polling noise',async()=>{
 const {yard}=await fixture(async u=>new Response(JSON.stringify(u.endsWith('/progress')?{progress:50,message:'Halfway',stages:[{name:'Build',status:'running'}]}:{id:'job',status:'running',message:'Processing'})));
 const c=config();c.platforms[0].operations.progress={method:'GET',path:'/runs/{runId}/progress'};yard.configure(c);const run=await yard.execute('register',{templateId:'report',externalId:'job'});
 await yard.execute('refresh',{id:run.id});const events=yard.snapshot().runs[0].events.length;
 await yard.execute('refresh',{id:run.id});assert.equal(yard.snapshot().runs[0].events.length,events);assert.equal(yard.snapshot().runs[0].progress,50);
});
test('feed records check failures once and omits percentage-only polling noise',async()=>{
 let percent=10,fail=false;const {yard,advance}=await fixture(async()=>{if(fail)throw Error('offline');return new Response(JSON.stringify({id:'job',status:'running',message:'Rendering',progress:percent}));});
 const run=await yard.execute('register',{templateId:'report',externalId:'job'}),before=run.events.length;
 percent=15;let view=await yard.execute('refresh',{id:run.id});assert.equal(view.events.length,before);assert.equal(view.progress,15);
 fail=true;view=await yard.execute('refresh',{id:run.id});assert.equal(view.events.at(-1).kind,'attention');const failures=view.events.length;
 advance(60001);view=await yard.execute('refresh',{id:run.id});assert.equal(view.events.length,failures);
 fail=false;advance(120001);view=await yard.execute('refresh',{id:run.id});assert.match(view.events.at(-1).message,/restored/);
});
test('registration reconciles a run that a concurrent launch has just recorded',async()=>{
 let finishGet;const {yard}=await fixture(async(u,o)=>o.method==='GET'?new Promise(r=>finishGet=()=>r(new Response(JSON.stringify({id:'shared',status:'running'})))):new Response(JSON.stringify({id:'shared',status:'running'})));
 const attaching=yard.execute('register',{templateId:'report',externalId:'shared'});const launch=await yard.execute('launch',{templateId:'report',requestId:'unique'});finishGet();const attached=await attaching;assert.equal(attached.id,launch.id);assert.equal(yard.snapshot().runs.length,1);
});
