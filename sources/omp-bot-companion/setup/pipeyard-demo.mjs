import {pipelineLinks} from './pipeline-links.mjs';
import {intervals,defaultIntervalMinutes} from './pipeyard-intervals.mjs';
// Browser-local simulation only. This module has no HTTP, credentials or companion dependencies.
const key='botRanch.pipeyard.demo.v1',copy=value=>JSON.parse(JSON.stringify(value));
// Demo animals never read or write the companion's live roster.
export function createDemoCreatureStore({storage=null,now=Date.now}={}){
 const storageKey='botRanch.pipeyard.demo.creatures.v1';let memory;
 function seed(){return {version:1,revision:0,editRevision:0,scope:'demo',updatedAt:now(),creatures:Array.from({length:13},(_,i)=>({id:'demo-animal-'+i,type:i<5?'cow':i<9?'chicken':'sheep',variant:i<5?i+1:1,name:(i<5?'Cow ':i<9?'Chicken ':'Sheep ')+(i<5?i+1:i<9?i-4:i-8),x:.12+(i%5)*.17,y:.2+Math.floor(i/5)*.25,fullness:25+(i*9)%55,eating:false})),hay:[{id:'hay-1',x:.84,y:.45},{id:'hay-2',x:.79,y:.76}]};}
 function read(){try{const value=JSON.parse(storage?.getItem(storageKey)||'null');if(value?.scope==='demo'&&value.version===1&&Number.isInteger(value.revision)&&Number.isInteger(value.editRevision)&&Array.isArray(value.creatures)&&value.creatures.length<=32&&Array.isArray(value.hay)&&value.hay.length===2)memory=value;}catch{}return copy(memory||=(seed()));}
 function save(input){const current=read();if(input.scope!=='demo')throw Error('Demo animal scope mismatch.');if(input.background&&input.revision!==current.revision)return current;if(!input.background&&input.revision!==current.revision&&input.editRevision!==current.editRevision){const error=Error('Animals changed in another window. Reload before saving.');error.status=409;throw error;}memory={...copy(input),revision:current.revision+1,editRevision:current.editRevision+(input.background?0:1),updatedAt:now()};delete memory.background;try{storage?.setItem(storageKey,JSON.stringify(memory));}catch{}return copy(memory);}
 return {read,save};
}
const terminal=run=>['succeeded','failed','cancelled'].includes(run.status);
const scenarios=[
 {id:'demo-research-north',shape:'standard',title:'Market scan · North district',templateId:'market-scan',templateName:'Market scan',color:'#61b7ba',status:'running',progress:32,message:'Comparing sources and checking the latest figures.',description:'Two runs of the same reusable research pipeline, each with its own inputs.',input:{district:'North',topic:'Market overview'},stageNames:['Gather sources','Cross-check findings','Write summary'],step:0},
 {id:'demo-research-south',shape:'orchestrator',title:'Market scan · South district',templateId:'market-scan',templateName:'Market scan',color:'#61b7ba',status:'running',progress:68,message:'Sources verified. Drafting the final summary.',description:'A second instance of Market scan. The matching color shows the shared template.',input:{district:'South',topic:'Market overview'},stageNames:['Gather sources','Cross-check findings','Write summary'],step:2},
 {id:'demo-media',shape:'quick',title:'Product teaser',templateId:'media-build',templateName:'Media build',color:'#bba2e7',status:'running',progress:18,message:'Preparing scenes for the first render.',description:'A different workflow running alongside the two research requests.',input:{format:'Short video',durationSeconds:20},stageNames:['Prepare scenes','Render preview','Package media'],step:0},
 {id:'demo-complete',shape:'quick',title:'Weekly summary',templateId:'report-export',templateName:'Report export',color:'#dfbd73',status:'succeeded',progress:100,message:'Report finished. Ready to review or clear to history.',description:'A completed run keeps its results and local journal after clearing.',input:{period:'This week',format:'PDF'},stageNames:['Collect metrics','Build report','Export result'],step:3,result:{summary:'Demo report ready: 18 items reviewed, 3 findings summarized.',artifact:'weekly-summary-demo.pdf',demo:true}},
 {id:'demo-approval',shape:'checkpoint',title:'Campaign release',templateId:'release-gate',templateName:'Release gate',color:'#ed8fa8',status:'awaiting-approval',progress:60,message:'Your approval is needed before the final publishing step.',description:'Try the approval flow. The displayed cost is simulated and no money is spent.',input:{campaign:'Spring preview',destination:'Demo channel'},stageNames:['Prepare package','Review content','Approve release','Publish'],step:2,costUsd:2.4},
 {id:'demo-ready',shape:'standard',title:'New campaign brief',templateId:'brief-builder',templateName:'Brief builder',color:'#89b9ed',status:'ready',progress:0,message:'Ready when you are. Open this pipe and start the demo run.',description:'An example you can initiate yourself. Starting it simulates submission and progress.',input:{audience:'New customers',goal:'Create a campaign brief'},stageNames:['Accept request','Outline brief','Write recommendations'],step:0}
];
export function createPipeyardDemo({now=Date.now,storage=null}={}){
 let state;
 function seed(){const at=now();const active=scenarios.map((scenario,i)=>{
  const {stageNames,step,...base}=scenario;
  return {...copy(base),intervalMinutes:defaultIntervalMinutes,source:'demo',platformId:'demo',platformName:'Demo platform',externalId:base.status==='ready'?'':'sample-'+(i+1),input:copy(base.input),result:base.result||null,costUsd:base.costUsd??null,tracking:base.status==='succeeded'?'finished':base.status==='ready'?'paused':'active',capabilities:base.status==='awaiting-approval'?['say','approve']:['say','pause','resume'],stages:stageNames.map((name,index)=>({name,status:base.status==='succeeded'||index<step?'done':index===step&&base.status!=='ready'?(base.status==='awaiting-approval'?'waiting':'running'):'pending'})),platformNotes:base.status==='awaiting-approval'?[{text:'Content checks passed. A person must approve the release.'}]:[],notes:[],events:[{id:'seed-'+i,at:at-60000*(i+1),kind:base.status==='awaiting-approval'?'attention':base.status==='succeeded'?'complete':'progress',message:base.message}],createdAt:at-i,updatedAt:at,lastCheckedAt:base.status==='ready'?null:at,nextCheckAt:base.status==='running'?at+defaultIntervalMinutes*60000:null,deadline:base.status==='ready'?null:at+3600000,archived:false,lastError:'',simulatedAt:at};
 });return {version:1,historySeedVersion:1,seededAt:at,runs:[...active,...historySamples(active,at)]};}
 function historySamples(active,at){
  const statuses=['succeeded','succeeded','failed','cancelled','paused','succeeded','awaiting-approval','running'];
  return Array.from({length:40},(_,i)=>{
   const status=statuses[i%statuses.length],base=copy(status==='awaiting-approval'?active.find(run=>run.status==='awaiting-approval'):active[i%active.length]),stamp=Math.max(1,at-(i+1)*3600000),number=String(i+1).padStart(2,'0');
   const message={succeeded:'Finished successfully. Results saved for review.',failed:'Validation failed; the sample inputs need attention.',cancelled:'Stopped before the final step.',paused:'Paused at a checkpoint; cleared from the active yard.','awaiting-approval':'Waiting for a decision; saved here for later review.',running:'Cleared locally while the sample workflow was in progress.'}[status];
   return {...base,id:'demo-history-'+number,title:base.templateName+' · Sample '+number,externalId:'sample-history-'+number,status,progress:status==='succeeded'?100:20+(i*13)%70,message,archived:true,tracking:['succeeded','failed','cancelled'].includes(status)?'finished':'paused',createdAt:Math.max(0,stamp-1800000),updatedAt:stamp,lastCheckedAt:stamp,nextCheckAt:null,deadline:stamp,simulatedAt:stamp,...(['succeeded','failed','cancelled'].includes(status)?{finishedAt:stamp}:{}),capabilities:status==='awaiting-approval'?['say','approve']:['say','pause','resume'],costUsd:status==='awaiting-approval'?2.4:null,stages:base.stages.map((stage,index)=>({...stage,status:status==='succeeded'?'done':index===0?'done':index===1?status==='failed'?'failed':'waiting':'pending'})),platformNotes:[],notes:[{id:'history-note-'+number,at:stamp,text:'Sample review: '+message}],events:[{id:'history-event-'+number,at:stamp-1,kind:status==='succeeded'?'complete':'tracking',message},{id:'history-archive-'+number,at:stamp,kind:'archive',message:'Cleared from the demo yard; saved in History.'}],result:status==='succeeded'?{demo:true,summary:'Sample '+base.templateName+' results are ready.',itemsReviewed:12+i}:null};
  });
 }
 function save(){try{storage?.setItem(key,JSON.stringify(state));}catch{/* Demo remains usable in memory when browser storage is unavailable. */}}
 function read(){try{const value=JSON.parse(storage?.getItem(key)||'null');if(value?.version===1&&Array.isArray(value.runs)&&value.runs.length<=50&&new Set(value.runs.map(r=>r?.id)).size===value.runs.length&&value.runs.every(r=>/^demo-[a-z0-9-]+$/.test(r?.id||'')&&r.source==='demo'&&typeof r.title==='string'&&typeof r.simulatedAt==='number'&&Array.isArray(r.notes)&&Array.isArray(r.events)&&Array.isArray(r.stages)&&Array.isArray(r.capabilities)))state=value;}catch{}if(!state){state=seed();save();}else if(state.historySeedVersion!==1){
  const samples=seed().runs.filter(run=>run.archived&&!state.runs.some(saved=>saved.id===run.id));state.runs.push(...samples.slice(0,Math.max(0,50-state.runs.length)));state.historySeedVersion=1;save();
 }}
 function event(run,message,kind='progress'){run.events.push({id:'event-'+now()+'-'+run.events.length,at:now(),kind,message});run.events=run.events.slice(-50);run.updatedAt=now();}
 function advance(){const at=now();let changed=false;for(const run of state.runs){if(run.status!=='running'||run.tracking!=='active'||run.archived)continue;const steps=Math.floor((at-run.simulatedAt)/5000);if(steps<1)continue;changed=true;run.simulatedAt=at;run.lastCheckedAt=at;run.progress=Math.min(100,run.progress+steps*6);run.nextCheckAt=at+(run.intervalMinutes??defaultIntervalMinutes)*60000;const previousStage=run.stages.findIndex(s=>s.status==='running');const stage=Math.min(run.stages.length-1,Math.floor(run.progress/100*run.stages.length));run.stages.forEach((s,i)=>s.status=run.progress===100||i<stage?'done':i===stage?'running':'pending');if(run.progress===100){run.status='succeeded';run.tracking='finished';run.nextCheckAt=null;run.finishedAt=at;run.message='Demo run completed. Results are ready to review.';run.result={summary:'Simulated '+run.templateName+' completed successfully.',demo:true};event(run,run.message,'complete');}else{const message='Demo: '+run.stages[stage].name.toLowerCase()+' ('+run.progress+'%).';if(run.message!==message){run.message=message;run.updatedAt=at;if(stage!==previousStage)event(run,'Reached '+run.stages[stage].name.toLowerCase()+'.');}}}if(changed)save();}
 function saveResponse(run){
  if(!run.externalId)return;
  const data={id:run.externalId,status:run.status,progress:run.progress,stages:copy(run.stages),notes:copy(run.platformNotes),result:copy(run.result),details:{demo:true,message:run.message}};
  if(run.progressResponse&&JSON.stringify(run.progressResponse.data)===JSON.stringify(data)){run.progressResponse.fetchedAt=run.lastCheckedAt||now();return;}
  run.progressResponse={mode:'raw',id:'demo-response-'+now()+'-'+Math.random().toString(36).slice(2),source:'progress',fetchedAt:run.lastCheckedAt||now(),data,review:null};
 }
 function due(run){return !!(run.externalId&&!run.archived&&!terminal(run)&&run.tracking==='active'&&now()<run.deadline&&now()>=(run.nextCheckAt||0));}
 function snapshot(){read();advance();for(const run of state.runs){if(!run.progressResponse||run.lastCheckedAt>run.progressResponse.fetchedAt)saveResponse(run);run.intervalMinutes??=defaultIntervalMinutes;run.responses={status:null,progress:run.progressResponse||null};run.responseVisibility={status:'raw',progress:'raw'};run.checkDue=due(run);}save();return {version:1,demo:true,limits:{demo:{visibleRuns:8,savedRuns:50}},usage:{visibleRuns:state.runs.filter(r=>!r.archived).length,savedRuns:state.runs.length},templates:[],platforms:[{id:'demo',name:'Demo platform'}],runs:copy(state.runs),at:now()};}
 function execute(action,body={}){
  read();advance();if(!['set-check-interval','set-appearance','update-run','create-demo','delete-demo','start-demo','approve','refresh','check-due','review-progress','pause-tracking','resume-tracking','pause','resume','note','say','clear','restore'].includes(action))throw Error('Unsupported demo action.');
  if(action==='create-demo'){
   if(typeof body.title!=='string'||!body.title.trim()||body.title.length>160)throw Error('Enter a pipeline title (up to 160 characters).');
   if(!/^#[a-f0-9]{6}$/i.test(body.color||''))throw Error('Choose a valid pipeline color.');
   if(state.runs.filter(r=>!r.archived).length>=8)throw Error('All eight slots are occupied. Clear or delete a demo pipe first.');
   if(state.runs.length>=50)throw Error('Delete a saved demo pipe before adding another.');
   const run={...seed().runs.find(r=>r.status==='ready'),id:'demo-manual-'+crypto.randomUUID(),title:body.title.trim(),color:body.color,templateId:'manual-preview',templateName:'Manual preview',description:'A local visual placeholder. Nothing has been triggered on a platform.',input:{},message:'Not triggered. Ready for a demo run when you choose.',events:[],createdAt:now(),updatedAt:now()};
   state.runs.push(run);event(run,'Added locally for preview. No external workflow was triggered.');save();return copy(run);
  }
  const run=state.runs.find(r=>r.id===body.id);if(!run)throw Error('Unknown demo run.');
  if(action==='set-check-interval'){
   if(!intervals.includes(body.intervalMinutes)||Object.keys(body).some(k=>!['id','intervalMinutes'].includes(k)))throw Error('Invalid check interval.');
   run.intervalMinutes=body.intervalMinutes;run.updatedAt=now();
   const candidate=Math.max(now(),(run.lastCheckedAt??now())+run.intervalMinutes*60000,run.retryAt||0);
   run.nextCheckAt=run.tracking==='active'&&!run.archived&&!terminal(run)&&run.externalId&&now()<run.deadline&&candidate<run.deadline?candidate:null;
   save();return copy(run);
  }
  if(action==='set-appearance'){if(!['color','shape'].some(k=>Object.hasOwn(body,k))||Object.keys(body).some(k=>!['id','color','shape'].includes(k)))throw Error('Use a color or shape.');if(body.color!==undefined&&!/^#[a-f0-9]{6}$/i.test(body.color))throw Error('Invalid pipe color.');if(body.shape!==undefined&&!['standard','orchestrator','checkpoint','quick'].includes(body.shape))throw Error('Invalid pipe shape.');if(body.color!==undefined)run.color=body.color;if(body.shape!==undefined)run.shape=body.shape;save();return copy(run);}
  if(action==='update-run'){
   const links=pipelineLinks(body);
   if(body.title!==undefined&&(typeof body.title!=='string'||!body.title.trim()||body.title.length>160))throw Error('Enter a pipeline title up to 160 characters.');
   if(body.externalId!==undefined&&(typeof body.externalId!=='string'||!body.externalId.trim()||body.externalId.length>500))throw Error('Enter an external pipeline ID up to 500 characters.');
   if(body.externalId&&state.runs.some(r=>r!==run&&r.externalId===body.externalId))throw Error('That external pipeline ID is already used in this demo.');
   if(body.metadata!==undefined&&(!body.metadata||typeof body.metadata!=='object'||Array.isArray(body.metadata)||JSON.stringify(body.metadata).length>32768))throw Error('Metadata must be a JSON object under 32768 characters.');
   if(body.externalId!==undefined&&body.externalId!==run.externalId){run.externalId=body.externalId;run.progressResponse=null;}
   if(body.title!==undefined)run.title=body.title.trim();if(body.metadata!==undefined)run.metadata=copy(body.metadata);
   Object.assign(run,links);event(run,'Local demo connection updated; no platform was contacted.');save();return copy(run);
  }
  if(action==='delete-demo'){state.runs=state.runs.filter(r=>r.id!==run.id);save();return {id:run.id,deleted:true};}
  if(action==='start-demo'){if(run.status!=='ready')throw Error('This demo run has already started.');run.status='running';run.tracking='active';run.externalId=run.externalId||'sample-'+run.id;run.progress=4;run.deadline=now()+3600000;run.simulatedAt=now();run.lastCheckedAt=now();run.nextCheckAt=now()+(run.intervalMinutes??defaultIntervalMinutes)*60000;run.stages[0].status='running';run.message='Demo request accepted. Building your campaign brief.';event(run,run.message);}
  else if(action==='approve'){if(body.confirmed!==true||run.status!=='awaiting-approval'||body.expectedCostUsd!==run.costUsd)throw Error('Confirm the simulated approval and displayed cost.');run.status='running';run.tracking='active';run.simulatedAt=now();run.message='Demo approval accepted. Preparing the final release; no charge was made.';run.stages[2].status='done';run.stages[3].status='running';run.progress=78;event(run,run.message);}
  else if(action==='note'||action==='say'){const value=body[action==='note'?'text':'message'];if(typeof value!=='string'||!value.trim()||value.length>4000)throw Error('Enter a short demo note or message.');if(action==='note')run.notes.push({id:'note-'+now()+'-'+run.notes.length,at:now(),text:value});else run.platformNotes.push({text:'Demo message: '+value});event(run,action==='note'?'Local demo note added.':'Message simulated locally; nothing was sent.');}
  else if(action==='clear'){run.archived=true;event(run,'Moved to demo history.');}
  else if(action==='restore'){if(run.archived&&state.runs.filter(r=>!r.archived).length>=8)throw Error('All eight slots are occupied. Clear or delete a demo pipe first.');run.archived=false;event(run,'Restored to the demo yard.');}
  else if(action==='pause'||action==='resume'){if(!['running','paused'].includes(run.status))throw Error('This demo workflow cannot be paused or resumed now.');run.status=action==='pause'?'paused':'running';run.simulatedAt=now();run.message=action==='pause'?'Demo workflow paused.':'Demo workflow resumed.';event(run,run.message);}
  else if(action==='pause-tracking'||action==='resume-tracking'){if(terminal(run)||run.status==='ready')throw Error('Start an active demo run before changing tracking.');run.tracking=action==='pause-tracking'?'paused':'active';run.simulatedAt=now();run.nextCheckAt=run.tracking==='active'?now()+(run.intervalMinutes??defaultIntervalMinutes)*60000:null;event(run,action==='pause-tracking'?'Demo tracking paused.':'Demo tracking resumed.');}
  else if(action==='refresh'||action==='check-due'){
   if(!run.externalId)throw Error('Start the demo run before checking.');
   if(action==='check-due'&&!due(run))return copy(run);
   run.lastCheckedAt=now();if(run.tracking==='active'&&!terminal(run))run.nextCheckAt=now()+(run.intervalMinutes??defaultIntervalMinutes)*60000;
   saveResponse(run);event(run,'Demo progress checked locally.');
  }
  else if(action==='review-progress'){
   if(!run.progressResponse||body.responseId!==run.progressResponse.id)throw Error('Progress response changed. Read it again.');
   if(typeof body.author!=='string'||!body.author.trim()||body.author.length>160||typeof body.summary!=='string'||!body.summary.trim()||body.summary.length>4000)throw Error('Enter author and review summary.');
   run.progressResponse.review={author:body.author,summary:body.summary,at:now()};run.notes.push({id:'review-'+now(),at:now(),responseId:body.responseId,text:body.author+': '+body.summary});
  }
  run.updatedAt=now();save();return copy(run);
 }
 function reset(){state=seed();save();return snapshot();}
 read();return {snapshot,execute,reset};
}
