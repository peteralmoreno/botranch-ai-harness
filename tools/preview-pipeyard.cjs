// Design-only server. No credentials, companion access, or platform API routes.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),port=43823;
const {createCreatureStore}=require('./creature-store.cjs');
const defaultCreatureFile=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'botRanch','pipeyard-preview','creatures.json');
const files={
 '/setup/pipeline-links.mjs':'sources/omp-bot-companion/setup/pipeline-links.mjs',
 '/setup/pipeyard-intervals.mjs':'sources/omp-bot-companion/setup/pipeyard-intervals.mjs',
 '/setup/bot-palette.mjs':'sources/omp-bot-companion/setup/bot-palette.mjs',
 '/prototype/creatures.mjs':'designs/pipeyard/creatures.mjs',
 '/prototype/creature-behavior.mjs':'designs/pipeyard/creature-behavior.mjs',
 '/setup/pipeyard.js':'sources/omp-bot-companion/setup/pipeyard.js',
 '/setup/pipeyard-editor.mjs':'sources/omp-bot-companion/setup/pipeyard-editor.mjs',
 '/setup/pipeyard.css':'sources/omp-bot-companion/setup/pipeyard.css',
 '/setup/pipeyard-demo.mjs':'sources/omp-bot-companion/setup/pipeyard-demo.mjs',
 '/setup/pipeyard-feed.mjs':'sources/omp-bot-companion/setup/pipeyard-feed.mjs',
 '/prototype/design.mjs':'designs/pipeyard/design.mjs',
 '/prototype/design.css':'designs/pipeyard/design.css'
};
function createPreviewServer({creatureFile=defaultCreatureFile}={}){
 const creatures=createCreatureStore(creatureFile);
 return http.createServer(async(req,res)=>{
 let route;try{route=new URL(req.url,'http://127.0.0.1').pathname;}catch{res.writeHead(400).end();return;}
 if(route==='/prototype/creatures'){
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  if(req.headers.host!=='127.0.0.1:'+req.socket.localPort)return reply(403,{error:'Use the local preview origin.'});
  try{
   if(req.method==='GET')return reply(200,creatures.read());
   if(req.method!=='PUT')return reply(405,{error:'Use GET or PUT.'});
   if(req.headers.origin!=='http://127.0.0.1:'+req.socket.localPort||!req.headers['content-type']?.startsWith('application/json'))return reply(403,{error:'Animal changes must come from this preview.'});
   let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)return reply(413,{error:'Animal file is too large.'});body+=chunk;}
   return reply(200,creatures.save(JSON.parse(body)));
  }catch(error){return reply(error.status||400,{error:error instanceof SyntaxError?'Animal file or request contains invalid JSON.':error.message});}
 }
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 let content,type;
 if(route==='/'||route==='/pipeyard/'){
  content=fs.readFileSync(path.join(root,'sources/omp-bot-companion/setup/pipeyard.html'),'utf8')
   .replace('</head>','<link rel="stylesheet" href="/prototype/design.css"></head>')
   .replace('src="/setup/pipeyard.js"','src="/prototype/design.mjs"');type='text/html';
 }else if(files[route]){content=fs.readFileSync(path.join(root,files[route]));type=route.endsWith('.css')?'text/css':'text/javascript';}
 else{res.writeHead(404).end('Design preview only.');return;}
 res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'"});res.end(content);
 });
}
module.exports={createPreviewServer,defaultCreatureFile};
if(require.main===module)createPreviewServer().listen(port,'127.0.0.1',()=>console.log('Pipeyard design preview: http://127.0.0.1:'+port+'/pipeyard/#demo=1'));
