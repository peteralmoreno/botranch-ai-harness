const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stageRanch, widgetFiles, projects } = require('../tools/build.cjs');

test('release staging includes complete source UI and excludes private or generated files', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-build-test-'));
  try {
    const source = path.join(temporary, 'source');
    fs.cpSync(path.join(__dirname, '../sources'), source, { recursive: true, filter: p => !/[\\/](bin|obj)([\\/]|$)/.test(p) });
    const companion = path.join(source, 'omp-bot-companion');
    for (const file of ['pairing-key.txt', 'admin-key.txt', 'ranch.json', 'ranch-updates.json', '.env', 'unexpected.mjs']) fs.writeFileSync(path.join(companion, file), 'PRIVATE');
    fs.mkdirSync(path.join(companion, 'sessions'));
    fs.writeFileSync(path.join(companion, 'sessions/private.json'), 'PRIVATE');
    const output = path.join(temporary, 'output');
    stageRanch(source, output);
    assert.equal(require('node:child_process').spawnSync(path.join(output,'bin/Terminal-Control.exe'),['probe'],{encoding:'utf8',windowsHide:true}).stdout.trim(),'ready:1');
    assert.ok(JSON.parse(fs.readFileSync(path.join(output,'release.json'))).files.includes('bin/Terminal-Control.exe'));
    for (const file of ['pairing-key.txt', 'admin-key.txt', 'ranch.json', 'ranch-updates.json', '.env', 'unexpected.mjs', 'sessions']) assert.equal(fs.existsSync(path.join(output, file)), false, file);
    const skillResult = require('node:child_process').spawnSync(process.execPath,[path.join(output,'ranch-cli.mjs'),'skill','--json'],{cwd:temporary,encoding:'utf8',windowsHide:true,env:{...process.env,OMP_BOT_KEY_FILE:path.join(temporary,'missing-credentials')}});
    assert.equal(skillResult.status,0,skillResult.stderr);
    const skill=JSON.parse(skillResult.stdout);assert.equal(skill.path,path.join(output,'skills/bot-ranch-pm/SKILL.md'));assert.ok(skill.text.includes('humanReview'));
    for (const file of ['pipeline.mjs','pipeline-manager.mjs','updates.mjs','sounds/completion.wav']) assert.ok(fs.statSync(path.join(output,file)).isFile(),file);
    for (const file of ['guides/bot-ranch-loop.md','guides/bot-ranch-pipeline.md']) assert.ok(fs.statSync(path.join(output,file)).isFile(),file);
    assert.ok(fs.readFileSync(path.join(output,'README.md'),'utf8').includes('(guides/bot-ranch-loop.md)'));
    for(const file of ['README.md',...fs.readdirSync(path.join(output,'guides')).filter(f=>f.endsWith('.md')).map(f=>'guides/'+f)]){
      for(const match of fs.readFileSync(path.join(output,file),'utf8').matchAll(/\]\(([^)]+)\)/g)){
        const link=match[1].split('#')[0];if(!link||/^(?:https?:|mailto:)/.test(link))continue;
        assert.ok(fs.existsSync(path.resolve(output,path.dirname(file),link)),`${file}: missing ${link}`);
      }
    }
    for (const file of widgetFiles.ranch) assert.deepEqual(fs.readFileSync(path.join(output, 'ui', file)), fs.readFileSync(path.join(source, projects.ranch.source, file)));
    for (const file of ['desk/index.html', 'desk/app.js', 'desk/widget.css', 'desk/resources/icon.svg', 'setup/index.html', 'setup/app.js', 'setup/style.css', 'setup/settings.css', 'release.json', 'install.mjs', 'companion-start.mjs', 'Install-Shortcut.ps1', 'Install botRanch.cmd', 'Open botRanch.cmd', 'Open Bot Ranch Setup.cmd', 'Terminal-Control.ps1', 'extension.mjs', 'runtime-policy.mjs', 'bot-library.mjs', 'queue-policy.mjs', 'work-check.mjs', 'terminal-runner.mjs', 'setup/board.html', 'setup/board.js', 'setup/board.css']) assert.ok(fs.statSync(path.join(output, file)).isFile(), file);
    for(const file of ['LICENSE','CHANGELOG.md','SECURITY.md','THIRD-PARTY-NOTICES.md']){assert.ok(JSON.parse(fs.readFileSync(path.join(output,'release.json'))).files.includes(file));assert.deepEqual(fs.readFileSync(path.join(output,file)),fs.readFileSync(path.join(__dirname,'..',file)));}
    const second = path.join(temporary, 'second');
    stageRanch(source, second);
    const files = fs.readdirSync(output, { recursive: true }).filter(f => fs.statSync(path.join(output, f)).isFile()).sort();
    assert.deepEqual(files, fs.readdirSync(second, { recursive: true }).filter(f => fs.statSync(path.join(second, f)).isFile()).sort());
    // Framework csc embeds compilation timestamps/MVIDs; compare executable readiness.
    for (const file of files.filter(f=>!f.endsWith('.exe')&&f!=='release.json')) assert.deepEqual(fs.readFileSync(path.join(output, file)), fs.readFileSync(path.join(second, file)));
    // Native executable timestamps differ, so their manifest hashes must differ
    // too. Validate each produced manifest against its own exact bytes instead.
    for(const directory of [output,second]){const manifest=JSON.parse(fs.readFileSync(path.join(directory,'release.json')));assert.equal(Object.keys(manifest.hashes).length,manifest.files.length);for(const file of manifest.files)assert.equal(manifest.hashes[file],require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex'));}
    assert.equal(require('node:child_process').spawnSync(path.join(second,'bin/Terminal-Control.exe'),['probe'],{encoding:'utf8',windowsHide:true}).stdout.trim(),'ready:1');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('single download bundle includes installer, widget and verifiable checksums',async()=>{const {addRanchBundleFiles}=require('../tools/build.cjs'),{createHash}=require('node:crypto');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranch-bundle-'));try{const staged=path.join(dir,'staged');fs.mkdirSync(staged);fs.writeFileSync(path.join(staged,'open-setup.mjs'),'// fixture');fs.writeFileSync(path.join(staged,'Install botRanch.cmd'),'@echo off');fs.writeFileSync(path.join(staged,'release.json'),JSON.stringify({version:'1.0.0',files:['open-setup.mjs','Install botRanch.cmd']}));const widget=path.join(dir,'bot-ranch-1.0.0.icuewidget');fs.writeFileSync(widget,'WIDGET');addRanchBundleFiles(staged,widget,'1.0.0');assert.equal(fs.readFileSync(path.join(staged,'iCUE/bot-ranch-1.0.0.icuewidget'),'utf8'),'WIDGET');const manifest=JSON.parse(fs.readFileSync(path.join(staged,'release.json')));assert.ok(manifest.files.includes('START-HERE.txt'));for(const line of fs.readFileSync(path.join(staged,'SHA256SUMS.txt'),'utf8').trim().split('\n')){const [hash,file]=line.split('  ');assert.equal(createHash('sha256').update(fs.readFileSync(path.join(staged,file))).digest('hex'),hash);}const {installRelease}=await import('../sources/omp-bot-companion/install.mjs');const dest=path.join(dir,'installed');installRelease(staged,dest);assert.ok(fs.existsSync(path.join(dest,'versions/1.0.0/iCUE/bot-ranch-1.0.0.icuewidget')));}finally{fs.rmSync(dir,{recursive:true,force:true});}});
