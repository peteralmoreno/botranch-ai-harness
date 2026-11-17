const {test}=require('node:test'),assert=require('node:assert/strict');
test('native pipeline links resolve saved URLs at click time and reject arbitrary, unsafe or credential-bearing targets',async()=>{
 const {createCompanionClient}=require('../sources/omp-bot-desktop/main.cjs'),opened=[],calls=[];
 let run={id:'run-1',ticketUrl:'https://tickets.example.test/ABC-1',pipelineUrl:'https://runs.example.test/one'};
 const client=createCompanionClient({origin:'http://127.0.0.1:43822',adminKey:'admin-secret',pairingKey:'pair-secret'},async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({runs:[run]})};},'1.1.7',url=>opened.push(url));
 assert.equal(opened.length,0);
 assert.equal((await client.pipeyard('open-link',{id:'run-1',link:'ticket'})).ok,true);assert.deepEqual(opened,[run.ticketUrl]);
 assert.equal((await client.pipeyard('open-link',{id:'run-1',link:'pipeline',url:'https://evil.test/'})).ok,false);
 assert.equal((await client.openSavedLink({url:'https://evil.test/'})).ok,false);
 assert.equal((await client.openSavedLink({url:run.pipelineUrl})).ok,true);
 for(const url of ['javascript:alert(1)','file:///C:/x','https://user:pass@example.test','https://example.test/admin-secret','http://127.0.0.1:43822/setup/']){run.ticketUrl=url;assert.equal((await client.pipeyard('open-link',{id:'run-1',link:'ticket'})).ok,false,url);}
 assert.equal(opened.length,2);assert(calls.every(c=>c.options.method==='GET'&&c.url.endsWith('/admin/pipeyard/snapshot')));
});
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

test('desktop interval controls forward validated values and preserve only the recoverable busy code',async()=>{
 const host=require('../sources/omp-bot-desktop/main.cjs'),calls=[];let busy=false;
 const client=host.createCompanionClient({origin:'http://127.0.0.1:12345',adminKey:'admin-secret',pairingKey:'pair-secret'},async(url,options)=>{calls.push({url,options});return busy?{ok:false,status:409,json:async()=>({error:'Busy admin-secret',code:'PIPEYARD_BUSY',retryable:true,private:'secret'})}:{ok:true,json:async()=>({intervalMinutes:.5})};});
 for(const value of [.5,1,2,3,5,10,15,30])assert.equal((await client.pipeyard('action',{action:'set-check-interval',id:'run-1',intervalMinutes:value})).ok,true);
 for(const value of [0,'1',1.5,NaN])assert.equal((await client.pipeyard('action',{action:'set-check-interval',id:'run-1',intervalMinutes:value})).ok,false);
 assert.equal((await client.pipeyard('action',{action:'set-check-interval',id:'run-1',intervalMinutes:1,minutes:120})).ok,false);assert.equal(calls.length,8);
 busy=true;const result=await client.pipeyard('action',{action:'set-check-interval',id:'run-1',intervalMinutes:1});assert.deepEqual(result,{ok:false,error:'Busy [redacted]',code:'PIPEYARD_BUSY',retryable:true});
});
test('desktop windows permit the shared polling module and human-only preview without broadening origins',()=>{
 const {allowedRequest}=require('../sources/omp-bot-desktop/companion-window.cjs'),ranch=require('../sources/omp-bot-desktop/ranch-window.cjs'),origin='http://127.0.0.1:43822';
 for(const url of ['/setup/pipeyard-intervals.mjs','/admin/pipeyard/preview','/admin/pipeyard/storage'])assert(allowedRequest(origin+url,origin));assert(ranch.allowedRequest(origin+'/setup/pipeyard-intervals.mjs',origin));assert.equal(allowedRequest('https://example.test/admin/pipeyard/preview',origin),false);
});
