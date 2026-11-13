const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createPreviewServer}=require('../tools/preview-pipeyard.cjs'),{createCreatureStore}=require('../tools/creature-store.cjs');
async function preview(page,fn){const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'creature-ui-')),'creatures.json'),store=createCreatureStore(file),server=createPreviewServer({creatureFile:file});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;try{await page.emulateMedia({reducedMotion:'reduce'});await page.goto(origin+'/pipeyard/#demo=1');await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');await fn({store,origin});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}

test('new animals arrive hungry and chosen colors render, can be edited and survive reload',async({page})=>preview(page,async({store})=>{
 for(const kind of ['cow','chicken','sheep']){
  await page.getByRole('button',{name:'＋ Add animal',exact:true}).click();
  await page.getByLabel('Animal species',{exact:true}).selectOption(kind);
  await page.getByLabel('New animal name',{exact:true}).fill('New '+kind);
  const color=page.getByRole('dialog',{name:'Add animal'}).getByLabel('Animal color',{exact:true});
  await expect(color).toBeVisible();await color.selectOption({label:'Chestnut'});
  await page.getByRole('button',{name:'Add to pasture',exact:true}).click();
  await expect.poll(()=>store.read().creatures.find(a=>a.name==='New '+kind)?.variant).toBe(4);
  const saved=store.read().creatures.find(a=>a.name==='New '+kind);expect(saved.fullness).toBeLessThanOrEqual(25);expect(saved.fullness).toBeGreaterThan(24);
  const region=kind==='sheep'?'.sheep-wool':'.'+kind+'-body > path:first-child';
  await expect(page.getByRole('button',{name:new RegExp('^New '+kind+',')}).locator(region)).toHaveCSS('fill','rgb(181, 121, 80)');
  await page.locator('.creature-panel').getByLabel('Animal color',{exact:true}).selectOption({label:'Charcoal'});
  await expect.poll(()=>store.read().creatures.find(a=>a.name==='New '+kind)?.variant).toBe(3);
  await expect(page.locator('.animal-portrait').locator(region)).toHaveCSS('fill','rgb(89, 94, 88)');
  await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');
  await expect(page.getByRole('button',{name:new RegExp('^New '+kind+',')}).locator(region)).toHaveCSS('fill','rgb(89, 94, 88)');
 }
}));
test('animal desk supports fullness, persistent names, add/remove and keeps hay behind creatures',async({page})=>preview(page,async({store})=>{
 await expect(page.locator('.animal-layer button')).toHaveCount(15);const order=await page.evaluate(()=>[getComputedStyle(document.querySelector('.hay-bale')).zIndex,getComputedStyle(document.querySelector('.animal-layer .pasture-cow')).zIndex]);expect(Number(order[0])).toBeLessThan(Number(order[1]));
 await page.locator('.animal-layer .pasture-cow').first().click();await expect(page.getByRole('heading',{name:'Animal Desk',exact:true})).toBeVisible();await expect(page.getByLabel('Fullness',{exact:true})).toBeVisible();await page.getByLabel('Animal name',{exact:true}).fill('Clover');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect.poll(()=>store.read().creatures[0].name).toBe('Clover');
 await page.reload();await expect(page.getByRole('button',{name:/^Clover, cow/})).toBeVisible();await page.getByRole('button',{name:'＋ Add animal',exact:true}).click();await page.getByLabel('Animal species',{exact:true}).selectOption('sheep');await page.getByLabel('New animal name',{exact:true}).fill('Woolly');await page.getByRole('button',{name:'Add to pasture',exact:true}).click();await expect.poll(()=>store.read().creatures.length).toBe(14);await expect(page.locator('.creature-panel h3')).toHaveText('Woolly');await page.getByRole('button',{name:'Remove animal',exact:true}).click();await expect.poll(()=>store.read().creatures.length).toBe(13);
 await page.locator('.pipe-tile').first().click();await expect(page.locator('#details')).toBeVisible();
}));
test('creature dragging saves position and Escape restores without opening the desk',async({page})=>preview(page,async({store})=>{
 const animal=page.locator('.animal-layer .pasture-cow').first(),before=await animal.boundingBox();await page.mouse.move(before.x+28,before.y+20);await page.mouse.down();await page.mouse.move(before.x+128,before.y+80,{steps:8});await page.mouse.up();await expect.poll(()=>store.read().creatures[0].x).toBeGreaterThan(.2);await expect(page.locator('.creature-panel')).toBeHidden();
 const moved=await animal.boundingBox();await page.mouse.move(moved.x+28,moved.y+20);await page.mouse.down();await page.mouse.move(moved.x+80,moved.y+80,{steps:6});await page.keyboard.press('Escape');await page.mouse.up();const cancelled=await animal.boundingBox();expect(Math.abs(cancelled.x-moved.x)).toBeLessThan(1);expect(Math.abs(cancelled.y-moved.y)).toBeLessThan(1);
 await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');expect(Math.abs((await animal.boundingBox()).x-moved.x)).toBeLessThan(1);
}));
test('preview file changes reject foreign origins and revision conflicts without losing the roster',async({page})=>preview(page,async({store,origin})=>{
 const state=store.read();const rejected=await fetch(origin+'/prototype/creatures',{method:'PUT',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify(state)});expect(rejected.status).toBe(403);expect(store.read().revision).toBe(state.revision);
 store.save(state);await page.locator('.animal-layer .pasture-cow').first().click();await page.getByLabel('Animal name',{exact:true}).fill('Conflicting name');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('.creature-save-status')).toContainText('another window');expect(store.read().creatures[0].name).not.toBe('Conflicting name');
}));

test('an animal eats according to fullness, leaves when full and returns only after getting hungry',async({page})=>preview(page,async({store})=>{
 const state=store.read();state.creatures=[{...state.creatures[0],name:'Hungry cow',x:state.hay[0].x,y:state.hay[0].y,fullness:25,eating:false}];store.save(state);await page.clock.install();await page.reload();await expect(page.locator('.creature-save-status')).toHaveText('Animals saved locally');await page.locator('.animal-layer .pasture-cow').click();
 await page.clock.runFor(250);await expect(page.locator('.animal-activity')).toHaveText('Eating hay');await page.clock.fastForward(240000);await page.clock.runFor(250);await expect(page.locator('.animal-activity')).toHaveText('Wandering');expect(await page.locator('#animal-fullness').evaluate(n=>n.value)).toBeGreaterThanOrEqual(90);
 await page.clock.fastForward(120000);await page.clock.runFor(250);await expect(page.locator('.animal-activity')).toHaveText('Wandering');await page.clock.fastForward(1320000);await page.clock.runFor(250);await expect(page.locator('.animal-activity')).toHaveText('Eating hay');
}));
