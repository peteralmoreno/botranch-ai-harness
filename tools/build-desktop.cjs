'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const nativeFiles = ['main.cjs', 'preload.cjs', 'window-policy.cjs', 'ranch-window.cjs', 'companion-window.cjs', 'utility-window.cjs', 'recovery-controller.cjs', 'package.json', 'index.html', 'recovery.html', 'ai-sync.html', 'dock.css'];
const runtimeFiles = ['electron.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'icudtl.dat', 'LICENSE', 'LICENSES.chromium.html', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'version', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll'];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const tag = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([tag, bytes])));
  return Buffer.concat([size, tag, bytes, crc]);
}
// Original code-native pixel artwork; no external asset or local screenshot enters releases.
function iconPng() {
  // Same cream-and-charcoal pixel cow as the Pipeyard button, on transparency.
  const size=256, rows=Buffer.alloc(size*(size*4+1));
  function rect(x,y,w,h,hex){
    const rgb=hex.match(/[a-f0-9]{2}/gi).map(n=>parseInt(n,16));
    for(let py=-39+y*7;py<-39+(y+h)*7;py++)for(let px=-320+x*7;px<-320+(x+w)*7;px++){
      if(px<0||py<0||px>=size||py>=size)continue;
      const at=py*(size*4+1)+1+px*4;rows[at]=rgb[0];rows[at+1]=rgb[1];rows[at+2]=rgb[2];rows[at+3]=255;
    }
  }
  rect(4,18,3,20,'#53513d');rect(5,17,5,3,'#53513d');rect(5,35,5,3,'#53513d');
  rect(14,16,42,25,'#f0e6c7');rect(10,20,6,17,'#f0e6c7');
  rect(16,17,13,11,'#39443b');rect(36,29,12,11,'#39443b');rect(45,16,10,9,'#39443b');
  rect(17,39,7,10,'#e6d7b7');rect(44,39,7,10,'#e6d7b7');
  rect(17,46,8,4,'#3b4138');rect(44,46,8,4,'#3b4138');rect(31,39,10,5,'#c99585');
  rect(54,12,19,25,'#eee3c3');rect(50,14,6,6,'#a78967');rect(72,14,7,6,'#a78967');
  rect(56,7,4,8,'#e5cd98');rect(69,7,4,8,'#e5cd98');
  rect(56,20,4,4,'#293e34');rect(68,20,4,4,'#293e34');
  rect(56,29,17,10,'#d4a08c');rect(59,32,3,3,'#765f50');rect(68,32,3,3,'#765f50');
  const header=Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
function stageDesktop(sources, destination, {runtime = true} = {}) {
  const source = path.join(sources, 'omp-bot-desktop'), app = path.join(destination, 'resources/app');
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) throw Error('Desktop output must be a fresh empty directory.');
  const version = JSON.parse(fs.readFileSync(path.join(sources, 'omp-bot/manifest.json'), 'utf8')).version;
  const sourcePackage=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  const packageVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  if(!/^\d+\.\d+\.\d+$/.test(version)||[sourcePackage.version,packageVersion,lock.version,lock.packages?.['']?.version].some(value=>value!==version))throw Error('Desktop versions must match package, lockfile and source manifest.');
  if(runtime){const dist=path.join(root,'node_modules/electron/dist');for(const name of [...runtimeFiles,'locales/en-US.pak'])if(!fs.existsSync(path.join(dist,name)))throw Error('Incomplete Electron runtime; run npm ci before packaging. Missing: '+name);}
  fs.mkdirSync(app, {recursive: true});
  for (const name of nativeFiles) fs.copyFileSync(path.join(source, name), path.join(app, name));
  const pkg = JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8')); pkg.version = version;
  fs.writeFileSync(path.join(app,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  require('esbuild').buildSync({entryPoints:[path.join(source,'renderer.tsx')],outfile:path.join(app,'renderer.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',minify:true,sourcemap:false,define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked',nodePaths:[path.join(root,'node_modules')]});
  require('esbuild').buildSync({entryPoints:[path.join(source,'recovery-renderer.tsx')],outfile:path.join(app,'recovery.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',minify:true,sourcemap:false,define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked',nodePaths:[path.join(root,'node_modules')]});
  require('esbuild').buildSync({entryPoints:[path.join(source,'ai-sync-renderer.tsx')],outfile:path.join(app,'ai-sync.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',minify:true,sourcemap:false,define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked',nodePaths:[path.join(root,'node_modules')]});
  const licenses = ['react/LICENSE','react-dom/LICENSE','scheduler/LICENSE','lucide-react/LICENSE','motion/LICENSE.md','framer-motion/LICENSE.md','motion-dom/LICENSE.md','motion-utils/LICENSE.md','tslib/LICENSE.txt'];
  fs.writeFileSync(path.join(app,'THIRD-PARTY-NOTICES.txt'),licenses.map(file=>file.split('/')[0]+'\n\n'+fs.readFileSync(path.join(root,'node_modules',file),'utf8')).join('\n\n----------------------------------------\n\n'));
  const png=iconPng(),ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=0;ico[7]=0;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
  fs.writeFileSync(path.join(app,'icon.png'),png);fs.writeFileSync(path.join(app,'icon.ico'),Buffer.concat([ico,png]));
  if (runtime) {
    const dist=path.join(root,'node_modules/electron/dist');
    if (!fs.existsSync(path.join(dist,'electron.exe'))) throw Error('Install the desktop runtime with: node node_modules/electron/install.js');
    for (const name of runtimeFiles) fs.copyFileSync(path.join(dist,name),path.join(destination,name==='electron.exe'?'botRanch.exe':name));
    fs.mkdirSync(path.join(destination,'locales'),{recursive:true});
    for (const name of fs.readdirSync(path.join(dist,'locales')).filter(n=>/^[A-Za-z-]+\.pak$/.test(n))) fs.copyFileSync(path.join(dist,'locales',name),path.join(destination,'locales',name));
  }
  return fs.readdirSync(destination,{recursive:true}).filter(name=>fs.statSync(path.join(destination,name)).isFile()).map(name=>'desktop/'+name.replaceAll('\\','/')).sort();
}
module.exports = {stageDesktop, iconPng};
