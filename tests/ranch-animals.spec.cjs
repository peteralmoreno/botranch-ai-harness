const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
async function ranch(page,fn){
 const {RanchManager}=await import('../sources/omp-bot-companion/manager.mjs'),{createBridge}=await import('../sources/omp-bot-companion/server.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranch-animals-')),manager=new RanchManager({dir,native:{}}),key='a'.repeat(64);
 const server=createBridge({key,adminKey:'b'.repeat(64),manager});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 try{await page.emulateMedia({reducedMotion:'reduce'});await page.goto(origin+'/ui/#pair='+key);await expect(page.getByRole('button',{name:'＋ Animal',exact:true})).toBeEnabled();await fn({origin,key,manager});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('Ranch animals add, rename, recolor, move and persist without touching Pipeyard or bot work',async({page})=>ranch(page,async({origin,key})=>{
 const actions=[];page.on('request',r=>{if(r.method()==='POST')actions.push(new URL(r.url()).pathname);});
 await expect(page.locator('.ranch-animal-layer .pasture-cow')).toHaveCount(0);
 await page.getByRole('button',{name:'＋ Animal',exact:true}).click();await page.getByLabel('New animal name',{exact:true}).fill('Little Clover');await page.getByLabel('Animal color',{exact:true}).selectOption({label:'Chestnut'});await page.getByRole('button',{name:'Add to pasture'}).click();
 await expect(page.getByRole('heading',{name:'Animal Desk',exact:true})).toBeVisible();await expect(page.locator('.ranch-animal-status .creature-save-status')).toHaveText('Animals saved locally');
 await page.getByLabel('Animal name',{exact:true}).fill('Clover');await page.getByRole('button',{name:'Save name'}).click();await expect(page.locator('.ranch-animal-status .creature-save-status')).toHaveText('Animals saved locally');
 await page.getByRole('button',{name:'Back to bots'}).click();await expect(page.locator('#ranch-desk')).toBeVisible();
 const cow=page.getByRole('button',{name:/^Clover, cow/});const before=await cow.boundingBox();await cow.focus();await page.keyboard.press('ArrowLeft');await expect.poll(async()=>Math.round((await cow.boundingBox()).x)).toBeLessThan(Math.round(before.x));
 await page.reload();await expect(cow).toBeVisible();await cow.click();await expect(page.getByLabel('Animal color',{exact:true})).toHaveValue('4');
 const yard=await fetch(origin+'/control/pipeyard/creatures',{headers:{Authorization:'Bearer '+key}}).then(r=>r.json());expect(yard.creatures).toHaveLength(13);expect(yard.creatures.some(a=>a.name==='Clover')).toBe(false);
 expect(actions.every(a=>a==='/control/ranch/creatures')).toBe(true);
 await page.getByRole('button',{name:'Remove animal'}).click();await expect(cow).toHaveCount(0);
}));
test('Ranch animals stay within the field and leave menu edges available',async({page})=>ranch(page,async()=>{
 await page.setViewportSize({width:1440,height:400});await page.getByRole('button',{name:'＋ Animal',exact:true}).click();await page.getByRole('button',{name:'Add to pasture'}).click();
 const cow=page.locator('.ranch-animal-layer .pasture-cow');await cow.focus();for(let i=0;i<30;i++)await page.keyboard.press('ArrowDown');
 const animal=await cow.boundingBox(),field=await page.locator('#scene').boundingBox();expect(animal.y+animal.height).toBeLessThanOrEqual(field.y+field.height);expect(animal.x+animal.width).toBeLessThanOrEqual(field.x+field.width);
 await page.getByRole('button',{name:'Back to bots'}).click();await expect(page.getByRole('button',{name:'Ranch bell actions'})).toBeEnabled();
}));

test('standalone widget loads shared animal modules across the companion origin',async({page})=>ranch(page,async({origin,key})=>{
 await page.route('http://127.0.0.1:43822/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:origin+url.pathname+url.search});await route.fulfill({response});});
 await page.addInitScript(key=>localStorage.setItem('omp-bot.key',key),key);await page.goto('http://127.0.0.1:4173/');
 await expect(page.getByRole('button',{name:'＋ Animal',exact:true})).toBeEnabled();await page.getByRole('button',{name:'＋ Animal',exact:true}).click();await page.getByRole('button',{name:'Add to pasture'}).click();await expect(page.locator('.ranch-animal-layer .pasture-cow')).toHaveCount(1);
}));

test('home changes expose animal reload even with the Animal Desk closed',async({page})=>ranch(page,async({manager})=>{
 await page.getByRole('button',{name:'＋ Animal',exact:true}).click();await page.getByLabel('New animal name',{exact:true}).fill('Original cow');await page.getByRole('button',{name:'Add to pasture'}).click();await expect(page.locator('.ranch-animal-status .creature-save-status')).toHaveText('Animals saved locally');await page.getByRole('button',{name:'Back to bots'}).click();
 await page.clock.install();await page.reload();await expect(page.getByRole('button',{name:'＋ Animal',exact:true})).toBeEnabled();
 const originalHome=manager.library.root;manager.setHome(fs.mkdtempSync(path.join(os.tmpdir(),'other-ranch-home-')));
 await page.clock.fastForward(16000);await expect(page.getByRole('button',{name:'Reload animals',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'＋ Animal',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Reload animals',exact:true}).click();await expect(page.getByRole('button',{name:'＋ Animal',exact:true})).toBeEnabled();await expect(page.locator('.ranch-animal-layer .pasture-cow')).toHaveCount(0);
 expect(JSON.parse(fs.readFileSync(path.join(originalHome,'ranch','creatures.json'),'utf8')).creatures[0].name).toBe('Original cow');
}));
