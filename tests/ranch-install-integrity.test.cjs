const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');

function fixture(root, version, extra = {}) {
  const source = path.join(root, 'source-' + version);
  fs.mkdirSync(source, {recursive:true});
  const contents = {'open-setup.mjs':'// release ' + version, 'ranch-cli.mjs':'// CLI', ...extra};
  for (const [file, text] of Object.entries(contents)) {
    fs.mkdirSync(path.dirname(path.join(source,file)), {recursive:true});
    fs.writeFileSync(path.join(source,file), text);
  }
  const hashes = Object.fromEntries(Object.entries(contents).map(([file,text]) => [file,createHash('sha256').update(text).digest('hex')]));
  fs.writeFileSync(path.join(source,'release.json'),JSON.stringify({version,files:Object.keys(contents),hashes}));
  return source;
}
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'ranch-integrity-'));
  t.after(() => {assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true,maxRetries:5});});
  return root;
}
const current = root => JSON.parse(fs.readFileSync(path.join(root,'current.json'),'utf8'));

test('same-version install verifies both supplied and installed content before reusing it', async t => {
  const {installRelease}=await import('../sources/omp-bot-companion/install.mjs');
  const root=temporary(t),source=fixture(root,'1.0.0'),target=path.join(root,'installed');
  installRelease(source,target);
  installRelease(source,target);
  fs.writeFileSync(path.join(target,'versions/1.0.0/open-setup.mjs'),'corrupt existing version');
  assert.throws(()=>installRelease(source,target),/integrity|different|checksum/i);
  assert.deepEqual(current(target),{version:'1.0.0'});
});
test('same-version changed package fails without activating the stale directory', async t => {
  const {installRelease}=await import('../sources/omp-bot-companion/install.mjs');
  const root=temporary(t),first=fixture(root,'1.0.0'),target=path.join(root,'installed');
  installRelease(first,target);installRelease(fixture(root,'1.0.1'),target);
  fixture(root,'1.0.0',{'open-setup.mjs':'different verified package'});
  assert.throws(()=>installRelease(first,target),/integrity|different|checksum/i);
  assert.equal(current(target).version,'1.0.1');
});
test('source corruption and absent hashes cannot change the active pointer', async t => {
  const {installRelease}=await import('../sources/omp-bot-companion/install.mjs');
  const root=temporary(t),target=path.join(root,'installed');installRelease(fixture(root,'1.0.0'),target);
  const next=fixture(root,'1.0.1');fs.writeFileSync(path.join(next,'open-setup.mjs'),'corruption');
  assert.throws(()=>installRelease(next,target),/integrity|checksum/i);
  assert.equal(current(target).version,'1.0.0');
  const manifest=JSON.parse(fs.readFileSync(path.join(next,'release.json')));delete manifest.hashes;
  fs.writeFileSync(path.join(next,'release.json'),JSON.stringify(manifest));
  assert.throws(()=>installRelease(next,target),/checksum|integrity/i);
});
test('desktop manifest omission cannot turn a missing renderer into a valid package', async t => {
  const {installRelease}=await import('../sources/omp-bot-companion/install.mjs');
  const root=temporary(t),source=fixture(root,'1.0.0',{'desktop/botRanch.exe':'fixture'});
  assert.throws(()=>installRelease(source,path.join(root,'installed')),/desktop|renderer/i);
});
test('staged copy corruption and copy failures preserve active version and remove only staging', async t => {
  const {installRelease}=await import('../sources/omp-bot-companion/install.mjs');
  const root=temporary(t),target=path.join(root,'installed');installRelease(fixture(root,'1.0.0'),target);
  const source=fixture(root,'1.0.1'),original=fs.copyFileSync;
  for(const failure of ['corrupt','throw']) {
    fs.copyFileSync=(from,to,...args)=>{if(String(to).includes('.install-')&&String(to).endsWith('open-setup.mjs')){if(failure==='throw')throw Error('copy fixture failed');original(from,to,...args);fs.writeFileSync(to,'copy was corrupted');return;}return original(from,to,...args);};
    try {assert.throws(()=>installRelease(source,target),/copy fixture|integrity|checksum/i);} finally {fs.copyFileSync=original;}
    assert.equal(current(target).version,'1.0.0');
    assert.equal(fs.existsSync(path.join(target,'versions/1.0.1')),false);
    assert.deepEqual(fs.readdirSync(path.join(target,'versions')),['1.0.0']);
  }
});
test('active pointer rename failure preserves both previous pointer and release', async t => {
  const {installRelease}=await import('../sources/omp-bot-companion/install.mjs');
  const root=temporary(t),target=path.join(root,'installed');installRelease(fixture(root,'1.0.0'),target);
  const before=fs.readFileSync(path.join(target,'current.json'),'utf8'),original=fs.renameSync;
  fs.renameSync=(from,to)=>{if(to===path.join(target,'current.json'))throw Error('pointer rename fixture');return original(from,to);};
  try{assert.throws(()=>installRelease(fixture(root,'1.0.1'),target),/pointer rename/);}finally{fs.renameSync=original;}
  assert.equal(fs.readFileSync(path.join(target,'current.json'),'utf8'),before);
  assert.equal(fs.readFileSync(path.join(target,'versions/1.0.0/open-setup.mjs'),'utf8'),'// release 1.0.0');
});
test('rollback validates preserved release and atomically records the candidate as previous', async t => {
  const {installRelease,rollbackRelease}=await import('../sources/omp-bot-companion/install.mjs');
  const root=temporary(t),target=path.join(root,'installed'),home=path.join(root,'home.txt');fs.writeFileSync(home,'compatible state');
  installRelease(fixture(root,'1.0.0'),target);installRelease(fixture(root,'1.0.1'),target);
  assert.deepEqual(current(target),{version:'1.0.1',previousVersion:'1.0.0'});
  rollbackRelease(target);
  assert.deepEqual(current(target),{version:'1.0.0',previousVersion:'1.0.1'});
  assert.equal(fs.readFileSync(home,'utf8'),'compatible state');
  fs.writeFileSync(path.join(target,'versions/1.0.1/open-setup.mjs'),'corrupt rollback');
  assert.throws(()=>rollbackRelease(target),/integrity|checksum/i);
  assert.equal(current(target).version,'1.0.0');
});
test('historical checksum file verifies legacy release and survives installation for rollback', async t => {
  const {installRelease,validateRelease}=await import('../sources/omp-bot-companion/install.mjs');
  const root=temporary(t),source=fixture(root,'1.0.0'),target=path.join(root,'installed');
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'release.json')));delete manifest.hashes;
  fs.writeFileSync(path.join(source,'release.json'),JSON.stringify(manifest));
  const sums=[...manifest.files,'release.json'].map(file=>createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex')+'  '+file).join('\n');
  fs.writeFileSync(path.join(source,'SHA256SUMS.txt'),sums+'\n');installRelease(source,target);
  assert.equal(validateRelease(path.join(target,'versions/1.0.0')).version,'1.0.0');
});
