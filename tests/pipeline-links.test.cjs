const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('connected links reject platform secrets before requests, preserve launch retries and survive registration',async()=>{
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'pipe-links-'));let calls=0;
 try{const yard=new Pipeyard({root,env:{PIPE_TOKEN:'secret/value'},fetchImpl:async()=>{calls++;return Response.json({id:'remote',status:'running'});}});
 yard.configure({version:1,platforms:[{id:'one',name:'One',baseUrl:'https://example.test',credential:{env:'PIPE_TOKEN'},operations:{trigger:{method:'POST',path:'/runs'},status:{method:'GET',path:'/runs/{runId}'}}}],templates:[{id:'one',name:'One',platformId:'one',color:'#123456'}]});
 for(const secret of ['secret/value','secret%2Fvalue'])await assert.rejects(yard.execute('register',{templateId:'one',externalId:'remote',ticketUrl:'https://example.test/'+secret}),/sensitive/);
 assert.equal(calls,0);
 const body={templateId:'one',requestId:'once',pipelineUrl:'https://example.test/run/remote'};let run=await yard.execute('launch',body);assert.equal(run.pipelineUrl,body.pipelineUrl);assert.equal((await yard.execute('launch',body)).id,run.id);assert.equal(calls,1);
 await assert.rejects(yard.execute('launch',{...body,pipelineUrl:'https://example.test/changed'}),/reused/);assert.equal(calls,1);
 run=await yard.execute('update-run',{id:run.id,ticketUrl:'https://tickets.example.test/ABC-1'});assert.equal(calls,1);assert.equal(run.ticketUrl,'https://tickets.example.test/ABC-1');
 assert.equal((await yard.execute('register',{templateId:'one',externalId:'remote'})).id,run.id);assert.equal(calls,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('pipeline links are validated, persisted, editable and part of retry identity without remote checks',async()=>{
 const {Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'pipe-links-'));let calls=0;
 try{const yard=new Pipeyard({root,fetchImpl:async()=>{calls++;throw Error('unexpected request');}}),body={requestId:'one',title:'Report',color:'#123456',ticketUrl:'https://tickets.example.test/ABC-1',pipelineUrl:'https://runs.example.test/one'};
 const first=await yard.execute('create-local',body);assert.equal(first.ticketUrl,body.ticketUrl);assert.equal((await yard.execute('create-local',body)).id,first.id);
 await assert.rejects(yard.execute('create-local',{...body,ticketUrl:'https://tickets.example.test/ABC-2'}),/reused/);
 const next=await yard.execute('update-run',{id:first.id,ticketUrl:null,pipelineUrl:'https://runs.example.test/two'});assert.equal(next.ticketUrl,null);assert.equal(next.pipelineUrl,'https://runs.example.test/two');assert.equal(calls,0);
 assert.equal(new Pipeyard({root}).snapshot().runs[0].pipelineUrl,next.pipelineUrl);
 for(const url of ['javascript:alert(1)','file:///C:/private','https://user:pass@example.test/','https://example.test/\npath','not a url'])await assert.rejects(yard.execute('update-run',{id:first.id,ticketUrl:url}),/URL|link/i);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
