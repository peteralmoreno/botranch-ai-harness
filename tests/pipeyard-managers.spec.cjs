const {test,expect}=require('@playwright/test');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('William is a persistent farmer manager with handoffs and separate Ranch capacity',async({page})=>{
 const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createBridge}=await import('../sources/omp-bot-companion/server.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yard-manager-ui-')),manager=new RanchManager({dir,native:{}}),key='a'.repeat(64);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const server=createBridge({key,adminKey:'b'.repeat(64),manager});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const william=manager.saveProfile({nickname:'William',folder:dir,color:0,role:'pipeyard-manager',design:'farmer',active:false});manager.setMembership(william.id,true,william.revision);
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1688,height:696});await page.goto(origin+'/pipeyard/#embed=1&pair='+key);await expect(page.locator('.yard-manager-panel')).toHaveCount(0);await expect(page.getByRole('button',{name:'＋ William',exact:true})).toHaveCount(0);
  const actor=page.getByRole('button',{name:'William, Pipeline Manager, offline',exact:true});await expect(actor).toBeVisible();await expect(actor.locator('.farmer')).toHaveCount(1);expect(manager.profiles[0].slot).toBe(6);
  await actor.click();await expect(page.getByRole('heading',{name:'William',exact:true})).toBeVisible();await page.getByRole('button',{name:'Check assigned pipes',exact:true}).click();await expect.poll(()=>manager.tasks.length).toBe(1);expect(manager.tasks[0].releasedForPickup).toBe(true);expect(manager.runs).toEqual({});
  const response=await page.request.post(origin+'/control/pipeyard/action',{headers:{Authorization:'Bearer '+key},data:{action:'create-local',requestId:'ui-manager-demo',title:'Review this pipeline',color:'#67a9a6'}});expect(response.ok()).toBe(true);
  await page.reload();await page.getByRole('button',{name:/Review this pipeline ·/}).click();await page.getByRole('button',{name:'Hand off to manager',exact:true}).click();await page.getByLabel('Handoff brief').fill('Summarize results and evidence.');await page.getByRole('button',{name:'Queue review',exact:true}).click();await expect(page.locator('#details')).toContainText('Manager: William');expect(manager.tasks.length).toBe(2);
  manager.saveProfile({nickname:'Willow',folder:dir,color:1,role:'pipeyard-manager',design:'farmer'});await page.reload();await expect(page.locator('.yard-manager-actor')).toHaveCount(2);await expect(page.getByRole('button',{name:'＋ Manager',exact:true})).toHaveCount(0);
  for(const width of [840,1688,2547]){await page.setViewportSize({width,height:696});await expect.poll(()=>actor.evaluate(e=>{const r=e.getBoundingClientRect(),p=document.querySelector('.pasture').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom;})).toBe(true);}
  await page.goto(origin+'/ui/#pair='+key);await expect(page.locator('#residents .bot')).toHaveCount(0);expect(errors).toEqual([]);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('active managers wander across refreshes, retain their identity, and stop for reduced motion or offline',async({page})=>{
 const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createBridge}=await import('../sources/omp-bot-companion/server.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yard-manager-walk-')),manager=new RanchManager({dir,native:{}}),key='a'.repeat(64);
 const profile=manager.saveProfile({nickname:'William',folder:dir,color:0,role:'pipeyard-manager',design:'farmer'});
 const server=createBridge({key,adminKey:'b'.repeat(64),manager});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let state='ready',snapshots=0,mutations=0;
 page.on('request',request=>{if(request.method()==='POST'&&!request.url().endsWith('/pipeyard/creatures'))mutations++;});
 await page.route('**/control/pipeyard/snapshot',async route=>{const response=await route.fetch(),body=await response.json();snapshots++;[...body.managers,...(body.bots||[])].forEach(p=>{p.state=state;});await route.fulfill({response,json:body});});
 try{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1688,height:696});await page.clock.install();
  await page.goto('http://127.0.0.1:'+server.address().port+'/pipeyard/#embed=1&pair='+key);
  const actor=page.locator('.yard-manager-actor');await expect(actor).toBeVisible();
  await actor.evaluate(e=>{e.dataset.identity='original';});const start=await actor.getAttribute('style');
  await page.clock.runFor(2500);expect(await actor.getAttribute('style')).not.toBe(start);
  const before=snapshots;await page.clock.runFor(4500);await expect.poll(()=>snapshots).toBeGreaterThan(before);await expect(actor).toHaveAttribute('data-identity','original');
  const walkBox=await actor.boundingBox();await page.mouse.move(walkBox.x+30,walkBox.y+30);await page.mouse.down();await page.mouse.move(walkBox.x-60,walkBox.y+50,{steps:5});await expect(actor).toHaveAttribute('data-held','true');
  const held=await actor.getAttribute('style'),heldRefresh=snapshots;await page.clock.runFor(5500);await expect.poll(()=>snapshots).toBeGreaterThan(heldRefresh);expect(await actor.getAttribute('style')).toBe(held);await page.mouse.up();await page.mouse.move(0,0);const drop=await actor.getAttribute('style');await page.clock.runFor(2500);expect(await actor.getAttribute('style')).not.toBe(drop);
  await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(100);const stopped=await actor.getAttribute('style');await page.clock.runFor(1000);expect(await actor.getAttribute('style')).toBe(stopped);
  const current=manager.profiles.find(p=>p.id===profile.id);manager.saveProfile({...current,expectedRevision:current.revision,nickname:'Rowan'});state='offline';
  await page.clock.runFor(4500);await expect(actor).toHaveAttribute('aria-label','Rowan, Pipeline Manager, offline');await expect(actor).toHaveAttribute('data-identity','original');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.clock.runFor(100);const offline=await actor.getAttribute('style');await page.clock.runFor(1000);expect(await actor.getAttribute('style')).toBe(offline);
  expect(mutations).toBe(0);expect(manager.tasks).toHaveLength(0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('Pipeyard managers can be picked up, dropped, cancelled and moved by keyboard without work mutations',async({page})=>{
 const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createBridge}=await import('../sources/omp-bot-companion/server.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yard-manager-drag-')),manager=new RanchManager({dir,native:{}}),key='a'.repeat(64);
 manager.saveProfile({nickname:'Willow',folder:dir,color:0,role:'pipeyard-manager',design:'farmer'});
 const server=createBridge({key,adminKey:'b'.repeat(64),manager});await new Promise(r=>server.listen(0,'127.0.0.1',r));let workMutations=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/pipeyard/action'))workMutations++;});
 try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1688,height:696});await page.goto('http://127.0.0.1:'+server.address().port+'/pipeyard/#embed=1&pair='+key);
  const actor=page.locator('.yard-manager-actor');await expect(actor).toBeVisible();const start=await actor.boundingBox();
  await page.mouse.move(start.x+start.width/2,start.y+30);await page.mouse.down();await page.mouse.move(start.x+start.width/2-130,start.y+110,{steps:8});await expect(actor).toHaveAttribute('data-dragging','true');await page.mouse.up();
  await expect(page.locator('.yard-manager-dialog')).toHaveCount(0);const dropped=await actor.boundingBox();expect(dropped.x).toBeLessThan(start.x-100);expect(dropped.y).toBeGreaterThan(start.y+60);
  await actor.focus();await page.keyboard.press('ArrowRight');expect((await actor.boundingBox()).x).toBeGreaterThan(dropped.x+10);await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Willow',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close',exact:true}).click();
  const before=await actor.boundingBox();await page.mouse.move(before.x+30,before.y+30);await page.mouse.down();await page.mouse.move(before.x-100,before.y+70,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();const cancelled=await actor.boundingBox();expect(cancelled.x).toBeCloseTo(before.x,0);expect(cancelled.y).toBeCloseTo(before.y,0);await expect(page.locator('.yard-manager-dialog')).toHaveCount(0);
  await actor.press('ArrowLeft');expect((await actor.boundingBox()).x).toBeLessThan(before.x-10);expect(workMutations).toBe(0);expect(manager.tasks).toHaveLength(0);
  const touch=await actor.boundingBox(),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x+30,y:touch.y+30,id:73}]});await expect(actor).toHaveAttribute('data-held','true');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x-60,y:touch.y+80,id:73}]});await expect(actor).toHaveAttribute('data-dragging','true');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(actor).toHaveAttribute('data-held','false');expect((await actor.boundingBox()).x).toBeCloseTo(touch.x,0);await cdp.detach();
  for(const width of [1366,2547]){await page.setViewportSize({width,height:768});const bar=await page.locator('.yard-toolbar').boundingBox();expect(bar.height).toBeLessThanOrEqual(40);await expect(page.locator('.yard-manager-panel')).toHaveCount(0);await expect(page.locator('.yard-toolbar .creature-save-status')).toHaveCount(0);}
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('explicit yard placement displays ordinary Pipeyard bots and Ranch managers in their chosen view',async({page})=>{
 const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createBridge}=await import('../sources/omp-bot-companion/server.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yard-profile-view-')),manager=new RanchManager({dir,native:{}}),key='a'.repeat(64);
 manager.saveProfile({nickname:'Painter',folder:dir,role:'designer',design:'designer',color:1,yard:'pipeyard'});manager.saveProfile({nickname:'Ranch manager',folder:dir,role:'pipeyard-manager',color:2,yard:'ranch'});
 const server=createBridge({key,adminKey:'b'.repeat(64),manager});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  await page.goto(origin+'/pipeyard/#embed=1&pair='+key);await expect(page.locator('.yard-manager-actor')).toHaveCount(1);await page.getByRole('button',{name:'Painter, Designer, offline',exact:true}).click();await expect(page.getByRole('heading',{name:'Painter',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Check assigned pipes',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Close',exact:true}).click();const painter=manager.profiles.find(p=>p.nickname==='Painter');manager.saveProfile({...painter,expectedRevision:painter.revision,role:'researcher'});await expect(page.locator('.yard-manager-actor')).toHaveAccessibleName('Painter, Researcher, offline',{timeout:10000});
  await page.goto(origin+'/ui/#pair='+key);await expect(page.locator('.bot')).toHaveCount(1);await expect(page.locator('.bot')).toHaveAccessibleName(/Ranch manager/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('ordinary bots open or focus sessions from either yard without restarting live work',async({page})=>{
 const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createBridge}=await import('../sources/omp-bot-companion/server.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yard-open-session-')),starts=[],focuses=[],live=new Set(),key='a'.repeat(64),native={checks:async()=>[],status:async r=>live.has(r.pid)?'live':'closed',launch:async p=>{starts.push(p.id);const pid=10000+starts.length;live.add(pid);return {pid,started:'639303286391764702'};},focus:async r=>{focuses.push(r.pid);return 'focused';}};
 const manager=new RanchManager({dir,native});manager.saveProfile({nickname:'Ranch bot',folder:dir,color:0,role:'generalist',yard:'ranch'});manager.saveProfile({nickname:'Yard bot',folder:dir,color:1,role:'generalist',yard:'pipeyard'});
 const server=createBridge({key,adminKey:'b'.repeat(64),manager});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  await page.goto(origin+'/ui/#pair='+key);await page.locator('.bot').click();await expect(page.locator('#desk-terminal')).toBeEnabled();await page.locator('#desk-terminal').click();await expect.poll(()=>starts.length).toBe(1);await expect(page.locator('#desk-terminal')).toBeEnabled();await page.locator('#desk-terminal').click();await expect.poll(()=>focuses.length).toBe(1);expect(starts.length).toBe(1);
  await page.goto(origin+'/pipeyard/#embed=1&pair='+key);await page.locator('.yard-manager-actor').click();await page.getByRole('button',{name:'Open session',exact:true}).click();await expect.poll(()=>starts.length).toBe(2);await page.locator('.yard-manager-actor').click();await page.getByRole('button',{name:'Open session',exact:true}).click();await expect.poll(()=>focuses.length).toBe(2);expect(starts.length).toBe(2);expect(manager.tasks).toHaveLength(0);
  await page.route('**/control/profile/session',route=>route.fulfill({status:403,json:{error:'Session access denied'}}));await page.locator('.yard-manager-actor').click();await page.getByRole('button',{name:'Open session',exact:true}).click();await expect(page.locator('.yard-manager-dialog .scoped-error')).toHaveText('Session access denied');await expect(page.locator('.yard-manager-dialog .scoped-error')).toBeFocused();expect(starts.length).toBe(2);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
