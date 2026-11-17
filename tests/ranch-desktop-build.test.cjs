const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {stageRanch}=require('../tools/build.cjs');

test('desktop staging produces an offline bundle and installer copies only listed release files',async()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ranch-desktop-build-'));
 try {
  const output=path.join(temporary,'release');
  stageRanch(path.join(__dirname,'../sources'),output,{desktop:true,runtime:true});
  const release=JSON.parse(fs.readFileSync(path.join(output,'release.json'),'utf8'));
  assert.equal(release.desktop?.runtime,true);
  assert.equal(Object.keys(release.hashes||{}).length,release.files.length);
  assert.equal(release.hashes['desktop/resources/app/renderer.js'],require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(output,'desktop/resources/app/renderer.js'))).digest('hex'));
  for(const name of ['setup/pipeyard-demo.mjs','pipeyard.mjs','pipeyard-adapter.mjs','pipeyard-api.mjs','pipeyard-catalog.mjs','setup/pipeyard.html','setup/pipeyard.js','setup/pipeyard.css','guides/bot-ranch-pipeyard.md'])assert.ok(release.files.includes(name),'Pipeyard release input: '+name);
  for(const name of ['main.cjs','preload.cjs','window-policy.cjs','renderer.js','recovery.js','ai-sync.js','recovery.html','ai-sync.html','index.html','dock.css','icon.png','icon.ico','THIRD-PARTY-NOTICES.txt'])assert.ok(release.files.includes('desktop/resources/app/'+name),name);
  const bundle=fs.readFileSync(path.join(output,'desktop/resources/app/renderer.js'),'utf8');
  assert.ok(bundle.length>10000);assert.ok(!fs.existsSync(path.join(output,'desktop/resources/app/renderer.js.map')));
  fs.writeFileSync(path.join(output,'desktop/resources/app/private-key.txt'),'PRIVATE');
  const {installRelease}=await import('../sources/omp-bot-companion/install.mjs');
  const installed=path.join(temporary,'installed');installRelease(output,installed);
  assert.ok(fs.existsSync(path.join(installed,'versions',release.version,'desktop/resources/app/main.cjs')));
  assert.equal(fs.existsSync(path.join(installed,'versions',release.version,'desktop/resources/app/private-key.txt')),false);
  assert.match(fs.readFileSync(path.join(installed,'launcher.mjs'),'utf8'),/open-desktop\.mjs/);
  assert.ok(fs.existsSync(path.join(installed,'botRanch-cli.cmd')));assert.match(fs.readFileSync(path.join(installed,'launcher-cli.mjs'),'utf8'),/ranch-cli\.mjs/);
  assert.ok(release.files.includes('agent-api.mjs'));assert.ok(release.files.includes('agent-catalog.json'));assert.ok(release.files.includes('ranch-cli.mjs'));assert.ok(release.files.includes('pickup-policy.mjs'));
 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});
test('desktop staging rejects a dirty output directory before copying anything',()=>{
 const {stageDesktop}=require('../tools/build-desktop.cjs');const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ranch-dirty-'));
 try{fs.writeFileSync(path.join(temporary,'unexpected.txt'),'preserve');assert.throws(()=>stageDesktop(path.join(__dirname,'../sources'),temporary,{runtime:false}),/empty|fresh/i);assert.equal(fs.readFileSync(path.join(temporary,'unexpected.txt'),'utf8'),'preserve');}finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
test('desktop staging rejects source package version drift instead of silently rewriting it',()=>{
 const {stageDesktop}=require('../tools/build-desktop.cjs');const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ranch-version-'));
 try{const source=path.join(temporary,'source');fs.mkdirSync(path.join(source,'omp-bot-desktop'),{recursive:true});fs.mkdirSync(path.join(source,'omp-bot'));fs.writeFileSync(path.join(source,'omp-bot-desktop/package.json'),JSON.stringify({version:'99.0.0'}));fs.writeFileSync(path.join(source,'omp-bot/manifest.json'),JSON.stringify({version:'1.1.5'}));assert.throws(()=>stageDesktop(source,path.join(temporary,'out'),{runtime:false}),/Desktop versions must match/);}finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
test('desktop launch selects bundled executable with browser fallback for source/older releases',async()=>{
 const {launchCommand}=await import('../sources/omp-bot-companion/open-desktop.mjs');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ranch-desktop-launch-'));
 try {
  const fallback=launchCommand(temporary,'test-node');assert.equal(fallback.command,'test-node');assert.equal(fallback.detached,false);assert.deepEqual(fallback.args,[path.join(temporary,'open-setup.mjs')]);
  fs.mkdirSync(path.join(temporary,'desktop'));fs.writeFileSync(path.join(temporary,'desktop/botRanch.exe'),'fixture');
  if(process.platform==='win32'){const desktop=launchCommand(temporary);assert.equal(desktop.command,path.join(temporary,'desktop/botRanch.exe'));assert.equal(desktop.detached,true);assert.equal(desktop.options.windowsHide,true);assert.equal(desktop.options.stdio,'ignore');}
 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});
