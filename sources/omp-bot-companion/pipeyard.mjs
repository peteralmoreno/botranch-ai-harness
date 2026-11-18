import {effectiveAdapter,configurationView,settingsPreview,targetSettings,endpointDiagnostics,progressFreshness,summarize} from './pipeyard-settings.mjs';
import {pipelineLinks,visiblePipelineLinks} from './setup/pipeline-links.mjs';
import {resolveResponseConfig,projectResponse} from './pipeyard-responses.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validateConfig,callPlatform,extractObservation,secretFor,safe,text,terminal,budgets,intervals} from './pipeyard-adapter.mjs';
import {validateAction,pipeyardLimits,limitError} from './pipeyard-catalog.mjs';

const copy=v=>JSON.parse(JSON.stringify(v));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const fingerprint=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export const exampleConfig={version:1,platforms:[{id:'example',name:'Example platform',baseUrl:'https://workflows.example.com',credential:{env:'PIPEYARD_API_TOKEN'},operations:{trigger:{method:'POST',path:'/runs',body:{input:'{{input}}'}},status:{method:'GET',path:'/runs/{runId}'},progress:{method:'GET',path:'/runs/{runId}/progress'},say:{method:'POST',path:'/runs/{runId}/messages',body:{text:'{{message}}'}}},fields:{id:'id',status:'status',message:'message',progress:'progress',stages:'stages',notes:'notes',result:'result',cost:null},statuses:{completed:'succeeded',waiting_for_approval:'awaiting-approval'}}],templates:[{id:'example-report',name:'Example report',platformId:'example',description:'Replace this example with your platform contract before launching.',color:'#61b7ba',input:{topic:''},intervalMinutes:1,waitMinutes:60}]};

export class Pipeyard {
 constructor({root,now=Date.now,fetchImpl=fetch,env=process.env}) {
  this.knownSecrets=new Set();this.root=root;this.now=now;this.fetchImpl=fetchImpl;this.env=env;this.locks=new Set();this.registerLocks=new Set();this.requestLocks=new Set();this.ticking=false;
  fs.mkdirSync(root,{recursive:true});this.configFile=path.join(root,'config.json');this.stateFile=path.join(root,'runs.json');
  this.config=fs.existsSync(this.configFile)?this.loadConfig():{version:1,platforms:[],templates:[]};
  const state=fs.existsSync(this.stateFile)?JSON.parse(fs.readFileSync(this.stateFile,'utf8')):{version:1,runs:[]};if(state.version!==1||!Array.isArray(state.runs))throw Error('Unsupported Pipeyard state.');
  this.runs=state.runs;this.rememberSecrets();this.boardAppearances=state.boardAppearances||{};this.deletedRuns=state.deletedRuns||[];
  let migrated=state.responseSchema!==1;
  for(const run of this.runs){
   run.responses??={};run.responseAttempts??={};run.intervalMinutes??=5;
   if(run.progressResponse){const old=run.progressResponse;if(['status','progress'].includes(old.source)&&!run.responses[old.source])run.responses[old.source]=old;delete run.progressResponse;migrated=true;}
  }
  if(migrated&&fs.existsSync(this.stateFile)){const backup=this.stateFile+'.pre-responses-v1.bak';if(!fs.existsSync(backup))fs.copyFileSync(this.stateFile,backup,fs.constants.COPYFILE_EXCL);this.persist();}
  // A process may stop after a remote POST but before receiving its response. Never resubmit it.
  for(const run of this.runs)if(run.status==='submitting'){run.status='unresolved';run.tracking='paused';run.message='Submission was interrupted. Verify the platform and link the existing run.';}
 }
 write(file,value){fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);}
 persist(){this.write(this.stateFile,{version:1,responseSchema:1,runs:this.runs,boardAppearances:this.boardAppearances,deletedRuns:this.deletedRuns});}
 configure(input){const config=validateConfig(input);this.write(this.configFile,config);this.config=config;this.rememberSecrets();return this.configuration();}
 preview(body){
  if(!body||Object.keys(body).some(k=>!['config','templateId','source','sample'].includes(k))||!['status','progress'].includes(body.source))throw Error('Invalid response preview.');
  const config=validateConfig(body.config),template=config.templates.find(t=>t.id===body.templateId);if(!template)throw Error('Choose a template to preview.');
  const platform=config.platforms.find(p=>p.id===template.platformId),rules=resolveResponseConfig(platform,template);let secret='';try{secret=secretFor(platform,this.env);}catch{}
  const adapter=effectiveAdapter(platform,template),clean=safe(body.sample??null,[secret]),result=extractObservation(adapter,body.source,clean),run={adapter,status:result.status,...result};
  const rule=rules[body.source],visible=rule.desk.mode==='raw',selected=key=>visible||rule.desk.mode==='custom'&&rule.desk.fields.some(f=>f.path===rule.mappings[key]),summary=summarize(run,{stageName:selected('stageName')?result.stageName:'',stagePosition:visible?result.stagePosition:null,displayProgress:result.progress,progressSource:'platform'});
  return safe({...projectResponse({id:'preview',source:body.source,fetchedAt:this.now(),data:clean,review:null},rules[body.source].desk),summary,diagnostics:result.diagnostics},[secret]);
 }
 async testConnection(body){
  if(!body||Object.keys(body).some(k=>!['config','templateId','externalId'].includes(k))||typeof body.externalId!=='string'||!body.externalId.trim()||body.externalId.length>500)throw Error('Provide a template and external ID for the read-only connection test.');
  const config=validateConfig(body.config),template=config.templates.find(t=>t.id===body.templateId);if(!template)throw Error('Choose a template to test.');
  const platform=config.platforms.find(p=>p.id===template.platformId),adapter=effectiveAdapter(platform,template),secret=secretFor(adapter,this.env);if(safe(body.externalId,[secret])!==body.externalId)throw Error('Invalid external ID.');
  const run={id:'connection-test',adapter,externalId:body.externalId,templateId:template.id,platformId:platform.id,input:{},status:'unknown',tracking:'paused',intervalMinutes:template.intervalMinutes,waitMinutes:template.waitMinutes,responses:{},responseAttempts:{},events:[],notes:[]};
  let retryAt=null;
  for(const source of ['status','progress']){
   if(source==='progress'&&(!adapter.operations.progress||!adapter.monitoring.progress))continue;
   if(retryAt>this.now()){run.endpointSkipped={progress:'Waiting for the platform retry boundary.'};break;}
   try{const result=await this.call(run,source);retryAt=result.retryAt;if(source==='status')this.observation(run,result);else this.observation(run,{...result,status:run.status,costUsd:run.costUsd});}catch(error){retryAt=error.retryAt??null;}
  }
  const view=this.publicRun(run);return Object.fromEntries(['responses','summary','endpointDiagnostics','progressFreshness','status','progress','stagePosition','stageName'].map(k=>[k,view[k]]));
 }
 previewSettings(run){const preview=this.publicSettings(settingsPreview(run,this.config));if(this.locks.has(run.id))return {...preview,canApply:false,reason:'Run is busy; retry after the current check.'};return preview;}
 applySettings(run,body){
  const preview=settingsPreview(run,this.config);
  if(body.expectedRevision!==preview.currentRevision||body.targetRevision!==preview.targetRevision)throw Object.assign(Error('Settings changed. Preview the latest settings again.'),{status:409,code:'PIPEYARD_SETTINGS_CHANGED'});
  if(!preview.canApply)throw Error(preview.reason);
  const previous=copy(run),target=targetSettings(run,this.config),oldRules=resolveResponseConfig(run.adapter),newRules=resolveResponseConfig(target.adapter);
  try{
   run.valueVisibility??={};for(const key of ['message','progress','stagePosition','stageName','stages','platformNotes','result'])run.valueVisibility[key]??=copy(oldRules[run.provenance?.[key]||'status'].desk);
   if(Object.values(oldRules).some(r=>r.desk.mode!=='raw'))for(const event of run.events||[])event.private=true;
   // Only read operations are adopted. Credentials, mutation operations and identity stay pinned.
   const operations={...run.adapter.operations};for(const source of ['status','progress']){if(target.adapter.operations[source])operations[source]=copy(target.adapter.operations[source]);else delete operations[source];}
   run.adapter={...run.adapter,operations,responses:newRules,fields:copy(target.adapter.fields),statuses:copy(target.adapter.statuses),monitoring:copy(target.adapter.monitoring),summary:copy(target.adapter.summary)};
   run.intervalMinutes=target.intervalMinutes;run.waitMinutes=target.waitMinutes;
   for(const source of ['status','progress']){
    const invalid=fingerprint(oldRules[source])!==fingerprint(newRules[source])||fingerprint(previous.adapter.operations[source]||null)!==fingerprint(operations[source]||null)||source==='progress'&&!run.adapter.monitoring.progress;
    if(!invalid)continue;
    const record=run.responses?.[source],endpointChanged=fingerprint(previous.adapter.operations[source]||null)!==fingerprint(operations[source]||null),visibilityWidened=oldRules[source].desk.mode!=='raw'&&fingerprint(oldRules[source].desk)!==fingerprint(newRules[source].desk);
    if(record){if(record.review&&oldRules[source].desk.mode!=='raw')record.review.private=true;record.settingsChanged=true;if(endpointChanged||visibilityWidened)record.projectionBlocked=true;}
    const disabled=source==='progress'&&!run.adapter.monitoring.progress;
    const mappingChanged=fingerprint({mappings:oldRules[source].mappings,scale:oldRules[source].progressScale})!==fingerprint({mappings:newRules[source].mappings,scale:newRules[source].progressScale});
    if(record&&!endpointChanged&&!disabled&&mappingChanged){const extracted=extractObservation(run.adapter,source,record.data);for(const key of ['message','progress','stagePosition','stageName','stages','platformNotes','result'])if(((run.provenance?.[key]||'status')===source||source==='progress')&&extracted[key]!==null&&extracted[key]!==undefined&&extracted[key]!==''&&(!Array.isArray(extracted[key])||extracted[key].length)){run[key]=extracted[key];run.provenance??={};run.provenance[key]=source;run.observedAt??={};run.observedAt[key]=record.fetchedAt;} }
   }
   run.nextCheckAt=run.externalId&&!run.archived&&!terminal(run.status)&&run.tracking==='active'&&this.now()<run.deadline?Math.max(this.now(),(run.lastCheckedAt??this.now())+run.intervalMinutes*60000,run.retryAt??0):null;
   this.entry(run,'settings','Updated local monitoring and display settings.');this.persist();return this.publicRun(run);
  }catch(error){for(const key of Object.keys(run))delete run[key];Object.assign(run,previous);throw error;}
 }
 rememberSecrets(){for(const adapter of [...this.config.platforms,...(this.runs||[]).map(r=>r.adapter).filter(Boolean)]){try{const value=secretFor(adapter,this.env);if(value)this.knownSecrets.add(value);}catch{}}}
 publicSettings(value){const secrets=[...this.knownSecrets,...this.config.platforms.map(p=>p.credential?.env?this.env[p.credential.env]:'').filter(Boolean)];return safe(value,secrets);}
 configuration(){return {config:copy(this.config),configPath:this.configFile,example:copy(exampleConfig)};}
 loadConfig(){const input=JSON.parse(fs.readFileSync(this.configFile,'utf8'));for(const t of input.templates||[])t.intervalMinutes??=5;return validateConfig(input);}
 reload(){if(this.busy)throw Error('Pipeyard is busy.');this.config=this.loadConfig();this.rememberSecrets();return this.configuration();}
 get busy(){return !!(this.locks.size||this.registerLocks.size||this.requestLocks.size||this.ticking);}
 publicRun(run){
  const adapter=run.adapter,monitoring=effectiveAdapter(adapter||{}).monitoring,rules=resolveResponseConfig(adapter||{}),responses=this.publicSettings(Object.fromEntries(['status','progress'].map(source=>[source,projectResponse(run.responses?.[source]?.projectionBlocked?null:run.responses?.[source],rules[source].desk)])));
  const allRaw=Object.values(rules).every(rule=>rule.desk.mode==='raw');
  const data={};for(const key of ['id','localOnly','title','description','templateId','templateName','platformId','platformName','externalId','requestId','taskId','status','tracking','color','archived','createdAt','updatedAt','deadline','nextCheckAt','lastCheckedAt','lastError','retryAt','intervalMinutes','waitMinutes','finishedAt','failures','stagePositionDiagnostic','input','connectionHistory'])if(run[key]!==undefined)data[key]=copy(run[key]);
  const enabled=key=>run.provenance?.[key]!=='progress'||monitoring.progress;
  const visible=key=>enabled(key)&&(!run.valueVisibility?.[key]||run.valueVisibility[key].mode==='raw')&&!run.responses?.[run.provenance?.[key]||'status']?.projectionBlocked&&rules[run.provenance?.[key]||'status']?.desk.mode==='raw'&&(run.provenance?.[key]||allRaw);
  for(const key of ['message','stages','platformNotes','result'])data[key]=visible(key)?copy(run[key]??null):key==='message'?'Workflow '+run.status+'.':null;
  const position=enabled('stagePosition')&&run.stagePosition?{...run.stagePosition,stage:visible('stagePosition')?run.stagePosition.stage:''}:null;
  const platformProgress=enabled('progress')&&typeof run.progress==='number'&&Number.isFinite(run.progress)?run.progress:null;
  const estimate=run.progressEstimate||null;
  const progressSource=run.status==='succeeded'?'completed':platformProgress!==null?'platform':estimate?'estimate':'unknown';
  const displayProgress=progressSource==='completed'?100:progressSource==='platform'?platformProgress:estimate?.percent??null;
  const notes=(run.notes||[]).filter(n=>!n.responseId||allRaw).map(n=>copy(n));
  const events=(run.events||[]).map(e=>allRaw&&!e.private?copy(e):{id:e.id,at:e.at,kind:e.kind,source:'tracker',message:'Pipeline '+e.kind+'.'});
  const selectedText=key=>{const source=run.provenance?.[key]||'status',rule=rules[source],mapping=rule.mappings[key];if(!enabled(key)||run.responses?.[source]?.projectionBlocked)return false;const field=key==='stagePosition'?(typeof mapping==='string'?mapping+'.stage':mapping?.stage):mapping;const allowed=desk=>desk.mode==='raw'||desk.mode==='custom'&&desk.fields.some(f=>f.path===field);return allowed(rule.desk)&&(!run.valueVisibility?.[key]||allowed(run.valueVisibility[key]));};
  if(position)position.stage=selectedText('stagePosition')?run.stagePosition.stage:'';
  const stageName=selectedText('stageName')?run.stageName||'':'',diagnostics=endpointDiagnostics(run,this.now()),freshness=progressFreshness(run,this.now(),diagnostics);
  return {...data,stageName,summary:summarize(run,{stageName,stagePosition:position,displayProgress,progressSource}),progressFreshness:freshness,endpointDiagnostics:diagnostics,configuration:this.publicSettings(configurationView(run,this.config)),...visiblePipelineLinks(run),notes,events,costUsd:run.costUsd??null,stagePosition:position,progress:platformProgress,responseAttempts:copy(run.responseAttempts||{}),responses,responseVisibility:Object.fromEntries(Object.entries(rules).map(([k,v])=>[k,v.desk.mode])),shape:['standard','orchestrator','checkpoint','quick'].includes(run.shape)?run.shape:'standard',checkDue:this.checkDue(run),metadata:copy(run.metadata||{}),progressResponse:adapter?.operations?.progress?responses.progress:responses.status,progressEstimate:copy(estimate),displayProgress,progressSource,capabilities:Object.keys(adapter?.operations||{}).filter(k=>!['trigger','status','progress'].includes(k)),source:'pipeyard'};
 }
 snapshot(){return {version:1,limits:copy(pipeyardLimits),usage:{templates:this.config.templates.length,remainingTemplates:200-this.config.templates.length,platforms:this.config.platforms.length,savedRuns:this.runs.length,visibleRuns:this.runs.filter(r=>!r.archived).length},templates:this.config.templates.map(t=>({...this.publicSettings(t),canLaunch:!!this.config.platforms.find(p=>p.id===t.platformId)?.operations.trigger})),platforms:this.config.platforms.map(p=>({id:p.id,name:p.name})),runs:this.runs.map(r=>this.publicRun(r)),at:this.now()};}
 template(id){const template=this.config.templates.find(t=>t.id===id);if(!template)throw Error('Unknown pipeline template.');const platform=this.config.platforms.find(p=>p.id===template.platformId);return {template,adapter:effectiveAdapter(platform,template)};}
 async call(run,operation,extra={}){
  if(!run.adapter)throw Error('Connect this local placeholder to a platform first.');
  const secret=secretFor(run.adapter,this.env);if(secret)this.knownSecrets.add(secret);
  const read=['status','progress'].includes(operation);if(read){run.responseAttempts??={};run.responseAttempts[operation]={at:this.now(),error:''};run.endpointSkipped??={};delete run.endpointSkipped[operation];}
  try{const result=await callPlatform(run.adapter,operation,{externalId:run.externalId,input:run.input,...extra},{now:this.now,fetchImpl:this.fetchImpl,env:this.env});
   if(read){if(result.externalId&&run.externalId&&result.externalId!==run.externalId)throw Error('Platform returned a different run ID.');this.saveProgressResponse(run,result.response,operation);run.extractionDiagnostics??={};run.extractionDiagnostics[operation]=result.diagnostics;}
   return result;
  }catch(error){if(read)run.responseAttempts[operation]={at:this.now(),error:error.message};throw error;}
 }
 entry(run,kind,message,source='tracker'){run.events.push({id:randomUUID(),at:this.now(),kind,source,message:text(message),...(source==='platform'&&Object.values(resolveResponseConfig(run.adapter||{})).some(r=>r.desk.mode!=='raw')?{private:true}:{})});run.events=run.events.slice(-500);run.updatedAt=this.now();}
 observation(run,result){
  const before=fingerprint([run.status,run.message,run.stages,run.stagePosition,run.stageName]);
  run.observedAt??={};run.missingValues??={};run.provenance??={};run.valueVisibility??={};
  for(const k of ['status','message','progress','stages','platformNotes','result','costUsd','stagePosition','stageName','stagePositionDiagnostic']){
   const preserve=['progress','stagePosition','stageName','stages','platformNotes','result'].includes(k),value=result[k],present=value!==null&&value!==undefined&&(!Array.isArray(value)||value.length>0);
   if(preserve&&!present){run.missingValues[k]=true;continue;}
   run[k]=value;if(preserve){run.observedAt[k]=this.now();run.missingValues[k]=false;}run.provenance[k]=result.provenance?.[k]||'status';run.valueVisibility[k]=copy(resolveResponseConfig(run.adapter||{})[run.provenance[k]].desk);
  }
  run.lastCheckedAt=this.now();run.lastError='';run.retryAt=result.retryAt??null;run.failures=0;
  if(terminal(run.status)){run.tracking='finished';run.finishedAt??=this.now();run.nextCheckAt=null;}
  else if(run.tracking==='active')run.nextCheckAt=Math.max(this.now()+run.intervalMinutes*60000,run.retryAt||0);
  if(before!==fingerprint([run.status,run.message,run.stages,run.stagePosition,run.stageName]))this.entry(run,run.status==='succeeded'?'complete':['awaiting-approval','failed','cancelled'].includes(run.status)?'attention':run.status==='paused'?'tracking':'progress',result.message||result.stageName||result.stagePosition?.stage||'Workflow '+run.status+'.','platform');
 }
 checkDue(run){return !!(run.externalId&&!run.archived&&!terminal(run.status)&&run.tracking==='active'&&this.now()<run.deadline&&this.now()>=Math.max(run.nextCheckAt||0,run.retryAt||0));}
 saveProgressResponse(run,data,source){
  run.responses??={};const previous=run.responses[source];
  if(previous&&fingerprint(previous.data)===fingerprint(data)){previous.fetchedAt=this.now();delete previous.projectionBlocked;delete previous.settingsChanged;return;}
  run.responses[source]={id:randomUUID(),source,fetchedAt:this.now(),data:copy(data),review:null};
 }

 async finalDetails(run,result){
  const monitoring=effectiveAdapter(run.adapter).monitoring;
  if(!terminal(result.status)||!run.adapter.operations.progress||!monitoring.progress||!monitoring.finalProgress||result.retryAt>this.now())return;
  try{const details=await this.call(run,'progress');result.retryAt=Math.max(result.retryAt||0,details.retryAt||0)||null;for(const key of ['message','progress','stagePosition','stageName','stages','platformNotes','result'])if(details[key]!==null&&details[key]!==undefined&&details[key]!==''&&(!Array.isArray(details[key])||details[key].length)){result[key]=details[key];result.provenance[key]='progress';}}catch{}
 }
 async check(run,{automatic=false}={}){
  if(run.retryAt&&run.retryAt>this.now())return;
  const previousError=run.lastError,previousFailures=run.failures||0;
  try{
   const result=await this.call(run,'status');
   if(result.externalId&&result.externalId!==run.externalId)throw Error('Platform returned a different run ID.');
   let detailsError=null;
   this.saveProgressResponse(run,result.response,'status');
   const monitoring=effectiveAdapter(run.adapter).monitoring;
   run.endpointSkipped??={};
   if(run.adapter.operations.progress&&monitoring.progress&&!(result.retryAt>this.now())&&(!terminal(result.status)||monitoring.finalProgress)&&(!automatic||(!run.archived&&run.tracking==='active'&&this.now()<run.deadline))){
    try{const progress=await this.call(run,'progress');if(progress.externalId&&progress.externalId!==run.externalId)throw Error('Progress returned a different run ID.');
     this.saveProgressResponse(run,progress.response,'progress');result.retryAt=Math.max(result.retryAt||0,progress.retryAt||0)||null;
     for(const k of ['progress','result','stagePosition','stageName'])if(progress[k]!==null){result[k]=progress[k];result.provenance[k]='progress';}
     for(const k of ['stages','platformNotes'])if(Array.isArray(progress[k])&&progress[k].length||progress[k]&&typeof progress[k]==='object'&&!Array.isArray(progress[k])){result[k]=progress[k];result.provenance[k]='progress';}
     if(progress.message){result.message=progress.message;result.provenance.message='progress';}
    }catch(error){detailsError=error;}
   }else if(run.adapter.operations.progress)run.endpointSkipped.progress=!monitoring.progress?'Progress monitoring is disabled.':result.retryAt>this.now()?'Waiting for the platform retry boundary.':terminal(result.status)&&!monitoring.finalProgress?'Final progress fetch is disabled.':'Monitoring budget or tracking state prevents a progress request.';
   this.observation(run,result);
   if(detailsError){run.lastError='Progress details unavailable. '+detailsError.message;run.failures=previousFailures+1;run.retryAt=detailsError.retryAt||this.now()+Math.min(1800000,60000*2**Math.min(run.failures-1,5));if(run.tracking==='active'&&run.retryAt)run.nextCheckAt=Math.max(run.nextCheckAt||0,run.retryAt);}

  }catch(error){run.lastError=error.message;run.failures=(run.failures||0)+1;run.retryAt=error.retryAt||this.now()+Math.min(1800000,60000*2**Math.min(run.failures-1,5));run.nextCheckAt=run.retryAt;}
  if(run.tracking!=='active'||run.archived||terminal(run.status))run.nextCheckAt=null;
  if(automatic&&run.tracking==='active'&&this.now()>=run.deadline){run.tracking='expired';run.nextCheckAt=null;}
  if(run.lastError&&run.lastError!==previousError)this.entry(run,'attention','Check unavailable. '+run.lastError);else if(previousError&&!run.lastError)this.entry(run,'tracking','Platform checks restored.');
  run.updatedAt=this.now();this.persist();
 }
 async tick(){
  if(this.ticking)return;this.ticking=true;
  try{const due=[];for(const run of this.runs){if(run.archived||run.tracking!=='active'||this.locks.has(run.id))continue;if(this.now()>=run.deadline){run.tracking='expired';run.nextCheckAt=null;this.entry(run,'tracking','Monitoring budget elapsed; external work may continue.');this.persist();continue;}if(run.externalId&&this.now()>=(run.nextCheckAt||0)&&this.now()>=(run.retryAt||0))due.push(run);}
   for(let i=0;i<due.length;i+=4)await Promise.all(due.slice(i,i+4).map(async run=>{if(this.locks.has(run.id)||run.archived||run.tracking!=='active'||this.now()<Math.max(run.nextCheckAt||0,run.retryAt||0))return;if(this.now()>=run.deadline){run.tracking='expired';run.nextCheckAt=null;this.persist();return;}this.locks.add(run.id);try{await this.check(run,{automatic:true});}finally{this.locks.delete(run.id);}}));
  }finally{this.ticking=false;}
 }
 saveTemplate(template){
  const platform=this.config.platforms.find(p=>p.id===template?.platformId);if(!platform)throw Error('Unknown platform. Configure its connection before saving a template.');
  const exists=this.config.templates.some(t=>t.id===template?.id);if(!exists&&this.config.templates.length>=200)throw limitError('templates',200,this.config.templates.length);
  let secret='';try{secret=secretFor(platform,this.env);}catch{}
  const candidate=safe(template,[secret]);
  const config=validateConfig({...this.config,templates:[...this.config.templates.filter(t=>t.id!==candidate.id),candidate]});
  this.configure(config);const saved=this.config.templates.find(t=>t.id===candidate.id);return {...copy(saved),canLaunch:!!platform.operations.trigger};
 }
 linkPatch(body,secret=''){
  const links=pipelineLinks(body);
  for(const value of Object.values(links)){
   if(!value)continue;let decoded=value;try{decoded=decodeURIComponent(value);}catch{}
   if(safe(value,[secret])!==value||safe(decoded,[secret])!==decoded)throw Error('Pipeline link contains sensitive data. Use a plain page URL.');
  }
  return links;
 }
 async updateRun(run,body){
  let secret='';try{secret=secretFor(run.adapter,this.env);}catch{}
  const patch=this.linkPatch(body,secret);if(body.title!==undefined)patch.title=safe(body.title,[secret]);if(body.metadata!==undefined)patch.metadata=safe(body.metadata,[secret]);
  if(body.externalId!==undefined&&body.externalId!==run.externalId){
   if(safe(body.externalId,[secret])!==body.externalId)throw Error('External pipeline ID contains invalid or sensitive data.');
   if(run.retryAt>this.now())throw Error('Platform asked us to wait before another request.');
   if(this.runs.some(r=>r!==run&&r.platformId===run.platformId&&r.externalId===body.externalId))throw Error('That external run is already tracked.');
   const identity=run.platformId+':'+body.externalId;if(this.registerLocks.has(identity))throw Error('Registration is busy.');this.registerLocks.add(identity);
   try{
    const result=await this.call({...run,responses:{},responseAttempts:{},externalId:body.externalId},'status');if(result.externalId&&result.externalId!==body.externalId)throw Error('Platform returned a different run ID.');
    if(this.runs.some(r=>r!==run&&r.platformId===run.platformId&&r.externalId===body.externalId))throw Error('That external run is already tracked.');
    const previous=run.externalId;
    run.connectionHistory=[...(run.connectionHistory||[]),{externalId:previous,status:run.status,changedAt:this.now()}].slice(-20);
    Object.assign(run,patch,{externalId:body.externalId,responses:{},responseAttempts:{},provenance:{},observedAt:{},missingValues:{},valueVisibility:{},endpointSkipped:{},extractionDiagnostics:{},stageName:null,stagePosition:null,progressEstimate:null,progress:null,result:null,stages:[],platformNotes:[],costUsd:null,lastCheckedAt:null,lastError:'',retryAt:null,failures:0,nextCheckAt:null});delete run.finishedAt;
    run.tracking=run.tracking==='active'&&this.now()<run.deadline?'active':run.tracking==='expired'||this.now()>=run.deadline?'expired':'paused';
    this.observation(run,result);this.saveProgressResponse(run,result.response,'status');
    this.entry(run,'linked','External pipeline ID changed from '+(previous||'(unlinked)')+' to '+run.externalId+'. Verified by status check; no submission made.');
   }finally{this.registerLocks.delete(identity);}
  }else{Object.assign(run,patch);this.entry(run,'note','Local pipeline details updated.');}
 }
 setBoardAppearance(body){validateAction('set-appearance',body);if(!body.id.startsWith('board-'))throw Error('Expected a Board pipeline.');const {id,...appearance}=body;this.boardAppearances[id]={...(this.boardAppearances[id]||{}),...appearance};this.persist();return copy(this.boardAppearances[id]);}
 async execute(action,body){
  validateAction(action,body);
  if(['launch','create-local'].includes(action)&&this.deletedRuns.some(r=>r.requestHash===fingerprint(body.requestId)))throw Error('This request was deleted from local History. Track the existing external run; use a new request ID only for new work.');
  if(action==='create-local')return this.createLocal(body);
  if(action==='save-template')return this.saveTemplate(body.template);
  if(action==='launch'||action==='register')return this.create(action,body);
  const run=this.runs.find(r=>r.id===body.id);if(!run){if(action==='delete'&&this.deletedRuns.some(r=>r.idHash===fingerprint(body.id)))return {id:body.id,deleted:true};throw Error('Unknown Pipeyard run.');}
  if(action==='preview-settings')return this.previewSettings(run);
  if(action==='check-due'&&(this.locks.has(run.id)||!this.checkDue(run)))return this.publicRun(run);
  if(this.locks.has(run.id))throw Object.assign(Error('Run is busy; retry after the current check.'),{status:409,code:'PIPEYARD_BUSY'});
  this.locks.add(run.id);
  try{
   if(action==='apply-settings')return this.applySettings(run,body);
   if(action==='set-check-interval'){
    if(run.intervalMinutes===body.intervalMinutes)return this.publicRun(run);
    const previous={intervalMinutes:run.intervalMinutes,nextCheckAt:run.nextCheckAt,updatedAt:run.updatedAt};
    run.intervalMinutes=body.intervalMinutes;run.updatedAt=this.now();
    run.nextCheckAt=run.externalId&&!run.archived&&!terminal(run.status)&&run.tracking==='active'&&this.now()<run.deadline?Math.max(this.now(),(run.lastCheckedAt??this.now())+run.intervalMinutes*60000,run.retryAt??0):null;
    try{this.persist();}catch(error){Object.assign(run,previous);throw error;}return this.publicRun(run);
   }
   if(action==='delete'){
    if(!run.archived)throw Error('Clear the pipeline to History before deleting it.');
    if(run.updatedAt!==body.expectedUpdatedAt)throw Object.assign(Error('The pipeline changed. Reload its History entry before deleting.'),{status:409});
    const previousRuns=this.runs,previousDeleted=this.deletedRuns;
    this.deletedRuns=[...this.deletedRuns,{idHash:fingerprint(run.id),...(run.requestId?{requestHash:fingerprint(run.requestId)}:{})}];this.runs=this.runs.filter(r=>r.id!==run.id);
    try{this.persist();}catch(error){this.runs=previousRuns;this.deletedRuns=previousDeleted;throw error;}
    return {id:run.id,deleted:true};
   }
   if(action==='connect-local')await this.connectLocal(run,body);
   else if(action==='set-appearance'){if(body.color!==undefined)run.color=body.color;if(body.shape!==undefined)run.shape=body.shape;}
   else if(action==='update-run')await this.updateRun(run,body);
   else if(action==='note'){let secret='';try{secret=secretFor(run.adapter,this.env);}catch{}run.notes.push({id:randomUUID(),at:this.now(),text:safe(body.text,[secret])});this.entry(run,'note','Local note added.');}
   else if(action==='review-progress'){
    const source=body.source??(run.adapter?.operations?.progress?'progress':'status'),record=run.responses?.[source],rule=resolveResponseConfig(run.adapter||{})[source];
    if(rule.desk.mode==='hidden')throw Error('This response is hidden and unavailable for review.');
    if(!record||record.id!==body.responseId)throw Error('Progress response changed or was superseded. Read the latest response before reviewing it.');
    let secret='';try{secret=secretFor(run.adapter,this.env);}catch{}
    const author=safe(body.author,[secret]),summary=safe(body.summary,[secret]);
    record.review={at:this.now(),author,summary,...(rule.desk.mode!=='raw'?{private:true}:{})};
    if(rule.desk.mode==='raw')run.notes.push({id:randomUUID(),at:this.now(),source,responseId:body.responseId,text:author+': '+summary});
    this.entry(run,'note','Progress response reviewed by '+author+'.');
   }
   else if(action==='estimate-progress'){
    if(terminal(run.status))throw Error('Workflow has finished; its progress estimate cannot change.');
    let secret='';try{secret=secretFor(run.adapter,this.env);}catch{}
    const reason=safe(body.reason,[secret]),author=safe(body.author,[secret]);
    run.progressEstimate=body.percent===null?null:{percent:body.percent,reason,author,at:this.now()};
    this.entry(run,'estimate',(body.percent===null?'Local progress estimate cleared':'Local progress estimated at '+body.percent+'%')+' by '+author+'. '+reason);
   }
   else if(action==='clear'){run.archived=true;this.entry(run,'archive','Cleared from the active yard; history retained.');}
   else if(action==='restore'){run.archived=false;this.entry(run,'archive','Restored to the yard.');}
   else if(action==='pause-tracking'){if(terminal(run.status))throw Error('Workflow has finished.');run.tracking='paused';run.nextCheckAt=null;this.entry(run,'tracking','Local tracking paused; external work is unchanged.');}
   else if(action==='resume-tracking'){if(terminal(run.status)||!run.externalId)throw Error('Link an active external run before resuming tracking.');const minutes=body.minutes??run.waitMinutes;if(!budgets.includes(minutes))throw Error('Unsupported monitoring budget.');run.tracking='active';run.deadline=this.now()+minutes*60000;run.nextCheckAt=this.now();this.entry(run,'tracking','Local tracking resumed for '+minutes+' minutes.');await this.check(run);}
   else if(action==='refresh'||action==='check-due'){if(!run.externalId)throw Error('Link the external run before checking.');await this.check(run,{automatic:action==='check-due'});}
   else if(action==='link'){
    if(run.status!=='unresolved'||run.externalId)throw Error('Only unresolved submissions can link an existing run.');
    if(this.runs.some(r=>r.platformId===run.platformId&&r.externalId===body.externalId))throw Error('That external run is already tracked.');
    const identity=run.platformId+':'+body.externalId;if(this.registerLocks.has(identity))throw Error('Registration is busy.');this.registerLocks.add(identity);
    try{const result=await this.call({...run,responses:{},responseAttempts:{},externalId:body.externalId},'status');if(result.externalId&&result.externalId!==body.externalId)throw Error('Platform returned a different run ID.');
     if(this.runs.some(r=>r!==run&&r.platformId===run.platformId&&r.externalId===body.externalId))throw Error('That external run is already tracked.');
     run.externalId=body.externalId;run.tracking=this.now()<run.deadline?'active':'expired';this.observation(run,result);this.saveProgressResponse(run,result.response,'status');this.entry(run,'linked','Verified existing external run; no submission made.');
    }finally{this.registerLocks.delete(identity);}
   }else{
    if(!run.adapter?.operations?.[action])throw Error('Platform does not support '+action+'.');
    if(!run.externalId||terminal(run.status))throw Error('Operation requires an active external run.');
    if(run.retryAt>this.now())throw Error('Platform asked us to wait before another request.');
    if(action==='approve'){
     if(body.confirmed!==true||body.expectedCostUsd!==run.costUsd)throw Error('Review the current approval and cost, then confirm explicitly.');
     await this.check(run);
     if(run.lastError||run.status!=='awaiting-approval'||body.expectedCostUsd!==run.costUsd)throw Error('Approval or cost changed, or could not be verified. Reopen the run and review it again.');
     if(run.retryAt>this.now())throw Error('Platform asked us to wait before another request.');
    }
    // Record intent before the call; an error must never cause an automatic mutation retry.
    this.entry(run,'operation','Requested platform '+action+'.');this.persist();
    try{await this.call(run,action,{message:body.message||'',idempotencyKey:randomUUID()});this.entry(run,'operation','Platform accepted '+action+'.');await this.check(run);}
    catch(error){run.lastError=error.message;run.retryAt=error.retryAt||null;this.entry(run,'warning','Platform operation outcome uncertain; inspect the external run before retrying.');this.persist();throw error;}
   }
   run.updatedAt=this.now();this.persist();return this.publicRun(run);
  }finally{this.locks.delete(run.id);}
 }
 createLocal(body){
  const fp=fingerprint({kind:'local',title:body.title,color:body.color,metadata:body.metadata||{},...pipelineLinks(body)}),previous=this.runs.find(r=>r.requestId===body.requestId);
  if(previous){if(previous.requestFingerprint!==fp)throw Error('Request ID was reused with different inputs.');return this.publicRun(previous);}
  const now=this.now(),run={id:randomUUID(),...this.linkPatch(body),localOnly:true,requestId:body.requestId,requestFingerprint:fp,title:safe(body.title),color:body.color,metadata:safe(body.metadata||{}),templateId:'',templateName:'Local placeholder',platformId:'',platformName:'Not connected',adapter:null,externalId:'',description:'Connect to an existing platform pipeline when ready.',status:'ready',tracking:'paused',message:'Local placeholder; no external workflow started.',input:{},result:null,progress:null,stages:[],platformNotes:[],notes:[],events:[],capabilities:[],archived:false,createdAt:now,updatedAt:now,deadline:null,nextCheckAt:null,lastCheckedAt:null,lastError:'',intervalMinutes:1,waitMinutes:60};
  this.entry(run,'created','Added a local placeholder. No platform request.');this.runs.push(run);this.persist();return this.publicRun(run);
 }
 async connectLocal(run,body){
  if(!run.localOnly||run.externalId)throw Error('Only unconnected local placeholders can use this action.');
  const {template,adapter}=this.template(body.templateId),identity=adapter.id+':'+body.externalId;
  if(this.runs.some(r=>r!==run&&r.platformId===adapter.id&&r.externalId===body.externalId))throw Error('That external run is already tracked.');
  if(this.registerLocks.has(identity))throw Error('Registration is busy.');this.registerLocks.add(identity);
  try{
   const secret=secretFor(adapter,this.env);if(safe(body.externalId,[secret])!==body.externalId)throw Error('External pipeline ID contains invalid or sensitive data.');
   const candidate={...run,...this.linkPatch(run,secret),responses:{},responseAttempts:{},templateId:template.id,templateName:template.name,platformId:adapter.id,platformName:adapter.name,adapter:copy(adapter),externalId:body.externalId,input:safe(template.input||{},[secret]),intervalMinutes:template.intervalMinutes,waitMinutes:template.waitMinutes};
   const result=await this.call(candidate,'status');if(result.externalId&&result.externalId!==body.externalId)throw Error('Platform returned a different run ID.');
   if(this.runs.some(r=>r!==run&&r.platformId===adapter.id&&r.externalId===body.externalId))throw Error('That external run is already tracked.');
   Object.assign(run,candidate,{localOnly:false,title:safe(run.title,[secret]),metadata:safe(run.metadata,[secret]),notes:run.notes.map(n=>({...n,text:safe(n.text,[secret])})),events:run.events.map(e=>({...e,message:safe(e.message,[secret])})),description:safe(template.description,[secret]),tracking:'active',deadline:this.now()+template.waitMinutes*60000,progressEstimate:null});
   this.observation(run,result);this.saveProgressResponse(run,result.response,'status');this.entry(run,'linked','Connected to an existing external pipeline. No workflow triggered.');
  }finally{this.registerLocks.delete(identity);}
 }
 async create(action,body){
  const fp=fingerprint({templateId:body.templateId,input:body.input||{},title:body.title||'',taskId:body.taskId||'',...(body.metadata===undefined?{}:{metadata:body.metadata}),...pipelineLinks(body)});
  if(action==='launch'){const previous=this.runs.find(r=>r.requestId===body.requestId);if(previous){if(previous.requestFingerprint!==fp)throw Error('Request ID was reused with different inputs.');return this.publicRun(previous);}}
  const {template,adapter}=this.template(body.templateId),input={...template.input,...(body.input||{})};
  if(action==='launch'){
   const previous=this.runs.find(r=>r.requestId===body.requestId);if(previous){if(previous.requestFingerprint!==fp)throw Error('Request ID was reused with different inputs.');return this.publicRun(previous);}
   if(!adapter.operations.trigger)throw Error('This template supports tracking existing runs only.');
   if(this.requestLocks.has(body.requestId))throw Error('Request is busy.');
  }else{const previous=this.runs.find(r=>r.platformId===adapter.id&&r.externalId===body.externalId);if(previous)return this.publicRun(previous);}
  const lock=adapter.id+':'+(body.externalId||body.requestId);if(this.registerLocks.has(lock))throw Error('Registration is busy.');
  const secret=secretFor(adapter,this.env); // Missing credentials fail before creating or submitting anything.
  const now=this.now(),run={id:randomUUID(),...this.linkPatch(body,secret),templateId:template.id,templateName:template.name,platformId:adapter.id,platformName:adapter.name,adapter:copy(adapter),title:safe(body.title||template.name,[secret]),description:safe(template.description,[secret]),color:template.color,metadata:safe(body.metadata||{},[secret]),input:safe(input,[secret]),taskId:body.taskId||null,externalId:body.externalId||'',requestId:body.requestId||null,requestFingerprint:fp,status:'submitting',tracking:'active',message:'',progress:null,result:null,stages:[],platformNotes:[],costUsd:null,notes:[],events:[],archived:false,createdAt:now,updatedAt:now,deadline:now+template.waitMinutes*60000,intervalMinutes:template.intervalMinutes,waitMinutes:template.waitMinutes,nextCheckAt:now,lastCheckedAt:null,lastError:'',retryAt:null};
  this.registerLocks.add(lock);if(body.requestId)this.requestLocks.add(body.requestId);this.locks.add(run.id);
  try{
   if(action==='register'){
    const result=await this.call(run,'status');if(result.externalId&&result.externalId!==run.externalId)throw Error('Platform returned a different run ID.');
    const existing=this.runs.find(r=>r.platformId===run.platformId&&r.externalId===run.externalId);if(existing)return this.publicRun(existing);
    await this.finalDetails(run,result);this.observation(run,result);this.saveProgressResponse(run,result.response,'status');this.runs.push(run);this.entry(run,'registered','Tracking an existing external run.');
   }else{
    this.runs.push(run);this.entry(run,'submitted','Submission recorded before contacting the platform.');this.persist();
    try{const result=await this.call(run,'trigger',{input,idempotencyKey:run.requestId});if(!result.externalId||result.externalId.includes('[redacted]'))throw Error('Platform did not return a usable run ID.');if(this.runs.some(r=>r!==run&&r.platformId===run.platformId&&r.externalId===result.externalId))throw Error('Platform returned an already tracked run.');run.externalId=result.externalId;this.observation(run,result);}
    catch(error){run.status='unresolved';run.tracking='paused';run.nextCheckAt=null;run.lastError=error.message;run.message='Submission outcome uncertain. Verify the platform and link the existing run; do not launch again.';this.entry(run,'warning',run.message);}
   }
   this.persist();return this.publicRun(run);
  }finally{this.registerLocks.delete(lock);this.requestLocks.delete(body.requestId);this.locks.delete(run.id);}
 }
}
