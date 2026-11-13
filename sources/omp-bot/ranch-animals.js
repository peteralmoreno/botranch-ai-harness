(()=>{'use strict';
 const add=document.getElementById('ranch-add-animal'),scene=document.getElementById('scene');
 let connection={connected:false},controller,loading=false,retryAt=0;
 const layer=document.createElement('div');layer.className='ranch-animal-layer';scene.append(layer);
 const desk=document.createElement('aside');desk.id='ranch-animal-desk';desk.hidden=true;desk.setAttribute('aria-label','Animal Desk');
 const heading=document.createElement('h2');heading.textContent='Animal Desk';
 const back=document.createElement('button');back.type='button';back.textContent='Back to bots';
 const toolbar=document.createElement('div');toolbar.className='ranch-animal-status';desk.append(heading,back);document.querySelector('.ranch-bar').append(toolbar);document.querySelector('.ranch-layout').append(desk);
 new MutationObserver(()=>{const status=toolbar.querySelector('.creature-save-status')?.textContent||'';toolbar.classList.toggle('needs-attention',!!toolbar.querySelector('button')||!!status&&!['Loading animals…','Saving animals…','Animals saved locally'].includes(status));}).observe(toolbar,{subtree:true,childList:true,characterData:true});
 const close=()=>{desk.hidden=true;document.body.classList.remove('ranch-viewing-animal');};
 const show=()=>{desk.hidden=false;document.body.classList.add('ranch-viewing-animal');};
 async function request(method,body){
  if(!connection.connected)throw Error('Connect the companion to edit animals.');
  const {base,key}=connection;
  const response=await fetch(base+'/control/ranch/creatures',{method,headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(4000)});
  const result=await response.json();if(connection.key!==key||connection.base!==base)throw Error('Connection changed. Retry with the current companion.');
  if(!response.ok){const error=Error(result.error||'Animals unavailable.');error.status=response.status;throw error;}return result;
 }
 async function connect(next){
  connection=next;add.title=next.connected?'Add a cow, chicken, or sheep':'Connect the companion to add animals';
  if(controller){controller.setEnabled(next.connected);return;}
  add.disabled=true;if(!next.connected||loading||Date.now()<retryAt)return;loading=true;
  try{
   const [{mountCreatures},{animalArt}]=await Promise.all([import(next.base+'/setup/yard-creatures.mjs'),import(next.base+'/setup/yard-animal-art.mjs')]);
   desk.querySelectorAll('.creature-panel,.creature-save-status').forEach(node=>node.remove());toolbar.replaceChildren();
   controller=await mountCreatures({layer,desk,toolbar,addControl:add,closeControl:back,deskTitle:'Animal Desk',art:animalArt,hayMarkup:animalArt.hay,bounds:{left:4,top:4,right:4,bottom:4},loadState:()=>request('GET'),saveState:body=>request('POST',body),onSelect:show,onClose:close,isEnabled:()=>connection.connected,moving:()=>document.body.dataset.motion!=='still'});
   if(!controller)throw Error(toolbar.textContent||'Animals unavailable.');controller.setEnabled(connection.connected);
  }catch(error){add.title=error.message;retryAt=Date.now()+10000;}finally{loading=false;}
 }
 document.addEventListener('click',event=>{if(event.target.closest('.bot,#all-updates,#feed-return'))controller?.close();});
 window.RanchAnimals={connect};
})();
