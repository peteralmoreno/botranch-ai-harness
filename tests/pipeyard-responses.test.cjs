const {test}=require('node:test'),assert=require('node:assert/strict');
test('response rules merge independent endpoint mappings and replace custom fields',async()=>{
 const {resolveResponseConfig,validateResponses}=await import('../sources/omp-bot-companion/pipeyard-responses.mjs');
 const rules=resolveResponseConfig({fields:{cost:'cost_usd'},responses:{status:{mappings:{status:'run.state'},desk:{mode:'hidden'}},progress:{desk:{mode:'custom',fields:[{label:'One',path:'one'}]}}}},{responses:{progress:{mappings:{cost:null},desk:{mode:'custom',fields:[{label:'Two',path:'two',format:'number'}]}}}});
 assert.equal(rules.status.mappings.status,'run.state');assert.equal(rules.status.desk.mode,'hidden');assert.equal(rules.progress.mappings.cost,null);assert.equal(rules.progress.desk.fields.length,1);assert.equal(rules.progress.desk.fields[0].label,'Two');
 for(const value of [{status:{desk:{mode:'typo'}}},{status:{mappings:{unknown:'x'}}},{progress:{desk:{mode:'custom',fields:[{label:'X',path:'constructor.bad'}]}}}])assert.throws(()=>validateResponses(value));
});
test('structured position never manufactures percent or completion',async()=>{
 const {normalizeStagePosition}=await import('../sources/omp-bot-companion/pipeyard-responses.mjs');
 assert.deepEqual(normalizeStagePosition({stage:'validation',current_index:8,total:8}),{stage:'validation',currentIndex:8,total:8});
 assert.deepEqual(normalizeStagePosition({stage:'validation',total:8}),{stage:'validation',currentIndex:null,total:8});
 for(const current_index of [0,-1,9,2.5,'4'])assert.equal(normalizeStagePosition({stage:'test',current_index,total:8}),null);
});
test('custom projection preserves zero/false but never exposes unselected body, hidden reviews or malformed fallback JSON',async()=>{
 const {projectResponse}=await import('../sources/omp-bot-companion/pipeyard-responses.mjs');
 const record={id:'r',source:'status',fetchedAt:1,data:{value:0,flag:false,private:'PRIVATE_SENTINEL',object:{deep:'PRIVATE_SENTINEL'}},review:{summary:'PRIVATE_SENTINEL'}};
 assert.equal(projectResponse(record,{mode:'hidden'}),null);
 const value=projectResponse(record,{mode:'custom',fields:[{label:'Value',path:'value',format:'number'},{label:'Flag',path:'flag',format:'text'},{label:'Missing',path:'missing',fallback:'Unknown'},{label:'Bad',path:'object',format:'number'}]});
 assert.equal(value.fields[0].value,'0');assert.equal(value.fields[1].value,'false');assert.equal(value.fields[2].value,'Unknown');assert.ok(value.fields[3].diagnostic);assert(!JSON.stringify(value).includes('PRIVATE_SENTINEL'));assert.equal(projectResponse({...record,data:null},{mode:'raw'}).data,null);
});

test('adapter extracts independent nested responses, optional costs, and stage positions without completing work',async()=>{
 const {validateConfig,callPlatform}=await import('../sources/omp-bot-companion/pipeyard-adapter.mjs');
 const cfg=validateConfig({version:1,platforms:[{id:'generic',name:'Generic',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'},progress:{method:'GET',path:'/runs/{runId}/progress'}},responses:{status:{mappings:{id:'run.id',status:'run.state',stagePosition:'position',cost:null}},progress:{mappings:{progress:'details.percent',cost:'details.amount'}}}}],templates:[]});
 const adapter=cfg.platforms[0],status=await callPlatform(adapter,'status',{}, {fetchImpl:async()=>new Response(JSON.stringify({run:{id:'one',state:'running'},position:{stage:'validation',current_index:8,total:8},cost_usd:100}))});
 assert.equal(status.status,'running');assert.equal(status.progress,null);assert.equal(status.costUsd,null);assert.equal(status.stagePosition.currentIndex,8);
 const progress=await callPlatform(adapter,'progress',{}, {fetchImpl:async()=>new Response(JSON.stringify({details:{percent:0,amount:0}}))});assert.equal(progress.progress,0);assert.equal(progress.costUsd,0);
 for(const value of ['10',-1,null]){const result=await callPlatform(adapter,'progress',{}, {fetchImpl:async()=>new Response(JSON.stringify({details:{amount:value}}))});assert.equal(result.costUsd,null);}
});

async function responseYard(statusDesk,progressDesk){
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');let fail=false,t=1000,status={id:'remote',status:'running',message:'STATUS_PRIVATE',result:'STATUS_PRIVATE',progress:{stage:'STATUS_PRIVATE',current_index:8,total:8}},progress={message:'PROGRESS_PRIVATE',result:'PROGRESS_PRIVATE',details:{percent:0,visible:'Allowed',unselected:'UNSELECTED_PRIVATE'}};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'responses-')),yard=new Pipeyard({root,now:()=>t,fetchImpl:async url=>url.endsWith('/progress')?(fail?new Response('{}',{status:503}):Response.json(progress)):Response.json(status)});
 yard.configure({version:1,platforms:[{id:'neutral',name:'Neutral',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'},progress:{method:'GET',path:'/runs/{runId}/progress'}},responses:{status:{desk:statusDesk},progress:{mappings:{progress:'details.percent'},desk:progressDesk}}}],templates:[{id:'one',name:'One',platformId:'neutral',color:'#61b7ba'}]});const run=await yard.execute('register',{templateId:'one',externalId:'remote'});
 return {yard,root,id:run.id,fail:()=>fail=true,time:n=>t=n,status:v=>status=v,progress:v=>progress=v,reload:()=>new Pipeyard({root,now:()=>t})};
}
test('independent persistence and allowlist prevent hidden/custom leaks across action, snapshot, review and restart',async()=>{
 const f=await responseYard({mode:'hidden'},{mode:'custom',fields:[{label:'Selected',path:'details.visible'}]});let run=await f.yard.execute('refresh',{id:f.id});
 assert.equal(run.responses.status,null);assert.equal(run.responses.progress.fields[0].value,'Allowed');assert.equal(run.progress,0);assert.equal(run.stagePosition.currentIndex,8);assert.equal(run.stagePosition.stage,'');
 assert(!/STATUS_PRIVATE|PROGRESS_PRIVATE|UNSELECTED_PRIVATE/.test(JSON.stringify(run)));assert(!/STATUS_PRIVATE|PROGRESS_PRIVATE|UNSELECTED_PRIVATE/.test(JSON.stringify(f.yard.snapshot())));
 const privateRun=f.yard.runs[0];assert.equal(privateRun.responses.status.data.message,'STATUS_PRIVATE');assert.equal(privateRun.responses.progress.data.message,'PROGRESS_PRIVATE');
 await assert.rejects(()=>f.yard.execute('review-progress',{id:f.id,source:'status',responseId:privateRun.responses.status.id,author:'Reader',summary:'Review'}),/hidden|unavailable/i);
 assert.deepEqual(f.reload().snapshot().runs[0].responses,run.responses);
 const previous=run.responses.progress;f.time(2000);f.fail();run=await f.yard.execute('refresh',{id:f.id});assert.deepEqual(run.responses.progress,previous);assert.equal(run.responses.status,null);assert.ok(run.responseAttempts.progress.error);
});
test('legacy response migration keeps one source, backups and idempotent review identity',async()=>{
 const fs=require('node:fs'),path=require('node:path'),f=await responseYard({mode:'raw'},{mode:'raw'});const file=path.join(f.root,'runs.json'),state=JSON.parse(fs.readFileSync(file));const run=state.runs[0];delete state.responseSchema;delete run.responses;run.progressResponse={id:'old',source:'status',fetchedAt:22,data:['legacy'],review:{author:'Reader',summary:'Old review'}};fs.writeFileSync(file,JSON.stringify(state));
 const restored=f.reload();assert.equal(restored.runs[0].responses.status.id,'old');assert.equal(restored.runs[0].responses.progress,undefined);assert(fs.existsSync(file+'.pre-responses-v1.bak'));assert.equal(f.reload().runs[0].responses.status.id,'old');
});

test('approval blocks numeric-to-null quotes, hidden bodies and failed reads without any mutation',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');let amount=12,failed=false,posts=0;
 const yard=new Pipeyard({root:fs.mkdtempSync(path.join(os.tmpdir(),'approval-privacy-')),fetchImpl:async(url,options)=>{if(options.method==='POST'){posts++;return Response.json({});}return failed?new Response('{}',{status:503}):Response.json({id:'remote',status:'awaiting-approval',cost_usd:amount,message:'HIDDEN_APPROVAL'});}});
 yard.configure({version:1,platforms:[{id:'generic',name:'Generic',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'},approve:{method:'POST',path:'/runs/{runId}/approve'}},responses:{status:{desk:{mode:'hidden'}}}}],templates:[{id:'one',name:'One',platformId:'generic',color:'#61b7ba'}]});let r=await yard.execute('register',{templateId:'one',externalId:'remote'});assert.equal(r.costUsd,12);assert.doesNotMatch(JSON.stringify(r),/HIDDEN_APPROVAL/);
 amount=null;await assert.rejects(()=>yard.execute('approve',{id:r.id,confirmed:true,expectedCostUsd:12}),/changed/);assert.equal(yard.publicRun(yard.runs[0]).costUsd,null);assert.equal(posts,0);
 failed=true;await assert.rejects(()=>yard.execute('approve',{id:r.id,confirmed:true,expectedCostUsd:null}),/verified/);assert.equal(posts,0);
});
test('source-specific review invalidates only the changed endpoint and cannot leak legacy auto-copied notes',async()=>{
 const f=await responseYard({mode:'raw'},{mode:'raw'});let r=await f.yard.execute('refresh',{id:f.id});const statusId=r.responses.status.id,progressId=r.responses.progress.id;
 await f.yard.execute('review-progress',{id:f.id,source:'status',responseId:statusId,author:'Reader',summary:'Status review'});f.progress({message:'new',details:{percent:5}});r=await f.yard.execute('refresh',{id:f.id});assert.equal(r.responses.status.id,statusId);assert.equal(r.responses.status.review.summary,'Status review');assert.notEqual(r.responses.progress.id,progressId);
 const privateRun=f.yard.runs[0];privateRun.adapter.responses.status.desk={mode:'hidden'};privateRun.notes.push({id:'old',responseId:statusId,text:'LEGACY_PRIVATE'});privateRun.events.push({id:'old',kind:'progress',message:'LEGACY_PRIVATE'});assert.doesNotMatch(JSON.stringify(f.yard.snapshot()),/STATUS_PRIVATE|LEGACY_PRIVATE/);
});

test('progress lifecycle cannot override status and mismatched progress identity retains prior success',async()=>{
 const f=await responseYard({mode:'raw'},{mode:'raw'});f.progress({id:'remote',status:'succeeded',details:{percent:100}});let r=await f.yard.execute('refresh',{id:f.id});assert.equal(r.status,'running');assert.equal(r.progressSource,'platform');const saved=r.responses.progress;
 f.progress({id:'other',status:'succeeded',details:{percent:100}});f.time(3000);r=await f.yard.execute('refresh',{id:f.id});assert.equal(r.status,'running');assert.deepEqual(r.responses.progress,saved);assert.match(r.responseAttempts.progress.error,/different run ID/);
});
