// Release gate: actual extracted ZIP -> installer -> bundled executable. Never a dev server.
// Privacy: all windows hidden; only fixture DOM and fixed diagnostic codes are retained.
const {test,expect,_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const repo=path.resolve(__dirname,'..'),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let root,candidate,candidateZip,installer,artifact;
const applications=new Set(),companions=new Set();
const psQuote=value=>"'"+String(value).replaceAll("'","''")+"'";
function powershell(command){const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:60000});if(result.error||result.status!==0)throw Error('Isolated archive operation failed.');}
function extract(zip,destination){powershell(`Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(destination)}`);}
function readDiagnostics(data){try{return JSON.parse(fs.readFileSync(path.join(data,'desktop-startup.json'),'utf8'));}catch{return [];}}
function safeDiagnostics(data){return readDiagnostics(data).map(({event,elapsedMs})=>({event,elapsedMs}));}
async function closeApp(app){if(app){await app.close();applications.delete(app);}}
async function closeCompanion(fixture){if(fixture){fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));companions.delete(fixture);}}
function reseal(directory,version){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'release.json')));manifest.version=version;
 for(const name of ['ui/manifest.json','desktop/resources/app/package.json']){const file=path.join(directory,name),data=JSON.parse(fs.readFileSync(file));data.version=version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
 manifest.hashes=Object.fromEntries(manifest.files.map(file=>[file,hash(path.join(directory,file))]));
 fs.writeFileSync(path.join(directory,'release.json'),JSON.stringify(manifest,null,2)+'\n');
}
async function fixtureCompanion(release,name,{seed=false,offline=false,home}={}){
 const directory=path.join(root,'state-'+name);fs.mkdirSync(directory,{recursive:true});
 const key='a'.repeat(64),adminKey='b'.repeat(64);
 fs.writeFileSync(path.join(directory,'pairing-key.txt'),key);fs.writeFileSync(path.join(directory,'admin-key.txt'),adminKey);
 if(home)fs.writeFileSync(path.join(directory,'ranch.json'),JSON.stringify({schemaVersion:3,homeFolder:home,profiles:[],tasks:[]}));
 // Import from this installed release: its HTTP server serves its own packaged assets.
 const {RanchManager}=await import(pathToFileURL(path.join(release,'manager.mjs')).href);
 const {createBridge}=await import(pathToFileURL(path.join(release,'server.mjs')).href);
 const manager=new RanchManager({dir:directory,native:{}});
 let runId;
 if(seed){
  const {Pipeyard}=await import(pathToFileURL(path.join(release,'pipeyard.mjs')).href);
  const yard=new Pipeyard({root:path.join(manager.library.root,'pipeyard'),fetchImpl:async url=>Response.json(url.endsWith('/progress')?{details:{percent:0,selected:'Fixture visible value',private:'PRIVATE_PROGRESS_FIXTURE'}}:{id:'fixture-run',status:'running',message:'PRIVATE_STATUS_FIXTURE'})});
  yard.configure({version:1,platforms:[{id:'fixture',name:'Fixture platform',baseUrl:'https://example.invalid',operations:{status:{method:'GET',path:'/runs/{runId}'},progress:{method:'GET',path:'/runs/{runId}/progress'}},responses:{status:{desk:{mode:'hidden'}},progress:{mappings:{progress:'details.percent'},desk:{mode:'custom',fields:[{label:'Selected field',path:'details.selected'}]}}}}],templates:[{id:'fixture',name:'Packaged fixture',platformId:'fixture',color:'#61b7ba'}]});
  const run=await yard.execute('register',{templateId:'fixture',externalId:'fixture-run',ticketUrl:'https://tickets.example.test/ABC-1',pipelineUrl:'https://runs.example.test/one'});runId=run.id;
  await yard.execute('refresh',{id:runId});await yard.execute('pause-tracking',{id:runId});
 }
 const requests=[];manager.shuttingDown=offline;
 const server=createBridge({key,adminKey,manager});
 server.on('request',req=>{if(req.url==='/admin/shutdown')requests.push('shutdown');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const fixture={server,manager,directory,port:server.address().port,requests,runId};companions.add(fixture);return fixture;
}
async function launch(release,fixture,name){
 const data=path.join(root,'desktop-'+name),env={...process.env,BOT_RANCH_DESKTOP_DATA:data,OMP_BOT_KEY_FILE:path.join(fixture.directory,'pairing-key.txt'),OMP_BOT_PORT:String(fixture.port)};
 delete env.ELECTRON_RUN_AS_NODE;
 // Do not inherit inspector hooks, node preload scripts, or any live companion defaults.
 delete env.NODE_OPTIONS;
 const app=await electron.launch({executablePath:path.join(release,'desktop/botRanch.exe'),args:['--test-hidden'],env,timeout:30000});applications.add(app);
 const failures=[];
 const observe=page=>{page.on('pageerror',()=>failures.push('renderer-exception'));page.on('crash',()=>failures.push('renderer-crash'));page.on('requestfailed',request=>{if(['script','stylesheet'].includes(request.resourceType()))failures.push('essential-request-failed');});};
 app.on('window',observe);for(const page of app.windows())observe(page);
 const page=await app.firstWindow({timeout:30000});
 return {app,page,data,failures};
}
async function mounted(session,{diagnostics=true}={}){
 const {page,app,data,failures}=session;
 await expect(page.getByRole('main',{name:'botRanch floating dock'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Open Connection & recovery',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Pipeyard',exact:true})).toBeEnabled();
 const prefs=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html'));return {hidden:!w.isVisible(),...w.webContents.getLastWebPreferences()};});
 expect(prefs.sandbox).toBe(true);expect(prefs.contextIsolation).toBe(true);expect(prefs.nodeIntegration).toBe(false);expect(prefs.hidden).toBe(true);
 expect(await page.evaluate(()=>({node:typeof window.require,process:typeof window.process}))).toEqual({node:'undefined',process:'undefined'});
 if(diagnostics)await expect.poll(()=>readDiagnostics(data).some(e=>e.event==='renderer-ready')).toBe(true);
 expect(failures).toEqual([]);
 if(diagnostics)expect(readDiagnostics(data).filter(e=>!['startup','renderer-ready'].includes(e.event))).toEqual([]);
}
async function connected(session){await expect.poll(()=>session.page.evaluate(async()=>{const state=await window.botRanch.state();return state.connectionVersion===1&&!state.offline;})).toBe(true);}
async function record(testInfo,session,extra={}){
 const evidence={artifact,...extra,...(session?{events:safeDiagnostics(session.data),failures:session.failures}:{}),capture:'disabled; isolated hidden windows and DOM assertions only'};
 const file=testInfo.outputPath('packaged-release-evidence.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
 await testInfo.attach('packaged-release-evidence',{path:file,contentType:'application/json'});
}
test.beforeAll(async()=>{
 if(process.platform!=='win32')throw Error('NON-RELEASE: Windows artifact requires Windows.');
 root=fs.mkdtempSync(path.join(os.tmpdir(),'botranch-packaged-gate-'));
 installer=await import(pathToFileURL(path.join(repo,'sources/omp-bot-companion/install.mjs')).href);
 candidateZip=process.env.BOT_RANCH_TEST_RELEASE_ZIP;
 if(!candidateZip){
  const stage=path.join(root,'stage');require('../tools/build.cjs').stageRanch(path.join(repo,'sources'),stage,{desktop:true,runtime:true});
  candidateZip=path.join(root,'candidate.zip');
  const helper=require('../tools/build-native.cjs').buildZip(path.join(root,'ZipRelease.exe'));
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(repo,'tools/zip-release.ps1'),'-Source',stage,'-Destination',candidateZip,'-Helper',helper],{encoding:'utf8',windowsHide:true,timeout:60000});
  if(result.error||result.status!==0)throw Error('Candidate ZIP creation failed.');
 }
 candidateZip=path.resolve(candidateZip);const extracted=path.join(root,'extracted');extract(candidateZip,extracted);
 const manifest=installer.validateRelease(extracted),expected=JSON.parse(fs.readFileSync(path.join(repo,'sources/omp-bot/manifest.json'))).version;
 expect(manifest.version).toBe(expected);expect(manifest.desktop?.runtime).toBe(true);
 const destination=path.join(root,'installed');installer.installRelease(extracted,destination);candidate=path.join(destination,'versions',manifest.version);
 artifact={sha256:hash(candidateZip),version:manifest.version,sourceCommit:spawnSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',windowsHide:true}).stdout.trim(),sourceWorkingTreeMayContainChanges:true};
});
test.afterEach(async()=>{for(const app of [...applications])await closeApp(app);for(const fixture of [...companions])await closeCompanion(fixture);});
test.afterAll(()=>{if(root){assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(root).startsWith('botranch-packaged-gate-'));fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});}});

test('installed ZIP mounts real UI, packaged Pipeline Desk/Ranch assets and response controls, then reopens',async({},testInfo)=>{
 const fixture=await fixtureCompanion(candidate,'online',{seed:true});let session=await launch(candidate,fixture,'online');
 await mounted(session);await connected(session);
 await session.app.evaluate(({shell})=>{globalThis.openedPipelineLinks=[];shell.openExternal=async url=>{globalThis.openedPipelineLinks.push(url);};});
 await session.page.getByRole('button',{name:'Pipeyard',exact:true}).click();
 await session.page.locator('.pipe-list-row').filter({hasText:'Packaged fixture'}).click();
 await expect(session.page.getByText('Fixture visible value',{exact:true})).toBeVisible();
 await expect(session.page.getByText('Response hidden by configuration.',{exact:true})).toBeVisible();
 expect(await session.page.locator('body').textContent()).not.toMatch(/PRIVATE_STATUS_FIXTURE|PRIVATE_PROGRESS_FIXTURE/);
 await session.page.getByRole('button',{name:'Ticket / Jira ↗',exact:true}).click();
 expect(await session.app.evaluate(()=>globalThis.openedPipelineLinks)).toEqual(['https://tickets.example.test/ABC-1']);
 await session.page.getByLabel('Check frequency',{exact:true}).selectOption('2');
 await session.page.getByRole('button',{name:'Save frequency',exact:true}).click();
 await expect.poll(()=>session.page.evaluate(async id=>(await window.botRanch.pipeyard('snapshot')).result.runs.find(r=>r.id===id).intervalMinutes,fixture.runId)).toBe(2);
 await session.page.getByRole('button',{name:'Full Pipeyard',exact:true}).click();
 await expect.poll(()=>session.app.windows().some(p=>p.url().includes('/pipeyard/'))).toBe(true);
 const desk=session.app.windows().find(p=>p.url().includes('/pipeyard/'));
 await desk.locator('.pipe-tile[data-run-id="'+fixture.runId+'"]').click();
 await desk.getByRole('link',{name:'Pipeline page ↗',exact:true}).click();
 await expect.poll(()=>session.app.evaluate(()=>globalThis.openedPipelineLinks.length)).toBe(2);
 await desk.evaluate(()=>window.open('https://unregistered.example.test/'));
 await expect(desk.getByLabel('Check frequency',{exact:true})).toHaveValue('2');
 expect(await desk.locator('body').textContent()).not.toMatch(/PRIVATE_STATUS_FIXTURE|PRIVATE_PROGRESS_FIXTURE/);
 await session.page.getByRole('button',{name:'Visual Ranch',exact:true}).click();
 await expect.poll(()=>session.app.windows().some(p=>p.url().includes('/ui/'))).toBe(true);
 const ranch=session.app.windows().find(p=>p.url().includes('/ui/'));
 await expect(ranch.locator('#scene')).toBeVisible();await ranch.getByRole('button',{name:'Pipeyard',exact:true}).click();
 const visual=ranch.frameLocator('#pipeyard-frame');await visual.locator('.pipe-tile[data-run-id="'+fixture.runId+'"]').click();
 await expect(visual.getByLabel('Check frequency',{exact:true})).toHaveValue('2');
 await visual.getByRole('link',{name:'Ticket / Jira ↗',exact:true}).click();
 await expect.poll(()=>session.app.evaluate(()=>globalThis.openedPipelineLinks)).toEqual(['https://tickets.example.test/ABC-1','https://runs.example.test/one','https://tickets.example.test/ABC-1']);
 await visual.getByRole('button',{name:'Demo mode',exact:true}).click();await expect(visual.locator('.pipe-tile')).toHaveCount(6);
 await visual.getByRole('button',{name:'History',exact:true}).click();await expect(visual.locator('.pasture')).toBeHidden();await expect(visual.locator('.history-row')).toHaveCount(20);await expect(visual.locator('#history-count')).toContainText('20 of 40');
 await visual.getByRole('button',{name:'Show 20 more',exact:true}).click();await expect(visual.locator('.history-row')).toHaveCount(40);
 await visual.getByLabel('Most recent',{exact:true}).selectOption('10');await expect(visual.locator('.history-row')).toHaveCount(10);
 await session.page.getByRole('button',{name:'Open settings',exact:true}).click();
 await expect.poll(()=>session.app.windows().some(p=>p.url().includes('/setup/'))).toBe(true);
 const settings=session.app.windows().find(p=>p.url().includes('/setup/')),storage=path.join(root,'relocated-pipeyard');
 await expect(settings.getByLabel('Pipeline and History folder',{exact:true})).not.toHaveValue('');
 await settings.getByLabel('Pipeline and History folder',{exact:true}).fill(storage);await settings.getByRole('button',{name:'Save Pipeyard folder',exact:true}).click();await expect(settings.locator('#storage-current')).toHaveText(storage);
 expect(JSON.parse(fs.readFileSync(path.join(storage,'runs.json'),'utf8')).runs.some(r=>r.id===fixture.runId)).toBe(true);
 expect(session.failures).toEqual([]);await record(testInfo,session,{case:'installed UI and served assets'});
 await closeApp(session.app);expect(fixture.requests).toEqual([]);
 session=await launch(candidate,fixture,'online');await mounted(session);await connected(session);
 expect(await session.page.evaluate(async id=>(await window.botRanch.pipeyard('snapshot')).result.runs.find(r=>r.id===id).intervalMinutes,fixture.runId)).toBe(2);
 expect(fixture.server.listening).toBe(true);expect(fixture.requests).toEqual([]);
});

test('unavailable companion leaves a mounted offline dock and usable recovery controls',async({},testInfo)=>{
 // A listening fixture returning503 exercises cold startup failure without allowing
 // the production auto-start branch to launch a detached companion.
 const fixture=await fixtureCompanion(candidate,'offline',{offline:true}),session=await launch(candidate,fixture,'offline');
 await mounted(session);await session.page.getByRole('button',{name:'Open task panel',exact:true}).click();
 await expect(session.page.getByText(/Offline · companion unavailable/)).toBeVisible();
 await session.page.getByRole('button',{name:'Open Connection & recovery',exact:true}).click();
 await expect.poll(()=>session.app.windows().some(p=>p.url().endsWith('/recovery.html'))).toBe(true);
 const recovery=session.app.windows().find(p=>p.url().endsWith('/recovery.html'));
 await expect(recovery.getByRole('heading',{name:'Connection & recovery',exact:true})).toBeVisible();
 expect(fixture.requests).toEqual([]);await record(testInfo,session,{case:'offline recovery'});
});

for(const kind of ['missing-renderer','broken-initialization'])test('smoke gate rejects '+kind,async({},testInfo)=>{
 const target=path.join(root,'negative-'+kind);installer.installRelease(candidate,target);
 const release=path.join(target,'versions',artifact.version),renderer=path.join(release,'desktop/resources/app/renderer.js');
 if(kind==='missing-renderer')fs.unlinkSync(renderer);else fs.writeFileSync(renderer,'throw new Error("deliberately broken fixture initialization");');
 const fixture=await fixtureCompanion(release,kind),session=await launch(release,fixture,kind);
 let rejected=false;try{await mounted(session);}catch{rejected=true;}
 expect(rejected).toBe(true);expect(await session.page.getByRole('main',{name:'botRanch floating dock'}).count()).toBe(0);
 await expect.poll(()=>readDiagnostics(session.data).some(e=>!['startup','renderer-ready'].includes(e.event))).toBe(true);
 expect(readDiagnostics(session.data).some(e=>e.event==='renderer-ready')).toBe(false);
 await record(testInfo,session,{case:kind,gateRejected:true});
});

test('disposable upgrade rolls back to known-good1.1.5 and keeps compatible home data',async({},testInfo)=>{
 const baselineZip=process.env.BOT_RANCH_TEST_ROLLBACK_ZIP;
 if(!baselineZip)throw Error('NON-RELEASE: set BOT_RANCH_TEST_ROLLBACK_ZIP to the preserved known-good1.1.5 full ZIP.');
 const baseline=path.join(root,'baseline');extract(path.resolve(baselineZip),baseline);expect(installer.validateRelease(baseline).version).toBe('1.1.5');
 const destination=path.join(root,'rollback-installed');installer.installRelease(baseline,destination);
 const previous=path.join(destination,'versions/1.1.5'),fixture=await fixtureCompanion(previous,'rollback-before');
 const compatibleHome=fixture.manager.library.root,marker=path.join(compatibleHome,'compatible-fixture.txt');fs.writeFileSync(marker,'Preserved compatible bot-home data');
 const homeBackup=path.join(root,'home-before-upgrade');fs.cpSync(compatibleHome,homeBackup,{recursive:true});
 let session=await launch(previous,fixture,'rollback');await mounted(session,{diagnostics:false});await connected(session);await closeApp(session.app);await closeCompanion(fixture);
 // Only test metadata is relabeled, allowing two different local1.1.5 trees to
 // participate in a rollback test without weakening same-version integrity.
 const upgrade=path.join(root,'test-only-upgrade');fs.cpSync(candidate,upgrade,{recursive:true});reseal(upgrade,'99.0.0');installer.installRelease(upgrade,destination);
 const upgraded=path.join(destination,'versions/99.0.0'),nextFixture=await fixtureCompanion(upgraded,'rollback-upgraded',{home:compatibleHome});
 session=await launch(upgraded,nextFixture,'rollback');await mounted(session);await connected(session);await closeApp(session.app);await closeCompanion(nextFixture);
 installer.rollbackRelease(destination);expect(JSON.parse(fs.readFileSync(path.join(destination,'current.json'))).version).toBe('1.1.5');
 const restoredFixture=await fixtureCompanion(previous,'rollback-restored',{home:compatibleHome});session=await launch(previous,restoredFixture,'rollback');
 await mounted(session,{diagnostics:false});await connected(session);
 expect(fs.readFileSync(marker,'utf8')).toBe(fs.readFileSync(path.join(homeBackup,'compatible-fixture.txt'),'utf8'));
 expect(restoredFixture.requests).toEqual([]);
 await record(testInfo,null,{case:'rollback',baselineSha256:hash(path.resolve(baselineZip)),restoredVersion:'1.1.5',testOnlyUpgradeVersion:'99.0.0',dataScope:'compatible fixture home; no claim that version rollback reverses migrations'});
});
