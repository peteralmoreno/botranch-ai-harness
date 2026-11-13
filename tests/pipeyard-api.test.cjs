const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('yard animals persist under home, require authentication and reject stale saves',()=>fixture(async({request,manager})=>{
 assert.equal((await request('/control/pipeyard/creatures',null,'wrong')).status,401);
 const response=await request('/control/pipeyard/creatures',null,'a'.repeat(64));assert.equal(response.status,200);
 const state=await response.json();state.creatures[0].name='Clover';state.creatures[0].variant=4;
 assert.equal((await request('/control/pipeyard/creatures',state,'a'.repeat(64))).status,200);
 assert.equal((await request('/admin/pipeyard/creatures',state)).status,409);
 assert.equal((await request('/admin/pipeyard/creatures',{...state,scope:'different-home'})).status,409);
 const saved=await (await request('/admin/pipeyard/creatures')).json();assert.equal(saved.creatures[0].name,'Clover');
 assert(fs.existsSync(path.join(manager.library.root,'pipeyard','creatures.json')));
 assert.equal((await request('/admin/ai/pipeyard/creatures')).status,404);
 const bad={...saved,creatures:[{...saved.creatures[0],fullness:999}]};assert.equal((await request('/admin/pipeyard/creatures',bad)).status,400);
}));
async function fixture(fn){const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createBridge}=await import('../sources/omp-bot-companion/server.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pipeyard-api-')),manager=new RanchManager({dir,native:{}});const server=createBridge({key:'a'.repeat(64),adminKey:'b'.repeat(64),manager});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;const request=(route,body,key='b'.repeat(64))=>fetch(origin+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});try{await fn({manager,request,origin,dir});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
test('Pipeyard API requires admin authentication, enforces agent modes and excludes config from agents',()=>fixture(async({request,manager})=>{
 assert.equal((await request('/admin/pipeyard/snapshot',null,'wrong')).status,401);
 assert.equal((await request('/admin/ai/pipeyard/catalog')).status,200);
 const estimate={action:'estimate-progress',id:'missing',percent:45,reason:'Stage two',author:'Scout'};
 assert.equal((await request('/admin/ai/pipeyard/action',estimate)).status,403);
 assert.equal((await request('/admin/ai/pipeyard/action',{action:'register',templateId:'x',externalId:'y'})).status,403);
 manager.setAiAccess('organize');assert.equal((await request('/admin/ai/pipeyard/action',{action:'launch',templateId:'x',requestId:'one'})).status,403);
 assert.equal((await request('/admin/ai/pipeyard/action',estimate)).status,400);
 const catalog=await (await request('/admin/ai/pipeyard/catalog')).json();assert.ok(catalog.permissions.organize.includes('estimate-progress'));
 assert.equal((await request('/admin/ai/pipeyard/config')).status,404);
 assert.equal((await request('/admin/pipeyard/config')).status,200);
 manager.aiState.access='unexpected';assert.equal((await request('/admin/ai/pipeyard/action',{action:'register',templateId:'x',externalId:'y'})).status,403);
 manager.setAiAccess('operate');assert.equal((await request('/admin/ai/pipeyard/action',{action:'register',templateId:'x',externalId:'y'})).status,400);
 const snapshot=await (await request('/admin/ai/pipeyard/snapshot')).json();assert.deepEqual(snapshot.runs,[]);assert.ok(!JSON.stringify(snapshot).includes('credential'));
}));
test('existing Board pipeline tasks appear without changing ownership or duplicating execution',()=>fixture(async({request,manager})=>{
 manager.tasks.push({id:'task-one',title:'Existing pipe',assignedProfileId:'bot-one',pipeline:{intervalMinutes:5,waitMinutes:60},pipelineRun:{jobId:'remote-one',status:'running',message:'Stage two',sleeping:true},attempts:[{id:'attempt-one',kind:'pipeline',state:'running'}]});
 const snapshot=await (await request('/admin/pipeyard/snapshot')).json();assert.equal(snapshot.runs.length,1);assert.equal(snapshot.runs[0].source,'board');assert.equal(snapshot.runs[0].tracking,'paused');assert.equal(manager.tasks[0].assignedProfileId,'bot-one');
}));
test('Organize agents can annotate persisted runs and Inspect agents cannot',()=>fixture(async({request,manager})=>{
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');let calls=0;
 const store=new Pipeyard({root:path.join(manager.library.root,'pipeyard'),fetchImpl:async()=>{calls++;return new Response(JSON.stringify({id:'remote',status:'running'}));}});
 store.configure({version:1,platforms:[{id:'example',name:'Example',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'}}}],templates:[{id:'report',name:'Report',platformId:'example',color:'#61b7ba'}]});
 const run=await store.execute('register',{templateId:'report',externalId:'remote'});
 manager.setAiAccess('organize');
 const response=await request('/admin/ai/pipeyard/action',{action:'estimate-progress',id:run.id,percent:60,reason:'Two stages complete; comparable runs spend 40% on verification.',author:'Scout'});
 assert.equal(response.status,200);const updated=await response.json();assert.equal(updated.displayProgress,60);assert.equal(updated.progressSource,'estimate');assert.equal(updated.status,'running');assert.equal(calls,1);
 manager.setAiAccess('inspect');assert.equal((await request('/admin/ai/pipeyard/action',{action:'estimate-progress',id:run.id,percent:70,reason:'Later guess',author:'Scout'})).status,403);
 const snapshot=await (await request('/admin/ai/pipeyard/snapshot')).json();assert.equal(snapshot.runs[0].progressEstimate.percent,60);
}));
test('CLI discovers and operates Pipeyard without exposing the companion key',async()=>{
 const {runCli}=await import('../sources/omp-bot-companion/ranch-cli.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pipeyard-cli-'));fs.writeFileSync(path.join(dir,'admin-key.txt'),'b'.repeat(64));const actionFile=path.join(dir,'action.json');fs.writeFileSync(actionFile,JSON.stringify({action:'note',id:'run-id',text:'Checked'}));let requested;
 const opts={env:{OMP_BOT_KEY_FILE:path.join(dir,'pairing-key.txt')},fetchImpl:async(url,init)=>{requested={url,init};return new Response('{}');},streams:{stdout:()=>{},stderr:()=>{}}};
 assert.equal(await runCli(['pipeyard','catalog','--json'],opts),0);assert.ok(requested.url.endsWith('/admin/ai/pipeyard/catalog'));
 assert.equal(await runCli(['pipeyard','action','--file',actionFile],opts),0);assert.equal(JSON.parse(requested.init.body).text,'Checked');
});
test('widget Pipeyard routes use connection key and cannot configure or mutate external work',()=>fixture(async({request})=>{
 const key='a'.repeat(64);
 assert.equal((await request('/control/pipeyard/snapshot',null,'wrong')).status,401);
 assert.equal((await request('/control/pipeyard/snapshot',null,key)).status,200);
 assert.equal((await request('/control/pipeyard/config',null,key)).status,404);
 for(const action of ['launch','approve','pause','resume','say','link'])assert.equal((await request('/control/pipeyard/action',{action,id:'missing'},key)).status,403,action);
 assert.equal((await request('/control/pipeyard/action',{action:'note',id:'missing',text:'Check'},key)).status,400);
 assert.equal((await request('/control/pipeyard/action',{action:'register',templateId:'missing',externalId:'run-1'},key)).status,400);
}));

test('agents can inspect saved JSON, Organize can review, and only Operate can request platform checks',()=>fixture(async({request,manager})=>{
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');
 const store=new Pipeyard({root:path.join(manager.library.root,'pipeyard'),fetchImpl:async()=>new Response(JSON.stringify({id:'remote',status:'running',custom:{nested:[true,2]}}))});
 store.configure({version:1,platforms:[{id:'one',name:'One',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'}}}],templates:[{id:'one',name:'One',platformId:'one',color:'#61b7ba'}]});
 let run=await store.execute('register',{templateId:'one',externalId:'remote'});run=await store.execute('refresh',{id:run.id});
 const review={action:'review-progress',id:run.id,responseId:run.progressResponse.id,author:'Scout',summary:'Ready for the next decision.'};
 assert.equal((await request('/admin/ai/pipeyard/action',review)).status,403);
 const snapshot=await (await request('/admin/ai/pipeyard/snapshot')).json();assert.equal(snapshot.runs[0].progressResponse.data.custom.nested[0],true);
 manager.setAiAccess('organize');assert.equal((await request('/admin/ai/pipeyard/action',review)).status,200);assert.equal((await request('/admin/ai/pipeyard/action',{action:'check-due',id:run.id})).status,403);
 manager.setAiAccess('operate');assert.equal((await request('/admin/ai/pipeyard/action',{action:'check-due',id:run.id})).status,200);
 assert.equal((await request('/control/pipeyard/action',{action:'check-due',id:run.id},'a'.repeat(64))).status,200);
}));

test('template and connection APIs expose limits, enforce Operate, and do not expose credentials',()=>fixture(async({request,manager})=>{
 const config={version:1,platforms:[{id:'one',name:'One',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'}}}],templates:[]};await request('/admin/pipeyard/config',config);
 const body={action:'save-template',template:{id:'report',name:'Report',platformId:'one',color:'#b51f43'}};
 assert.equal((await request('/admin/ai/pipeyard/action',body)).status,403);manager.setAiAccess('organize');assert.equal((await request('/admin/ai/pipeyard/action',body)).status,403);manager.setAiAccess('operate');const created=await request('/admin/ai/pipeyard/action',body);assert.equal(created.status,200);assert.equal((await created.json()).id,'report');
 const snapshot=await (await request('/admin/ai/pipeyard/snapshot')).json();assert.equal(snapshot.limits.demo.visibleRuns,6);assert.equal(snapshot.usage.templates,1);assert.equal(snapshot.limits.live.runCount,null);assert(!JSON.stringify(snapshot).includes('credential'));
 const large=await request('/admin/ai/pipeyard/action',{action:'update-run',id:'none',metadata:{x:'x'.repeat(32768)}});assert.equal(large.status,400);const error=await large.json();assert.equal(error.code,'PIPEYARD_LIMIT');assert.equal(error.limit.max,32768);
 assert.equal((await request('/control/pipeyard/action',body,'a'.repeat(64))).status,403);
}));

test('paired yard can create local placeholders but agents still require Operate access',()=>fixture(async({request,manager})=>{
 const body={action:'create-local',requestId:'local-ui',title:'Future design',color:'#b51f43'};
 assert.equal((await request('/control/pipeyard/action',body,'wrong')).status,401);
 const response=await request('/control/pipeyard/action',body,'a'.repeat(64));assert.equal(response.status,200);const run=await response.json();assert.equal(run.localOnly,true);assert.equal(run.externalId,'');
 assert.equal((await request('/admin/ai/pipeyard/action',{...body,requestId:'ai-local'})).status,403);manager.setAiAccess('organize');assert.equal((await request('/admin/ai/pipeyard/action',{...body,requestId:'ai-local'})).status,403);manager.setAiAccess('operate');assert.equal((await request('/admin/ai/pipeyard/action',{...body,requestId:'ai-local'})).status,200);
 assert.equal((await request('/control/pipeyard/action',{action:'connect-local',id:run.id,templateId:'missing',externalId:'remote'},'a'.repeat(64))).status,400);
}));


test('paired and Organize clients can change appearance, including Board-owned pipes',()=>fixture(async({request,manager})=>{
 const created=await (await request('/admin/pipeyard/action',{action:'create-local',requestId:'appearance',title:'Local',color:'#61b7ba'})).json();
 const action={action:'set-appearance',id:created.id,shape:'checkpoint',color:'#b51f43'};
 assert.equal((await request('/admin/ai/pipeyard/action',action)).status,403);
 manager.setAiAccess('organize');assert.equal((await request('/admin/ai/pipeyard/action',action)).status,200);
 assert.equal((await request('/control/pipeyard/action',{...action,shape:'quick'},'a'.repeat(64))).status,200);
 manager.tasks.push({id:'visual-task',title:'Board pipe',pipeline:{},pipelineRun:{status:'running',jobId:'remote'},family:{color:'#61b7ba'}});
 assert.equal((await request('/control/pipeyard/action',{action:'set-appearance',id:'board-visual-task',shape:'orchestrator',color:'#b51f43'},'a'.repeat(64))).status,200);
 const snapshot=await (await request('/admin/pipeyard/snapshot')).json(),board=snapshot.runs.find(r=>r.id==='board-visual-task');assert.equal(board.shape,'orchestrator');assert.equal(board.color,'#b51f43');assert.equal(manager.tasks.at(-1).family.color,'#61b7ba');
}));


test('Ranch animals start empty, persist separately and enforce connection scope',()=>fixture(async({request,manager})=>{
 const route='/control/ranch/creatures',key='a'.repeat(64);
 assert.equal((await request(route,null,'wrong')).status,401);
 const empty=await (await request(route,null,key)).json();assert.deepEqual(empty.creatures,[]);
 const yardBefore=await (await request('/control/pipeyard/creatures',null,key)).json();
 const next={...empty,creatures:[{id:'cow-one',name:'Clover',type:'cow',variant:1,x:.5,y:.5,fullness:25,eating:false}]};
 assert.equal((await request(route,next,key)).status,200);
 const saved=await (await request(route,null,key)).json();assert.equal(saved.creatures[0].name,'Clover');
 assert.deepEqual(await (await request('/control/pipeyard/creatures',null,key)).json(),yardBefore);
 assert.equal((await request(route,{...saved,scope:'another-home'},key)).status,409);
 assert.equal((await request(route,next,key)).status,409);
 assert(fs.existsSync(path.join(manager.library.root,'ranch','creatures.json')));
 assert.equal((await request('/admin/ai/pipeyard/ranch-creatures')).status,404);
}));
