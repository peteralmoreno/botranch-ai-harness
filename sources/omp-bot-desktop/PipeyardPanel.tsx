import {visiblePipelineLinks} from '../omp-bot-companion/setup/pipeline-links.mjs';
import {intervals,defaultIntervalMinutes,intervalLabel} from '../omp-bot-companion/setup/pipeyard-intervals.mjs';
import {botColors,colorNames} from './sidebar-model';
import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';

type Manager={id:string;nickname:string;state:string;label:string;taskCount:number};
type Response={mode:'raw'|'custom';source:string;fetchedAt:number;data?:unknown;fields?:{label:string;value:string;diagnostic?:string}[]};
type Run={ticketUrl?:string|null;pipelineUrl?:string|null;intervalMinutes?:number;deadline?:number;retryAt?:number;costUsd?:number|null;stagePosition?:{stage:string;currentIndex:number|null;total:number};responses?:{status:Response|null;progress:Response|null};responseVisibility?:{status:string;progress:string};responseAttempts?:{status?:{at:number;error?:string};progress?:{at:number;error?:string}};managerAssignment?:{nickname:string;status:string;summary:string;available:boolean};updatedAt?:number;shape?:string;localOnly?:boolean;id:string;title:string;templateName:string;platformName?:string;externalId?:string;status:string;tracking:string;source?:string;taskId?:string;color?:string;archived?:boolean;message?:string;lastError?:string;checkDue?:boolean;lastCheckedAt?:number;nextCheckAt?:number;displayProgress?:number|null;progress?:number|null;progressSource?:string;progressEstimate?:unknown;progressResponse?:{source:string;fetchedAt:number;data:unknown};metadata?:unknown;input?:unknown;result?:unknown;stages?:unknown;platformNotes?:unknown;notes?:{id:string;at:number;text:string}[];events?:{id:string;at:number;text?:string;message?:string}[]};
const labels:Record<string,string>={running:'Running',queued:'Queued',paused:'Workflow paused','awaiting-approval':'Needs approval',succeeded:'Completed',failed:'Failed',cancelled:'Cancelled',unknown:'Status unknown',unresolved:'Needs reconciliation',submitting:'Submitting',ready:'Ready'};
const runLabel=(r:Run)=>r.localOnly?'Local placeholder':labels[r.status]||r.status;
const completed=(r:Run)=>['succeeded','failed','cancelled'].includes(r.status);
const attention=(r:Run)=>['awaiting-approval','unresolved','failed'].includes(r.status)||!!r.lastError;
const date=(at?:number)=>at?new Date(at).toLocaleString():'Not yet';
function progress(r:Run){const value=r.displayProgress===undefined?r.progress:r.displayProgress;return typeof value==='number'&&Number.isFinite(value)?Math.round(value)+'%':'Progress unknown';}
function ObjectView({value}:{value:unknown}){
 let budget=400;
 function branch(value:unknown,name:string,depth:number):ReactNode{
  if(budget--<=0||depth>8)return <span>More in raw JSON</span>;
  if(value!==null&&typeof value==='object')return <details open={depth<2} key={name}><summary>{name} {Array.isArray(value)?'['+value.length+']':'{'+Object.keys(value).length+'}'}</summary>{Object.entries(value).slice(0,100).map(([key,item])=><div className="pipe-object-child" key={key}>{branch(item,key,depth+1)}</div>)}</details>;
  return <div className="pipe-object-value"><span>{name}: </span><code>{typeof value==='string'?value:JSON.stringify(value)}</code></div>;
 }
 return <div className="pipe-object">{branch(value,'Response',0)}<details><summary>Raw JSON</summary><pre tabIndex={0}>{JSON.stringify(value,null,2)}</pre></details></div>;
}
export default function PipeyardPanel({connected,popout,openRanch,drafts}:{drafts:Map<string,string>;connected:boolean;popout:(taskId?:string)=>void;openRanch:()=>void}){
 const [managers,setManagers]=useState<Manager[]>([]),[managerId,setManagerId]=useState(''),[pickupPaused,setPickupPaused]=useState(false);
 const [runs,setRuns]=useState<Run[]>([]),[selected,setSelected]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('active');
 const [appearance,setAppearance]=useState({shape:'standard',color:'#61b7ba'});
 const [deleteTarget,setDeleteTarget]=useState<{id:string;updatedAt:number;title:string}|null>(null);
 const [available,setAvailable]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState(''),[note,setNote]=useState(''),[minutes,setMinutes]=useState(60);
 const [frequency,setFrequency]=useState<number|null>(null),[frequencyError,setFrequencyError]=useState(''),[frequencyPending,setFrequencyPending]=useState(false);
 const alive=useRef(true),fetching=useRef(false),working=useRef(false),checked=useRef('');
 async function refresh(){
  if(fetching.current)return;fetching.current=true;
  try{const reply=await window.botRanch.pipeyard('snapshot');if(reply.error||!Array.isArray(reply.result?.runs))throw Error(reply.error||'Invalid pipeline response.');if(alive.current){setRuns(reply.result.runs);setManagers(reply.result.managers||[]);setPickupPaused(!!reply.result.pickupPaused);setAvailable(true);setNotice(current=>current.startsWith('Pipeyard unavailable.')?'':current);}}
  catch{if(alive.current){setAvailable(false);setNotice('Pipeyard unavailable. Showing saved information; actions are disabled.');}}finally{fetching.current=false;}
 }
 useEffect(()=>{alive.current=true;if(connected)void refresh();else setAvailable(false);const timer=setInterval(()=>{if(connected&&!working.current&&!document.hidden)void refresh();},4000);return()=>{alive.current=false;clearInterval(timer);};},[connected]);
 async function act(action:string,body:object={},success='Updated.'){
  if(!connected||!available||working.current)return false;
  working.current=true;setPending(true);setNotice('');
  try{const reply=await window.botRanch.pipeyard('action',{action,id:selected,...body});if(reply.error)throw Error(reply.error);if(alive.current){await refresh();}return true;}
  catch(error){if(alive.current)setNotice(error instanceof Error?error.message:'Pipeline action failed.');return false;}
  finally{working.current=false;if(alive.current)setPending(false);}
 }
 useEffect(()=>{if(!managers.some(p=>p.id===managerId))setManagerId(managers[0]?.id||'');},[managers,managerId]);
 async function saveFrequency(){
  if(frequency===null||working.current||!connected||!available)return;
  const id=selected,value=frequency;working.current=true;setFrequencyPending(true);setFrequencyError('');
  try{for(let attempt=0;attempt<3;attempt++){
   if(!alive.current)return;
   const reply=await window.botRanch.pipeyard('action',{action:'set-check-interval',id,intervalMinutes:value});
   if(!reply.error){await refresh();setFrequency(null);return;}
   if(reply.code!=='PIPEYARD_BUSY'||!reply.retryable||attempt===2)throw Error(reply.error);
   await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }}catch(error){if(alive.current)setFrequencyError((error instanceof Error?error.message:'Could not save frequency.')+' Your change is still unsaved. Retry saving.');}
  finally{working.current=false;if(alive.current)setFrequencyPending(false);}
 }
 const run=runs.find(r=>r.id===selected),disabled=!connected||!available||pending||frequencyPending;
 useEffect(()=>{if(!selected){checked.current='';return;}if(!run||disabled||checked.current===selected)return;checked.current=selected;if(run.checkDue&&!run.archived&&run.externalId&&run.source!=='board'&&!completed(run))void act('check-due',{},'Due progress checked.');},[selected,run?.id,disabled]);
 useEffect(()=>{setAppearance({shape:run?.shape||'standard',color:run?.color||'#61b7ba'});},[run?.id,run?.shape,run?.color]);
 const choose=(r:Run)=>{checked.current='';setDeleteTarget(null);setSelected(r.id);setFrequency(null);setFrequencyError('');setNote(drafts.get(r.id)||'');setNotice('');};
 const visible=runs.filter(r=>(filter==='history'?!!r.archived:!r.archived)&&(filter!=='attention'||attention(r))&&[r.title,r.externalId,r.templateName].join(' ').toLowerCase().includes(query.toLowerCase()));
 return <section className="pipe-panel" aria-label="Pipeline operations">
  <div className="section-toolbar"><button className="text-button" disabled={pending} onClick={()=>void refresh()}>Refresh list</button><button className="text-button" onClick={()=>popout()}>Full Pipeyard</button><button className="text-button" onClick={openRanch}>Visual Ranch</button></div>

  {run&&run.source!=='board'&&!run.archived&&managers.length>0&&<div className="pipe-manager-handoff"><label>Manager<select value={managerId} onChange={e=>setManagerId(e.target.value)}>{managers.map(p=><option key={p.id} value={p.id}>{p.nickname}</option>)}</select></label><button disabled={disabled||!managerId} onClick={()=>void act('handoff',{managerId},'Manager review queued. '+(pickupPaused?'Pickup is paused.':''))}>Hand off run</button></div>}
  {run?.managerAssignment&&<p className="field-hint">{run.managerAssignment.nickname} · {run.managerAssignment.status}{run.managerAssignment.summary&&' · '+run.managerAssignment.summary}</p>}
  {notice&&<p className="inline-notice" role="status">{notice}</p>}
  {run?<div className="sidebar-detail pipe-detail">
   <button className="text-button" disabled={pending} onClick={()=>{setSelected('');setNotice('');}}>Back to pipelines</button><h2>{run.title}</h2>
   <p className="pipe-state">{runLabel(run)} · {progress(run)}</p>{run.stagePosition&&<p>Stage {run.stagePosition.currentIndex??'?'} of {run.stagePosition.total}{run.stagePosition.stage&&' — '+run.stagePosition.stage}</p>}
   {!run.localOnly&&run.tracking==='paused'&&<p className="inline-notice">Local monitoring paused. External work may continue.</p>}{run.tracking==='expired'&&<p className="inline-notice">Monitoring asleep. External work may continue.</p>}
   {run.message&&<p>{run.message}</p>}{run.lastError&&<p className="inline-notice">Last check: {run.lastError}</p>}
   <dl className="pipe-facts"><dt>Pipeline ID</dt><dd>{run.externalId||'Not connected'}</dd><dt>Local ID</dt><dd>{run.id}</dd><dt>Template</dt><dd>{run.templateName}</dd><dt>Platform</dt><dd>{run.platformName||'Unknown'}</dd><dt>Last check</dt><dd>{date(run.lastCheckedAt)}</dd><dt>Next eligible check</dt><dd>{run.nextCheckAt?date(Math.max(run.nextCheckAt,run.retryAt||0)):'Not scheduled'}</dd><dt>Monitoring deadline</dt><dd>{date(run.deadline)}</dd><dt>Retry boundary</dt><dd>{run.retryAt?date(run.retryAt):'No retry delay'}</dd><dt>Approval cost</dt><dd>{run.costUsd==null?'Not reported':'$'+run.costUsd.toFixed(2)}</dd></dl>
   <div className="button-row" aria-label="Pipeline links">{(['ticket','pipeline'] as const).map(link=>{const url=visiblePipelineLinks(run)[link==='ticket'?'ticketUrl':'pipelineUrl'];return url&&<button key={link} className="text-button" disabled={disabled} title={url} onClick={async()=>{const reply=await window.botRanch.pipeyard('open-link',{id:run.id,link});if(reply.error)setNotice(reply.error);}}>{link==='ticket'?'Ticket / Jira ↗':'Pipeline page ↗'}</button>;})}</div>
   <fieldset className="sidebar-fields" aria-label="Pipeline appearance" disabled={disabled}>
    <label>Pipe shape<select value={appearance.shape} onChange={e=>setAppearance({...appearance,shape:e.target.value})}>{[['standard','Original'],['orchestrator','Orchestrator'],['checkpoint','Checkpoint'],['quick','Quick']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <fieldset className="color-palette pipe-color-palette"><legend>Pipe color · {colorNames[botColors.indexOf(appearance.color.toLowerCase())]||'Custom'}</legend>{botColors.map((c,i)=><button type="button" key={c} title={colorNames[i]} aria-label={colorNames[i]} aria-pressed={appearance.color.toLowerCase()===c} style={{'--swatch':c} as CSSProperties} onClick={()=>setAppearance({...appearance,color:c})}/>)}{!botColors.includes(appearance.color.toLowerCase())&&<button type="button" title="Current custom color" aria-label="Current custom color" aria-pressed="true" style={{'--swatch':appearance.color} as CSSProperties}/>}</fieldset>
    <button onClick={()=>void act('set-appearance',appearance,'Pipeline appearance saved.')}>Save appearance</button>
   </fieldset>
   {run.source!=='board'&&<fieldset className="sidebar-fields" disabled={disabled}><label>Check frequency<select aria-label="Check frequency" aria-describedby={frequencyError?'pipe-frequency-error':undefined} value={frequency??run.intervalMinutes??defaultIntervalMinutes} onChange={e=>{setFrequency(Number(e.target.value));setFrequencyError('');}}>{intervals.map((value:number)=><option value={value} key={value}>{intervalLabel(value)}</option>)}</select></label><p className="field-hint">Saved frequency: {intervalLabel(run.intervalMinutes??defaultIntervalMinutes)}</p><button disabled={frequency===null} onClick={()=>void saveFrequency()}>{frequencyPending?'Saving frequency…':'Save frequency'}</button>{frequencyError&&<p id="pipe-frequency-error" role="alert" className="field-error">{frequencyError}</p>}</fieldset>}
   {run.source==='board'?<p>Managed by its Board task. <button className="text-button" onClick={()=>popout(run.taskId)}>Open Board task</button></p>:<>
    <fieldset className="sidebar-fields" disabled={disabled}><div className="button-row">
     <button disabled={!run.externalId||!!run.archived} onClick={()=>void act('refresh',{},'Progress checked.')}>Check now</button>
     {run.tracking==='active'&&!completed(run)&&!run.archived&&<button onClick={()=>void act('pause-tracking',{},'Local monitoring paused.')}>Pause monitoring</button>}
     <button onClick={()=>void act(run.archived?'restore':'clear',{},run.archived?'Returned to the yard.':'Cleared from the yard; retained in History.')}>{run.archived?'Restore to yard':'Clear from yard'}</button>
     {run.archived&&<button disabled={!Number.isSafeInteger(run.updatedAt)} onClick={()=>setDeleteTarget({id:run.id,title:run.title,updatedAt:run.updatedAt!})}>Delete from History</button>}
    </div>
    {deleteTarget?.id===run.id&&<div role="group" aria-label="Confirm History deletion"><p>Delete {deleteTarget.title}, its local notes and saved results permanently? External work and Board task history are unchanged.</p><div className="button-row"><button onClick={()=>setDeleteTarget(null)}>Cancel deletion</button><button onClick={async()=>{const target=deleteTarget;if(await act('delete',{id:target.id,confirmed:true,expectedUpdatedAt:target.updatedAt},'Deleted from local History.')){drafts.delete(target.id);setDeleteTarget(null);setSelected('');}}}>Delete permanently</button></div></div>}
    {!completed(run)&&run.externalId&&run.tracking!=='active'&&!run.archived&&<><label>Monitor for<select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[10,20,40,60,120].map(n=><option key={n} value={n}>{n<60?n+' minutes':n/60+' hour'+(n===120?'s':'')}</option>)}</select></label><button onClick={()=>void act('resume-tracking',{minutes},'Local monitoring resumed.')}>Resume monitoring</button></>}
    <label htmlFor="pipe-local-note">Local pipeline note</label><textarea id="pipe-local-note" value={note} maxLength={4000} rows={3} onChange={e=>{setNote(e.target.value);drafts.set(run.id,e.target.value);}}/><button disabled={!note.trim()} onClick={async()=>{const text=note,id=run.id;if(await act('note',{text},'Note saved.')){if(drafts.get(id)===text)drafts.delete(id);if(alive.current)setNote('');}}}>Save note</button>
    </fieldset><p className="field-hint">Clear only removes local visibility. It does not cancel external work. Platform actions and connection edits are in Full Pipeyard.</p>
   </>}
   {(['status','progress'] as const).map(source=>{const response=run.responses?.[source],attempt=run.responseAttempts?.[source];return <section className="pipe-response" key={source}><h3>Saved {source} response</h3>{response?<><p className="field-hint">{source} · {date(response.fetchedAt)}</p>{response.mode==='custom'?<dl className="pipe-response-fields">{response.fields?.map((field,i)=><div key={i}><dt>{field.label}</dt><dd>{field.value??'—'}</dd>{field.diagnostic&&<dd className="field-hint">{field.diagnostic}</dd>}</div>)}</dl>:response.mode==='raw'?<ObjectView value={response.data}/>:null}</>:<p className="field-hint">{run.responseVisibility?.[source]==='hidden'?'Response hidden by configuration.':'No saved response for this endpoint.'}</p>}{attempt?.error&&<p className="field-error">Last attempt {date(attempt.at)}: {attempt.error}. Showing the last saved response.</p>}</section>;})}
   {(['metadata','input','stages','result','platformNotes','progressEstimate'] as const).map(key=>run[key]!=null&&<details className="pipe-data-section" key={key}><summary>{({metadata:'Metadata',input:'Input',stages:'Stages',result:'Result',platformNotes:'Platform notes',progressEstimate:'Local estimate'})[key]}</summary><ObjectView value={run[key]}/></details>)}
   <h3>Local notes</h3>{run.notes?.length?run.notes.slice(-30).reverse().map(n=><article className="pipe-note" key={n.id}><time>{date(n.at)}</time><p>{n.text}</p></article>):<p className="field-hint">No notes yet.</p>}
   {!!run.events?.length&&<details><summary>Recent activity</summary>{run.events.slice(-15).reverse().map((e,i)=><p key={e.id||i}>{date(e.at)} · {e.text||e.message}</p>)}</details>}
  </div>:<>
   <div className="board-lanes" aria-label="Pipeline filters">{[['active','Active'],['attention','Needs you'],['history','History']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
   <label className="pipe-search">Find a pipeline<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Title, template or pipeline ID"/></label>
   <p className="field-hint">{visible.length} pipelines · {available?'Live local tracking':'Last known view'}</p>
   {visible.map(r=><button key={r.id} className="pipe-list-row" style={{'--pipe-color':/^#[a-f0-9]{6}$/i.test(r.color||'')?r.color:'#aab7bb'} as CSSProperties} onClick={()=>choose(r)}><strong>{r.title}</strong><span>{runLabel(r)}{attention(r)?' · Needs you':''}</span><span>{progress(r)} · {r.templateName}</span><small>{r.externalId||'No external ID'}{r.localOnly?' · Not connected':r.tracking==='paused'?' · Monitoring paused':r.tracking==='expired'?' · Monitoring asleep':''}</small></button>)}
   {!visible.length&&<p className="field-hint">{available?'No matching pipelines. Use Full Pipeyard to launch or track an existing run.':'Connect the companion to load pipelines.'}</p>}
  </>}
 </section>;
}
