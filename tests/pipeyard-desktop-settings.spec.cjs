const {test,expect}=require('@playwright/test');
const path=require('node:path'),esbuild=require('esbuild');
let bundle;
test.beforeAll(async()=>{bundle=(await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import PipeyardPanel from './sources/omp-bot-desktop/PipeyardPanel';createRoot(document.getElementById('root')).render(<PipeyardPanel connected={true} drafts={new Map()} popout={()=>window.openedFull=true} openRanch={()=>{}}/>);`,resolveDir:path.join(__dirname,'..'),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'})).outputFiles[0].text;});
async function mount(page){
 await page.addInitScript(()=>{
  const configuration={revision:'a'.repeat(64),latestRevision:'b'.repeat(64),updateAvailable:true,templateId:'t1',platformId:'p1',monitoring:{progress:true,finalProgress:true},summary:{mode:'both'},responses:{progress:{progress:'completion',progressScale:'fraction'}},intervalMinutes:5,waitMinutes:60};
  window.calls=[];window.mode='ok';window.run={id:'run-1',title:'Review this run',templateName:'Fixture template',platformName:'Fixture platform',status:'running',tracking:'paused',externalId:'external-1',progress:0,summary:{mode:'both',primary:'0%',secondary:'Verifying'},progressFreshness:{stale:true,at:1700000000000,reason:'Progress unavailable'},endpointDiagnostics:{status:{enabled:true,state:'ok',lastSuccessAt:1700000000000,lastAttemptAt:1700000000000},progress:{enabled:true,state:'error',reason:'Progress unavailable',lastSuccessAt:1700000000000,lastAttemptAt:1700000100000,error:'Timed out'}},configuration,responses:{status:null,progress:null},responseVisibility:{status:'hidden',progress:'hidden'}};
  window.botRanch={pipeyard:async(kind,body)=>{
   if(kind==='snapshot')return {result:{runs:[window.run],managers:[]}};
   window.calls.push(body);
   if(body.action==='preview-settings')return {result:{id:'run-1',currentRevision:window.run.configuration.revision,targetRevision:window.run.configuration.latestRevision,changes:[{field:'summary.mode',label:'Summary mode',before:'completion',after:'both'}],canApply:true}};
   if(body.action==='apply-settings'){
    if(window.mode==='busy')return {error:'Busy',code:'PIPEYARD_BUSY',retryable:true};
    if(window.mode==='stale')return {error:'Changed',code:'PIPEYARD_SETTINGS_CHANGED'};
    window.run.configuration.revision=body.targetRevision;window.run.configuration.updateAvailable=false;return {result:window.run};
   }
   return {result:{}};
  }};
 });
 await page.route('http://desktop-pipeyard.test/**',route=>route.fulfill({body:'<!doctype html><div id="root"></div><script>'+bundle+'</script>',contentType:'text/html'}));
 await page.goto('http://desktop-pipeyard.test/');
}
test('desktop renders last-known summaries, reviews changes and applies only explicit revisions',async({page})=>{
 await mount(page);
 const row=page.getByRole('button',{name:/Review this run/});await expect(row).toContainText('Last known: 0%');await expect(row).toContainText('Verifying');await expect(row).toContainText('Progress: error');
 await row.click();await expect(page.getByText('Last success:',{exact:false}).first()).toBeVisible();await expect(page.getByText('Response hidden by configuration.')).toHaveCount(2);
 await page.getByLabel('Local pipeline note',{exact:true}).fill('Keep this draft');
 await page.getByRole('button',{name:'Preview settings update',exact:true}).click();
 const review=page.getByRole('group',{name:'Review settings update'});await expect(review).toContainText('Before: completion');await expect(review).toContainText('After: both');
 expect(await page.evaluate(()=>window.calls.map(c=>c.action))).toEqual(['preview-settings']);
 await page.getByRole('button',{name:'Apply reviewed settings',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Settings applied to this run.');await expect(page.getByLabel('Local pipeline note',{exact:true})).toHaveValue('Keep this draft');
 expect(await page.evaluate(()=>window.calls.at(-1))).toEqual({action:'apply-settings',id:'run-1',expectedRevision:'a'.repeat(64),targetRevision:'b'.repeat(64),confirmed:true});
});
test('desktop busy apply stays reviewable, stale apply requires another preview',async({page})=>{
 await mount(page);await page.getByRole('button',{name:/Review this run/}).click();await page.getByRole('button',{name:'Preview settings update',exact:true}).click();
 await page.evaluate(()=>window.mode='busy');await page.getByRole('button',{name:'Apply reviewed settings',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No settings were changed');await expect(page.getByRole('button',{name:'Apply reviewed settings',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>window.calls.filter(c=>c.action==='apply-settings').length)).toBe(1);
 await page.evaluate(()=>window.mode='stale');await page.getByRole('button',{name:'Apply reviewed settings',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Preview the latest changes');await expect(page.getByRole('button',{name:'Apply reviewed settings',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Preview settings update',exact:true}).click();await expect(page.getByRole('button',{name:'Apply reviewed settings',exact:true})).toBeEnabled();
});

test('desktop invalidates a reviewed update when a refreshed snapshot changes revision',async({page})=>{
 await mount(page);await page.getByRole('button',{name:/Review this run/}).click();await page.getByRole('button',{name:'Preview settings update',exact:true}).click();
 await page.evaluate(()=>window.run.configuration.latestRevision='c'.repeat(64));await page.getByRole('button',{name:'Refresh list',exact:true}).click();
 await expect(page.getByRole('button',{name:'Apply reviewed settings',exact:true})).toBeDisabled();await expect(page.getByText('Settings changed since this preview. Preview again before applying.')).toBeVisible();
 expect(await page.evaluate(()=>window.calls.filter(c=>c.action==='apply-settings').length)).toBe(0);
});

test('confirmed completion distinguishes stale secondary stage information',async({page})=>{
 await mount(page);
 await page.evaluate(()=>{window.run.status='succeeded';window.run.summary={mode:'both',primary:'100% complete',secondary:'Verifying'};window.run.progressFreshness={stale:false,stageStale:true,stageAt:1700000000000,stageReason:'Final progress check failed'};});
 await page.getByRole('button',{name:'Refresh list',exact:true}).click();
 const row=page.getByRole('button',{name:/Review this run/});
 await expect(row).toContainText('100% complete');await expect(row).not.toContainText('Last known: 100%');await expect(row).toContainText('Last known stage: Verifying');
});
