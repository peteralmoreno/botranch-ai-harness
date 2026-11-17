'use strict';
const {contextBridge, ipcRenderer} = require('electron');

// Expose only the small capability set needed by the current local page.
const page = location.pathname.split('/').pop();
// Send only fixed event codes: exception messages and page data can contain secrets.
if(page==='index.html'){
  window.addEventListener('error',()=>ipcRenderer.send('bot-ranch:startup-status','renderer-error'));
  window.addEventListener('unhandledrejection',()=>ipcRenderer.send('bot-ranch:startup-status','renderer-rejection'));
}
const capabilities = {};
if(page==='index.html')Object.assign(capabilities,{
  pipeyard:(kind,body)=>ipcRenderer.invoke('bot-ranch:pipeyard',kind,body),
  state:()=>ipcRenderer.invoke('bot-ranch:state'),
  action:(name,body)=>ipcRenderer.invoke('bot-ranch:action',name,body),
  openPage:(target,taskId)=>ipcRenderer.invoke('bot-ranch:open-page',target,taskId),
  openUtility:kind=>ipcRenderer.invoke('bot-ranch:open-utility',kind),
  window:(action='info',value)=>ipcRenderer.invoke('bot-ranch:window',action,value),
});
if(page==='recovery.html')Object.assign(capabilities,{
  health:()=>ipcRenderer.invoke('bot-ranch:utility-health'),
  recover:action=>ipcRenderer.invoke('bot-ranch:utility-recover',action),
  diagnostics:()=>ipcRenderer.invoke('bot-ranch:utility-diagnostics'),
  copy:text=>ipcRenderer.invoke('bot-ranch:utility-copy',text),
});
if(page==='ai-sync.html')capabilities.aiSync=(action,body)=>ipcRenderer.invoke('bot-ranch:utility-ai-sync',action,body);
contextBridge.exposeInMainWorld('botRanch', Object.freeze(capabilities));
