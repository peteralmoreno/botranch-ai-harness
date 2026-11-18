import {intervals,defaultIntervalMinutes,intervalLabel} from './pipeyard-intervals.mjs';
// Guided controls patch the JSON draft rather than rebuilding the configuration.
// Unrepresented adapter options and request bodies are preserved.
export function mountConfigEditor({root,textarea,onTemplate,onChange}) {
 let platformId='',templateId='',scope='template',source='status';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const read=()=>{const c=JSON.parse(textarea.value);if(!c||!Array.isArray(c.platforms)||!Array.isArray(c.templates)||[...c.platforms,...c.templates].some(v=>!v||typeof v!=='object'))throw Error('Configuration needs platforms and templates arrays.');return c;};
 const write=c=>{textarea.value=JSON.stringify(c,null,2);onChange?.();};
 function patch(fn){try{const c=read();fn(c);write(c);}catch(e){error.textContent=e.message;}}
 const error=node('p');error.className='error';error.setAttribute('role','status');
 function field(parent,label,value,change,{options,type='text',hint}={}) {
  const wrap=node('label',label),input=node(options?'select':'input');input.setAttribute('aria-label',label);
  if(options)for(const [v,t] of options){const option=node('option',t);option.value=v;input.append(option);}else input.type=type;
  input.value=value??'';input.addEventListener(options?'change':'input',()=>change(input.value));wrap.append(input);parent.append(wrap);
  if(hint){const help=node('small',hint);help.className='hint';wrap.append(help);}return input;
 }
 function group(title){const g=node('fieldset'),legend=node('legend',title);g.append(legend);root.append(g);return g;}
 function action(parent,label,fn){const b=node('button',label);b.type='button';b.onclick=fn;parent.append(b);return b;}
 const selected=c=>scope==='platform'?c.platforms.find(p=>p.id===platformId):c.templates.find(t=>t.id===templateId);
 function setting(path,value){patch(c=>{let target=selected(c);if(!target)return;for(const key of path.slice(0,-1))target=target[key]??={};const key=path.at(-1);if(value===undefined)delete target[key];else target[key]=value;});}
 function render(){
  root.replaceChildren();root.append(error);error.textContent='';let c;
  try{c=read();}catch{error.textContent='Fix the Advanced JSON to continue with guided settings. Your draft is preserved.';return;}
  if(!c.platforms.some(p=>p.id===platformId))platformId=c.platforms[0]?.id||'';
  if(!c.templates.some(t=>t.id===templateId&&t.platformId===platformId))templateId=c.templates.find(t=>t.platformId===platformId)?.id||'';
  const p=c.platforms.find(p=>p.id===platformId),t=c.templates.find(t=>t.id===templateId);
  const choose=group('Choose a platform and template');choose.className='guided-choices';
  field(choose,'Platform',platformId,v=>{platformId=v;render();},{options:c.platforms.map(p=>[p.id,p.name||p.id])});
  field(choose,'Template',templateId,v=>{templateId=v;render();},{options:c.templates.filter(t=>t.platformId===platformId).map(t=>[t.id,t.name||t.id])});
  const nextId=(items,prefix)=>{let i=1;while(items.some(x=>x.id===prefix+i))i++;return prefix+i;};
  action(choose,'Add platform',()=>{patch(c=>{platformId=nextId(c.platforms,'platform-');c.platforms.push({id:platformId,name:'New platform',baseUrl:'https://example.test',operations:{status:{method:'GET',path:'/runs/{runId}'}}});});render();});
  const add=action(choose,'Add template',()=>{patch(c=>{templateId=nextId(c.templates,'template-');c.templates.push({id:templateId,platformId,name:'New template',color:'#61b7ba',intervalMinutes:defaultIntervalMinutes,waitMinutes:60});});render();});add.disabled=!p;
  onTemplate?.(templateId,source);
  if(!p){root.append(node('p','Add a platform to describe its status endpoint, then add a template.'));return;}
  const connection=group('Platform connection');connection.className='guided-grid';
  const platformField=(key,value)=>patch(c=>{c.platforms.find(p=>p.id===platformId)[key]=value;});
  field(connection,'Platform name',p.name,v=>platformField('name',v));
  field(connection,'Base URL',p.baseUrl,v=>platformField('baseUrl',v),{type:'url'});
  for(const endpoint of ['status','progress'])field(connection,(endpoint==='status'?'Status path (required)':'Progress path (optional)'),p.operations?.[endpoint]?.path||'',v=>patch(c=>{const p=c.platforms.find(p=>p.id===platformId);p.operations??={};if(!v&&endpoint==='progress')delete p.operations.progress;else p.operations[endpoint]={...p.operations[endpoint],method:'GET',path:v};}),{hint:'GET path, for example /runs/{runId}'+(endpoint==='progress'?'/progress':'')});
  const credential=p.credential||{},kind=credential.file?'file':credential.env?'env':'none';
  field(connection,'Credential source',kind,v=>{platformField('credential',v==='none'?{}:{[v]:''});render();},{options:[['none','No credential'],['env','Environment variable'],['file','Local secret file']]});
  if(kind!=='none')field(connection,'Credential reference',credential[kind],v=>platformField('credential',{[kind]:v}),{hint:'Reference only. Never paste the token value.'});
  const translations=node('details');translations.append(node('summary','Translate platform status values'));connection.append(translations);
  translations.className='guided-translations';translations.append(node('p','Map your platform’s status names to Pipeyard states. For example, completed becomes succeeded.'));
  const states=['queued','running','paused','awaiting-approval','succeeded','failed','cancelled','unknown'];
  Object.entries(p.statuses||{}).forEach(([remote,state],index)=>{let currentRemote=remote;const row=node('div');row.className='guided-custom-field';
   field(row,'Remote status '+(index+1),remote,v=>patch(c=>{const statuses=c.platforms.find(p=>p.id===platformId).statuses;if(v!==currentRemote&&Object.hasOwn(statuses,v))throw Error('That remote status already has a translation.');const value=statuses[currentRemote];delete statuses[currentRemote];statuses[v]=value;currentRemote=v;}));
   field(row,'Pipeyard status '+(index+1),state,v=>patch(c=>{c.platforms.find(p=>p.id===platformId).statuses[currentRemote]=v;}),{options:states.map(v=>[v,v])});
   action(row,'Remove status translation '+(index+1),()=>{patch(c=>{delete c.platforms.find(p=>p.id===platformId).statuses[currentRemote];});render();});translations.append(row);
  });
  action(translations,'Add status translation',()=>{patch(c=>{const target=c.platforms.find(p=>p.id===platformId);target.statuses??={};let key='completed',i=1;while(Object.hasOwn(target.statuses,key))key='status-'+i++;target.statuses[key]='succeeded';});render();root.querySelector('.guided-translations').open=true;});
  if(t){const template=group('Template');template.className='guided-grid';
   field(template,'Template name',t.name,v=>patch(c=>{c.templates.find(t=>t.id===templateId).name=v;}));
   field(template,'Description',t.description,v=>patch(c=>{c.templates.find(t=>t.id===templateId).description=v;}));
   field(template,'Check interval',String(t.intervalMinutes??defaultIntervalMinutes),v=>patch(c=>{c.templates.find(t=>t.id===templateId).intervalMinutes=Number(v);}),{options:intervals.map(v=>[String(v),intervalLabel(v)])});
   field(template,'Monitoring budget',String(t.waitMinutes??60),v=>patch(c=>{c.templates.find(t=>t.id===templateId).waitMinutes=Number(v);}),{options:[10,20,40,60,120].map(v=>[String(v),v+' minutes'])});
  }else scope='platform';
  const settings=group('Monitoring and summary');settings.className='guided-grid';
  field(settings,'Edit settings for',scope,v=>{scope=v;render();},{options:[['platform','Platform defaults'],...(t?[['template','Selected template overrides']]:[])]});
  const target=selected(c),monitor=target.monitoring||{};
  for(const [key,label] of [['progress','Progress checks'],['finalProgress','Final progress check']])field(settings,label,monitor[key]===undefined?'':String(monitor[key]),v=>setting(['monitoring',key],v===''?undefined:v==='true'),{options:[['',scope==='template'?'Inherit platform setting':'Automatic default'],['true','Enabled'],['false','Disabled']],hint:key==='finalProgress'?'One last progress read after a terminal status.':'Status checks always remain enabled.'});
  field(settings,'Run summary',target.summary?.mode||'',v=>setting(['summary','mode'],v||undefined),{options:[['',scope==='template'?'Inherit platform setting':'Completion (default)'],['completion','Completion percentage'],['stage','Current stage'],['both','Stage and completion'],['status','Status only']]});
  const response=group('Response mapping and visibility');
  field(response,'Mapping endpoint',source,v=>{source=v;render();},{options:[['status','Status response'],['progress','Progress response']]});
  const rules=target.responses?.[source]||{},parent=p.responses?.[source]||{};
  const mappingGrid=node('div');mappingGrid.className='guided-grid';response.append(mappingGrid);
  for(const [key,label] of [['status','Status field'],['progress','Completion field'],['stageName','Stage name field'],['message','Message field']])field(mappingGrid,label,rules.mappings?.[key]??'',v=>setting(['responses',source,'mappings',key],v||undefined),{hint:'Dot path'+(scope==='template'?' · blank inherits platform':' · blank uses default')});
  field(mappingGrid,'Progress scale',rules.progressScale||'',v=>setting(['responses',source,'progressScale'],v||undefined),{options:[['',scope==='template'?'Inherit platform setting':'Percent (default)'],['percent','Percent: 0 to 100'],['fraction','Fraction: 0 to 1']]});
  const stage=node('details');stage.append(node('summary','Stage position (optional)'));response.append(stage);
  const position=rules.mappings?.stagePosition;
  field(stage,'Stage position object field',typeof position==='string'?position:'',v=>{setting(['responses',source,'mappings','stagePosition'],v||undefined);},{hint:'Object with stage, currentIndex and total. It does not determine completion.'});
  if(position&&typeof position==='object')for(const key of ['stage','currentIndex','total'])field(stage,'Stage position '+key,position[key],v=>setting(['responses',source,'mappings','stagePosition',key],v));
  const more=node('details');more.append(node('summary','More response fields'));response.append(more);
  for(const [key,label,fallback] of [['id','Run ID','id'],['cost','Approval cost','cost_usd'],['stages','Stage details','stages'],['notes','Platform notes','notes'],['result','Result','result'],['stageName','Stage name',''],['message','Message','message'],['progress','Completion','progress']]){
   const mapping=rules.mappings?.[key],row=node('div');row.className='guided-grid';more.append(row);
   field(row,label+' mapping',mapping===null?'disabled':typeof mapping==='string'?'mapped':'inherit',v=>{setting(['responses',source,'mappings',key],v==='disabled'?null:v==='mapped'?(fallback||'phase'):undefined);render();for(const detail of root.querySelectorAll('details'))if(detail.firstChild?.textContent==='More response fields')detail.open=true;},{options:[['inherit',scope==='template'?'Inherit platform setting':'Use default'],['mapped','Read a field'],['disabled','Do not extract']]});
   if(typeof mapping==='string')field(row,label+' path',mapping,v=>setting(['responses',source,'mappings',key],v));
  }
  const mode=rules.desk?.mode||'';
  field(response,'Response visibility',mode,v=>{setting(['responses',source,'desk'],v?{mode:v,...(v==='custom'?{fields:[]}: {})}:undefined);render();},{options:[['',scope==='template'?'Inherit platform setting':'Raw JSON (default)'],['raw','Raw JSON'],['custom','Selected fields only'],['hidden','Hidden']]});
  if(mode==='custom'){
   const fields=rules.desk.fields||[];fields.forEach((f,index)=>{const row=node('div');row.className='guided-custom-field';
    const set=(key,v)=>patch(c=>{selected(c).responses[source].desk.fields[index][key]=v;});
    field(row,'Field '+(index+1)+' label',f.label,v=>set('label',v));field(row,'Field '+(index+1)+' path',f.path,v=>set('path',v));
    field(row,'Field '+(index+1)+' format',f.format||'text',v=>set('format',v),{options:['text','number','percent','title','json'].map(v=>[v,v])});
    field(row,'Field '+(index+1)+' fallback',f.fallback||'',v=>set('fallback',v));
    action(row,'Remove field '+(index+1),()=>{patch(c=>selected(c).responses[source].desk.fields.splice(index,1));render();});response.append(row);
   });action(response,'Add displayed field',()=>{patch(c=>{const target=selected(c);target.responses[source].desk.fields.push({label:'New field',path:'message',format:'text'});});render();});
  }else if(!mode&&scope==='template')response.append(node('p','Inherited visibility: '+(parent.desk?.mode||'raw')+'.'));
  const hint=node('p','Paths, response visibility, and monitoring apply to the selected settings scope. Advanced JSON retains launch operations, input bodies, and other adapter options.');hint.className='hint';root.append(hint);
 }
 textarea.addEventListener('input',()=>{onChange?.();render();});
 return {render,getTemplate:()=>templateId};
}
