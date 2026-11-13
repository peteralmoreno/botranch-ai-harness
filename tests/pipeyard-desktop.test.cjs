const {test}=require('node:test'),assert=require('node:assert/strict');
test('desktop Pipeyard opens only local pages and its dedicated API/assets',()=>{
 const policy=require('../sources/omp-bot-desktop/window-policy.cjs'),{allowedRequest,allowedNavigation}=require('../sources/omp-bot-desktop/companion-window.cjs');
 const origin='http://127.0.0.1:43822',url=policy.pageUrl('pipeyard','run-1',{origin,adminKey:'private',pairingKey:'pair'});
 assert.equal(url,origin+'/pipeyard/#admin=private&run=run-1');assert.equal(allowedNavigation(url,origin),true);
 assert.equal(allowedRequest(origin+'/setup/pipeyard.js',origin),true);assert.equal(allowedRequest(origin+'/admin/pipeyard/action',origin),true);
 assert.equal(allowedRequest('https://evil.test/admin/pipeyard/action',origin),false);assert.equal(allowedRequest(origin+'/admin/pipeyard/unknown',origin),false);
});
test('native popouts open only authenticated same-origin run details',async()=>{
 const {createCompanionWindows}=require('../sources/omp-bot-desktop/companion-window.cjs'),windows=[],origin='http://127.0.0.1:43822';
 class Window{constructor(options){this.options=options;this.webContents={getURL:()=>this.url,setWindowOpenHandler:fn=>this.popup=fn,on:()=>{}};windows.push(this);}setMenu(){}on(){}isDestroyed(){return false;}async loadURL(url){this.url=url;}show(){}focus(){}}
 const controller=createCompanionWindows({BrowserWindow:Window,Menu:{buildFromTemplate:x=>x},session:{fromPartition:()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){},on(){},webRequest:{onBeforeRequest(){}}})},screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1440,height:900}})},appDir:'D:/test/app',hidden:true});
 await controller.open('pipeyard',origin+'/pipeyard/#admin=test-key',origin);const parent=windows[0];
 parent.popup({url:'https://example.test/pipeyard/#admin=test-key&run=one'});parent.popup({url:origin+'/pipeyard/#admin=wrong&run=one'});await new Promise(r=>setImmediate(r));assert.equal(windows.length,1);
 parent.popup({url:origin+'/pipeyard/#admin=test-key&run=one'});await new Promise(r=>setImmediate(r));assert.equal(windows.length,2);assert.match(windows[1].url,/run=one/);assert.equal(windows[1].options.webPreferences.nodeIntegration,false);
 parent.popup({url:origin+'/pipeyard/#admin=test-key&run=demo-ready&demo=1'});await new Promise(r=>setImmediate(r));assert.equal(windows.length,3);assert.match(windows[2].url,/demo=1/);
 windows[2].url=origin+'/pipeyard/';parent.popup({url:origin+'/pipeyard/#admin=test-key&run=demo-ready&demo=1'});await new Promise(r=>setImmediate(r));assert.equal(windows.length,3);assert.match(windows[2].url,/demo=1/);
 parent.popup({url:origin+'/pipeyard/#admin=test-key&run=demo-ready&demo=invalid'});await new Promise(r=>setImmediate(r));assert.equal(windows.length,3);
});
