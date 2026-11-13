const {test}=require('node:test'),assert=require('node:assert/strict');
test('pipeline feed orders bounded events and filters family, run, event and attention',async()=>{
 const {pipelineFeed}=await import('../sources/omp-bot-companion/setup/pipeyard-feed.mjs');
 const runs=[{id:'one',templateId:'a',status:'running',title:'One',events:[{id:'e1',kind:'progress',at:1,message:'Stage done'}],notes:[{id:'n1',at:3,text:'Local observation'}]},{id:'two',templateId:'b',status:'awaiting-approval',title:'Two',events:[{id:'e2',kind:'attention',at:2,message:'Approval needed'}]}];
 assert.deepEqual(pipelineFeed(runs).map(e=>e.id),['one:note:n1','two:event:e2','one:event:e1']);
 assert.equal(pipelineFeed(runs,{family:'a'}).length,2);assert.equal(pipelineFeed(runs,{run:'two'}).length,1);assert.equal(pipelineFeed(runs,{kind:'note'})[0].text,'Local observation');assert.equal(pipelineFeed(runs,{attention:true})[0].run.id,'two');assert.equal(pipelineFeed(runs,{kind:'complete'}).length,0);
 assert.equal(pipelineFeed([{...runs[0],events:Array.from({length:500},(_,i)=>({id:String(i),at:i,kind:'progress',message:'step'}))}]).length,150);
});
