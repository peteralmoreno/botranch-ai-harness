'use strict';
import {botColors,colorNames} from './bot-palette.mjs';
import {pipelineFeed} from './pipeyard-feed.mjs';
import {createPipeyardDemo,createDemoCreatureStore} from './pipeyard-demo.mjs';
const $=id=>document.getElementById(id),fragment=new URLSearchParams(location.hash.slice(1));
const visualYard=fragment.get('embed')==='1'||fragment.get('yard')==='1';
const embedded=fragment.get('embed')==='1',paired=embedded||fragment.has('pair');
const token=paired?(fragment.get('pair')||sessionStorage.getItem('pipeyard-pair')||''):(fragment.get('admin')||sessionStorage.getItem('pipeyard-admin')||'');
if(token)sessionStorage.setItem(paired?'pipeyard-pair':'pipeyard-admin',token);
document.body.classList.toggle('embedded',embedded);
let demoMode=fragment.get('demo')==='1',demo=null,viewEpoch=0,yardController=null;
let selected=fragment.get('run')||'',detailMode=!!selected;
function updateFragment(){const hash=new URLSearchParams();if(embedded)hash.set('embed','1');else if(visualYard)hash.set('yard','1');if(selected&&detailMode)hash.set('run',selected);if(demoMode)hash.set('demo','1');history.replaceState(null,'',location.pathname+(hash.size?'#'+hash:''));}
updateFragment();
if(detailMode)document.body.classList.add('detail-mode');
const noteDrafts=new Map();
let checkedSelection='',checkingId='';
let snapshot={runs:[],templates:[]},historyView=false,creating='launch',connectingLocal='',pendingRequest='',pendingAction=null,configuration=null,busy=false,online=false,refreshing=false;
const labels={ready:'Ready to launch',queued:'Queued',running:'Running',paused:'Workflow paused','awaiting-approval':'Awaiting approval',succeeded:'Completed',failed:'Failed',cancelled:'Cancelled',unknown:'Status unknown',unresolved:'Needs reconciliation',submitting:'Submitting'};
const runLabel=run=>run.localOnly?'Local placeholder':labels[run.status]||run.status;
const symbols={ready:'▷',running:'●',queued:'◷',paused:'Ⅱ','awaiting-approval':'!',succeeded:'✓',failed:'!',cancelled:'—',unknown:'?',unresolved:'!'};
const finished=r=>['succeeded','failed','cancelled'].includes(r.status);
function progressView(run){
 const value=Object.hasOwn(run,'displayProgress')?run.displayProgress:run.progress;
 const percent=typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):null;
 const source=demoMode?'Demo':({platform:'Platform',estimate:'Estimated',completed:'Confirmed complete'}[run.progressSource]||'Platform');
 return {percent,label:percent===null?'Progress unknown':percent+'%',provenance:percent===null?'Progress unknown':percent+'% · '+source};
}
const date=at=>at?new Date(at).toLocaleString():'Not yet checked';
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function button(label,fn){const n=el('button',label);n.type='button';n.onclick=fn;return n;}
function message(value){$('notice').textContent=value;}
function color(run){return /^#[a-f0-9]{6}$/i.test(run.color)?run.color:'#61b7ba';}
async function api(route,body){if(demoMode)throw Error('Live API calls are disabled in demo mode.');const response=await fetch((paired?'/control/pipeyard/':'/admin/pipeyard/')+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});let result;try{result=await response.json();}catch{throw Error('Companion returned an invalid response.');}if(!response.ok)throw Error(result.error||'Request failed.');return result;}
async function action(action,body={}){if(!demoMode&&(['start-demo','create-demo','delete-demo'].includes(action)||String(body.id||'').startsWith('demo-')))throw Error('Demo actions cannot operate the live yard.');if(busy)throw Error('Another action is still in progress.');busy=true;if(['refresh','check-due'].includes(action)){checkingId=body.id;renderDetails();}try{const result=demoMode?demo.execute(action,body):await api('action',{action,...body});await refresh();return result;}catch(error){await refresh();throw error;}finally{busy=false;checkingId='';renderDetails();}}
function pipeArt(){const n=document.createElementNS('http://www.w3.org/2000/svg','svg');n.setAttribute('viewBox','0 0 210 100');n.setAttribute('class','pipe-art');n.setAttribute('shape-rendering','crispEdges');n.setAttribute('aria-hidden','true');n.innerHTML='<path d="M5 75H32V38H75M135 38H177V75H205" fill="none" stroke="#131c21" stroke-width="24"/><path d="M5 75H32V38H75M135 38H177V75H205" fill="none" stroke="currentColor" stroke-width="15"/><path class="flow" d="M5 75H32V38H75M135 38H177V75H205" fill="none" stroke="#edf8ef" stroke-opacity=".5" stroke-width="3"/><rect x="70" y="13" width="70" height="74" rx="12" fill="#18272d" stroke="currentColor" stroke-width="4"/><rect x="80" y="51" width="50" height="24" rx="4" fill="currentColor" opacity=".22"/><circle cx="105" cy="35" r="14" fill="#e0e9cf"/><path d="M105 35l7-8" stroke="#29383e" stroke-width="3" stroke-linecap="round"/><circle cx="94" cy="61" r="3" fill="#e5f4ee"/><circle cx="116" cy="61" r="3" fill="#e5f4ee"/><path d="M99 70h12" stroke="#e5f4ee" stroke-width="2"/><path d="M52 28v20M158 28v20M22 65h20M167 65h20" stroke="#c1cbc1" stroke-width="4"/><path d="M80 89h50" stroke="#0c1317" stroke-width="5"/>';return n;}
function renderYard(){
 const focusedRun=document.activeElement?.closest('.pipe-tile')?.dataset.runId;
 const query=$('search').value.trim().toLowerCase(),runs=snapshot.runs.filter(r=>!!r.archived===historyView&&(!query||[r.title,r.externalId,r.templateName].join(' ').toLowerCase().includes(query))).sort((a,b)=>b.createdAt-a.createdAt);
 $('runs').replaceChildren();if(focusedRun)queueMicrotask(()=>{if(document.activeElement===document.body){const tile=[...$('runs').querySelectorAll('.pipe-tile')].find(n=>n.dataset.runId===focusedRun);tile?.focus({preventScroll:true});}});$('empty').hidden=!!runs.length;$('count').textContent=runs.length+(runs.length===1?' run':' runs');$('active-view').setAttribute('aria-pressed',String(!historyView));$('history-view').setAttribute('aria-pressed',String(historyView));
 $('empty').querySelector('h2').textContent=historyView?'History is clear':query?'No matching runs':'No pipelines here yet';
 $('empty').querySelector('p').textContent=demoMode?'Add a demo pipeline to arrange the yard, or reset to restore the six examples.':'Configure a platform and template, then launch a run or track one already in progress.';
 for(const run of runs){const tile=button('',()=>{selected=selected===run.id?'':run.id;renderYard();renderDetails();});tile.className='pipe-tile'+(run.status==='awaiting-approval'?' needs-attention':'')+(selected===run.id?' selected':'')+(run.status==='running'&&run.tracking==='active'?' is-running':'');tile.dataset.runId=run.id;tile.dataset.shape=['standard','orchestrator','checkpoint','quick'].includes(run.shape)?run.shape:'standard';tile.dataset.status=run.localOnly?'placeholder':run.status;tile.dataset.tracking=run.tracking;tile.dataset.checkIssue=String(!!run.lastError);tile.style.setProperty('--pipe',color(run));tile.setAttribute('aria-label',run.title+' · '+runLabel(run));tile.setAttribute('aria-pressed',String(selected===run.id));const top=el('div',undefined,'tile-top');top.append(el('span',run.templateName),el('span',run.source==='board'?'Board':run.source==='demo'?'Demo':'↗'));tile.append(top,pipeArt(),el('strong',run.title),el('span',run.message||run.externalId||'Waiting for external ID','run-message'));const status=el('span',undefined,'status-line');status.append(el('span',symbols[run.status]||'◷','status-icon'),el('span',runLabel(run)));tile.append(status);if(run.lastError)tile.append(el('span','⚠ Check unavailable','tracking-badge'));else if(run.status!=='ready'&&(run.tracking==='paused'||run.tracking==='expired'))tile.append(el('span',run.tracking==='paused'?'Tracking paused':'Monitoring asleep','tracking-badge'));const progress=progressView(run);const progressLabel=el('span',progress.label,'progress-label');progressLabel.title=progress.provenance;progressLabel.setAttribute('aria-label',progress.provenance);tile.append(progressLabel);if(progress.percent!==null){const meter=el('div',undefined,'meter'),fill=el('span');meter.setAttribute('role','progressbar');meter.setAttribute('aria-label',progress.label);meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.setAttribute('aria-valuenow',String(progress.percent));fill.style.width=progress.percent+'%';meter.append(fill);tile.append(meter);} $('runs').append(tile);}
 renderFeed();
}
let feedSignature='',feedScope='',feedKnown=new Set();
function fillFilter(id,values,label){const node=$(id),selected=node.value,signature=JSON.stringify(values);if(node.dataset.signature===signature)return;node.dataset.signature=signature;node.replaceChildren();const all=el('option',label);all.value='';node.append(all);for(const [value,name] of values){const option=el('option',name);option.value=value;node.append(option);}node.value=values.some(([value])=>value===selected)?selected:'';}
function renderFeed(force=false){
 const runs=snapshot.runs.filter(r=>!!r.archived===historyView);
 fillFilter('feed-family',[...new Map(runs.map(r=>[r.templateId||'board',r.templateName])).entries()],'All families');
 fillFilter('feed-run',runs.filter(r=>!$('feed-family').value||(r.templateId||'board')===$('feed-family').value).map(r=>[r.id,r.title]),'All runs');
 const rows=pipelineFeed(snapshot.runs,{family:$('feed-family').value,run:$('feed-run').value,kind:$('feed-kind').value,attention:$('feed-attention').checked,history:historyView});
 const list=$('pipeline-feed-list'),signature=JSON.stringify(rows),live=list.scrollTop<24;const scope=JSON.stringify([demoMode,historyView,$('feed-family').value,$('feed-run').value,$('feed-kind').value,$('feed-attention').checked]);if(scope!==feedScope){force=true;feedScope=scope;}
 $('pipeline-feed-status').textContent=(!online?'Offline · saved updates. ':demoMode?'Demo updates. ':'')+(rows.length?rows.length+' updates · newest first':'No matching updates yet.');
 const fresh=rows.filter(r=>!feedKnown.has(r.id)).length;
 if(!force&&!live&&feedSignature){$('pipeline-feed-new').hidden=!fresh;$('pipeline-feed-new').textContent=fresh+' new updates';return;}
 $('pipeline-feed-new').hidden=true;if(!force&&signature===feedSignature)return;
 list.replaceChildren();for(const row of rows){const card=el('article',undefined,'pipeline-post'),avatar=pipeArt();avatar.classList.add('pipeline-avatar');avatar.setAttribute('viewBox','67 10 76 74');card.style.setProperty('--pipe',color(row.run));const head=el('div',undefined,'pipeline-post-head'),name=button(row.run.title,()=>{selected=row.run.id;renderYard();renderDetails();});head.append(name,el('time',date(row.at)));const source=row.run.source==='demo'?'Demo':row.kind==='note'?'Local note':row.kind==='estimate'?'Local estimate':row.source==='platform'?'Platform':row.source==='tracker'?'Tracker':['progress','attention','complete'].includes(row.kind)?'Platform':'Tracker';card.append(avatar,head,el('p',row.text),el('span',source+' · '+row.run.templateName,'post-source'));list.append(card);}
 feedSignature=signature;feedKnown=new Set(rows.map(r=>r.id));if(force||live)list.scrollTop=0;
}
function resetFeed(){feedSignature='';feedKnown=new Set();for(const id of ['feed-family','feed-run','feed-kind'])$(id).value='';$('feed-attention').checked=false;renderFeed(true);}
for(const id of ['feed-family','feed-run','feed-kind','feed-attention'])$(id).onchange=()=>renderFeed(true);
$('pipeline-feed-new').onclick=()=>renderFeed(true);$('pipeline-feed-list').onscroll=()=>{if($('pipeline-feed-list').scrollTop<24)renderFeed();};
$('desk-all').onclick=()=>{selected='';if(detailMode){detailMode=false;document.body.classList.remove('detail-mode');}updateFragment();renderYard();renderDetails();renderFeed();};
function addSection(parent,title){parent.append(el('h3',title));}
function appendData(parent,value){parent.append(el('pre',typeof value==='string'?value:JSON.stringify(value,null,2)));}
function openBoard(run){location.href='/board/#'+new URLSearchParams({admin:token,task:run.taskId});}
function checkOnOpen(run){
 if(checkedSelection===run.id||busy)return;
 checkedSelection=run.id;
 const due=run.checkDue||(!run.archived&&!finished(run)&&run.tracking==='active'&&Date.now()<run.deadline&&Date.now()>=Math.max(run.nextCheckAt||0,run.retryAt||0));
 if(run.source==='board'||!run.externalId||!due)return;
 const epoch=viewEpoch,id=run.id;
 queueMicrotask(()=>{if(selected===id&&epoch===viewEpoch)void action('check-due',{id}).catch(error=>message(error.message));});
}
function objectTree(value){
 let remaining=800;
 function node(value,label,depth){
  if(remaining--<=0)return el('p','More data is available in the JSON view.','hint');
  if(value!==null&&typeof value==='object'){
   const entries=Object.entries(value),branch=el('details',undefined,'json-branch');branch.open=depth<2;
   branch.append(el('summary',label+' '+(Array.isArray(value)?'['+entries.length+']':'{'+entries.length+'}')));
   for(const [key,child] of entries){if(remaining<=0){branch.append(el('p','More data is available in the JSON view.','hint'));break;}branch.append(node(child,key,depth+1));}
   return branch;
  }
  const row=el('div',undefined,'json-value');row.append(el('span',label+': ','json-key'),el('code',JSON.stringify(value)));return row;
 }
 const tree=el('div',undefined,'json-tree');tree.append(node(value,'Response',0));return tree;
}
function expandProgress(run){
 const response=run.progressResponse;if(!response)return;
 const dialog=el('dialog',undefined,'progress-dialog');dialog.setAttribute('aria-label','Saved progress response');
 const head=el('div',undefined,'dialog-heading'),close=button('Close progress',()=>dialog.close());head.append(el('h2',run.title+' — progress'),close);
 const label=el('label','Progress JSON'),raw=el('textarea');raw.id='progress-json';label.htmlFor=raw.id;raw.readOnly=true;raw.spellcheck=false;raw.rows=16;raw.value=JSON.stringify(response.data,null,2);
 dialog.append(head,el('p',(demoMode?'Demo response':'Saved '+response.source+' response')+' · '+date(response.fetchedAt)+'. Snapshot at opening.','hint'),objectTree(response.data),label,raw);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
function progressResponseSection(root,run){
 const section=el('section',undefined,'progress-response');section.append(el('h3','Saved progress response'));
 const response=run.progressResponse;
 if(!response){section.append(el('p',run.externalId?'No response saved yet. Choose Check now to fetch it.':'Start or link this run to receive progress.','hint'));root.append(section);return;}
 section.append(el('p',(demoMode?'Demo JSON':response.source==='progress'?'Platform /progress JSON':'Platform status JSON (no progress endpoint)')+' · '+date(response.fetchedAt),'hint'));
 section.append(el('p',response.review?'Reviewed by '+response.review.author+' · '+date(response.review.at):'Awaiting agent review','response-review'));
 if(response.review)section.append(el('p',response.review.summary));
 section.append(button('Expand progress',()=>expandProgress(run)),objectTree(response.data));root.append(section);
}
function editConnection(run){
 const dialog=el('dialog'),form=el('form'),heading=el('div',undefined,'dialog-heading');dialog.setAttribute('aria-label','Edit pipeline connection');heading.append(el('h2','Pipeline connection'),button('Cancel connection',()=>dialog.close()));form.append(heading);
 function field(labelText,id,value,readonly=false){const label=el('label',labelText),input=el('input');input.id=id;input.value=value;input.readOnly=readonly;label.htmlFor=id;form.append(label,input);return input;}
 field('Local record ID','connection-local-id',run.id,true);
 const title=field('Pipeline display name','connection-title',run.title);title.maxLength=160;title.required=true;
 const external=field('External pipeline ID','connection-external-id',run.externalId||'');external.maxLength=500;external.required=!!run.externalId;external.disabled=!!run.localOnly;
 form.append(el('p','Platform: '+run.platformName+' · Template: '+run.templateName,'hint'));
 const label=el('label','Local metadata (JSON)'),metadata=el('textarea');metadata.id='connection-metadata';metadata.rows=7;metadata.spellcheck=false;metadata.value=JSON.stringify(run.metadata||{},null,2);label.htmlFor=metadata.id;form.append(label,metadata);
 form.append(el('p',demoMode?'Demo-only connection. Saving does not trigger a run or contact a platform.':'Changed external IDs are verified with a status read before saving. Local metadata is not sent to the platform. Do not include credentials.','hint'));
 const error=el('p',undefined,'error');error.setAttribute('role','alert');const submit=el('button','Save connection');submit.type='submit';form.append(error,submit);dialog.append(form);
 form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{const body={id:run.id,title:title.value,metadata:JSON.parse(metadata.value)},externalId=external.value.trim();if(externalId!==(run.externalId||''))body.externalId=externalId;await action('update-run',body);dialog.close();message('Pipeline connection saved.');}catch(e){error.textContent=e instanceof SyntaxError?'Metadata must contain valid JSON.':e.message;}finally{submit.disabled=false;}};
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();external.focus();
}
function editAppearance(run){
 const dialog=el('dialog'),form=el('form');dialog.setAttribute('aria-label','Pipeline appearance');form.append(el('h2','Pipeline appearance'),el('p',run.title));
 const shapeLabel=el('label','Pipe shape'),shape=el('select');shape.id='pipe-shape';shapeLabel.htmlFor=shape.id;
 for(const [value,label] of [['standard','Original'],['orchestrator','Orchestrator'],['checkpoint','Checkpoint'],['quick','Quick']]){const option=el('option',label);option.value=value;shape.append(option);}shape.value=run.shape||'standard';
 let selectedColor=color(run).toLowerCase();
 const palette=el('fieldset',undefined,'pipe-color-palette'),legend=el('legend'),swatches=[];palette.append(legend);
 function selectColor(value){selectedColor=value;legend.textContent='Pipe color · '+(colorNames[botColors.indexOf(value)]||'Custom');for(const swatch of swatches)swatch.setAttribute('aria-pressed',String(swatch.dataset.color===value));}
 function addSwatch(value,name){const swatch=button('',()=>selectColor(value));swatch.title=name;swatch.setAttribute('aria-label',name);swatch.dataset.color=value;swatch.style.setProperty('--swatch',value);swatches.push(swatch);palette.append(swatch);}
 botColors.forEach((value,index)=>addSwatch(value,colorNames[index]));if(!botColors.includes(selectedColor))addSwatch(selectedColor,'Current custom color');selectColor(selectedColor);
 const error=el('p','','error'),save=el('button','Save appearance');save.type='submit';error.setAttribute('role','alert');const cancel=button('Cancel',()=>dialog.close());
 form.append(shapeLabel,shape,palette,el('p','Appearance only. This does not change execution or checkpoints.','hint'),error,save,cancel);
 form.onsubmit=async event=>{event.preventDefault();save.disabled=true;cancel.disabled=true;try{await action('set-appearance',{id:run.id,shape:shape.value,color:selectedColor});dialog.close();message('Pipeline appearance saved.');}catch(e){error.textContent=e.message;}finally{save.disabled=false;cancel.disabled=false;}};
 dialog.append(form);dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
function renderDetails(){
 const root=$('details'),run=snapshot.runs.find(r=>r.id===selected),focused=document.activeElement?.id;
 if(root.dataset.runId&&$('local-note'))noteDrafts.set(root.dataset.runId,$('local-note').value);
 $('pipeline-feed').hidden=!!run;$('desk-all').setAttribute('aria-pressed',String(!run));root.hidden=!run;if(!run){checkedSelection='';delete root.dataset.signature;return;}
 checkOnOpen(run);
 const signature=JSON.stringify([run,checkingId]);if(root.dataset.signature===signature)return;root.dataset.signature=signature;root.dataset.runId=run.id;const oldNote=noteDrafts.get(run.id)||'';root.replaceChildren();root.style.setProperty('--pipe',color(run));
 const head=el('div',undefined,'detail-head'),title=el('div');title.append(el('span',run.platformName+' / '+run.templateName,'detail-label'),el('h2',run.title));const close=button('×',()=>{selected='';if(detailMode){detailMode=false;document.body.classList.remove('detail-mode');}updateFragment();renderYard();renderDetails();});close.setAttribute('aria-label','Close details');head.append(title,close);root.append(head,el('p','Pipeline ID: '+(run.externalId||'Not connected'),'detail-id'));
 const state=el('div',undefined,'detail-status');state.append(el('strong',(symbols[run.status]||'')+' '+runLabel(run)));state.append(el('span',' · '+progressView(run).label));if(run.message)state.append(el('p',run.message));if(run.status!=='ready'&&(run.tracking==='paused'||run.tracking==='expired'))state.append(el('p',run.tracking==='paused'?'Local tracking paused. External work may continue.':'Monitoring budget elapsed. External work may continue.'));root.append(state);
 if(run.progressEstimate){const estimate=run.progressEstimate;root.append(el('p',(run.progressSource==='estimate'?'Estimated by ':'Saved estimate by ')+estimate.author+' · '+date(estimate.at)+' · '+estimate.percent+'%. '+estimate.reason+(run.progressSource==='estimate'?'':' Platform progress or confirmed completion takes priority.'),'hint'));}
 if(run.lastError)root.append(el('p','Last check issue: '+run.lastError+' Showing the last known workflow state.','warning'));
 const actions=el('div',undefined,'detail-actions');actions.append(button('Appearance',()=>editAppearance(run)));
 if(!detailMode&&!paired)actions.append(button('Pop out run',()=>{const url=new URL('/pipeyard/',location.origin);url.hash=new URLSearchParams({admin:token,run:run.id,...(demoMode?{demo:'1'}:{})});window.open(url.href,'pipeyard-'+run.id,'popup,width=760,height=850');}));
 const operate=(name,body={})=>void action(name,{id:run.id,...body}).catch(e=>message(e.message));
 if(run.source==='board'){if(!paired)actions.append(button('Open Board task',()=>openBoard(run)));root.append(el('p',run.description,'hint'));}
 else{
  if(!paired||demoMode)actions.append(button('Edit connection',()=>editConnection(run)));
  if(demoMode)actions.append(button('Delete demo pipe',async()=>{try{await action('delete-demo',{id:run.id});selected='';renderDetails();message('Demo pipe deleted. Reset restores the original examples.');}catch(error){message(error.message);}}));
  if(run.localOnly)actions.append(button('Connect to platform',()=>createDialog('connect-local',run.id)));
  if(demoMode&&run.status==='ready')actions.append(button('Start demo run',()=>operate('start-demo')));
  if(run.externalId){const check=button(checkingId===run.id?'Checking…':'Check now',()=>operate('refresh'));check.disabled=checkingId===run.id;actions.append(check);}
  if(!finished(run)&&run.externalId)actions.append(button(run.tracking==='active'?'Pause tracking':'Resume tracking',()=>run.tracking==='active'?operate('pause-tracking'):askAction('resume-tracking',run)));
  if(!paired&&run.status==='unresolved'&&!run.externalId)actions.append(button('Link existing run',()=>askAction('link',run)));
  for(const name of ['say','approve','pause','resume'])if((!paired||demoMode)&&run.capabilities?.includes(name)&&!finished(run)&&run.externalId&&(name!=='approve'||run.status==='awaiting-approval'))actions.append(button({say:'Message platform',approve:'Review approval',pause:'Pause workflow',resume:'Resume workflow'}[name],()=>askAction(name,run)));
  actions.append(button(run.archived?'Restore to yard':'Clear from yard',async()=>{try{await action(run.archived?'restore':'clear',{id:run.id});selected='';renderDetails();}catch(e){message(e.message);}}));
 }
 if(paired&&!demoMode)root.append(el('p','Use Pipeyard on the desktop panel for platform approvals, messages and launches.','hint'));root.append(actions);const meta=el('div',undefined,'detail-meta');for(const [label,value]of [['Last checked',date(run.lastCheckedAt)],['Monitoring until',run.deadline?date(run.deadline):'—'],['Next check',run.nextCheckAt?date(run.nextCheckAt):'Not scheduled'],['Approval cost',run.costUsd===null||run.costUsd===undefined?'Not reported':'$'+run.costUsd.toFixed(2)]]){const n=el('div',label);n.append(el('b',value));meta.append(n);}root.append(meta);
 if(run.description)root.append(el('p',run.description,'hint'));
 if(run.source!=='board')progressResponseSection(root,run);
 const connection=el('details');connection.append(el('summary','Connection & metadata'),el('p','Local record ID: '+run.id,'detail-id'),el('p','Platform: '+run.platformId+' · Template: '+run.templateId,'hint'));appendData(connection,run.metadata||{});root.append(connection);
 addSection(root,'Progress');if(Array.isArray(run.stages)&&run.stages.length){for(const stage of run.stages){const row=el('div',undefined,'stage');if(stage&&typeof stage==='object'){row.append(el('strong',stage.name||stage.title||stage.id||'Step'));if(stage.status)row.append(el('p',stage.status));if(stage.message)row.append(el('p',stage.message));if(stage.pushed===false)row.append(el('p','This step has not reported its result.','warning'));}else row.textContent=String(stage);root.append(row);}}else root.append(el('p','No stage details reported by the platform.','hint'));
 if(run.platformNotes&&(Array.isArray(run.platformNotes)?run.platformNotes.length:Object.keys(run.platformNotes).length)){addSection(root,'Platform notes');appendData(root,run.platformNotes);}
 if(run.source!=='board'){addSection(root,'Local journal');root.append(el('p','Your observations stay here. They are not sent to the platform.','hint'));for(const note of run.notes||[]){const n=el('article',undefined,'journal-entry');n.append(el('time',date(note.at)),el('p',note.text));root.append(n);}const form=el('form',undefined,'note-form'),label=el('label','Local run note'),input=el('textarea');input.id='local-note';input.rows=3;input.maxLength=4000;input.value=oldNote;label.htmlFor=input.id;const save=el('button','Save local note');save.type='submit';form.append(label,input,save);form.onsubmit=async e=>{e.preventDefault();try{save.disabled=true;await action('note',{id:run.id,text:input.value});noteDrafts.set(run.id,'');if($('details').dataset.runId===run.id&&$('local-note'))$('local-note').value='';message('Local note saved.');}catch(error){message(error.message);}finally{save.disabled=false;}};root.append(form);}
 const request=el('details');request.append(el('summary','Original request'));appendData(request,run.input);root.append(request);if(run.result!==null&&run.result!==undefined){addSection(root,'Result');appendData(root,run.result);}
 const events=el('details');events.append(el('summary','Run activity ('+(run.events||[]).length+')'));for(const event of [...(run.events||[])].reverse()){const n=el('article',undefined,'journal-entry');n.append(el('time',date(event.at)),el('p',event.message));events.append(n);}root.append(events);if(focused==='local-note')$('local-note').focus();
}
function addDemoPipeline(){
 const isDemo=demoMode,requestId=crypto.randomUUID();
 const dialog=el('dialog'),form=el('form'),heading=el('div',undefined,'dialog-heading');dialog.setAttribute('aria-label',isDemo?'Add demo pipeline':'Add local placeholder');heading.append(el('h2',isDemo?'Add demo pipeline':'Add local placeholder'),button('Cancel',()=>dialog.close()));
 const titleLabel=el('label','Pipeline name'),title=el('input');title.id='demo-pipeline-name';title.required=true;title.maxLength=160;titleLabel.htmlFor=title.id;titleLabel.append(title);
 const colorLabel=el('label','Pipe color'),select=el('select');select.id='demo-pipeline-color';colorLabel.htmlFor=select.id;
 for(const [value,name] of [['#b51f43','Crimson'],['#61b7ba','Teal'],['#89b9ed','Blue'],['#bba2e7','Lavender'],['#dfbd73','Gold'],['#8fae76','Sage']]){const option=el('option',name);option.value=value;select.append(option);}
 const error=el('p',undefined,'error');error.setAttribute('role','alert');const submit=el('button','Add to yard');submit.type='submit';
 form.append(heading,el('p',isDemo?'A local, untriggered demo pipe. Choose Start demo run later to simulate activity.':'A saved local placeholder. Connect it to an existing platform pipeline later.','hint'),titleLabel,colorLabel,select,el('p',isDemo?'Six visible slots. Clear or delete an example to make room.':'No platform connection or API call is needed.','hint'),error,submit);dialog.append(form);
 form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{const run=await action(isDemo?'create-demo':'create-local',{title:title.value,color:select.value,...(isDemo?{}:{requestId})});historyView=false;selected=run.id;document.dispatchEvent(new Event('pipeyard:select-pipeline'));$('search').value='';renderYard();renderDetails();dialog.close();message(isDemo?'Demo pipe added. No platform workflow was triggered.':'Local placeholder added. Connect it when ready.');}catch(e){error.textContent=e.message;}finally{submit.disabled=false;}};
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();title.focus();
}
function addYardPipeline(){
 const dialog=el('dialog');dialog.setAttribute('aria-label','Add pipeline');
 const head=el('div',undefined,'dialog-heading');head.append(el('h2','Add pipeline'),button('Cancel',()=>dialog.close()));dialog.append(head);
 const track=button('Track existing',()=>{dialog.close();createDialog('register');});track.disabled=demoMode;
 dialog.append(track,el('p',demoMode?'Switch to Live yard to track a real platform pipeline.':'Choose a template and verify the external pipeline ID. No new workflow is triggered.','hint'));
 dialog.append(button('Add local placeholder',()=>{dialog.close();addDemoPipeline();}),el('p',demoMode?'Add a sample pipe in this demo.':'Choose a name and color now; connect to a platform later.','hint'));
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
const addDemoButton=button('＋ Add demo pipeline',addDemoPipeline);addDemoButton.id='add-demo-pipeline';document.querySelector('.header-actions').append(addDemoButton);
function demoControls(){
 addDemoButton.hidden=!demoMode||visualYard;$('demo-banner').hidden=!demoMode;document.body.classList.toggle('demo-mode',demoMode);$('demo-toggle').setAttribute('aria-pressed',String(demoMode));$('demo-toggle').hidden=demoMode;$('demo-toggle').textContent=demoMode?'Live yard':'Demo mode';
 for(const id of ['configure','attach','launch'])$(id).hidden=demoMode||paired;document.querySelector('.yard-footer span:last-child').textContent=demoMode?'Simulation stays in this browser. No API or model calls.':'Checks run in the companion, without model calls.';
}
function demoEngine(){if(!demo){let storage=null;try{storage=localStorage;}catch{}demo=createPipeyardDemo({storage});}return demo;}
function clearDemoDrafts(){if($('details').dataset.runId?.startsWith('demo-')&&$('local-note'))$('local-note').value='';for(const k of noteDrafts.keys())if(k.startsWith('demo-'))noteDrafts.delete(k);}
async function switchDemo(enabled){
 if(busy){message('Wait for the current action before switching views.');return;}
 if(visualYard){if(yardController&&!(await yardController.flush())){message('Animal edits have not saved. Retry or reload animals before switching modes.');return;}if(enabled)demoEngine().reset();demoMode=enabled;selected='';detailMode=false;updateFragment();location.reload();return;}
 viewEpoch++;refreshing=false;demoMode=enabled;selected='';historyView=false;detailMode=false;pendingAction=null;
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 document.body.classList.remove('detail-mode');$('search').value='';message('');updateFragment();demoControls();
 if(enabled){clearDemoDrafts();snapshot=demoEngine().reset();}else snapshot={runs:[],templates:[]};
 resetFeed();renderYard();renderDetails();$('launch').disabled=true;$('attach').disabled=true;
 if(!enabled){$('connection').textContent='Connecting to live yard…';$('empty').querySelector('h2').textContent='Loading live yard…';}
 await refresh();
}

function resetDemo(){if(!demoMode||busy)return;selected='';historyView=false;detailMode=false;document.body.classList.remove('detail-mode');clearDemoDrafts();$('search').value='';snapshot=demoEngine().reset();resetFeed();updateFragment();renderYard();renderDetails();message('');}
async function refresh(){if(refreshing)return;refreshing=true;const epoch=viewEpoch;try{const next=demoMode?demoEngine().snapshot():await api('snapshot');if(epoch!==viewEpoch)return;snapshot=next;online=true;$('connection').textContent=demoMode?'Demo · sample progress, no platform calls':'Connected · updated '+new Date().toLocaleTimeString();renderYard();if(document.activeElement?.id!=='local-note')renderDetails();$('launch').disabled=!snapshot.templates.some(t=>t.canLaunch);$('attach').disabled=!snapshot.templates.length;}catch(e){if(epoch!==viewEpoch)return;online=false;renderFeed();$('connection').textContent='Offline · last known view';if(!snapshot.runs.length)$('empty').querySelector('h2').textContent='Live yard unavailable';message(e.message);}finally{if(epoch===viewEpoch)refreshing=false;}}
$('demo-toggle').onclick=()=>void switchDemo(!demoMode);$('demo-exit').onclick=()=>void switchDemo(false);$('demo-reset').onclick=resetDemo;

function templateChanged(){const t=snapshot.templates.find(t=>t.id===$('template').value);$('template-description').textContent=t?.description||'';$('run-input').value=JSON.stringify(t?.input||{},null,2);}
function createDialog(kind,localId=''){creating=kind;connectingLocal=localId;pendingRequest=crypto.randomUUID();$('create-title').textContent=kind==='launch'?'Launch pipeline':kind==='connect-local'?'Connect to platform':'Track existing run';$('create-submit').textContent=kind==='launch'?'Launch pipeline':'Verify & track';$('external-field').hidden=kind==='launch';$('external-id').required=kind!=='launch';$('input-field').hidden=kind!=='launch';$('run-title').closest('label').hidden=kind==='connect-local';$('create-hint').textContent=kind==='launch'?'This submits one request to the external platform.':'This checks an existing run ID. It does not start another workflow.';$('create-error').textContent='';$('run-title').value='';$('external-id').value='';$('template').replaceChildren();for(const t of snapshot.templates.filter(t=>kind!=='launch'||t.canLaunch)){const option=el('option',t.name);option.value=t.id;$('template').append(option);}templateChanged();$('create-submit').disabled=!$('template').options.length;if(!$('template').options.length)$('create-hint').textContent='First create a template: dock → Pipeyard → Full Pipeyard → Configure platforms. You can add a local placeholder now and connect it later.';$('create-dialog').showModal();}
$('launch').onclick=()=>createDialog('launch');$('attach').onclick=()=>createDialog('register');$('template').onchange=()=>{pendingRequest=crypto.randomUUID();templateChanged();};$('run-input').oninput=$('run-title').oninput=()=>pendingRequest=crypto.randomUUID();
$('create-form').onsubmit=async e=>{e.preventDefault();$('create-submit').disabled=true;try{const body={templateId:$('template').value,...($('run-title').value.trim()?{title:$('run-title').value.trim()}:{})};if(creating==='launch')Object.assign(body,{requestId:pendingRequest,input:JSON.parse($('run-input').value)});else body.externalId=$('external-id').value.trim();if(creating==='connect-local'){delete body.title;body.id=connectingLocal;}const run=await action(creating,body);selected=run.id;document.dispatchEvent(new Event('pipeyard:select-pipeline'));historyView=!!run.archived;$('create-dialog').close();renderYard();renderDetails();}catch(error){$('create-error').textContent=error.message;}finally{$('create-submit').disabled=false;}};
async function configLoad(){configuration=await api('config');$('config-json').value=JSON.stringify(configuration.config,null,2);$('config-path').textContent='Local configuration: '+configuration.configPath;}
$('configure').onclick=async()=>{try{await configLoad();$('config-error').textContent='';$('config-dialog').showModal();}catch(e){message(e.message);}};
$('example').onclick=()=>{$('config-json').value=JSON.stringify(configuration.example,null,2);$('credential-platform').value='example';};
$('reload-config').onclick=async()=>{try{await api('config',{reload:true});await configLoad();await refresh();$('config-error').textContent='Reloaded from disk.';}catch(e){$('config-error').textContent=e.message;}};
$('set-credential').onclick=()=>{try{const c=JSON.parse($('config-json').value),p=c.platforms.find(p=>p.id===$('credential-platform').value.trim());if(!p)throw Error('Enter an existing platform ID.');const kind=$('credential-kind').value,reference=$('credential-reference').value.trim();p.credential=kind==='none'?{}:{[kind]:reference};$('config-json').value=JSON.stringify(c,null,2);$('config-error').textContent='Reference added. Validate & save to apply.';}catch(e){$('config-error').textContent=e.message;}};
$('save-config').onclick=async()=>{const save=$('save-config');save.disabled=true;try{await api('config',JSON.parse($('config-json').value));await refresh();$('config-dialog').close();message('Platform configuration saved. Existing runs keep their original adapter.');}catch(e){$('config-error').textContent=e.message;}finally{save.disabled=false;}};
function askAction(name,run){pendingAction={name,run};const titles={say:'Message the platform',approve:'Approve the waiting step',pause:'Pause the external workflow',resume:'Resume the external workflow',link:'Link an existing run','resume-tracking':'Resume local tracking'};$('action-title').textContent=titles[name];$('action-text-label').hidden=!['say','link'].includes(name);$('action-text-label').firstChild.textContent=name==='link'?'External run ID':'Message';$('action-minutes-label').hidden=name!=='resume-tracking';$('action-text').value='';$('action-error').textContent='';$('action-explanation').textContent=name==='approve'?'This authorizes an external step. Reported cost: '+(run.costUsd===null?'not reported':('$'+run.costUsd.toFixed(2)))+'.':name==='link'?'Verify the ID on the platform before linking. This never submits a new workflow.':name==='resume-tracking'?'Resume checks on the same run. This does not resume a paused external workflow.':'This sends a request to the external platform.';if(demoMode)$('action-explanation').textContent='Demo only: this interaction is simulated locally. No external request or charge. '+(name==='approve'?'Simulated cost: $'+run.costUsd.toFixed(2)+'.':'');$('action-dialog').showModal();}
$('action-form').onsubmit=async e=>{e.preventDefault();$('confirm-action').disabled=true;try{const {name,run}=pendingAction,body={id:run.id};if(name==='say')body.message=$('action-text').value;if(name==='link')body.externalId=$('action-text').value.trim();if(name==='resume-tracking')body.minutes=Number($('action-minutes').value);if(name==='approve')Object.assign(body,{confirmed:true,expectedCostUsd:run.costUsd});await action(name,body);$('action-dialog').close();}catch(error){$('action-error').textContent=error.message;}finally{$('confirm-action').disabled=false;}};
for(const close of document.querySelectorAll('[data-close]'))close.onclick=()=>$(close.dataset.close).close();
$('active-view').onclick=()=>{historyView=false;selected='';renderYard();renderDetails();};$('history-view').onclick=()=>{historyView=true;selected='';renderYard();renderDetails();};$('search').oninput=renderYard;
if(visualYard){
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/setup/pipeyard-ranch.css';document.head.append(sheet);
 const {mountYard}=await import('./pipeyard-ranch.mjs');
 const animalDemo=demoMode;let demoStorage=null;try{demoStorage=localStorage;}catch{}
 const demoAnimals=animalDemo?createDemoCreatureStore({storage:demoStorage}):null;
 async function animals(body){
  if(demoAnimals)return body?demoAnimals.save(body):demoAnimals.read();
  const response=await fetch((paired?'/control/':'/admin/')+'pipeyard/creatures',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();if(!response.ok){const error=Error(value.error||'Animal storage unavailable.');error.status=response.status;throw error;}return value;
 }
 yardController=await mountYard({addPipeline:addYardPipeline,loadState:()=>animals(),saveState:animals,getScope:()=>demoMode?'demo':'live'});
}
demoControls();void refresh();setInterval(()=>{if(!document.hidden&&!document.querySelector('dialog[open]'))void refresh();},5000);
