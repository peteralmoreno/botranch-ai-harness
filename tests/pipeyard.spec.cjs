const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('integrated Ranch yard has live columns, persistent animals and scrolls past six runs',async({page})=>yard(page,async()=>{
 const origin=new URL(page.url()).origin;await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(origin+'/pipeyard/#embed=1&pair='+'a'.repeat(64));await page.reload();
 await expect(page.locator('.pasture')).toBeVisible();await expect(page.locator('.pipeline-row')).toHaveCount(10);await expect(page.getByRole('img',{name:'Paused',exact:true})).toBeVisible();
 await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 const positions=await page.locator('.pipeline-row').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));expect(new Set(positions.map(p=>p.y)).size).toBe(1);expect(positions[9].x).toBeGreaterThan(positions[5].x);
 await page.locator('.animal-layer .pasture-cow').first().click();const portrait=await page.locator('.animal-portrait').boundingBox(),panel=await page.locator('.creature-panel').boundingBox();expect(portrait.x).toBeGreaterThanOrEqual(panel.x);await page.getByLabel('Animal name',{exact:true}).fill('Clover live');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 await page.reload();await expect(page.getByRole('button',{name:/^Clover live, cow/})).toBeVisible();await expect(page.locator('.pipeline-row')).toHaveCount(10);
}));
test('Ranch Pipeyard page shares pairing, shows a filtered desk, and returns to Ranch',async({page})=>yard(page,async()=>{
 const origin=new URL(page.url()).origin;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/ui/#pair='+'a'.repeat(64)+'&page=pipeyard&demo=1');
 await expect(page.getByRole('button',{name:'Pipeyard',exact:true})).toHaveAttribute('aria-pressed','true');
 const pipe=page.frameLocator('#pipeyard-frame');await expect(pipe.locator('.pipe-tile')).toHaveCount(6);await expect(pipe.getByRole('heading',{name:'Pipeline Desk'})).toBeVisible();
 await pipe.getByRole('combobox',{name:'Family',exact:true}).selectOption('market-scan');await expect(pipe.locator('.pipeline-post')).toHaveCount(2);
 await pipe.getByRole('combobox',{name:'Family',exact:true}).selectOption('');await pipe.getByLabel('Attention needed',{exact:true}).check();await expect(pipe.locator('.pipeline-post')).toHaveCount(1);await expect(pipe.locator('.pipeline-post')).toContainText('Campaign release');
 await pipe.getByLabel('Attention needed',{exact:true}).uncheck();await pipe.getByRole('button',{name:'New campaign brief · Ready to launch',exact:true}).click();await expect(pipe.locator('#pipeline-feed')).toBeHidden();await pipe.getByRole('button',{name:'Start demo run'}).click();
 await pipe.getByRole('button',{name:'All updates',exact:true}).click();await expect(pipe.locator('#pipeline-feed')).toBeVisible();await expect(pipe.locator('#pipeline-feed-list')).toContainText('Demo request accepted');
 await page.getByRole('button',{name:'Ranch',exact:true}).click();await expect(page.locator('#scene')).toBeVisible();await expect(page.locator('#pipeyard-page')).toBeHidden();
 await page.getByRole('button',{name:'Pipeyard',exact:true}).click();await expect(pipe.getByRole('button',{name:'New campaign brief · Running',exact:true})).toBeVisible();
 await pipe.getByRole('button',{name:'Exit demo'}).click();await expect(pipe.locator('.pipe-tile')).toHaveCount(10);await expect(pipe.getByRole('button',{name:'Configure platforms'})).toBeHidden();
 await page.setViewportSize({width:1440,height:540});await expect(pipe.locator('#pipeline-desk')).toBeVisible();
 const box=await pipe.locator('#pipeline-desk').boundingBox();const yardBox=await pipe.locator('.yard').boundingBox();expect(box.x).toBeGreaterThan(yardBox.x);expect(box.width).toBeGreaterThan(250);
 const changedKey='c'.repeat(64),requestPromise=page.waitForRequest(r=>r.url().endsWith('/control/pipeyard/snapshot')&&r.headers().authorization==='Bearer '+changedKey);await page.getByRole('button',{name:'Connection settings'}).click();await page.locator('#key').fill(changedKey);await page.locator('#pair-form').evaluate(form=>form.requestSubmit());await pipe.getByRole('button',{name:'Exit demo'}).click();await requestPromise;
 expect(errors).toEqual([]);
}));
test('pipeline desk filters live notes and remains below the yard on narrow screens',async({page})=>yard(page,async()=>{
 await page.getByRole('button',{name:/Report 3 ·/}).click();await page.getByLabel('Local run note').fill('Validation reached a milestone.');await page.getByRole('button',{name:'Save local note'}).click();
 await page.getByRole('button',{name:'All updates',exact:true}).click();await page.getByRole('combobox',{name:'Events',exact:true}).selectOption('note');await expect(page.locator('.pipeline-post')).toHaveCount(1);await expect(page.locator('.pipeline-post')).toContainText('Validation reached a milestone.');
 await page.getByRole('combobox',{name:'Run',exact:true}).selectOption({label:'Report 4'});await expect(page.locator('.pipeline-post')).toHaveCount(0);await page.getByRole('combobox',{name:'Run',exact:true}).selectOption('');
 await page.getByRole('combobox',{name:'Events',exact:true}).selectOption('');await page.locator('#pipeline-feed-list').evaluate(list=>list.scrollTop=200);expect(await page.locator('#pipeline-feed-list').evaluate(list=>list.scrollTop)).toBeGreaterThan(24);await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.locator('.pipeline-post')).toHaveCount(0);await page.getByRole('button',{name:'Active yard',exact:true}).click();
 await page.setViewportSize({width:540,height:800});const box=await page.locator('#pipeline-desk').boundingBox(),yardBox=await page.locator('.yard').boundingBox();expect(box.y).toBeGreaterThanOrEqual(yardBox.y+yardBox.height-1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}));
test('progress labels distinguish estimates, reported zero and unknown with safe attribution',async({page})=>{
 await page.route('**/admin/pipeyard/snapshot',async route=>{
  const response=await route.fetch(),data=await response.json();
  const estimated=data.runs.find(r=>r.title==='Report 3');Object.assign(estimated,{progress:null,displayProgress:62,progressSource:'estimate',progressEstimate:{percent:62,reason:'<img src=x onerror=alert(1)> Two stages finished.',author:'Scout',at:100000}});
  Object.assign(data.runs.find(r=>r.title==='Report 4'),{progress:0,displayProgress:0,progressSource:'platform',progressEstimate:{percent:70,reason:'Old estimate',author:'Scout',at:100000}});
  Object.assign(data.runs.find(r=>r.title==='Report 5'),{progress:null,displayProgress:null,progressSource:'unknown'});
  await route.fulfill({response,json:data});
 });
 await yard(page,async()=>{
  const estimated=page.getByRole('button',{name:/Report 3 ·/});await expect(estimated).toContainText('62%');await expect(estimated.locator('.progress-label')).toHaveAttribute('title','62% · Estimated');await estimated.click();
  await expect(page.locator('#details')).toContainText('Estimated by Scout');await expect(page.locator('#details')).toContainText('Two stages finished.');await expect(page.locator('#details img')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Report 4 ·/})).toContainText('0%');await expect(page.getByRole('button',{name:/Report 5 ·/})).toContainText('Progress unknown');
 });
});
async function yard(page,fn){
 const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createBridge}=await import('../sources/omp-bot-companion/server.mjs'),{Pipeyard}=await import('../sources/omp-bot-companion/pipeyard.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pipeyard-ui-')),manager=new RanchManager({dir,native:{}}),storage=new Pipeyard({root:path.join(manager.library.root,'pipeyard'),fetchImpl:async u=>new Response(JSON.stringify({id:u.split('/').at(-1),status:'running',message:'Building a report',progress:45,stages:[{name:'Gather inputs',status:'done'},{name:'Build report',status:'running'}]}))});
 storage.configure({version:1,platforms:[{id:'demo',name:'Demo',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'}}}],templates:[{id:'report',name:'Daily report',platformId:'demo',color:'#61b7ba',description:'Reporting workflow'}]});
 for(let i=0;i<10;i++){const r=await storage.execute('register',{templateId:'report',externalId:'run-'+i,title:'Report '+(i+1)});if(i===0){storage.runs[i].status='paused';storage.runs[i].message='<img src=x onerror=alert(1)>';storage.persist();}if(i===1){storage.runs[i].status='succeeded';storage.runs[i].tracking='finished';storage.persist();}}
 const server=createBridge({key:'a'.repeat(64),adminKey:'b'.repeat(64),manager});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await page.goto('http://127.0.0.1:'+server.address().port+'/pipeyard/#admin='+'b'.repeat(64));await fn({manager});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('ten colored pipes, paused indication, safe details, local notes and history',async({page})=>yard(page,async()=>{
 await page.setViewportSize({width:1440,height:900});await expect(page.locator('.pipe-tile')).toHaveCount(10);await page.getByRole('button',{name:/Report 1 ·/}).click();
 await expect(page.locator('#details')).toContainText('Workflow paused');await expect(page.locator('#details')).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('#details img')).toHaveCount(0);
 await page.getByLabel('Local run note').fill('Reviewed the inputs');await page.getByRole('button',{name:'Save local note'}).click();await expect(page.locator('#details')).toContainText('Reviewed the inputs');
 await page.getByLabel('Local run note').fill('Draft for the first run');await page.getByRole('button',{name:/Report 2 ·/}).click();await expect(page.getByLabel('Local run note')).toHaveValue('');await page.getByRole('button',{name:/Report 1 ·/}).click();await expect(page.getByLabel('Local run note')).toHaveValue('Draft for the first run');
 await page.getByRole('button',{name:'Close details'}).click();await page.getByRole('button',{name:/Report 2 ·/}).click();await page.getByRole('button',{name:'Clear from yard'}).click();await expect(page.locator('.pipe-tile')).toHaveCount(9);
 await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(1);await page.getByRole('button',{name:/Report 2 ·/}).click();await page.getByRole('button',{name:'Restore to yard'}).click();await expect(page.locator('.pipe-tile')).toHaveCount(0);
 await page.getByRole('button',{name:'Active yard',exact:true}).click();if(process.env.BOT_RANCH_CAPTURE_TEST_IMAGES==='1')await page.screenshot({path:'.scratch/pipeyard-desktop.png',fullPage:true});
}));
test('configuration, template choices and responsive run popout',async({page})=>yard(page,async()=>{
 await page.getByRole('button',{name:'Configure platforms'}).click();await expect(page.getByLabel('Platform configuration JSON')).toHaveValue(/example.test/);await page.getByRole('button',{name:'Close configuration'}).click();
 await page.getByRole('button',{name:'Track existing'}).click();await expect(page.getByLabel('Pipeline template')).toHaveValue('report');await expect(page.getByLabel('External run ID')).toBeVisible();await page.getByRole('button',{name:'Cancel'}).click();
 await page.getByRole('button',{name:/Report 1 ·/}).click();const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Pop out run'}).click();const popup=await popupPromise;await expect(popup.locator('#details')).toContainText('Report 1');await popup.close();
 await page.setViewportSize({width:540,height:800});await expect(page.getByRole('button',{name:'Close details'})).toBeVisible();if(process.env.BOT_RANCH_CAPTURE_TEST_IMAGES==='1')await page.screenshot({path:'.scratch/pipeyard-narrow.png',fullPage:true});
}));
test('configure a local platform, launch parallel runs and attach without resubmitting',async({page})=>{
 const http=require('node:http');let posts=0;
 const platform=http.createServer(async(req,res)=>{for await(const chunk of req){}const id=req.method==='POST'?'job-'+(++posts):req.url.split('/').at(-1);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id,status:'running',message:'In progress',progress:25}));});await new Promise(r=>platform.listen(0,'127.0.0.1',r));
 try{await yard(page,async()=>{
  await page.getByRole('button',{name:'Configure platforms'}).click();const config={version:1,platforms:[{id:'local',name:'Local test platform',baseUrl:'http://127.0.0.1:'+platform.address().port,operations:{trigger:{method:'POST',path:'/runs',body:'{{input}}'},status:{method:'GET',path:'/runs/{runId}'}}}],templates:[{id:'test',name:'Local pipeline',platformId:'local',color:'#d9bb72'}]};
  await page.getByLabel('Platform configuration JSON').fill(JSON.stringify(config));await page.getByRole('button',{name:'Validate & save'}).click();
  for(let i=0;i<2;i++){await page.getByRole('button',{name:'＋ Launch pipeline',exact:true}).click();await page.getByLabel('Run title',{exact:true}).fill('New run '+i);await page.locator('#create-submit').click();await expect(page.locator('#create-dialog')).not.toBeVisible();}
  expect(posts).toBe(2);await expect(page.locator('.pipe-tile')).toHaveCount(12);
  await page.getByRole('button',{name:'Track existing',exact:true}).click();await page.getByLabel('External run ID').fill('job-1');await page.getByRole('button',{name:'Verify & track'}).click();await expect(page.locator('#create-dialog')).not.toBeVisible();expect(posts).toBe(2);await expect(page.locator('.pipe-tile')).toHaveCount(12);
 });}finally{platform.closeAllConnections();await new Promise(r=>platform.close(r));}
});
test('six demo pipes support approval, start, notes and reset without companion API requests',async({page})=>yard(page,async()=>{
 await page.getByRole('button',{name:'Demo mode',exact:true}).click();await expect(page.locator('#demo-banner')).toBeVisible();await expect(page.locator('.pipe-tile')).toHaveCount(6);
 const calls=[];page.on('request',r=>{if(r.url().includes('/admin/'))calls.push(r.url());});
 const north=page.locator('#runs').getByRole('button',{name:/Market scan · North district/}),south=page.locator('#runs').getByRole('button',{name:/Market scan · South district/});expect(await north.evaluate(n=>n.style.getPropertyValue('--pipe'))).toBe(await south.evaluate(n=>n.style.getPropertyValue('--pipe')));
 await page.getByRole('button',{name:/Campaign release · Awaiting approval/}).click();await page.getByRole('button',{name:'Review approval'}).click();await expect(page.locator('#action-explanation')).toContainText('simulated');await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.locator('#details')).toContainText('no charge was made');
 await page.getByRole('button',{name:/New campaign brief · Ready to launch/}).click();await page.getByRole('button',{name:'Start demo run'}).click();await expect(page.locator('#details')).toContainText('Demo request accepted');
 await page.getByLabel('Local run note').fill('Testing the demo');await page.getByRole('button',{name:'Save local note'}).click();await expect(page.locator('#details')).toContainText('Testing the demo');
 await page.getByLabel('Local run note').fill('Discard this demo draft');await page.getByRole('button',{name:'Reset demo'}).click();await expect(page.locator('.pipe-tile')).toHaveCount(6);await page.getByRole('button',{name:/New campaign brief · Ready to launch/}).click();await expect(page.getByLabel('Local run note')).toHaveValue('');expect(calls).toEqual([]);
 await page.getByRole('button',{name:'Exit demo',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(10);await expect(page.locator('#demo-banner')).not.toBeVisible();
}));
test('demo popouts and reload stay isolated, and simulated progress advances',async({page})=>yard(page,async()=>{
 await page.getByRole('button',{name:'Demo mode',exact:true}).click();await page.locator('#runs').getByRole('button',{name:/Market scan · North district/}).click();
 const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Pop out run'}).click();const popup=await popupPromise;const calls=[];popup.on('request',r=>{if(r.url().includes('/admin/'))calls.push(r.url());});
 await expect(popup.locator('#demo-banner')).toBeVisible();await expect(popup.locator('#details')).toContainText('North district');await popup.reload();await expect(popup.locator('#demo-banner')).toBeVisible();await expect(popup.locator('#details')).toContainText('North district');
 await expect.poll(()=>popup.locator('.detail-status').textContent(),{timeout:10000}).not.toContain('32%');expect(calls).toEqual([]);await popup.close();
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'Reset demo'}).click();if(process.env.BOT_RANCH_CAPTURE_TEST_IMAGES==='1')await page.screenshot({path:'.scratch/pipeyard-demo.png',fullPage:true});
}));
test('exiting demo clears sample controls immediately even when the live companion fails',async({page})=>yard(page,async()=>{
 await page.getByRole('button',{name:'Demo mode',exact:true}).click();await page.getByRole('button',{name:/New campaign brief · Ready to launch/}).click();await expect(page.getByRole('button',{name:'Start demo run'})).toBeVisible();
 let pending;await page.route('**/admin/pipeyard/snapshot',route=>{pending=route;});const posts=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/admin/'))posts.push(r.url());});
 await page.getByRole('button',{name:'Exit demo',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(0);await expect(page.getByRole('button',{name:'Start demo run'})).not.toBeVisible();await expect.poll(()=>!!pending).toBe(true);await pending.abort();await expect(page.locator('#notice')).not.toBeEmpty();expect(posts).toEqual([]);
}));

test('opening due progress checks once, shows safe flexible JSON, and expands a saved response',async({page})=>{
 let active,checks=[];
 await page.route('**/admin/pipeyard/snapshot',async route=>{const response=await route.fetch(),data=await response.json();if(!active)active={...data.runs[2],checkDue:true,progressResponse:null};data.runs[2]=active;await route.fulfill({response,json:data});});
 await page.route('**/admin/pipeyard/action',async route=>{const body=route.request().postDataJSON();checks.push(body.action);active={...active,checkDue:false,progressResponse:{id:'response-1',source:'progress',fetchedAt:Date.now(),data:{custom:{items:[{title:'<img src=x onerror=alert(1)>',ready:true}],details:null},percent:47},review:null}};await route.fulfill({json:active});});
 await yard(page,async()=>{
  await page.getByRole('button',{name:/Report 3 ·/}).click();await expect(page.locator('.progress-response')).toContainText('Awaiting agent review');expect(checks).toEqual(['check-due']);
  await expect(page.locator('.progress-response img')).toHaveCount(0);await page.getByRole('button',{name:'Expand progress'}).click();await expect(page.getByRole('dialog',{name:'Saved progress response'})).toBeVisible();await expect(page.getByLabel('Progress JSON')).toHaveValue(/<img src=x onerror=alert/);
  await page.getByRole('button',{name:'Close progress'}).click();await page.getByRole('button',{name:'Close details'}).click();await page.getByRole('button',{name:/Report 3 ·/}).click();expect(checks).toEqual(['check-due']);
  await page.getByRole('button',{name:'Check now',exact:true}).click();await expect.poll(()=>checks).toEqual(['check-due','refresh']);
 });
});

test('an active pipeline can be cleared locally and restored without remote cancellation',async({page})=>yard(page,async()=>{
 await page.getByRole('button',{name:/Report 3 ·/}).click();await page.getByRole('button',{name:'Clear from yard',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(9);
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('button',{name:/Report 3 ·/}).click();await expect(page.locator('#details')).toContainText('Running');
 await page.getByRole('button',{name:'Restore to yard'}).click();await page.getByRole('button',{name:'Active yard',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(10);
}));

test('manual demo pipelines add without triggering, delete permanently, and survive reload without API calls',async({page})=>yard(page,async()=>{
 await page.getByRole('button',{name:'Demo mode',exact:true}).click();const calls=[];page.on('request',r=>{if(/\/(admin|control)\//.test(r.url()))calls.push(r.url());});
 await page.getByRole('button',{name:'＋ Add demo pipeline',exact:true}).click();await page.getByLabel('Pipeline name',{exact:true}).fill('My manual pipe');await page.getByRole('button',{name:'Add to yard',exact:true}).click();await expect(page.getByRole('dialog',{name:'Add demo pipeline'})).toContainText('All six slots are occupied');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.locator('.pipe-tile').first().click();await page.getByRole('button',{name:'Delete demo pipe',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(5);
 await page.getByRole('button',{name:'＋ Add demo pipeline',exact:true}).click();await page.getByLabel('Pipeline name',{exact:true}).fill('My manual pipe');await page.getByLabel('Pipe color',{exact:true}).selectOption('#b51f43');await page.getByRole('button',{name:'Add to yard',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(6);await expect(page.locator('#details')).toContainText('Not triggered');
 await page.reload();await expect(page.getByRole('button',{name:'My manual pipe · Ready to launch',exact:true})).toBeVisible();await page.getByRole('button',{name:'My manual pipe · Ready to launch',exact:true}).click();await page.getByRole('button',{name:'Delete demo pipe',exact:true}).click();await page.reload();await expect(page.locator('.pipe-tile')).toHaveCount(5);await expect(page.getByRole('button',{name:'My manual pipe · Ready to launch',exact:true})).toHaveCount(0);expect(calls).toEqual([]);
}));

test('connection editor shows a stable local ID and persists editable demo ID and metadata',async({page})=>yard(page,async()=>{
 await page.getByRole('button',{name:'Demo mode',exact:true}).click();await page.getByRole('button',{name:'New campaign brief · Ready to launch',exact:true}).click();await page.getByRole('button',{name:'Edit connection',exact:true}).click();
 await expect(page.getByLabel('Local record ID',{exact:true})).toHaveValue('demo-ready');await expect(page.getByLabel('Local record ID',{exact:true})).toHaveAttribute('readonly','');await page.getByLabel('External pipeline ID',{exact:true}).fill('custom-pipeline-42');await page.getByLabel('Local metadata (JSON)',{exact:true}).fill('{"links":{"report":"report-42"},"owner":"PM"}');await page.getByRole('button',{name:'Save connection',exact:true}).click();await expect(page.locator('#details')).toContainText('Pipeline ID: custom-pipeline-42');await expect(page.locator('#details')).toContainText('Ready to launch');
 await page.reload();await page.getByRole('button',{name:'New campaign brief · Ready to launch',exact:true}).click();await page.getByRole('button',{name:'Edit connection',exact:true}).click();await expect(page.getByLabel('External pipeline ID',{exact:true})).toHaveValue('custom-pipeline-42');await expect(page.getByLabel('Local metadata (JSON)',{exact:true})).toHaveValue(/report-42/);
}));

test('animal save conflicts stop further edits and offer reload',async({page})=>yard(page,async()=>{
 const origin=new URL(page.url()).origin;await page.emulateMedia({reducedMotion:'reduce'});await page.goto(origin+'/pipeyard/#embed=1&pair='+'a'.repeat(64));await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 await page.route('**/control/pipeyard/creatures',route=>route.request().method()==='POST'?route.fulfill({status:409,json:{error:'Animals changed in another window. Reload before saving.'}}):route.continue());
 await page.locator('.animal-layer .pasture-cow').first().click();await page.getByLabel('Animal name',{exact:true}).fill('Conflicting name');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.getByRole('button',{name:'Reload animals',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Add animal',exact:false})).toBeDisabled();await expect(page.getByLabel('Animal color',{exact:true})).toBeDisabled();
}));

test('an empty visual yard keeps the same dimensions without a large empty message',async({page})=>yard(page,async()=>{
 const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#embed=1&pair='+'a'.repeat(64));await page.reload();await expect(page.locator('.pipeline-row')).toHaveCount(10);
 const before=await page.locator('.pasture').boundingBox();await page.getByRole('searchbox',{name:'Find a run'}).fill('no-matching-pipeline');await expect(page.locator('.pipe-tile')).toHaveCount(0);await expect(page.locator('#empty')).toBeHidden();const after=await page.locator('.pasture').boundingBox();expect(after.height).toBe(before.height);expect(after.width).toBe(before.width);
}));

test('Ranch adds a pipeline next to animal controls using the existing tracking flow',async({page})=>yard(page,async()=>{
 const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#embed=1&pair='+'a'.repeat(64));await page.reload();await expect(page.locator('.pipeline-row')).toHaveCount(10);
 const add=page.getByRole('button',{name:'＋ Pipeline',exact:true});await expect(add).toBeVisible();const animal=await page.getByRole('button',{name:'＋ Add animal',exact:true}).boundingBox(),pipe=await add.boundingBox();expect(pipe.x).toBeGreaterThan(animal.x);expect(Math.abs(pipe.y-animal.y)).toBeLessThan(2);
 const calls=[];page.on('request',r=>{if(r.url().endsWith('/control/pipeyard/action'))calls.push(r.postDataJSON());});
 await add.click();await page.getByRole('button',{name:'Track existing',exact:true}).click();await expect(page.getByRole('heading',{name:'Track existing run'})).toBeVisible();await page.getByLabel('External run ID',{exact:true}).fill('run-0');await page.getByRole('button',{name:'Verify & track',exact:true}).click();await expect(page.locator('#create-dialog')).toBeHidden();expect(calls.map(c=>c.action)).toEqual(['register']);await expect(page.locator('.pipeline-row')).toHaveCount(10);
 await page.getByRole('button',{name:'Demo mode',exact:true}).click();await page.getByRole('button',{name:'＋ Pipeline',exact:true}).click();await page.getByRole('button',{name:'Add local placeholder',exact:true}).click();await expect(page.getByRole('dialog',{name:'Add demo pipeline',exact:true})).toBeVisible();
}));

test('local placeholder can be created from Ranch, reloaded and connected later without a launch',async({page})=>yard(page,async()=>{
 const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#embed=1&pair='+'a'.repeat(64));await page.reload();await expect(page.locator('.pipeline-row')).toHaveCount(10);const calls=[];page.on('request',r=>{if(r.url().endsWith('/control/pipeyard/action'))calls.push(r.postDataJSON());});
 await page.getByRole('button',{name:'＋ Pipeline',exact:true}).click();await page.getByRole('button',{name:'Add local placeholder',exact:true}).click();await page.getByRole('textbox',{name:'Pipeline name'}).fill('Design review');await page.getByLabel('Pipe color',{exact:true}).selectOption('#b51f43');await page.getByRole('button',{name:'Add to yard',exact:true}).click();await expect(page.locator('.pipeline-row')).toHaveCount(11);await expect(page.getByRole('button',{name:'Connect to platform',exact:true})).toBeVisible();expect(calls.map(c=>c.action)).toEqual(['create-local']);
 await page.reload();await expect(page.getByRole('button',{name:'Design review · Local placeholder',exact:true})).toBeVisible();await page.getByRole('button',{name:'Design review · Local placeholder',exact:true}).click();await page.getByRole('button',{name:'Connect to platform',exact:true}).click();await expect(page.getByRole('heading',{name:'Connect to platform',exact:true})).toBeVisible();await expect(page.getByLabel('External run ID',{exact:true})).toBeVisible();
}));


test('demo animals stay browser-local through reload and live mode switches',async({page})=>yard(page,async()=>{
 const origin=new URL(page.url()).origin;await page.emulateMedia({reducedMotion:'reduce'});
 const calls=[];page.on('request',r=>{if(r.url().endsWith('/pipeyard/creatures'))calls.push(r.method());});
 await page.goto(origin+'/pipeyard/#yard=1&demo=1&admin='+'b'.repeat(64));await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 await page.locator('.pasture-cow').first().click({position:{x:4,y:20}});await page.getByLabel('Animal name',{exact:true}).fill('Demo Clover');await page.getByRole('button',{name:'Save name',exact:true}).click();
 await page.reload();await expect(page.getByRole('button',{name:/^Demo Clover, cow/})).toBeVisible();expect(calls).toEqual([]);
 await page.getByRole('button',{name:'Exit demo',exact:true}).click();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');await expect(page.getByRole('button',{name:/^Demo Clover, cow/})).toHaveCount(0);
 await page.getByRole('button',{name:'Demo mode',exact:true}).click();await expect(page.getByRole('button',{name:/^Demo Clover, cow/})).toBeVisible();
}));

test('two visual yards keep animal controls usable through background saves',async({page,context})=>yard(page,async()=>{
 const origin=new URL(page.url()).origin,second=await context.newPage();
 try{
  for(const p of [page,second]){await p.emulateMedia({reducedMotion:'reduce'});await p.clock.install();await p.goto(origin+'/pipeyard/#yard=1&admin='+'b'.repeat(64));await p.reload();await expect(p.locator('.creature-save-status')).toHaveText('Animals saved locally');}
  await page.clock.fastForward(15100);await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
  await second.clock.fastForward(15100);await expect(second.locator('.creature-save-status')).toHaveText('Animals saved locally');await expect(second.getByRole('button',{name:'＋ Add animal',exact:true})).toBeEnabled();
  await second.locator('.pasture-cow').first().click();await second.getByLabel('Animal name',{exact:true}).fill('Shared Clover');await second.getByRole('button',{name:'Save name',exact:true}).click();await expect(second.locator('.creature-save-status')).toHaveText('Animals saved locally');
  await page.clock.fastForward(15100);await expect(page.getByRole('button',{name:/^Shared Clover, cow/})).toBeVisible();await expect(page.getByRole('button',{name:'＋ Add animal',exact:true})).toBeEnabled();
 }finally{await second.close();}
}));

test('adding a placeholder leaves Animal Desk and displays its truthful status',async({page})=>yard(page,async()=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#yard=1&admin='+'b'.repeat(64));await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 await page.locator('.pasture-cow').first().click();await expect(page.getByRole('heading',{name:'Animal Desk',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'＋ Pipeline',exact:true}).click();await page.getByRole('button',{name:'Add local placeholder',exact:true}).click();await page.getByLabel('Pipeline name',{exact:true}).fill('Local design');await page.getByRole('button',{name:'Add to yard',exact:true}).click();
 await expect(page.getByRole('button',{name:'Connect to platform',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Pipeline Desk',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Local design · Local placeholder',exact:true})).toContainText('Local placeholder');
}));

test('pipeline keyboard focus survives scheduled refresh',async({page})=>yard(page,async()=>{
 await page.clock.install();const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#yard=1&admin='+'b'.repeat(64));await page.reload();
 const tile=page.getByRole('button',{name:/Report 3 ·/});await tile.focus();await page.clock.fastForward(5100);await expect(tile).toBeFocused();
}));


test('animal edits queued behind movement persist even when the yard is hidden',async({page})=>yard(page,async()=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.clock.install();const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#yard=1&admin='+'b'.repeat(64));await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 let release,blocked=false;const gate=new Promise(r=>release=r);await page.route('**/admin/pipeyard/creatures',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().background&&!blocked){blocked=true;await gate;}await route.continue();});
 try{
  await page.clock.fastForward(15100);await expect.poll(()=>blocked).toBe(true);
  await page.locator('.pasture-cow').first().click();await page.getByLabel('Animal name',{exact:true}).fill('Queued Clover');await page.getByRole('button',{name:'Save name',exact:true}).click();await page.locator('.pasture').evaluate(n=>n.style.display='none');release();
  await expect.poll(async()=>{const r=await page.request.get(origin+'/admin/pipeyard/creatures',{headers:{Authorization:'Bearer '+'b'.repeat(64)}});return (await r.json()).creatures[0].name;}).toBe('Queued Clover');
 }finally{release();}
}));

test('a failed animal edit is retried without being replaced by background movement',async({page})=>yard(page,async()=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.clock.install();const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#yard=1&admin='+'b'.repeat(64));await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 let failed=false;await page.route('**/admin/pipeyard/creatures',async route=>{if(route.request().method()==='POST'&&!route.request().postDataJSON().background&&!failed){failed=true;return route.abort();}return route.continue();});
 await page.locator('.pasture-cow').first().click();await page.getByLabel('Animal name',{exact:true}).fill('Retry Clover');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('.creature-save-status')).toContainText('Failed to fetch');
 const cow=page.locator('.animal-layer .pasture-cow').first(),before=await cow.boundingBox();await page.mouse.move(before.x+25,before.y+20);await page.mouse.down();await page.mouse.move(before.x+95,before.y+60,{steps:5});await page.clock.fastForward(15100);await expect(page.locator('.creature-save-status')).toContainText('Failed to fetch');await page.keyboard.press('Escape');await page.mouse.up();
 await page.clock.fastForward(15100);await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 expect(Math.abs((await cow.boundingBox()).x-before.x)).toBeLessThan(1);
 const r=await page.request.get(origin+'/admin/pipeyard/creatures',{headers:{Authorization:'Bearer '+'b'.repeat(64)}});expect((await r.json()).creatures[0].name).toBe('Retry Clover');
}));

test('background responses do not reset an animal being dragged',async({page})=>yard(page,async()=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.clock.install();const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#yard=1&admin='+'b'.repeat(64));await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 let release,blocked=false;const gate=new Promise(r=>release=r);await page.route('**/admin/pipeyard/creatures',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().background&&!blocked){blocked=true;await gate;}await route.continue();});
 try{
  await page.clock.fastForward(15100);await expect.poll(()=>blocked).toBe(true);const cow=page.locator('.animal-layer .pasture-cow').first(),before=await cow.boundingBox();await page.mouse.move(before.x+25,before.y+20);await page.mouse.down();await page.mouse.move(before.x+95,before.y+60,{steps:5});const moved=await cow.boundingBox();release();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
  const after=await cow.boundingBox();expect(Math.abs(after.x-moved.x)).toBeLessThan(1);expect(Math.abs(after.y-moved.y)).toBeLessThan(1);await page.mouse.up();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 }finally{release();}
}));


test('pipeline symbols distinguish action, waiting, completion, error and placeholder',async({page})=>yard(page,async()=>{
 await page.route('**/admin/pipeyard/snapshot',async route=>{const response=await route.fetch(),data=await response.json();data.runs=data.runs.slice(0,5).map((r,i)=>({...r,status:['awaiting-approval','ready','succeeded','failed','ready'][i],localOnly:i===4,tracking:'active',progress:45,displayProgress:45,progressSource:'platform'}));await route.fulfill({response,json:data});});
 const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#yard=1&admin='+'b'.repeat(64));await page.reload();
 for(const name of ['Action needed','Not started','Complete','Error','Placeholder — not connected or started'])await expect(page.getByRole('img',{name,exact:true})).toBeVisible();
 await expect(page.locator('.progress-value').first()).toHaveText('45%');
 expect(await page.locator('.progress-value').first().evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(18);
}));


test('switching Demo waits for a pending live animal edit',async({page})=>yard(page,async()=>{
 await page.emulateMedia({reducedMotion:'reduce'});const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#yard=1&admin='+'b'.repeat(64));await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
 let release,blocked=false;const gate=new Promise(r=>release=r);await page.route('**/admin/pipeyard/creatures',async route=>{if(route.request().method()==='POST'&&!route.request().postDataJSON().background&&!blocked){blocked=true;await gate;}await route.continue();});
 try{
  await page.locator('.pasture-cow').first().click();await page.getByLabel('Animal name',{exact:true}).fill('Saved before demo');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect.poll(()=>blocked).toBe(true);
  await page.getByRole('button',{name:'Demo mode',exact:true}).click();expect(page.url()).not.toContain('demo=1');release();await expect(page.getByRole('button',{name:'Exit demo',exact:true})).toBeVisible();
  const r=await page.request.get(origin+'/admin/pipeyard/creatures',{headers:{Authorization:'Bearer '+'b'.repeat(64)}});expect((await r.json()).creatures[0].name).toBe('Saved before demo');await expect(page.getByRole('button',{name:/^Saved before demo, cow/})).toHaveCount(0);
 }finally{release();}
}));


test('pipe appearance persists and narrow pipe targets leave animals selectable behind them',async({page})=>yard(page,async()=>{
 // Freeze visual animation so this test can place an animal beneath a pipe deterministically.
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.emulateMedia({reducedMotion:'reduce'});const origin=new URL(page.url()).origin;await page.goto(origin+'/pipeyard/#embed=1&pair='+'a'.repeat(64));await page.reload();await expect(page.locator('.pipeline-row')).toHaveCount(10);
 const pipe=page.getByRole('button',{name:/Report 3 ·/});await pipe.click();await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.getByLabel('Pipe shape',{exact:true}).selectOption('orchestrator');const original=await pipe.evaluate(n=>n.style.getPropertyValue('--pipe'));await expect(page.getByRole('button',{name:'Current custom color',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Save appearance',exact:true}).click();await page.reload();await expect(pipe).toHaveCSS('--pipe',original);await pipe.click();await page.getByRole('button',{name:'Appearance',exact:true}).click();await expect(page.locator('.pipe-color-palette button')).toHaveCount(33);await page.getByRole('button',{name:'Mint',exact:true}).click();await expect(page.getByRole('button',{name:'Mint',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Save appearance',exact:true}).click();await expect(pipe).toHaveAttribute('data-shape','orchestrator');
 await page.reload();await expect(pipe).toHaveAttribute('data-shape','orchestrator');await expect(pipe).toHaveCSS('--pipe','#66d9ce');await pipe.click();await page.getByRole('button',{name:'Appearance',exact:true}).click();await expect(page.locator('.pipe-color-palette button')).toHaveCount(32);await expect(page.getByRole('button',{name:'Mint',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(pipe.locator('.progress-label')).toHaveText('45%');
 await pipe.scrollIntoViewIfNeeded();await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
 const row=await pipe.locator('..').boundingBox(),hit=await pipe.boundingBox();expect(hit.width).toBeLessThan(row.width*.65);
 const target=await pipe.evaluate(n=>{const cow=document.querySelector('.animal-layer .pasture-cow'),layer=cow.parentElement,box=n.getBoundingClientRect(),field=layer.getBoundingClientRect();cow.style.transform=`translate(${box.x-field.x-25}px,${box.y-field.y+180}px)`;const x=box.x-18,y=box.y+195,center=box.x+box.width/2;return {x,y,hits:{animal:!!document.elementFromPoint(x,y)?.closest('.pasture-cow'),pipe:!!document.elementFromPoint(center,y)?.closest('.pipe-tile')}};});
 expect(target.hits).toEqual({animal:true,pipe:true});
 await page.mouse.click(target.x,target.y);await expect(page.getByRole('heading',{name:'Animal Desk',exact:true})).toBeVisible();
}));

test('History deletion requires confirmation and does not touch external work',async({page})=>yard(page,async()=>{
 const actions=[];page.on('request',r=>{if(r.url().endsWith('/pipeyard/action'))actions.push(r.postDataJSON());});
 await page.getByRole('button',{name:/Report 3 ·/}).click();await page.getByRole('button',{name:'Clear from yard',exact:true}).click();await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('button',{name:/Report 3 ·/}).click();
 await page.getByRole('button',{name:'Delete from History',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(actions.filter(a=>a.action==='delete')).toHaveLength(0);await expect(page.locator('.pipe-tile')).toHaveCount(1);
 await page.getByRole('button',{name:'Delete from History',exact:true}).click();await page.getByRole('button',{name:'Delete permanently',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(0);expect(actions.filter(a=>a.action==='delete')).toHaveLength(1);expect(actions.at(-1)).toMatchObject({action:'delete',confirmed:true});
 await page.reload();await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(0);
 await page.getByRole('button',{name:'Demo mode',exact:true}).click();await page.locator('.pipe-tile').first().click();await page.getByRole('button',{name:'Clear from yard',exact:true}).click();await page.getByRole('button',{name:'History',exact:true}).click();await page.locator('.pipe-tile').first().click();await page.getByRole('button',{name:'Delete from History',exact:true}).click();await page.getByRole('button',{name:'Delete permanently',exact:true}).click();await expect(page.locator('.pipe-tile')).toHaveCount(0);expect(actions.filter(a=>a.action==='delete')).toHaveLength(1);
}));
