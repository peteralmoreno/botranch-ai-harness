// Extraction rules and public presentation are deliberately separate.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
export const legacyFields={id:'id',status:'status',message:'message',progress:'progress',stages:'stages',notes:'notes',result:'result',cost:'cost_usd',stagePosition:'progress',stageName:null};
export function validPath(v){return typeof v==='string'&&v.length>0&&v.length<=200&&v.split('.').every(k=>k&&!['__proto__','constructor','prototype'].includes(k));}
export function readField(value,path){return validPath(path)?path.split('.').reduce((v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k)?v[k]:undefined,value):undefined;}
function keys(value,allowed){if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('Unknown response setting.');}
export function validateMappings(value){
 keys(value,Object.keys(legacyFields));
 for(const [k,v] of Object.entries(value)){
  if(v===null||validPath(v))continue;
  if(k==='stagePosition'&&object(v)){keys(v,['stage','currentIndex','total']);if(Object.keys(v).length===3&&Object.values(v).every(validPath))continue;}
  throw Error('Invalid response field mapping.');
 }
 return clone(value);
}
export function validateDesk(desk){
 keys(desk,['mode','fields']);if(!['raw','custom','hidden'].includes(desk.mode))throw Error('Unknown response display mode.');
 if(desk.mode==='custom'){
  if(!Array.isArray(desk.fields)||desk.fields.length>50)throw Error('Custom display requires at most 50 fields.');
  for(const f of desk.fields){keys(f,['label','path','format','fallback']);if(typeof f.label!=='string'||!f.label.trim()||f.label.length>100||!validPath(f.path)||!['text','number','percent','title','json'].includes(f.format??'text')||f.fallback!==undefined&&(typeof f.fallback!=='string'||f.fallback.length>1000))throw Error('Invalid custom response field.');}
 }else if(desk.fields!==undefined)throw Error('Fields require custom mode.');
 return clone(desk);
}
export function validateResponses(value={}){
 keys(value,['status','progress']);for(const endpoint of Object.values(value)){keys(endpoint,['mappings','desk','progressScale']);if(endpoint.progressScale!==undefined&&!['percent','fraction'].includes(endpoint.progressScale))throw Error('Progress scale must be percent or fraction.');if(endpoint.mappings!==undefined)validateMappings(endpoint.mappings);if(endpoint.desk!==undefined)validateDesk(endpoint.desk);}
 return clone(value);
}
export function resolveResponseConfig(platform={},template={}){
 validateResponses(platform.responses);validateResponses(template.responses);
 return Object.fromEntries(['status','progress'].map(source=>[source,{
  mappings:{...legacyFields,...platform.fields,...platform.responses?.[source]?.mappings,...template.responses?.[source]?.mappings},
  progressScale:template.responses?.[source]?.progressScale??platform.responses?.[source]?.progressScale??'percent',
  desk:clone(template.responses?.[source]?.desk??platform.responses?.[source]?.desk??{mode:'raw'})
 }]));
}
export function normalizeStagePosition(value){
 if(!object(value)||!Number.isInteger(value.total)||value.total<1)return null;
 const index=value.currentIndex??value.current_index??null;
 if(index!==null&&(!Number.isInteger(index)||index<1||index>value.total))return null;
 return {stage:typeof value.stage==='string'?value.stage.slice(0,200):'',currentIndex:index,total:value.total};
}
export function extractStagePosition(data,mapping){return normalizeStagePosition(object(mapping)?Object.fromEntries(Object.entries(mapping).map(([k,p])=>[k,readField(data,p)])):readField(data,mapping));}
export function projectResponse(record,desk={mode:'raw'}){
 if(!record||desk.mode==='hidden')return null;
 const base={id:record.id,source:record.source,fetchedAt:record.fetchedAt,mode:desk.mode};
 if(desk.mode==='raw')return {...base,data:clone(record.data),review:record.review&&!record.review.private?clone(record.review):null};
 const fields=desk.fields.map(f=>{
  const value=readField(record.data,f.path),format=f.format??'text',out={label:f.label,value:''};
  if(value===undefined||value===null)return {...out,value:f.fallback??'—'};
  if(format==='json')return {...out,value:JSON.stringify(value,null,2).slice(0,16000)};
  if(['number','percent'].includes(format)){if(typeof value==='number'&&Number.isFinite(value))return {...out,value:String(value)+(format==='percent'?'%':'')};}
  else if(['string','number','boolean'].includes(typeof value))return {...out,value:(format==='title'?String(value).replace(/[_-]+/g,' ').replace(/\b\p{L}/gu,c=>c.toUpperCase()):String(value)).slice(0,4000)};
  return {...out,value:'—',diagnostic:'Value does not match '+format+' format.'};
 });
 // A review can quote fields that are no longer selected. Keep it private in custom mode.
 return {...base,fields,review:null};
}
