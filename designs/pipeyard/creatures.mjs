import {HAY_RADIUS,HUNGRY_AT,FULL_AT,ANIMAL_LIMIT,updateFullness,wantsHay} from './creature-behavior.mjs';
// Variant numbers stay compatible with the saved roster (including chestnut/golden cows).
const animalColors=[['Cream','#eee7d4','#c9c3ae'],['Slate','#a3afb2','#707f85'],['Charcoal','#595e58','#3d443f'],['Chestnut','#b57950','#714a37'],['Golden','#dfbd7a','#b68c4e']];
export async function mountCreatures({layer,art,hayMarkup,dragTick}){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),desk=document.getElementById('pipeline-desk'),heading=desk.querySelector('h2');
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const control=make('button','＋ Add animal');control.type='button';document.querySelector('.yard-toolbar').append(control);
 const saveStatus=make('span','Loading animals…','creature-save-status');saveStatus.setAttribute('role','status');document.querySelector('.yard-toolbar').append(saveStatus);
 let saved,revision=0,saving=false,queued=false,conflict=false,held=null,selected=null,last=performance.now(),lastNeeds=Date.now(),lastUI=0;
 const herd=[],bales=[],panel=make('section',undefined,'creature-panel');panel.hidden=true;desk.append(panel);
 try{const response=await fetch('/prototype/creatures');if(!response.ok)throw Error('Could not load the animal file.');saved=await response.json();revision=saved.revision;}catch(error){saveStatus.textContent=error.message;control.disabled=true;return;}
 function state(){return {version:1,revision,creatures:herd.map(a=>({id:a.id,type:a.type,variant:a.variant,name:a.name,x:a.x,y:a.y,fullness:a.fullness,eating:a.eating})),hay:bales.map(h=>({id:h.id,x:h.x,y:h.y}))};}
 async function save(){
  if(conflict||!layer.clientWidth||!layer.clientHeight)return false;if(saving){queued=true;return false;}saving=true;saveStatus.textContent='Saving animals…';
  try{const response=await fetch('/prototype/creatures',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state())});const result=await response.json();if(!response.ok){if(response.status===409)conflict=true;throw Error(result.error||'Could not save animals.');}revision=result.revision;saveStatus.textContent='Animals saved locally';return true;}catch(error){saveStatus.textContent=error.message;return false;}finally{saving=false;if(queued&&!conflict){queued=false;void save();}}
 }
 function bound(a){const w=layer.clientWidth,h=layer.clientHeight;if(!w||!h)return;a.x=Math.max(20,Math.min(w-a.actor.offsetWidth-20,a.x*w))/w;a.y=Math.max(65,Math.min(h-a.actor.offsetHeight-40,a.y*h))/h;}
 function paint(a){bound(a);a.actor.style.transform=`translate(${a.x*layer.clientWidth}px,${a.y*layer.clientHeight}px)`;}
 function announceName(a){a.actor.setAttribute('aria-label',a.name+', '+a.type+'. Click for details; drag or use arrow keys to move.');a.actor.title=a.name;}
 function applyColor(node,variant){const color=animalColors[variant-1];node.style.setProperty('--animal-coat',color[1]);node.style.setProperty('--animal-shade',color[2]);node.classList.add('colored-animal');}
 function colorPicker(parent,id,variant=1){const label=make('label','Animal color'),select=make('select');label.htmlFor=id;select.id=id;animalColors.forEach(([name],i)=>{const option=make('option',name);option.value=String(i+1);select.append(option);});select.value=String(variant);parent.append(label,select);return select;}
 function wanderTarget(a){a.tx=.06+Math.random()*.88;a.ty=.15+Math.random()*.7;a.pause=0;}
 function closePanel(){selected=null;panel.hidden=true;desk.classList.remove('viewing-creature');heading.textContent='Pipeline Desk';}
 function showAnimal(a){
  selected=a;panel.replaceChildren();panel.hidden=false;desk.classList.add('viewing-creature');heading.textContent='Animal Desk';
  const portrait=make('div',undefined,'animal-portrait '+a.actor.className);portrait.innerHTML=art[a.type];applyColor(portrait,a.variant);
  const name=make('h3',a.name),kind=make('p',a.type[0].toUpperCase()+a.type.slice(1),'hint');panel.append(portrait,name,kind);
  const meterLabel=make('label','Fullness'),meter=make('meter');meter.id='animal-fullness';meter.min=0;meter.max=100;meter.low=HUNGRY_AT;meter.high=FULL_AT;meter.optimum=100;meterLabel.htmlFor=meter.id;
  const value=make('p','','fullness-value'),activity=make('p','','animal-activity');panel.append(meterLabel,meter,value,activity,make('p','Seeks hay at 25% fullness. Eats until 90% full, then wanders.','hint'));
  const color=colorPicker(panel,'animal-color',a.variant);color.onchange=()=>{a.variant=Number(color.value);applyColor(a.actor,a.variant);applyColor(portrait,a.variant);void save();};
  const form=make('form'),label=make('label','Animal name'),input=make('input'),rename=make('button','Save name');input.id='animal-name';input.value=a.name;input.maxLength=80;input.required=true;label.htmlFor=input.id;rename.type='submit';form.append(label,input,rename);form.onsubmit=async event=>{event.preventDefault();if(!input.value.trim())return;a.name=input.value.trim();announceName(a);name.textContent=a.name;await save();};panel.append(form);
  const remove=make('button','Remove animal');remove.type='button';remove.onclick=()=>{if(held?.a===a)release(true);herd.splice(herd.indexOf(a),1);a.actor.remove();closePanel();void save();};panel.append(remove);updatePanel();
 }
 function updatePanel(){if(!selected)return;panel.querySelector('meter').value=selected.fullness;panel.querySelector('.fullness-value').textContent=Math.round(selected.fullness)+'% full';panel.querySelector('.animal-activity').textContent=selected.actor.dataset.activity||'Wandering';}
 function release(cancel=false){
  if(!held)return;const moving=held;held=null;const a=moving.a;
  if(cancel){a.x=moving.x;a.y=moving.y;paint(a);}else if(moving.moved){if(a.type){a.eating=false;a.target=null;a.pause=1;wanderTarget(a);}void save();}
  a.actor.classList.remove('picked-up');try{a.actor.releasePointerCapture(moving.pointer);}catch{}
  if(!cancel&&!moving.moved&&a.type)showAnimal(a);
 }
 function wire(a){
  a.actor.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary||held)return;event.preventDefault();event.stopPropagation();const box=a.actor.getBoundingClientRect();held={a,pointer:event.pointerId,x:a.x,y:a.y,startX:event.clientX,startY:event.clientY,dx:event.clientX-box.left,dy:event.clientY-box.top,moved:false};a.actor.setPointerCapture(event.pointerId);a.actor.focus({preventScroll:true});});
  a.actor.addEventListener('pointermove',event=>{if(held?.a!==a||held.pointer!==event.pointerId)return;event.preventDefault();if(Math.hypot(event.clientX-held.startX,event.clientY-held.startY)<5&&!held.moved)return;held.moved=true;a.actor.classList.add('picked-up');const box=layer.getBoundingClientRect();a.x=(event.clientX-box.left-held.dx)/box.width;a.y=(event.clientY-box.top-held.dy)/box.height;paint(a);});
  a.actor.addEventListener('pointerup',event=>{if(held?.a===a&&held.pointer===event.pointerId)release();});
  for(const type of ['pointercancel','lostpointercapture'])a.actor.addEventListener(type,()=>{if(held?.a===a)release(true);});
  a.actor.addEventListener('click',event=>{if(event.detail===0&&a.type)showAnimal(a);});
  a.actor.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?40:15;a.x+=(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0)/layer.clientWidth;a.y+=(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)/layer.clientHeight;if(a.type){a.eating=false;a.target=null;wanderTarget(a);}paint(a);void save();});
 }
 function addCreature(data){const actor=make('button',undefined,'pasture-'+data.type);actor.type='button';actor.innerHTML=art[data.type];applyColor(actor,data.variant);layer.append(actor);const a={...data,actor,pause:0,target:null,speed:data.type==='chicken'?24:data.type==='sheep'?13:14,angle:Math.random()*Math.PI*2};wanderTarget(a);herd.push(a);announceName(a);paint(a);wire(a);return a;}
 layer.replaceChildren();
 for(const h of saved.hay){const actor=make('button',undefined,'hay-bale '+h.id);actor.type='button';actor.innerHTML=hayMarkup;actor.title='Move hay near hungry animals.';actor.setAttribute('aria-label',h.id.replace('-',' ')+'. Drag or use arrow keys to move.');layer.append(actor);const bale={...h,actor};bales.push(bale);paint(bale);wire(bale);}
 const offline=Math.max(0,(Date.now()-saved.updatedAt)/1000);
 for(const data of saved.creatures){updateFullness(data,offline,false);addCreature(data);}
 saveStatus.textContent='Animals saved locally';
 control.onclick=()=>{
  const dialog=make('dialog'),form=make('form');dialog.setAttribute('aria-label','Add animal');form.append(make('h2','Add animal'));
  const label=make('label','Animal species'),species=make('select');species.id='animal-species';label.htmlFor=species.id;for(const kind of ['cow','chicken','sheep']){const option=make('option',kind[0].toUpperCase()+kind.slice(1));option.value=kind;species.append(option);}
  const nameLabel=make('label','New animal name'),name=make('input');name.id='new-animal-name';nameLabel.htmlFor=name.id;name.maxLength=80;name.placeholder='Optional';
  form.append(label,species,nameLabel,name);const color=colorPicker(form,'new-animal-color');
  const add=make('button','Add to pasture'),cancel=make('button','Cancel animal'),error=make('p','','error');add.type='submit';cancel.type='button';cancel.onclick=()=>dialog.close();form.append(make('p','Arrives hungry at 25% fullness.','hint'),make('p',herd.length+' / '+ANIMAL_LIMIT+' animals','hint'),error,add,cancel);
  form.onsubmit=async event=>{event.preventDefault();if(herd.length>=ANIMAL_LIMIT){error.textContent='The pasture holds up to '+ANIMAL_LIMIT+' animals. Remove one to make room.';return;}const kind=species.value,a=addCreature({id:'animal-'+crypto.randomUUID(),type:kind,variant:Number(color.value),name:name.value.trim()||kind[0].toUpperCase()+kind.slice(1)+' '+(herd.filter(a=>a.type===kind).length+1),x:.75+Math.random()*.15,y:.3+Math.random()*.4,fullness:HUNGRY_AT,eating:false});dialog.close();showAnimal(a);await save();};dialog.append(form);dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
 };
 document.getElementById('desk-all').addEventListener('click',closePanel);
 document.addEventListener('click',event=>{if(event.target.closest('.pipe-tile'))closePanel();});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&held){event.preventDefault();release(true);}});window.addEventListener('blur',()=>release(true));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void save();});
 setInterval(()=>{if(!document.hidden)void save();},15000);
 function frame(time){
  const dt=Math.min(.05,(time-last)/1000);last=time;const now=Date.now(),needsDt=Math.max(0,(now-lastNeeds)/1000);lastNeeds=now;const width=layer.clientWidth,height=layer.clientHeight;if(!width||!height){requestAnimationFrame(frame);return;}
  for(const bale of bales)paint(bale);
  for(const a of herd){
   if(held?.a===a){paint(a);continue;}
   if(a.target&&(!bales.includes(a.target)||a.fullness>=FULL_AT)){a.target=null;a.eating=false;wanderTarget(a);}
   if(!a.target&&wantsHay(a)){const nearby=bales.filter(h=>held?.a!==h).map(h=>({h,d:Math.hypot((h.x-a.x)*width,(h.y-a.y)*height)})).sort((a,b)=>a.d-b.d)[0];if(nearby?.d<=HAY_RADIUS){a.target=nearby.h;a.eating=true;a.pause=0;}}
   if(a.target){const goal={actor:a.actor,x:a.target.x+Math.cos(a.angle)*45/width,y:a.target.y+Math.sin(a.angle)*35/height};bound(goal);a.tx=goal.x;a.ty=goal.y;}
   const atHay=!!a.target&&Math.hypot((a.target.x-a.x)*width,(a.target.y-a.y)*height)<75;
   updateFullness(a,needsDt,atHay);
   if(a.fullness>=FULL_AT&&a.target){a.target=null;a.eating=false;wanderTarget(a);}
   if(!reduced.matches&&!document.hidden){if(a.pause>0)a.pause-=dt;else{const dx=(a.tx-a.x)*width,dy=(a.ty-a.y)*height,distance=Math.hypot(dx,dy),step=Math.min(distance,a.speed*dt);if(distance<2){a.pause=1.5+Math.random()*4;if(!a.target)wanderTarget(a);}else{a.x+=dx/distance*step/width;a.y+=dy/distance*step/height;a.actor.dataset.facing=dx<0?'left':'right';}}}
   paint(a);a.actor.dataset.grazing=String(atHay||a.pause>0);a.actor.dataset.activity=atHay&&a.target?'Eating hay':a.target?'Heading to hay':a.fullness<=HUNGRY_AT?'Hungry — looking for hay':'Wandering';
  }
  for(const bale of bales)bale.actor.dataset.visitors=String(herd.filter(a=>a.target===bale).length);
  if(time-lastUI>200){updatePanel();lastUI=time;}dragTick?.();requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 return {save};
}
