if(process.platform!=='win32')throw Error('NON-RELEASE: the Windows packaged desktop gate must run on Windows.');
module.exports={
 testDir:'./tests',testMatch:'ranch-desktop-packaged.spec.cjs',timeout:120000,expect:{timeout:30000},
 workers:1,fullyParallel:false,retries:0,reporter:'list',outputDir:'test-results/desktop-packaged',
 use:{screenshot:'off',video:'off',trace:'off'},
};
