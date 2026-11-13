const fs=require('node:fs'),path=require('node:path');
const LIMIT=32;
function defaults(){const xs=[.12,.72,.35,.81,.66,.21,.61,.82,.44,.87,.75,.92,.57],ys=[.19,.46,.82,.7,.24,.7,.25,.65,.4,.32,.62,.67,.78];return {version:1,revision:0,updatedAt:Date.now(),creatures:xs.map((x,i)=>({id:'animal-'+(i+1),type:i<5?'cow':i<9?'chicken':'sheep',variant:i<5?i+1:1,name:(i<5?'Cow ':i<9?'Chicken ':'Sheep ')+(i<5?i+1:i<9?i-4:i-8),x,y:ys[i],fullness:25+(i*9)%55,eating:false})),hay:[{id:'hay-1',x:.84,y:.45},{id:'hay-2',x:.79,y:.76}]};}
function validate(input){
 if(!input||input.version!==1||!Number.isInteger(input.revision)||!Array.isArray(input.creatures)||input.creatures.length>LIMIT||!Array.isArray(input.hay)||input.hay.length!==2)throw Error('Use version 1, a revision, at most 32 animals and two hay bales.');
 const ids=new Set();function position(item){if(!item||typeof item.id!=='string'||!/^[a-z0-9-]{1,80}$/i.test(item.id)||ids.has(item.id)||!Number.isFinite(item.x)||!Number.isFinite(item.y)||item.x<0||item.x>1||item.y<0||item.y>1)throw Error('Invalid or duplicate object identity or position.');ids.add(item.id);return {id:item.id,x:item.x,y:item.y};}
 const creatures=input.creatures.map(item=>{const p=position(item);if(!['cow','chicken','sheep'].includes(item.type)||typeof item.name!=='string'||!item.name.trim()||item.name.length>80||/[\x00-\x1f\x7f]/.test(item.name)||!Number.isFinite(item.fullness)||item.fullness<0||item.fullness>100||!Number.isInteger(item.variant)||item.variant<1||item.variant>5||typeof item.eating!=='boolean')throw Error('Invalid animal name, species, fullness or variant.');return {...p,type:item.type,variant:item.variant,name:item.name.trim(),fullness:item.fullness,eating:item.eating};});
 const hay=input.hay.map(position);return {version:1,revision:input.revision,creatures,hay};
}
function createCreatureStore(file){
 function read(){if(!fs.existsSync(file)){const initial={...defaults(),editRevision:0};write(initial);return initial;}const value=JSON.parse(fs.readFileSync(file,'utf8'));if(!Number.isFinite(value.updatedAt)||value.updatedAt<0)throw Error('Animal file has an invalid save timestamp.');return {...validate(value),editRevision:Number.isInteger(value.editRevision)?value.editRevision:value.revision,updatedAt:value.updatedAt};}
 function write(state){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);}
 function save(input){
  let next=validate(input);const current=read(),background=input.background===true;
  // Simulation snapshots never replace newer edits. Return that state for the view to adopt.
  if(background&&next.revision!==current.revision)return current;
  if(!background&&next.revision!==current.revision&&input.editRevision!==current.editRevision){const error=Error('Animals changed in another window. Reload before saving.');error.status=409;throw error;}
  if(background){const positions=new Map(next.creatures.map(a=>[a.id,a]));next={...current,creatures:current.creatures.map(a=>{const p=positions.get(a.id);return p?{...a,x:p.x,y:p.y,fullness:p.fullness,eating:p.eating}:a;})};}
  next.revision=current.revision+1;next.editRevision=current.editRevision+(background?0:1);next.updatedAt=Date.now();write(next);return next;
 }
 return {read,save};
}
module.exports={createCreatureStore,validate,defaults,LIMIT};
