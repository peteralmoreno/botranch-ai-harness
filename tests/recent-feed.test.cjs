const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../sources/omp-bot-companion/recent-feed.mjs');
const update=(id,at)=>({id,at,profileId:'brick',text:'Finished '+id,kind:'complete',private:'never expose'});
test('recent feed returns compact latest rows and resumes through same-time arrivals without dropping backlog',async()=>{
 const {recentFeed}=await load(),view={profiles:[{id:'brick',nickname:'Brick'}],updates:[update('z',100),update('y',100),update('x',99)]};
 const read=q=>recentFeed({view,runs:[],home:'home',query:new URLSearchParams(q)});
 const first=read('scope=ranch&limit=1');assert.equal(first.items.length,1);assert.equal(first.items[0].author,'Brick');assert(!JSON.stringify(first).includes('never expose'));
 view.updates.push(update('a',100),update('b',101),update('c',102));
 const next=read('scope=ranch&limit=1&after='+first.nextCursor);assert.equal(next.items[0].text,'Finished a');assert.equal(next.hasMore,true);
 const third=read('scope=ranch&limit=2&after='+next.nextCursor);assert.deepEqual(third.items.map(x=>x.text),['Finished b','Finished c']);assert.equal(third.hasMore,false);
 assert.equal(read('scope=ranch&after='+third.nextCursor).items.length,0);
 assert.throws(()=>read('scope=pipeyard&after='+first.nextCursor),/cursor/i);
 assert.throws(()=>recentFeed({view,runs:[],home:'other',query:new URLSearchParams('scope=ranch&after='+first.nextCursor)}),/cursor/i);
});
test('feed validates filters and pages chronological history including cleared pipes',async()=>{
 const {recentFeed}=await load(),runs=[{id:'r',title:'Report',archived:true,events:[{id:'e',at:20,kind:'complete',message:'Done'}],notes:[],metadata:{secret:'not a feed'}}];
 const read=q=>recentFeed({view:{updates:[update('a',10)]},runs,home:'h',query:new URLSearchParams(q)});
 assert.deepEqual(read('scope=all&since=0').items.map(x=>x.scope),['ranch','pipeyard']);assert(!JSON.stringify(read('scope=pipeyard')).includes('not a feed'));
 for(const q of ['scope=no','limit=0','limit=101','limit=2.5','since=-1','after=x','limit=1&limit=2','unknown=yes','after=x&since=0'])assert.throws(()=>read(q),undefined,q);
});
