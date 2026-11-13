const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../sources/omp-bot-companion/setup/pipeyard-demo.mjs');
test('demo provides exactly six illustrative runs with matching template colors and no dependencies',async()=>{
 const {createPipeyardDemo}=await load(),demo=createPipeyardDemo({now:()=>100000}),s=demo.snapshot();
 assert.equal(s.runs.length,6);assert.equal(s.runs[0].templateId,s.runs[1].templateId);assert.equal(s.runs[0].color,s.runs[1].color);assert.notEqual(s.runs[2].templateId,s.runs[0].templateId);
 assert.equal(s.runs.filter(r=>r.status==='succeeded').length,1);assert.equal(s.runs.filter(r=>r.status==='awaiting-approval').length,1);assert.equal(s.runs.filter(r=>r.status==='ready').length,1);
 assert.ok(s.runs.every(r=>r.source==='demo'));
});
test('start, approve, polling, notes and reset operate entirely on simulated records',async()=>{
 let now=100000;const {createPipeyardDemo}=await load(),demo=createPipeyardDemo({now:()=>now});let runs=demo.snapshot().runs;
 const ready=runs.find(r=>r.status==='ready'),alert=runs.find(r=>r.status==='awaiting-approval');
 assert.throws(()=>demo.execute('approve',{id:alert.id,confirmed:false}),/confirm/i);
 demo.execute('start-demo',{id:ready.id});demo.execute('approve',{id:alert.id,confirmed:true,expectedCostUsd:2.4});demo.execute('note',{id:ready.id,text:'Trying this out'});
 now+=10000;runs=demo.snapshot().runs;assert.ok(runs.find(r=>r.id===ready.id).progress>0);assert.equal(runs.find(r=>r.id===alert.id).status,'running');assert.equal(runs.find(r=>r.id===ready.id).notes[0].text,'Trying this out');
 demo.execute('pause',{id:ready.id});const p=demo.snapshot().runs.find(r=>r.id===ready.id).progress;now+=10000;assert.equal(demo.snapshot().runs.find(r=>r.id===ready.id).progress,p);
 const complete=runs.find(r=>r.status==='succeeded');demo.execute('clear',{id:complete.id});assert.equal(demo.snapshot().runs.filter(r=>r.archived).length,1);
 demo.reset();assert.equal(demo.snapshot().runs.length,6);assert.equal(demo.snapshot().runs.filter(r=>r.status==='ready').length,1);assert.equal(demo.snapshot().runs.filter(r=>r.archived).length,0);
 assert.throws(()=>demo.execute('launch',{templateId:'real'}),/unsupported/i);
});
test('demo windows share only their dedicated browser storage key and reject live IDs',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}, {createPipeyardDemo}=await load(),a=createPipeyardDemo({storage,now:()=>100000});
 a.execute('note',{id:a.snapshot().runs[0].id,text:'Shared sample note'});const b=createPipeyardDemo({storage,now:()=>100000});assert.equal(b.snapshot().runs[0].notes[0].text,'Shared sample note');
 assert.deepEqual([...map.keys()],['botRanch.pipeyard.demo.v1']);assert.throws(()=>b.execute('refresh',{id:'live-run'}),/demo run/i);
});

test('demo response JSON is readable, reviewable and can be cleared while active',async()=>{
 const {createPipeyardDemo}=await import('../sources/omp-bot-companion/setup/pipeyard-demo.mjs');const demo=createPipeyardDemo();let run=demo.snapshot().runs.find(r=>r.status==='running');assert.equal(run.progressResponse.data.details.demo,true);
 run=demo.execute('review-progress',{id:run.id,responseId:run.progressResponse.id,author:'Scout',summary:'Sample reviewed'});assert.equal(run.progressResponse.review.author,'Scout');
 run=demo.execute('refresh',{id:run.id});assert.equal(run.progressResponse.review.author,'Scout');run=demo.execute('clear',{id:run.id});assert.equal(run.archived,true);assert.equal(run.status,'running');
});

test('manual demo pipes persist without starting, support duplicate names, and can be deleted down to an empty yard',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}, {createPipeyardDemo}=await load(),demo=createPipeyardDemo({storage,now:()=>100000});
 assert.throws(()=>demo.execute('create-demo',{title:'My pipe',color:'#b51f43'}),/six|6|slots/i);
 demo.execute('delete-demo',{id:demo.snapshot().runs[0].id});demo.execute('delete-demo',{id:demo.snapshot().runs[0].id});
 const a=demo.execute('create-demo',{title:'My pipe',color:'#b51f43'}),b=demo.execute('create-demo',{title:'My pipe',color:'#89b9ed'});assert.notEqual(a.id,b.id);assert.equal(a.status,'ready');assert.equal(a.externalId,'');assert.equal(a.tracking,'paused');assert.equal(a.color,'#b51f43');
 const again=createPipeyardDemo({storage,now:()=>100000});assert.equal(again.snapshot().runs.filter(r=>r.title==='My pipe').length,2);
 for(const run of again.snapshot().runs)again.execute('delete-demo',{id:run.id});assert.equal(createPipeyardDemo({storage}).snapshot().runs.length,0);
 assert.throws(()=>again.execute('create-demo',{title:'',color:'#b51f43'}),/title/i);assert.throws(()=>again.execute('create-demo',{title:'Bad color',color:'url(evil)'}),/color/i);
 assert.equal(again.reset().runs.length,6);
});

test('demo connection IDs and metadata are editable without starting placeholders',async()=>{
 const {createPipeyardDemo}=await load(),demo=createPipeyardDemo();const ready=demo.snapshot().runs.find(r=>r.status==='ready');let run=demo.execute('update-run',{id:ready.id,externalId:'my-platform-run',metadata:{owner:'PM'},title:'Connected preview'});assert.equal(run.id,ready.id);assert.equal(run.status,'ready');assert.equal(run.tracking,'paused');assert.equal(run.externalId,'my-platform-run');assert.equal(run.metadata.owner,'PM');
 const other=demo.snapshot().runs.find(r=>r.id!==ready.id);assert.throws(()=>demo.execute('update-run',{id:other.id,externalId:'my-platform-run'}),/already|unique/i);
 run=demo.execute('start-demo',{id:ready.id});assert.equal(run.externalId,'my-platform-run');assert.equal(demo.snapshot().limits.demo.visibleRuns,6);
});


test('demo appearance survives reload and rejects invalid shapes and colors',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};const {createPipeyardDemo}=await load(),demo=createPipeyardDemo({storage,now:()=>1000}),id=demo.snapshot().runs[0].id;
 demo.execute('set-appearance',{id,shape:'checkpoint',color:'#b51f43'});const saved=createPipeyardDemo({storage,now:()=>1000}).snapshot().runs[0];assert.equal(saved.shape,'checkpoint');assert.equal(saved.color,'#b51f43');assert.throws(()=>demo.execute('set-appearance',{id,shape:'bad'}));assert.throws(()=>demo.execute('set-appearance',{id,color:'red'}));
});
