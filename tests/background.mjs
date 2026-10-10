import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import * as core from '../core.mjs';
const {DEFAULTS,DEFAULT_CATEGORIES}=core;
const local={...DEFAULTS,schema:2,enabled:true,jevKey:'TEST-KEY',limit:4};
const session={};
const storage=data=>({get:async query=>typeof query==='string'?{[query]:data[query]}:{...query,...data},set:async value=>Object.assign(data,value),remove:async key=>{for(const k of [].concat(key))delete data[k];},setAccessLevel:async()=>{}});
let handler,calls=0,bodies=[],mode='success',active=0,maxActive=0;
const context=vm.createContext({...core,crypto:webcrypto,TextEncoder,AbortController,URL,setTimeout,clearTimeout,
 chrome:{storage:{local:storage(local),session:storage(session)},runtime:{onMessage:{addListener:h=>handler=h}}},
 fetch:async(url,req)=>{calls++;active++;maxActive=Math.max(maxActive,active);assert.equal(req.headers.Authorization,'Bearer TEST-KEY');await new Promise(r=>setTimeout(r,5));active--;
  const body=JSON.parse(req.body);const ids=Object.keys(body.questions);bodies.push(ids);
  if(mode==='multi400'&&ids.length>1)return {ok:false,status:400,json:async()=>({})};
  if(mode==='bad400')return {ok:false,status:400,json:async()=>({})};
  const answers=Object.fromEntries(ids.map(id=>[id,{type:'noul',noul:id==='slop'?.95:id==='advert'?.7:.1}]));
  if(mode==='noslop')delete answers.slop;
  return {ok:mode!=='fail',status:mode==='fail'?429:200,json:async()=>mode==='invalid'?{}:({answers})};}
});
vm.runInContext(fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/,''),context);
const send=m=>new Promise(resolve=>handler(m,{url:'https://www.linkedin.com/feed/'},resolve));
assert.equal(handler({type:'settings'},{url:'https://attacker.example'},()=>{}),false);
for (const url of ['https://www.linkedin.com/feedfake','https://www.linkedin.com.evil.example/feed/',undefined,'bad-url']) {
 assert.equal(handler({type:'settings'},{url},()=>{}),false);
}
const settings=await send({type:'settings'});
assert.equal(settings.enabled,true);assert.equal(settings.jevKey,undefined);assert.equal(JSON.stringify(settings).includes('TEST-KEY'),false);
assert.deepEqual(settings.categories,DEFAULT_CATEGORIES.map(({id,name,action,threshold})=>({id,name,action,threshold})),'the page gets display settings, never definitions');
const [a,b]=await Promise.all([send({type:'classify',text:'same'}),send({type:'classify',text:'same'})]);
assert.equal(a.scores.slop,.95);assert.equal(b.scores.slop,.95);assert.equal(calls,1);
await send({type:'classify',text:'same'});assert.equal(calls,1);
const cacheKeys=Object.keys(local).filter(k=>k.startsWith('cache:'));assert.equal(cacheKeys.length,1);assert.equal(local[cacheKeys[0]].s.slop,.95);assert.equal(JSON.stringify(local).includes('same'),false,'post text must not be stored');assert.equal(Object.keys(session).some(k=>k.startsWith('cache:')),false);
for(const k of Object.keys(session))if(k!=='requests')delete session[k];
assert.equal((await send({type:'classify',text:'same'})).scores.slop,.95);assert.equal(calls,1,'cache survives a browser restart');
local.jevKey='';const nokey=await send({type:'classify',text:'no key'});assert.match(nokey.error,/API key/);assert.equal(nokey.short,'no API key');assert.equal(calls,1);local.jevKey='TEST-KEY';
mode='fail';const failed=await send({type:'classify',text:'failure'});assert.match(failed.error,/429/);assert.match(local.lastError,/429/);assert.equal(failed.short,'API error 429');
mode='success';const ok=await send({type:'classify',text:'another'});assert.equal(calls,3);assert.equal(ok.short,undefined);assert.equal(local.lastError,undefined,'a success clears the last error');
mode='invalid';const invalid=await send({type:'classify',text:'bad answer'});assert.match(invalid.error,/valid probability/);assert.equal(invalid.short,'invalid answer');assert.equal(calls,4);mode='success';
const capped=await send({type:'classify',text:'over limit'});assert.match(capped.error,/limit/);assert.equal(capped.short,'request limit reached');assert.equal(calls,4);
local.enabled=false;const off=await send({type:'classify',text:'disabled'});assert.equal(off.disabled,true);assert.equal(off.short,undefined);assert.equal(calls,4);
assert.equal(maxActive,1);

{
 local.enabled=true;local.limit=100;for(const k of Object.keys(session))delete session[k];
 // Every category goes out in one request and comes back as scores, plus the display settings for the page.
 assert.deepEqual(bodies[0],['slop','brainrot','advert','opportunity','nourishment']);
 const r=await send({type:'classify',text:'categories please'});
 assert.deepEqual(r.scores,{slop:.95,brainrot:.1,advert:.7,opportunity:.1,nourishment:.1});
 assert.equal(r.probability,undefined,'no special slop number');
 assert.deepEqual(r.categories.map(c=>[c.id,c.action]),[['slop','hide'],['brainrot','label'],['advert','label'],['opportunity','highlight'],['nourishment','highlight']]);
 assert.equal(JSON.stringify(r).includes('instructions'),false,'definitions are not sent to the page');
 const again=await send({type:'classify',text:'categories please'});assert.deepEqual(again.scores,r.scores);
 // Editing a definition changes the configuration and starts fresh scores; a new category is asked.
 const before=calls;const cfg=(await send({type:'settings'})).configuration;
 local.categories=[...DEFAULT_CATEGORIES,{id:'hot',name:'Hot takes',instructions:'Is this a hot take?',action:'hide',threshold:.5}];
 assert.notEqual((await send({type:'settings'})).configuration,cfg);
 const edited=await send({type:'classify',text:'categories please'});assert.equal(calls,before+1);assert.equal(bodies.at(-1).includes('hot'),true);assert.equal(edited.categories.at(-1).threshold,.5);
 // Changing a name, action or threshold keeps the configuration and needs no new request.
 const cfg2=(await send({type:'settings'})).configuration;
 local.categories=local.categories.map(c=>c.id==='advert'?{...c,name:'Ads',action:'hide',threshold:.6}:c);
 assert.equal((await send({type:'settings'})).configuration,cfg2);
 const redisplayed=await send({type:'classify',text:'categories please'});assert.equal(calls,before+1,'display change needs no new request');
 assert.deepEqual(redisplayed.categories.find(c=>c.id==='advert'),{id:'advert',name:'Ads',action:'hide',threshold:.6});
 // Switching a category off stops asking it.
 local.categories=local.categories.map(c=>c.id==='brainrot'?{...c,action:'off'}:c);
 const offR=await send({type:'classify',text:'categories please'});assert.equal(bodies.at(-1).includes('brainrot'),false);assert.equal(offR.categories.some(c=>c.id==='brainrot'),false);
 // An answer missing Slop is still a result: the other scores apply.
 mode='noslop';const missing=await send({type:'classify',text:'no slop answer'});assert.equal(missing.error,undefined);assert.equal(missing.scores.slop,undefined);assert.equal(missing.scores.advert,.7);mode='success';
 // A provider that refuses several questions is asked the hide categories only, says so, and stays that way until settings change.
 local.categories=null;mode='multi400';const c1=calls;
 const fb=await send({type:'classify',text:'fallback one'});assert.deepEqual(Object.keys(fb.scores),['slop']);assert.equal(calls,c1+2);assert.deepEqual(bodies.at(-1),['slop']);
 assert.match(local.lastError,/refused several questions/);
 await send({type:'classify',text:'fallback two'});assert.equal(calls,c1+3,'after the fallback only one request per post');assert.deepEqual(bodies.at(-1),['slop']);
 assert.match(local.lastError,/refused several questions/,'the notice stays while the fallback is in use');
 local.categories=DEFAULT_CATEGORIES.map(c=>c.id==='advert'?{...c,action:'hide'}:c);
 await send({type:'classify',text:'fallback three'});assert.deepEqual(bodies.at(-1),['slop','advert'],'a display change keeps the fallback but asks the current hide categories');
 local.categories=DEFAULT_CATEGORIES.map(c=>c.id==='advert'?{...c,instructions:'Is this an advert? Edited.'}:c);mode='success';
 await send({type:'classify',text:'fallback four'});assert.equal(bodies.at(-1).length,5,'new scoring settings try every category again');assert.equal(local.lastError,undefined);
 // A 400 with nothing to fall back to is an ordinary error.
 local.categories=DEFAULT_CATEGORIES.map(c=>({...c,action:'hide'}));mode='bad400';
 const plain=await send({type:'classify',text:'bad request'});assert.match(plain.error,/HTTP 400/);mode='success';
}
console.log('PASS: sender restriction, credential isolation, display settings, deduplication/cache, API errors with short reasons, persistent cache, session cap, disable, serial requests, scoring key vs display, fallback');
