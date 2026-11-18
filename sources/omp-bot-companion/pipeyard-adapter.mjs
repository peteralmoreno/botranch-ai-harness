import {legacyFields,validateMappings,validateResponses,resolveResponseConfig,readField,extractStagePosition} from './pipeyard-responses.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const terminal = status => ['succeeded','failed','cancelled'].includes(status);
export const states = ['queued','running','paused','awaiting-approval','succeeded','failed','cancelled','unknown'];
import {intervals,defaultIntervalMinutes} from './setup/pipeyard-intervals.mjs';
export {intervals,defaultIntervalMinutes};
export const budgets = [10,20,40,60,120];
const operations = ['trigger','status','progress','say','approve','pause','resume'];
const own = (o,k) => Object.hasOwn(o,k);
export function object(value) { return !!value && typeof value==='object' && !Array.isArray(value); }
export function text(value,max=4000) { return typeof value==='string'?value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').slice(0,max):''; }
export function safe(value,secrets=[],depth=0) {
  if(depth>10)return '[truncated]';
  if(typeof value==='string')return text(secrets.filter(Boolean).reduce((s,key)=>s.split(key).join('[redacted]'),value),16000);
  if(value===null||typeof value==='boolean'||Number.isFinite(value))return value;
  if(Array.isArray(value))return value.slice(0,200).map(v=>safe(v,secrets,depth+1));
  if(object(value))return Object.fromEntries(Object.entries(value).slice(0,200).filter(([k])=>!/(?:password|secret|authorization|credential|api.?key|token)/i.test(k)&&!['__proto__','prototype','constructor'].includes(k)).map(([k,v])=>[safe(k,secrets,depth+1),safe(v,secrets,depth+1)]));
  return null;
}
function identifier(v) { return typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v); }
function jsonCopy(v) { return JSON.parse(JSON.stringify(v)); }
function validatePlatform(p) {
  if(!object(p)||!identifier(p.id)||!text(p.name,100)||!object(p.operations)||!p.operations.status)throw Error('Platform requires id, name and status operation.');
  const url=new URL(p.baseUrl);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)throw Error('Use a base HTTP(S) URL without credentials, query or fragment.');
  const credential=p.credential||{};
  if(!object(credential)||Object.keys(credential).some(k=>!['env','file'].includes(k))||credential.env&&credential.file)throw Error('Credential must reference one environment variable or local file.');
  if(credential.env&&!/^[A-Za-z_][A-Za-z0-9_]*$/.test(credential.env))throw Error('Invalid credential environment variable.');
  if(credential.file&&(typeof credential.file!=='string'||!path.isAbsolute(credential.file)))throw Error('Credential file must be an absolute local path.');
  if((credential.env||credential.file)&&url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Credentials require HTTPS except loopback.');
  const ops={};
  for(const [name,op] of Object.entries(p.operations)) {
    if(!operations.includes(name)||!object(op)||!['GET','POST'].includes(op.method))throw Error('Unsupported adapter operation or method.');
    if(['status','progress'].includes(name)&&op.method!=='GET'||!['status','progress'].includes(name)&&op.method!=='POST')throw Error('Reads use GET; external changes use POST.');
    if(typeof op.path!=='string'||!op.path.startsWith('/')||op.path.startsWith('//')||/[\\#\r\n]/.test(op.path)||op.path.length>2000)throw Error('Operation path must stay on the platform origin.');
    if(new URL(op.path.replaceAll('{runId}','example'),url).origin!==url.origin)throw Error('Operation path must stay on the platform origin.');
    if(name!=='trigger'&&!op.path.includes('{runId}'))throw Error('Run operations require {runId} in the path.');
    if(op.body!==undefined&&JSON.stringify(op.body).length>32768)throw Error('Operation body is too large.');
    if(Object.keys(op).some(k=>!['method','path','body'].includes(k)))throw Error('Unknown operation option. Use credential references, not custom headers.');
    ops[name]={method:op.method,path:op.path,...(op.body===undefined?{}:{body:jsonCopy(op.body)})};
  }
  const fields=validateMappings({...legacyFields,...(p.fields||{})}),responses=validateResponses(p.responses);
  const statuses=p.statuses||{};if(!object(statuses)||Object.values(statuses).some(s=>!states.includes(s)))throw Error('Status mappings must use supported Pipeyard states.');
  if(Object.keys(p).some(k=>!['id','name','baseUrl','credential','operations','fields','statuses','responses','monitoring','summary'].includes(k)))throw Error('Unknown platform field.');
  return {id:p.id,name:text(p.name,100),baseUrl:url.href,credential:{...credential},operations:ops,fields,responses,monitoring:validateMonitoring(p.monitoring),summary:validateSummary(p.summary),statuses:jsonCopy(statuses)};
}
export function validateMonitoring(value={}) {if(!object(value)||Object.entries(value).some(([k,v])=>!['progress','finalProgress'].includes(k)||typeof v!=='boolean'))throw Error('Monitoring options must be booleans.');return {...value};}
export function validateSummary(value={}) {if(!object(value)||Object.keys(value).some(k=>k!=='mode')||value.mode!==undefined&&!['completion','stage','both','status'].includes(value.mode))throw Error('Invalid summary mode.');return {...value};}
export function validateConfig(input) {
  if(!object(input)||input.version!==1||!Array.isArray(input.platforms)||!Array.isArray(input.templates)||input.platforms.length>50||input.templates.length>200)throw Error('Config requires version 1, platforms and templates.');
  const platforms=input.platforms.map(validatePlatform),ids=new Set(platforms.map(p=>p.id));if(ids.size!==platforms.length)throw Error('Duplicate platform ID.');
  const templates=input.templates.map(t=>{
    if(!object(t)||!identifier(t.id)||!text(t.name,100)||!ids.has(t.platformId)||!/^#[a-fA-F0-9]{6}$/.test(t.color||''))throw Error('Template requires id, name, known platformId and hex color.');
    if(!intervals.includes(t.intervalMinutes??defaultIntervalMinutes)||!budgets.includes(t.waitMinutes??60))throw Error('Unsupported polling interval or monitoring budget.');
    if(t.input!==undefined&&!object(t.input))throw Error('Template input must be a JSON object.');
    if(Object.keys(t).some(k=>!['id','name','platformId','description','color','input','intervalMinutes','waitMinutes','responses','monitoring','summary'].includes(k)))throw Error('Unknown template field.');
    return {id:t.id,name:text(t.name,100),platformId:t.platformId,description:text(t.description),color:t.color,input:jsonCopy(t.input||{}),responses:validateResponses(t.responses),monitoring:validateMonitoring(t.monitoring),summary:validateSummary(t.summary),intervalMinutes:t.intervalMinutes??defaultIntervalMinutes,waitMinutes:t.waitMinutes??60};
  });
  if(new Set(templates.map(t=>t.id)).size!==templates.length)throw Error('Duplicate template ID.');
  if(JSON.stringify(input).length>131072)throw Error('Configuration is too large.');
  return {version:1,platforms,templates};
}
export function secretFor(platform,env=process.env) {
  const c=platform.credential||{};let value='';
  try {if(c.env)value=env[c.env]||'';else if(c.file){if(fs.statSync(c.file).size>16384)throw Error();value=fs.readFileSync(c.file,'utf8').trim();}}
  catch{throw Error('Could not read the configured credential file.');}
  if((c.env||c.file)&&(!value||/[\r\n]/.test(value)))throw Error('Configured credential is missing or invalid.');
  return value;
}
const field=readField;
function interpolate(value,context) {
  if(typeof value==='string') {const m=/^\{\{([\w.]+)\}\}$/.exec(value);return m?field(context,m[1])??null:value;}
  if(Array.isArray(value))return value.map(v=>interpolate(v,context));
  if(object(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,interpolate(v,context)]));
  return value;
}
export async function callPlatform(platform,operation,{externalId='',input={},message='',decision='approve',idempotencyKey=''}={}, {fetchImpl=fetch,env=process.env,now=Date.now}={}) {
  const op=platform.operations[operation];if(!op)throw Error('Platform does not support '+operation+'.');
  const secret=secretFor(platform,env),headers={Accept:'application/json',...(secret?{Authorization:'Bearer '+secret}:{})};
  if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
  const url=new URL(op.path.replaceAll('{runId}',encodeURIComponent(externalId)),platform.baseUrl);
  if(url.origin!==new URL(platform.baseUrl).origin)throw Error('Operation escaped the platform origin.');
  const options={method:op.method,headers,redirect:'error',signal:AbortSignal.timeout(10000)};
  if(op.method==='POST'){headers['Content-Type']='application/json';options.body=JSON.stringify(interpolate(op.body??(operation==='trigger'?'{{input}}':{message:'{{message}}',decision:'{{decision}}'}),{input,message,decision,runId:externalId}));}
  let response;
  try{response=await fetchImpl(url.href,options);}catch{throw Error('Platform request failed or timed out. Check the external platform before retrying a change.');}
  const retry=response.headers.get('retry-after'),seconds=retry&&/^\d+$/.test(retry)?Number(retry):null,until=seconds!==null?now()+seconds*1000:Date.parse(retry||''),retryAt=Number.isFinite(until)?Math.max(now(),until):null;
  if(!response.ok)throw Object.assign(Error('Platform returned HTTP '+response.status+'.'),{retryAt:retryAt>now()?retryAt:null});
  let data,buffer='';
  try{if(response.body){const decoder=new TextDecoder();let bytes=0;for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>1048576)throw Error();buffer+=decoder.decode(chunk,{stream:true});}buffer+=decoder.decode();}data=buffer?JSON.parse(buffer):{};}catch{throw Error('Platform response must be JSON under 1 MB.');}
  const clean=safe(data,[secret]);
  return {...extractObservation(platform,operation,clean),retryAt};
}
export function extractObservation(platform,operation,clean) {
  const source=operation==='progress'?'progress':'status',rules=resolveResponseConfig(platform)[source],fields=rules.mappings;
  const rawStatus=field(clean,fields.status),status=own(platform.statuses||{},String(rawStatus))?platform.statuses[String(rawStatus)]:states.includes(rawStatus)?rawStatus:'unknown';
  const id=field(clean,fields.id),progress=field(clean,fields.progress),cost=field(clean,fields.cost),stagePosition=extractStagePosition(clean,fields.stagePosition);
  const mapped={stageName:text(field(clean,fields.stageName),200)||null,message:text(field(clean,fields.message)),progress:typeof progress==='number'&&Number.isFinite(progress)?progress>=0&&progress<=(rules.progressScale==='fraction'?1:100)?progress*(rules.progressScale==='fraction'?100:1):null:null,stages:field(clean,fields.stages)??[],platformNotes:field(clean,fields.notes)??[],result:field(clean,fields.result)??null,costUsd:typeof cost==='number'&&Number.isFinite(cost)&&cost>=0?cost:null,stagePosition,stagePositionDiagnostic:fields.stagePosition&&object(typeof fields.stagePosition==='string'?field(clean,fields.stagePosition):clean)&&!stagePosition?'Stage position is unavailable or invalid.':''};
  const diagnostics={progress:progress===undefined||progress===null?'Progress value is missing.':typeof progress!=='number'||!Number.isFinite(progress)||progress<0||progress>(rules.progressScale==='fraction'?1:100)?'Progress value is invalid for '+rules.progressScale+' scale.':'',stageName:fields.stageName&&!mapped.stageName?'Stage name is missing or invalid.':'',stagePosition:mapped.stagePositionDiagnostic};
  return {response:clean,source,diagnostics,externalId:(typeof id==='string'||typeof id==='number')?String(id):'',status,...mapped,provenance:Object.fromEntries(Object.keys(mapped).map(k=>[k,source]))};
}
