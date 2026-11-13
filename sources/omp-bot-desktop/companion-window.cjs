'use strict';
const {ranchOptions}=require('./ranch-window.cjs');
const {ranchPlacement}=require('./window-policy.cjs');
const pages=new Set(['/board/','/setup/','/pipeyard/']);
const assets=new Set(['/setup/bot-palette.mjs','/setup/pipeyard-ranch.mjs','/setup/pipeyard-ranch.css','/setup/yard-creatures.mjs','/setup/yard-creature-behavior.mjs','/setup/pipeyard-feed.mjs','/setup/pipeyard-demo.mjs','/setup/pipeyard.js','/setup/pipeyard.css','/setup/board.js','/setup/board.css','/setup/app.js','/setup/style.css','/setup/settings.css','/ui/sprites.js']);
const routes=new Set(['pipeyard/creatures','pipeyard/snapshot','pipeyard/catalog','pipeyard/config','pipeyard/action','state','checks','key','control-key','control-key/revoke','profile/check-work','profile/ring-all','profiles/wake','profile/delete','profile/clean','library/import','role','pickup','task/start','profile','settings','action','task/queue','task/stop','task','task/archive','task/pipeline','task/retry','task/review','membership']);
function allowedRequest(value,origin){try{const u=new URL(value);return u.origin===origin&&!u.username&&!u.password&&!u.search&&(pages.has(u.pathname)||assets.has(u.pathname)||u.pathname.startsWith('/admin/')&&routes.has(u.pathname.slice(7)));}catch{return false;}}
function allowedNavigation(value,origin){try{const u=new URL(value);return allowedRequest(value,origin)&&pages.has(u.pathname);}catch{return false;}}
function createCompanionWindows({BrowserWindow,Menu,session,screen,appDir,hidden=false}){
 const windows=new Map();
 const controller={async open(page,url,origin){
  const fragment=new URLSearchParams(new URL(url).hash.slice(1));
  const key=page+':'+(fragment.get('run')||fragment.get('task')|| (fragment.get('new')==='1'?'new':''));
  let win=windows.get(key);
  if(win&&!win.isDestroyed()&&win.webContents.getURL().split('#')[0]===url.split('#')[0]){
   if(page==='pipeyard'&&fragment.has('run')){const current=new URLSearchParams(new URL(win.webContents.getURL()).hash.slice(1));if(current.get('run')!==fragment.get('run')||current.get('demo')!==fragment.get('demo'))await win.loadURL(url);}
   if(!hidden){if(win.isMinimized())win.restore();win.show();win.focus();}return;
  }
  const options=ranchOptions(appDir,ranchPlacement({width:1100,height:820},screen.getPrimaryDisplay().workArea));
  options.title=page==='settings'?'botRanch · Settings':page==='pipeyard'?'botRanch · Pipeyard':'botRanch · Full Board';
  options.webPreferences.partition='bot-ranch-companion-'+page;
  const ses=session.fromPartition(options.webPreferences.partition);
  ses.setPermissionRequestHandler((_c,_p,cb)=>cb(false));ses.setPermissionCheckHandler(()=>false);
  ses.on('will-download',event=>event.preventDefault());
  ses.webRequest.onBeforeRequest((details,cb)=>cb({cancel:!allowedRequest(details.url,origin)}));
  win=new BrowserWindow(options);windows.set(key,win);
  win.setMenu(Menu.buildFromTemplate([{label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'},{role:'close'}]}]));
  win.webContents.setWindowOpenHandler(details=>{
   try{const target=new URL(details.url),hash=new URLSearchParams(target.hash.slice(1)),keys=[...hash.keys()];
    if(page==='pipeyard'&&target.origin===origin&&target.pathname==='/pipeyard/'&&!target.search&&!target.username&&!target.password&&hash.get('admin')===fragment.get('admin')&&/^[a-zA-Z0-9_-]{1,160}$/.test(hash.get('run')||'')&&(keys.length===2&&keys.every(k=>['admin','run'].includes(k))||keys.length===3&&hash.get('demo')==='1'&&keys.every(k=>['admin','run','demo'].includes(k)))){setImmediate(()=>void controller.open('pipeyard',target.href,origin).catch(()=>{}));}
   }catch{}return {action:'deny'};
  });
  for(const name of ['will-navigate','will-frame-navigate','will-redirect'])win.webContents.on(name,(event,url)=>{if(!allowedNavigation(url,origin))event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.on('closed',()=>{if(windows.get(key)===win)windows.delete(key);});
  try{await win.loadURL(url);if(!hidden&&!win.isDestroyed()){win.show();win.focus();}}
  catch{if(!win.isDestroyed())win.destroy();throw Error('Could not open the companion window.');}
 }};
 return controller;
}
module.exports={allowedRequest,allowedNavigation,createCompanionWindows};
