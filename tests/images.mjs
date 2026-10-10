import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as core from '../core.mjs';
const {IMAGE_DEFAULTS,normalizeImages,attachmentUrl,imageRequest,imageScoringKey,VISUAL_ID,DEFAULTS,DEFAULT_CATEGORIES}=core;
assert.deepEqual(normalizeImages(null),IMAGE_DEFAULTS);
assert.equal(normalizeImages({enabled:1,model:'remote-model',action:'highlight',threshold:NaN}).enabled,false);
const url='https://media.licdn.com/dms/image/v2/synthetic/feedshare-shrink_800/test';
assert.equal(attachmentUrl(url),url);
for(const bad of ['https://evil.example/dms/image/a','https://media.licdn.com/profile/a','http://media.licdn.com/dms/image/a','https://media.licdn.com@evil.example/dms/image/a','https://media.licdn.com:444/dms/image/a','data:image/png;base64,AA=='])assert.throws(()=>attachmentUrl(bad));
const image='data:image/jpeg;base64,AA==';
const request=imageRequest(IMAGE_DEFAULTS,'Synthetic caption',[image]);
assert.equal(request.body.model,'cloudflare/clef-flash');assert.equal(request.body.state[1].image_url.url,image);
assert.throws(()=>imageRequest(IMAGE_DEFAULTS,'x'.repeat(2001),[image]));
assert.doesNotThrow(()=>imageRequest({model:'openai/gpt-6-luna-decisions'},'x'.repeat(2001),[image]));
assert.throws(()=>imageRequest(IMAGE_DEFAULTS,'',[image.repeat(10000)]));
assert.equal(imageScoringKey({...IMAGE_DEFAULTS,enabled:true}),imageScoringKey({...IMAGE_DEFAULTS,enabled:true,action:'hide',threshold:.9}));
assert.notEqual(imageScoringKey({...IMAGE_DEFAULTS,enabled:true}),imageScoringKey({...IMAGE_DEFAULTS,enabled:true,model:'openai/gpt-6-luna-decisions'}));

const local={...DEFAULTS,enabled:true,schema:2,categories:DEFAULT_CATEGORIES,jevKey:'PRIVATE-SYNTHETIC-KEY',limit:100},session={};
const storage=data=>({get:async q=>structuredClone(q===null?data:typeof q==='string'?{[q]:data[q]}:{...q,...data}),set:async v=>Object.assign(data,structuredClone(v)),remove:async ks=>{for(const k of [].concat(ks))delete data[k];},setAccessLevel:async()=>{}});
let handler,allowed=true,textCalls=0,imageCalls=0,downloads=0,mode='ok',textHide=false,active=0,maxActive=0,release;
const transport=async(u,req)=>{
  active++;maxActive=Math.max(active,maxActive);
  try {
    assert.equal(req.credentials,'omit');assert.equal(req.redirect,'error');
    if(u.startsWith('https://media.licdn.com/')){downloads++;return new Response(new Uint8Array([u.includes('second')?2:1]),{headers:{'content-type':'image/png'}});}
    assert.equal(req.headers.Authorization,'Bearer PRIVATE-SYNTHETIC-KEY');
    const body=JSON.parse(req.body),visual=Object.keys(body.questions).includes(VISUAL_ID);
    if(visual){imageCalls++;assert.equal(body.state[1].type,'image_url');assert.equal(JSON.stringify(body).includes('media.licdn.com'),false);
      if(mode==='hold')await new Promise(r=>release=r);
      if(mode==='bad')return {ok:true,json:async()=>({answers:{}})};
      if(mode==='fail')return {ok:false,status:429};
    } else {textCalls++;assert.equal(body.model,'typesafe/jev-1.13');assert.equal(body.state.post_text!==undefined,true);}
    await new Promise(r=>setTimeout(r,2));
    return {ok:true,json:async()=>({answers:Object.fromEntries(Object.keys(body.questions).map(id=>[id,{type:'noul',noul:id===VISUAL_ID?.95:id==='slop'&&textHide?.95:.1}])),usage:{input_tokens:4321,cost:.0002,private:'do-not-copy'}})};
  } finally {active--;}
};
// Real bounded fetch/decode path; rendering primitives stand in for service-worker graphics.
globalThis.fetch=transport;
globalThis.createImageBitmap=async blob=>({width:900,height:700,bytes:new Uint8Array(await blob.arrayBuffer()),close(){}});
globalThis.OffscreenCanvas=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return {fillRect(){},drawImage:b=>{this.bitmap=b;}};}async convertToBlob(){return new Blob([this.bitmap.bytes],{type:'image/jpeg'});}};
const context=vm.createContext({...core,crypto:webcrypto,TextEncoder,AbortController,URL,setTimeout,clearTimeout,
  chrome:{permissions:{contains:async()=>allowed},storage:{local:storage(local),session:storage(session)},runtime:{id:'images-test',getURL:p=>'chrome-extension://images-test/'+p,onMessage:{addListener:h=>handler=h}}},fetch:transport});
vm.runInContext(fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/,''),context);
const feed={id:'images-test',url:'https://www.linkedin.com/feed/',tab:{id:1}},trusted={id:'images-test',url:'chrome-extension://images-test/options.html'};
const send=(m,sender=feed)=>new Promise(resolve=>handler(m,sender,r=>resolve(JSON.parse(JSON.stringify(r)))));
await send({type:'classify',text:'Off trial',imageUrls:[url]});assert.equal(downloads,0);assert.equal(imageCalls,0);
local.imageAnalysis={...IMAGE_DEFAULTS,enabled:true};
const view=await send({type:'settings'});assert.equal(view.categories.at(-1).id,VISUAL_ID);assert.equal(view.images.enabled,true);assert.equal(JSON.stringify(view).includes('instructions'),false);assert.equal(JSON.stringify(view).includes('PRIVATE'),false);
const r=await send({type:'classify',text:'Caption one',imageUrls:[url]});assert.equal(r.scores[VISUAL_ID],.95);assert.equal(r.imageStatus,'scored');assert.equal(r.imageUsage.inputTokens,4321);assert.equal(r.imageUsage.private,undefined);assert.match(r.imageFingerprint,/^[a-f0-9]{64}$/);assert.equal(session.requests,3);
const before=imageCalls;await send({type:'classify',text:'Caption one',imageUrls:[url]});assert.equal(imageCalls,before,'cached visual result costs no new API attempt');
local.imageAnalysis.action='hide';local.imageAnalysis.threshold=.9;await send({type:'classify',text:'Caption one',imageUrls:[url]});assert.equal(imageCalls,before,'display changes reuse visual scores');
await send({type:'classify',text:'Caption one',imageUrls:[url+'/second']});assert.equal(imageCalls,before+1,'same caption with different image bytes is not the same post');
const persisted=JSON.stringify(local);assert.equal(persisted.includes('Caption one'),false);assert.equal(persisted.includes('data:image'),false);assert.equal(persisted.includes(url),false);
textHide=true;const skip=await send({type:'classify',text:'Text already hides',imageUrls:[url]});assert.equal(skip.imageStatus,'skipped-hidden');assert.equal(imageCalls,before+1);textHide=false;
allowed=false;const noPermission=await send({type:'classify',text:'No permission',imageUrls:[url]});assert.equal(noPermission.imageStatus,'unavailable');assert.equal(noPermission.scores[VISUAL_ID],undefined);allowed=true;
const dl=downloads;const unsafe=await send({type:'classify',text:'Invalid attachment',imageUrls:['https://evil.example/a']});assert.equal(unsafe.imageStatus,'unavailable');assert.equal(downloads,dl);
const tooMany=await send({type:'classify',text:'Gallery',imageUrls:Array(5).fill(url)});assert.equal(tooMany.imageStatus,'unavailable');assert.equal(downloads,dl);
mode='bad';const invalid=await send({type:'classify',text:'Invalid answer',imageUrls:[url]});assert.equal(invalid.scores[VISUAL_ID],undefined);assert.equal(invalid.imageStatus,'unavailable');mode='ok';
const imageOnly=await send({type:'classify',text:'',imageUrls:[url]});assert.equal(imageOnly.scores[VISUAL_ID],.95);
local.imageAnalysis.model='openai/gpt-6-luna-decisions';const switched=await send({type:'classify',text:'Caption one',imageUrls:[url]});assert.equal(switched.imageModel,local.imageAnalysis.model);assert.equal(imageCalls,before+4);
mode='hold';const stale=send({type:'classify',text:'Changed during scoring',imageUrls:[url]});while(!release)await new Promise(r=>setTimeout(r,2));local.imageAnalysis.enabled=false;release();assert.equal((await stale).disabled,true);mode='ok';
local.enabled=false;const compare=await send({type:'compareImages',text:'Explicit comparison',images:[image]},trusted);assert.equal(compare.results.length,2);assert.equal(compare.results.every(x=>x.scores?.[VISUAL_ID]===.95),true);
assert.equal(handler({type:'compareImages',text:'',images:[image]},feed,()=>{}),false,'feed cannot invoke the file comparison');
session.requests=local.limit;const capped=await send({type:'compareImages',text:'Fresh cap case',images:[image]},trusted);assert.equal(capped.results.every(x=>x.error),true);
assert.equal(maxActive,1,'text, attachments and image inference share the serial queue');
assert.ok(textCalls>0);
console.log('PASS: opt-in images, URL and payload bounds, text isolation, image cache identity, strict display configuration, permissions, stale results, cap, private storage and explicit comparison');
