// Derive a compact journal from persisted milestones, never from poll timestamps.
export const needsAttention=run=>['awaiting-approval','failed','unresolved'].includes(run.status)||!!run.lastError||run.tracking==='expired';
export function pipelineFeed(runs,{family='',run='',kind='',attention=false,history=false}={}){
 const rows=[];
 for(const item of runs){
  if(!!item.archived!==history||family&&(item.templateId||'board')!==family||run&&item.id!==run||attention&&!needsAttention(item))continue;
  for(const event of item.events||[]){
   if(event.kind==='note')continue; // Render the actual local note below, not its generic acknowledgement.
   rows.push({id:item.id+':event:'+event.id,at:event.at,source:event.source,kind:event.kind==='demo'?'progress':event.kind,text:String(event.message||'').slice(0,500),run:item});
  }
  for(const note of item.notes||[])rows.push({id:item.id+':note:'+note.id,at:note.at,kind:'note',text:String(note.text||'').slice(0,500),run:item});
 }
 return rows.filter(row=>row.text&&(!kind||row.kind===kind)).sort((a,b)=>Number(b.at)-Number(a.at)||a.id.localeCompare(b.id)).slice(0,150);
}
