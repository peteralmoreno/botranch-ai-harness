export {botColors,colorNames} from '../omp-bot-companion/setup/bot-palette.mjs';
export type Delivery={id:string;phase:string;reason?:string};
export type Reporting={automatic?:boolean;lastActivityAt?:number|null;supported:boolean;lastAcceptedAt?:number;lastResult?:string};
export type Profile = {delivery?:Delivery|null;reporting?:Reporting;id:string;nickname:string;color?:number;revision:number;folder?:string;personality?:string;contextPolicy?:string;instructionsPath?:string;readOnly?:boolean;role?:string;yard?:'ranch'|'pipeyard';design?:string;state?:string;label?:string;status?:string;active?:boolean;autoPickup?:boolean;retireAfterCurrent?:boolean;workCheckSupported?:boolean;workCheckPending?:boolean;busy?:boolean;activityBusy?:boolean};
export type Task = {id:string;title:string;revision:number;status:string;archived?:boolean;assignedProfileId?:string|null;family?:{id?:string;name:string;color:string}|null;stickyMode?:'inherit'|'on'|'off';sticky?:boolean;familyStickyDefault?:boolean|null;preferredProfileId?:string|null;instructions?:string;projectFolder?:string;acceptanceCriteria?:string;workStation?:string;reasoningRequest?:string;modelEligibility?:string[];humanReview?:boolean;pipeOnly?:boolean;releasedForPickup?:boolean;queueOrder?:number;dependsOn?:string[];waitingReason?:string;resultSummary?:string;pipeline?:object;attempts?:{state:string;delivery?:Delivery}[]};
export type RanchState = {profileYards?:boolean;uiRequest?:{id:string;view:string}|null;appVersion?:string;profiles:Profile[];tasks:Task[];familyPolicies?:Record<string,{sticky:boolean}>;updates:{source?:string;id:string;profileId:string;taskId?:string;text:string;at:number}[];pickupPaused:boolean;taskRevision:number;homeFolder:string;roles:{id:string;name:string;model?:string;error?:string}[];error?:string;offline?:boolean};
export type Reply = {error?:string;result?:any};
export type RunAction = (name:string,body:object,message?:string)=>Promise<any>;


export const familyColors:Record<string,string>={mint:'#80d9b4',cyan:'#7cd8eb',lavender:'#b7a6f3',rose:'#ee9bbc',amber:'#e8bd74',lime:'#b5cf79'};
export function taskInput(task:Task){return {id:task.id,title:task.title,instructions:task.instructions||'',projectFolder:task.projectFolder||'',acceptanceCriteria:task.acceptanceCriteria||'',workStation:task.workStation||'auto',reasoningRequest:task.reasoningRequest||'auto',expectedRevision:task.revision};}
export function activeTask(task:Task){return task.attempts?.some(a=>['dispatching','awaiting-runtime','claimed','running','unresolved'].includes(a.state))||task.status==='doing';}

export function botYard(profile?:Profile|null):'ranch'|'pipeyard'{return profile?.yard|| (profile?.role==='pipeyard-manager'?'pipeyard':'ranch');}
