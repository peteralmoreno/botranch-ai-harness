export const pipelineLinkFields=['ticketUrl','pipelineUrl'];
export function pipelineLink(value){
 if(value===null)return null;
 if(typeof value!=='string'||!value.trim()||value.length>2048||/[\u0000-\u0020\u007f-\u009f]/.test(value))throw Error('Pipeline link must be an HTTP(S) URL without spaces or credentials.');
 let url;try{url=new URL(value);}catch{throw Error('Invalid pipeline link URL.');}
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw Error('Pipeline link must be an HTTP(S) URL without embedded credentials.');
 return url.href;
}
export function pipelineLinks(input){return Object.fromEntries(pipelineLinkFields.filter(key=>Object.hasOwn(input,key)).map(key=>[key,pipelineLink(input[key])]));}
export function visiblePipelineLinks(input){return Object.fromEntries(pipelineLinkFields.map(key=>{try{return [key,pipelineLink(input[key]??null)];}catch{return [key,null];}}));}
