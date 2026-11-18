export async function mountYard({loadState,saveState,getScope,addPipeline}){
const $=id=>document.getElementById(id);
document.body.classList.add('pipeyard-ranch');
document.querySelector('.yard-caption').textContent='Drag pipes to reorder; click to inspect. Pick up animals or move the hay to invite nearby grazers. Arrow keys also move focused objects.';
const searchLabel=document.querySelector('.search-label');for(const node of [...searchLabel.childNodes])if(node.nodeType===Node.TEXT_NODE)node.remove();$('search').setAttribute('aria-label','Find a run');

document.querySelector('.feed-intro').textContent='A little news from each pipe. Select a rig to see its story.';

const grid=$('runs'),pasture=document.createElement('div');pasture.className='pasture';
grid.before(pasture);pasture.append(grid);
const scenery=document.createElement('div');scenery.className='pasture-scenery';scenery.setAttribute('aria-hidden','true');
scenery.innerHTML='<div class="distant-hill"></div><div class="fence fence-back"></div><div class="cows"></div><div class="fence fence-front"></div><span class="pasture-sign">North paddock</span>';
const grass=document.createElement('div');grass.className='grass-patches';
for(let i=0;i<52;i++){const tuft=document.createElement('span');tuft.className='grass-tuft';tuft.style.left=(2+(i*37)%94)+'%';tuft.style.top=(3+(i*29)%89)+'%';tuft.innerHTML='<svg viewBox="0 0 24 18" aria-hidden="true"><path d="M12 17L4 6l5 2L8 0l5 9 6-6-2 8 6-2-8 8z" fill="currentColor"/></svg>';grass.append(tuft);}
scenery.append(grass);pasture.prepend(scenery);
const animalLayer=document.createElement('div');animalLayer.className='animal-layer';pasture.append(animalLayer);
const cow='<svg viewBox="0 0 84 54" shape-rendering="crispEdges" aria-hidden="true"><ellipse cx="42" cy="48" rx="32" ry="4" fill="#294d3260"/><g class="cow-body"><path d="M14 16h42v25H14zM10 20h6v17h-6z" fill="#f0e6c7"/><path d="M16 17h13v11H16zM36 29h12v11H36zM45 16h10v9H45z" fill="#39443b"/><path d="M17 39h7v10h-7zM44 39h7v10h-7z" fill="#e6d7b7"/><path d="M17 46h8v4h-8zM44 46h8v4h-8z" fill="#3b4138"/><path d="M31 39h10v5H31z" fill="#c99585"/><path d="M9 18H5v19h4" fill="none" stroke="#53513d" stroke-width="3"/><g class="cow-head"><path d="M54 12h19v25H54z" fill="#eee3c3"/><path d="M50 14h6v6h-6zM72 14h7v6h-7z" fill="#a78967"/><path d="M56 7h4v8h-4zM69 7h4v8h-4z" fill="#e5cd98"/><path d="M56 20h4v4h-4zM68 20h4v4h-4z" fill="#293e34"/><path d="M56 29h17v10H56z" fill="#d4a08c"/><path d="M59 32h3v3h-3zM68 32h3v3h-3z" fill="#765f50"/></g></g></svg>';
for(let i=0;i<5;i++){const actor=document.createElement('button');actor.type='button';actor.className='pasture-cow cow-'+(i+1);actor.innerHTML=cow;actor.setAttribute('aria-label',['Spotted','Cream','Black and white','Chestnut','Golden'][i]+' cow. Drag or use arrow keys to move.');animalLayer.append(actor);}

function oilPipeline(){
 return '<div class="pipe-art oil-pipeline" aria-hidden="true"><div class="equipment-support"></div><div class="equipment-support second"></div><div class="equipment-shaft"></div><div class="equipment-collar"></div><div class="equipment-collar second"></div><div class="equipment-side-line"></div><div class="equipment-side-line left"></div><div class="equipment-orchestrator"><div class="equipment-dial"></div></div><div class="equipment-checkpoint"><div class="equipment-gate-lights"><b></b><b></b><b></b></div></div><div class="equipment-quick"></div></div>';
}

const chicken='<svg viewBox="0 0 46 42" shape-rendering="crispEdges" aria-hidden="true"><ellipse cx="24" cy="37" rx="17" ry="3" fill="#294d3240"/><g class="chicken-body"><path d="M10 17h23v15H10zM6 13h7v13H6zM3 9h6v11H3z" fill="#eee2bc"/><path d="M13 21h13v8H13z" fill="#d5c291"/><path d="M18 32v6M28 32v6M15 38h7M25 38h7" stroke="#b28640" stroke-width="2"/><g class="chicken-head"><path d="M28 9h11v15H28z" fill="#f6eac8"/><path d="M29 5h4v6h-4zM34 4h4v7h-4zM33 22h4v5h-4z" fill="#b64f44"/><path d="M38 16h6v4h-6z" fill="#d9ad52"/><path d="M34 12h3v3h-3z" fill="#354534"/></g></g></svg>';
for(let i=0;i<4;i++){const actor=document.createElement('button');actor.type='button';actor.className='pasture-chicken chicken-'+(i+1);actor.innerHTML=chicken;actor.setAttribute('aria-label','Chicken '+(i+1)+'. Drag or use arrow keys to move.');animalLayer.append(actor);}
for(let i=0;i<4;i++){const sheep=document.createElement('button');sheep.type='button';sheep.className='pasture-sheep sheep-'+(i+1);
sheep.setAttribute('aria-label','Woolly sheep '+(i+1)+'. Drag or use arrow keys to move.');
sheep.innerHTML='<svg viewBox="0 0 72 54" aria-hidden="true"><ellipse cx="35" cy="48" rx="29" ry="4" fill="#294d3240"/><path d="M18 33h6v14h-6zM43 33h6v14h-6z" fill="#655b4b"/><path d="M17 45h9v4h-9zM42 45h9v4h-9z" fill="#3c4339"/><g class="sheep-wool" fill="#eee7d4" stroke="#c9c3ae" stroke-width="1.5"><circle cx="20" cy="24" r="11"/><circle cx="28" cy="17" r="11"/><circle cx="41" cy="18" r="12"/><circle cx="47" cy="29" r="12"/><circle cx="33" cy="33" r="12"/><circle cx="21" cy="33" r="9"/></g><g class="sheep-head"><path d="M51 20l-7-6-4 6 11 6M60 19l9-4 2 6-11 5" fill="#696351"/><rect x="49" y="17" width="16" height="24" rx="7" fill="#575a4b"/><path d="M49 18q8-10 17 0v6H49z" fill="#f4edd9"/><circle cx="54" cy="29" r="1.7" fill="#f7f1dc"/><circle cx="61" cy="29" r="1.7" fill="#f7f1dc"/><path d="M55 36h5" stroke="#343d33" stroke-width="2"/></g></svg>';
animalLayer.append(sheep);}
// Feed portraits are equipment gauges too, not robot faces.
function decorateFeed(){for(const avatar of document.querySelectorAll('.pipeline-avatar:not(.column-avatar)')){const holder=document.createElement('div');holder.innerHTML='<svg class="pipeline-avatar column-avatar" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 0v40" stroke="currentColor" stroke-width="12"/><circle class="instrument-gauge" cx="20" cy="20" r="12" fill="#e7dfb5" stroke="#3d5942" stroke-width="3"/><path d="M20 20l6-6" stroke="#826646" stroke-width="2"/></svg>';avatar.replaceWith(holder.firstElementChild);}}

new MutationObserver(decorateFeed).observe($('pipeline-feed-list'),{childList:true});decorateFeed();

let storage;try{storage=localStorage;}catch{}
let scope='',order=[];
function syncScope(){const next=getScope();if(next===scope)return;scope=next;try{const saved=JSON.parse(storage?.getItem('botRanch.pipeyard.order.'+scope)||'[]');order=Array.isArray(saved)?[...new Set(saved.filter(id=>typeof id==='string'))].slice(0,10000):[];}catch{order=[];}}
syncScope();
let drag=null,suppressClickUntil=0;
const announcement=document.createElement('p');announcement.className='reorder-status';announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');pasture.before(announcement);
const rows=()=>[...grid.querySelectorAll(':scope > .pipeline-row')];
function arrange(){
 syncScope();const items=rows(),known=new Set(order);grid.style.setProperty('--column-count',String(Math.max(8,items.length)));grid.style.setProperty('--yard-span',Math.max(70,items.length*70/8)+'%');grid.style.minWidth=Math.max(896,items.length*112)+'px';for(const row of items)if(!known.has(row.dataset.runId)){order.push(row.dataset.runId);known.add(row.dataset.runId);}
 const sorted=items.slice().sort((a,b)=>order.indexOf(a.dataset.runId)-order.indexOf(b.dataset.runId));
 const desired=sorted;
 if([...grid.children].some((row,i)=>row!==desired[i]))for(const row of desired)grid.append(row);
 for(const row of sorted)row.classList.toggle('dragging',!!drag?.active&&row.dataset.runId===drag.id);
}
function saveOrder(){try{storage?.setItem('botRanch.pipeyard.order.'+scope,JSON.stringify(order));}catch{} }
function moveTo(id,beforeId){const next=order.filter(item=>item!==id),index=beforeId?next.indexOf(beforeId):-1;next.splice(index<0?next.length:index,0,id);order=next;arrange();}
function decorate(){
 observer.disconnect();
 try{
  for(const tile of grid.querySelectorAll(':scope > .pipe-tile')){
   const title=tile.querySelector('strong').textContent,id=tile.dataset.runId;
   tile.title=title+' — '+(tile.querySelector('.status-line')?.textContent.trim()||'');
   const status=tile.dataset.status,tracking=tile.dataset.tracking;
   const state=status==='placeholder'?'placeholder':status==='failed'?'error':status==='awaiting-approval'||status==='unresolved'||tile.dataset.checkIssue==='true'?'attention':status==='succeeded'?'complete':status==='cancelled'?'cancelled':status==='ready'||status==='queued'?'not-started':status==='paused'?'paused':tracking==='expired'?'asleep':tracking==='paused'?'monitor-paused':status==='running'?'running':'unknown';
   const badges={
    attention:['Action needed','M8 1 15 14H1Z M8 5v4 M8 11v1'],
    'not-started':['Not started','M8 1a7 7 0 1 0 0 14 7 7 0 1 0 0-14 M8 4v4h3'],
    complete:['Complete','M2 8l4 4L14 3'],error:['Error','M3 3l10 10 M13 3 3 13'],
    placeholder:['Placeholder — not connected or started','M3 2H1v3 M6 2h4 M13 2h2v3 M15 8v3 M15 14h-3 M9 14H6 M3 14H1v-3 M1 8V7'],
    paused:['Paused','M5 2v12 M11 2v12'],'monitor-paused':['Monitoring paused','M5 2v12 M11 2v12'],
    asleep:['Monitoring asleep','M10 1A7 7 0 1 0 15 10 7 7 0 0 1 10 1'],
    cancelled:['Cancelled','M8 1a7 7 0 1 0 0 14 7 7 0 1 0 0-14 M3 13 13 3'],
    running:['Running','M13 5A6 6 0 0 0 2 7 M13 1v4H9 M3 11a6 6 0 0 0 11-2 M3 15v-4h4'],
    unknown:['Status unknown','M5 4a3 3 0 1 1 5 3L8 9v1 M8 13v1']
   };
   const [label,path]=badges[state],badge=document.createElement('span');badge.className='pipe-state-icon';badge.dataset.state=state;badge.setAttribute('role','img');badge.setAttribute('aria-label',label);badge.title=label;
   badge.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="'+path+'"/></svg>';tile.append(badge);
   const progress=tile.querySelector('.progress-label'),progressText=progress.dataset.summaryMode==='completion'?progress.textContent.replace(/(\d+(?:\.\d+)?%) complete\b/,'$1'):progress.textContent,value=document.createElement('span');value.className='progress-value';value.textContent=progressText;progress.classList.toggle('text-summary',progress.dataset.summaryMode!=='completion'||!/^\d+(\.\d+)?%$/.test(progressText));progress.replaceChildren(value);
   const row=document.createElement('div');row.className='pipeline-row';row.dataset.runId=id;
   tile.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight Home End');
   tile.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();
    const visible=rows().map(item=>item.dataset.runId),from=visible.indexOf(id),to=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,from+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)));
    if(from===to)return;const without=visible.filter(item=>item!==id);moveTo(id,without[to]);saveOrder();announcement.textContent=title+' moved to column '+(to+1)+'. Visual order only.';tile.focus({preventScroll:true});tile.scrollIntoView({block:'nearest',inline:'nearest'});
   });
   tile.before(row);row.append(tile);
   const meter=tile.querySelector('[role=progressbar]'),percent=Number(meter?.getAttribute('aria-valuenow')||0),art=tile.querySelector('.pipe-art');
   const holder=document.createElement('div');holder.innerHTML=oilPipeline(percent,tile.classList.contains('needs-attention'));art.replaceWith(holder.firstElementChild);
  }
  arrange();
 }finally{observer.observe(grid,{childList:true});}
}
const observer=new MutationObserver(decorate);decorate();

grid.addEventListener('pointerdown',event=>{
 if(event.button!==0||!event.isPrimary)return;const row=event.target.closest('.pipeline-row');if(!row)return;
 drag={id:row.dataset.runId,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,original:[...order],active:false};
});
function placeDragged(){
 if(!drag?.active)return;
 const others=rows().filter(row=>row.dataset.runId!==drag.id),before=others.find(row=>{const box=row.getBoundingClientRect();return drag.x<box.x+box.width/2;});
 moveTo(drag.id,before?.dataset.runId);
}
window.addEventListener('pointermove',event=>{
 if(!drag||event.pointerId!==drag.pointer)return;drag.x=event.clientX;drag.y=event.clientY;
 if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>7){drag.active=true;pasture.setPointerCapture?.(event.pointerId);document.body.classList.add('reordering');}
 if(drag.active){event.preventDefault();placeDragged();}
},{passive:false});
function finishDrag(cancel=false){
 if(!drag)return;const finished=drag;if(cancel)order=finished.original;
 if(finished.active){suppressClickUntil=performance.now()+350;try{pasture.releasePointerCapture(finished.pointer);}catch{}if(!cancel){saveOrder();announcement.textContent='Pipeline moved to column '+(order.indexOf(finished.id)+1)+'. Visual order only.';}else announcement.textContent='Move cancelled.';}
 drag=null;document.body.classList.remove('reordering');arrange();
}
window.addEventListener('pointerup',event=>{if(drag?.pointer===event.pointerId)finishDrag();});
window.addEventListener('pointercancel',()=>finishDrag(true));
window.addEventListener('blur',()=>finishDrag(true));
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();finishDrag(true);}});
grid.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
$('demo-reset').addEventListener('click',()=>{order=[];saveOrder();announcement.textContent='Playground and column order reset.';});

// The animal roster is separate from pipeline execution and tracking.
const {mountCreatures}=await import('./yard-creatures.mjs');
const creatures=await mountCreatures({loadState,saveState,layer:animalLayer,art:{cow,chicken,sheep:animalLayer.querySelector('.pasture-sheep').innerHTML},hayMarkup:'<svg viewBox="0 0 72 56" aria-hidden="true"><ellipse cx="36" cy="48" rx="32" ry="6" fill="#294d3240"/><path d="M5 19L19 9h43l5 10v27H5z" fill="#c69c48" stroke="#766038" stroke-width="2"/><path d="M5 19h62v27H5z" fill="#d9b65e"/><path d="M11 24h49M9 31h53M12 39h48M22 12l-8 7M37 12l-7 7M52 12l-7 7" stroke="#eed087" stroke-width="2"/><path d="M23 10l-5 9v27M51 10l-5 9v27" fill="none" stroke="#87713d" stroke-width="4"/></svg>',dragTick:()=>{
 if(drag?.active){const box=pasture.getBoundingClientRect();const speed=drag.x<box.left+40?-9:drag.x>box.right-40?9:0;if(speed&&drag.y>box.top&&drag.y<box.bottom){pasture.scrollLeft+=speed;placeDragged();}}
}});

const animal=document.getElementById('yard-add-animal'),group=document.createElement('div'),add=document.getElementById('add-pipeline');group.className='yard-add-controls';animal.before(group);group.append(animal,add);
animal.textContent='＋ Animal';animal.setAttribute('aria-label','＋ Add animal');
$('active-view').textContent='Yard';$('active-view').setAttribute('aria-label','Active yard');
const saveStatus=document.querySelector('.creature-save-status'),footer=document.querySelector('.yard-footer');if(saveStatus)footer.insertBefore(saveStatus,footer.lastElementChild);
return creatures;

}

// Moving a bot is play only: its profile, tasks and AI session are untouched.
export function bindManagerDrag({actor,pose,pasture,onSelect,isEnabled=()=>true}){
 let held=null;
 const paint=()=>{const paused=pose.paused;pose.paused=true;stepManagerWalk(pose,{width:pasture.clientWidth,height:pasture.clientHeight,actorWidth:actor.offsetWidth,actorHeight:actor.offsetHeight},0);pose.paused=paused;actor.style.transform=`translate(${pose.x}px,${pose.y}px)`;};
 function finish(cancel=false){
  if(!held)return;const drag=held;held=null;pose.held=false;actor.dataset.held='false';actor.dataset.dragging='false';
  if(cancel){pose.x=drag.x;pose.y=drag.y;}else if(drag.moved){delete pose.tx;delete pose.ty;pose.wait=1.2;if(document.activeElement===actor)actor.blur();}
  paint();try{actor.releasePointerCapture(drag.pointer);}catch{}
  if(!cancel&&!drag.moved&&isEnabled())onSelect();
 }
 actor.draggable=false;actor.onclick=null;
 actor.addEventListener('pointerdown',event=>{
  if(!isEnabled()||held||!event.isPrimary||event.button!==0)return;
  event.preventDefault();event.stopPropagation();actor.focus({preventScroll:true});
  held={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:pose.x,y:pose.y,moved:false};pose.held=true;pose.walking=false;actor.dataset.held='true';actor.dataset.walking='false';
  try{actor.setPointerCapture(event.pointerId);}catch{finish(true);}
 });
 actor.addEventListener('pointermove',event=>{
  if(!held||held.pointer!==event.pointerId)return;if(!isEnabled()){finish(true);return;}
  event.preventDefault();if(!held.moved&&Math.hypot(event.clientX-held.startX,event.clientY-held.startY)<6)return;
  held.moved=true;actor.dataset.dragging='true';pose.x=held.x+event.clientX-held.startX;pose.y=held.y+event.clientY-held.startY;paint();
 });
 actor.addEventListener('pointerup',event=>{if(held?.pointer===event.pointerId)finish(!isEnabled());});
 for(const type of ['pointercancel','lostpointercapture'])actor.addEventListener(type,event=>{if(held?.pointer===event.pointerId)finish(true);});
 actor.addEventListener('click',event=>{if(event.detail===0&&!held&&isEnabled())onSelect();});
 actor.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&held){event.preventDefault();finish(true);return;}
  if(!isEnabled()||held||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const step=event.shiftKey?40:16;pose.x+=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0;pose.y+=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;delete pose.tx;delete pose.ty;pose.wait=1.2;paint();
 });
 return ()=>finish(true);
}

// Pure visual movement: no task, polling, or runtime operations.
export function stepManagerWalk(pose,{width,height,actorWidth=84,actorHeight=120},elapsed,random=Math.random){
 const left=12,top=36,right=Math.max(left,width-actorWidth-12),bottom=Math.max(top,height-actorHeight-12);
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 pose.x=clamp(pose.x,left,right);pose.y=clamp(pose.y,top,bottom);
 pose.walking=false;const dt=clamp(elapsed,0,.05);if(pose.paused)return pose;
 if(pose.wait>0){pose.wait=Math.max(0,pose.wait-dt);return pose;}
 if(pose.tx===undefined){pose.tx=left+random()*(right-left);pose.ty=top+random()*(bottom-top);}
 pose.tx=clamp(pose.tx,left,right);pose.ty=clamp(pose.ty,top,bottom);
 const dx=pose.tx-pose.x,dy=pose.ty-pose.y,distance=Math.hypot(dx,dy),step=52*dt;
 if(distance<=Math.max(step,1)){pose.x=pose.tx;pose.y=pose.ty;delete pose.tx;delete pose.ty;pose.wait=1.5+random()*3;return pose;}
 pose.x+=dx/distance*step;pose.y+=dy/distance*step;pose.walking=true;if(Math.abs(dx)>1)pose.facing=dx<0?'left':'right';return pose;
}
