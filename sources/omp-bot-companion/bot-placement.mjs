// Explicit placement wins; role-based defaults only migrate older profiles.
export function profileYard(profile){
 return profile?.yard==='pipeyard'||profile?.yard==='ranch'?profile.yard:profile?.role==='pipeyard-manager'?'pipeyard':'ranch';
}
export function profileSlots(profile){return profileYard(profile)==='pipeyard'?[6,7]:[0,1,2,3,4,5];}
export function slotLimit(profile){return profileYard(profile)==='pipeyard'?'Pipeyard has room for two active bots.':'The active ranch has room for six residents.';}
