import {createHash} from 'node:crypto';
import {pipelineFeed} from './setup/pipeyard-feed.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
const short=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').slice(0,max);
const validTime=value=>Number.isSafeInteger(value)&&value>=0;

/** Read only public projections. A bounded recent journal, not an audit archive. */
export function recentFeed({view,runs,home,query=new URLSearchParams()}) {
 const allowed=['scope','limit','since','after'];
 for(const key of query.keys())if(!allowed.includes(key)||query.getAll(key).length!==1)throw Error('Unsupported or repeated feed filter.');
 const scope=query.get('scope')||'all',size=query.get('limit')??'20',since=query.get('since'),after=query.get('after');
 if(!['all','ranch','pipeyard'].includes(scope))throw Error('Feed scope must be all, ranch or pipeyard.');
 if(!/^\d+$/.test(size)||Number(size)<1||Number(size)>100)throw Error('Feed limit must be 1–100.');
 if(since!==null&&after!==null)throw Error('Use since or after, not both.');
 if(since!==null&&(!/^\d+$/.test(since)||!validTime(Number(since))))throw Error('Feed since must be an epoch millisecond timestamp.');
 const binding=hash(JSON.stringify([home,scope]));let cursor=null;
 if(after!==null){
  try{
   if(after.length>14000||!/^[-\w]+$/.test(after))throw Error();
   cursor=JSON.parse(Buffer.from(after,'base64url').toString('utf8'));
   if(cursor.v!==1||cursor.binding!==binding||!validTime(cursor.at)||!Array.isArray(cursor.seen)||cursor.seen.length>500||cursor.seen.some(id=>typeof id!=='string'||! /^[a-f0-9]{16}$/.test(id)))throw Error();
  }catch{throw Error('Invalid feed cursor. Keep its scope and bot home unchanged, or start a new read.');}
 }
 const rows=[];
 if(scope!=='pipeyard')for(const update of (view.updates||[]).slice(-200)){
  rows.push({id:'ranch:'+update.id,scope:'ranch',at:update.at,kind:short(update.kind,80),text:short(update.text),profileId:short(update.profileId,160),taskId:update.taskId?short(update.taskId,160):null,author:short((view.profiles||[]).find(p=>p.id===update.profileId)?.nickname||update.profileId,160)});
 }
 if(scope!=='ranch')for(const row of [...pipelineFeed(runs),...pipelineFeed(runs,{history:true})]){
  rows.push({id:'pipeyard:'+row.id,scope:'pipeyard',at:row.at,kind:short(row.kind,80),text:short(row.text),runId:short(row.run.id,160),title:short(row.run.title,160),archived:!!row.run.archived});
 }
 const ordered=rows.filter(row=>validTime(row.at)&&row.text).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
 const eligible=cursor?ordered.filter(row=>row.at>cursor.at||row.at===cursor.at&&!cursor.seen.includes(hash(row.id))):since!==null?ordered.filter(row=>row.at>=Number(since)):ordered;
 const initial=!cursor&&since===null,limit=Number(size),items=initial?eligible.slice(-limit):eligible.slice(0,limit),last=items.at(-1);
 const at=last?.at??cursor?.at??(since!==null?Number(since):0);
 // On first read, earlier rows are intentionally skipped. Remember the whole boundary,
 // including rows outside the returned page, and allow late arrivals at the same time.
 const seen=initial?ordered.filter(row=>row.at===at).map(row=>hash(row.id)):[...(cursor?.at===at?cursor.seen:[]),...items.filter(row=>row.at===at).map(row=>hash(row.id))];
 const retainedIds=new Set(ordered.filter(row=>row.at===at).map(row=>hash(row.id)));
 const nextCursor=Buffer.from(JSON.stringify({v:1,binding,at,seen:[...new Set(seen)].filter(id=>retainedIds.has(id))})).toString('base64url');
 return {scope,items,nextCursor,hasMore:!initial&&eligible.length>items.length,retention:'Recent retained feed only; older or deleted entries may be unavailable.',oldestAvailableAt:ordered[0]?.at??null};
}
