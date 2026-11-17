// Throwaway visual exploration on a dedicated demo-only origin.
const requested=new URLSearchParams(location.hash.slice(1)),previewHash=new URLSearchParams({demo:'1'});
if(/^demo-[a-z0-9-]+$/.test(requested.get('run')||''))previewHash.set('run',requested.get('run'));
history.replaceState(null,'',location.pathname+'#'+previewHash);
document.body.classList.add('pipeyard-prototype');
await import('/setup/pipeyard.js');

const $=id=>document.getElementById(id);
$('yard-mode').textContent='Demo';
$('demo-exit').hidden=true;$('demo-exit').disabled=true;
$('demo-reset').textContent='Reset playground';
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

function oilPipeline(percent,attention){
 return `<svg class="pipe-art oil-pipeline compact-column" viewBox="0 0 40 600" preserveAspectRatio="none" aria-hidden="true">
 <g class="pipe-supports" fill="#969b96" stroke="#515d58" stroke-width="1">
 ${[74,195,401,548].map(y=>`<path d="M3 ${y+9}h34v14H3z" fill="#354d3c" opacity=".3" stroke="none"/><path d="M8 ${y}h6v17H8zM26 ${y}h6v17H26z" fill="#646f6a"/><path d="M1 ${y+14}h16v7H1zM23 ${y+14}h16v7H23z"/><path d="M4 ${y-2}h32v9H4z" fill="#aeb3ac"/>`).join('')}
 </g>
 <path d="M20 -5V605" stroke="#314c3d" stroke-width="18"/>
 <path d="M20 -5V605" stroke="currentColor" stroke-width="14"/>
 <path d="M17 -5V605" stroke="#fff6cd" stroke-opacity=".45" stroke-width="2"/>
 <path class="oil-flow" d="M22 -5V605" stroke="#f4f3cd" stroke-opacity=".6" stroke-width="1.5" stroke-dasharray="5 15"/>
 <g fill="#79857e" stroke="#c3c8be" stroke-width="1"><path d="M9 74h22v7H9zM9 195h22v7H9zM9 401h22v7H9zM9 548h22v7H9z"/></g>
 <rect x="16" y="26" width="8" height="8" fill="${attention?'#ffd684':'#c5dcb0'}" stroke="#314c3d" stroke-width="2"/>
 </svg>`;
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

const {createPipeyardDemo}=await import('/setup/pipeyard-demo.mjs');
let storage;try{storage=localStorage;}catch{}
const ids=new Map(createPipeyardDemo({storage}).snapshot().runs.map(run=>[run.title,run.id]));
const orderKey='botRanch.pipeyard.design.order.v1';let order=[];
try{const saved=JSON.parse(storage?.getItem(orderKey)||'[]');if(Array.isArray(saved))order=[...new Set(saved.filter(id=>[...ids.values()].includes(id)))];}catch{}
let drag=null,suppressClickUntil=0;
const announcement=document.createElement('p');announcement.className='reorder-status';announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');pasture.before(announcement);
const rows=()=>[...grid.querySelectorAll(':scope > .pipeline-row')];
function arrange(){
 const items=rows(),known=new Set(order);for(const row of items)if(!known.has(row.dataset.runId)){order.push(row.dataset.runId);known.add(row.dataset.runId);}
 const sorted=items.slice().sort((a,b)=>order.indexOf(a.dataset.runId)-order.indexOf(b.dataset.runId));
 const desired=sorted;
 if([...grid.children].some((row,i)=>row!==desired[i]))for(const row of desired)grid.append(row);
 for(const row of sorted)row.classList.toggle('dragging',!!drag?.active&&row.dataset.runId===drag.id);
}
function saveOrder(){try{storage?.setItem(orderKey,JSON.stringify(order));}catch{} }
function moveTo(id,beforeId){const next=order.filter(item=>item!==id),index=beforeId?next.indexOf(beforeId):-1;next.splice(index<0?next.length:index,0,id);order=next;arrange();}
function decorate(){
 observer.disconnect();
 try{
  for(const tile of grid.querySelectorAll(':scope > .pipe-tile')){
   const title=tile.querySelector('strong').textContent,id=tile.dataset.runId||ids.get(title)||title;
   tile.title=title+' — '+(tile.querySelector('.status-line')?.textContent.trim()||'');
   const failed=/ · (Failed|Needs reconciliation)$/.test(tile.getAttribute('aria-label')||''),checkIssue=tile.querySelector('.tracking-badge')?.textContent.includes('Check unavailable');
   if(tile.classList.contains('needs-attention')||failed||checkIssue){const alert=document.createElement('span');alert.className='pipe-alert';alert.textContent=failed?'! Needs help':checkIssue?'! Check issue':'! Review';alert.title='Open this pipe for the alert and available actions in the Pipeline Desk.';tile.append(alert);}
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

// The animal roster is a separate local preview file, independent of pipeline runs.
const {mountCreatures}=await import('/prototype/creatures.mjs');
await mountCreatures({layer:animalLayer,art:{cow,chicken,sheep:animalLayer.querySelector('.pasture-sheep').innerHTML},hayMarkup:'<svg viewBox="0 0 72 56" aria-hidden="true"><ellipse cx="36" cy="48" rx="32" ry="6" fill="#294d3240"/><path d="M5 19L19 9h43l5 10v27H5z" fill="#c69c48" stroke="#766038" stroke-width="2"/><path d="M5 19h62v27H5z" fill="#d9b65e"/><path d="M11 24h49M9 31h53M12 39h48M22 12l-8 7M37 12l-7 7M52 12l-7 7" stroke="#eed087" stroke-width="2"/><path d="M23 10l-5 9v27M51 10l-5 9v27" fill="none" stroke="#87713d" stroke-width="4"/></svg>',dragTick:()=>{
 if(drag?.active){const box=pasture.getBoundingClientRect();const speed=drag.x<box.left+40?-9:drag.x>box.right-40?9:0;if(speed&&drag.y>box.top&&drag.y<box.bottom){pasture.scrollLeft+=speed;placeDragged();}}
}});
