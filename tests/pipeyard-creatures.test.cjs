const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCreatureStore}=require('../tools/creature-store.cjs');
test('background movement does not conflict with edits or overwrite a newer roster',()=>{
 const store=createCreatureStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pasture-sync-')),'creatures.json'));
 const first=store.read(),second=store.read();
 const moving=store.save({...first,background:true});
 assert.equal(moving.editRevision,first.editRevision);
 second.creatures[0].name='Shared Clover';const edited=store.save(second);
 assert.equal(edited.editRevision,first.editRevision+1);
 assert.deepEqual(store.save({...moving,background:true}),edited);
 const stale=structuredClone(second);stale.creatures[0].name='Stale name';
 assert.throws(()=>store.save(stale),/another window/);
 assert.equal(store.read().creatures[0].name,'Shared Clover');
});
test('animal roster, names, fullness and positions persist, with revision protection',()=>{const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pasture-')),'creatures.json'),store=createCreatureStore(file);const state=store.read();assert.equal(state.creatures.length,13);state.creatures[0].name='Clover';state.creatures[0].fullness=77;state.creatures[0].x=.4;state.creatures.pop();const saved=store.save(state);assert.equal(saved.revision,1);assert.deepEqual(createCreatureStore(file).read(),saved);assert.throws(()=>store.save(state),/another window/);saved.creatures.push({...saved.creatures[0]});assert.throws(()=>store.save(saved),/duplicate/);});
test('animal roster rejects invalid coordinates, names and counts without overwriting data',()=>{const store=createCreatureStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pasture-')),'creatures.json')),state=store.read();for(const patch of [{name:''},{x:2},{fullness:101},{type:'unknown'}]){const bad=structuredClone(state);Object.assign(bad.creatures[0],patch);assert.throws(()=>store.save(bad));}const bad=structuredClone(state);bad.creatures=Array.from({length:33},(_,i)=>({...state.creatures[0],id:'x'+i}));assert.throws(()=>store.save(bad),/32/);assert.deepEqual(store.read(),state);});
test('hunger rather than a timer determines eating and returning to food',async()=>{const {updateFullness,wantsHay,HAY_RADIUS}=await import('../designs/pipeyard/creature-behavior.mjs');assert.equal(HAY_RADIUS,420);const a={type:'cow',fullness:25,eating:false};assert(wantsHay(a));a.eating=true;updateFullness(a,120,true);assert.equal(a.fullness,61);assert(wantsHay(a));updateFullness(a,120,true);assert(!wantsHay(a));a.eating=false;updateFullness(a,120,false);assert(!wantsHay(a));updateFullness(a,1320,false);assert(wantsHay(a));});
test('animals seek food at 25 percent, not above it, but finish an ongoing meal',async()=>{const {wantsHay}=await import('../designs/pipeyard/creature-behavior.mjs');assert.equal(wantsHay({fullness:25.01,eating:false}),false);assert.equal(wantsHay({fullness:25,eating:false}),true);assert.equal(wantsHay({fullness:24,eating:false}),true);assert.equal(wantsHay({fullness:60,eating:true}),true);assert.equal(wantsHay({fullness:90,eating:true}),false);});
