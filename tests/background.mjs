import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DEFAULTS,requestFor,probability,scores,categoryList,CACHE_PREFIX,cacheFresh,cacheEvictions,thresholdFor,classificationKey} from '../core.mjs';
const local={...DEFAULTS,enabled:true,jevKey:'TEST-KEY',limit:4};
const session={};
const storage=data=>({get:async query=>typeof query==='string'?{[query]:data[query]}:{...query,...data},set:async value=>Object.assign(data,value),remove:async key=>{for(const k of [].concat(key))delete data[k];},setAccessLevel:async()=>{}});
let handler,calls=0,bodies=[],mode='success',active=0,maxActive=0;
const context=vm.createContext({DEFAULTS,requestFor,probability,scores,categoryList,CACHE_PREFIX,cacheFresh,cacheEvictions,thresholdFor,classificationKey,crypto:webcrypto,TextEncoder,AbortController,URL,setTimeout,clearTimeout,
 chrome:{storage:{local:storage(local),session:storage(session)},runtime:{onMessage:{addListener:h=>handler=h}}},
 fetch:async(url,req)=>{calls++;active++;maxActive=Math.max(maxActive,active);assert.equal(req.headers.Authorization,'Bearer TEST-KEY');await new Promise(r=>setTimeout(r,5));active--;
  const body=JSON.parse(req.body);const ids=Object.keys(body.questions);bodies.push(ids);
  if(mode==='multi400'&&ids.length>1)return {ok:false,status:400,json:async()=>({})};
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
assert.equal(settings.enabled,true);assert.equal(settings.jevKey,undefined);
const [a,b]=await Promise.all([send({type:'classify',text:'same'}),send({type:'classify',text:'same'})]);
assert.equal(a.probability,.95);assert.equal(b.probability,.95);assert.equal(calls,1);
await send({type:'classify',text:'same'});assert.equal(calls,1);
const cacheKeys=Object.keys(local).filter(k=>k.startsWith('cache:'));assert.equal(cacheKeys.length,1);assert.equal(local[cacheKeys[0]].p,.95);assert.equal(JSON.stringify(local).includes('same'),false,'post text must not be stored');assert.equal(Object.keys(session).some(k=>k.startsWith('cache:')),false);
for(const k of Object.keys(session))if(k!=='requests')delete session[k];
assert.equal((await send({type:'classify',text:'same'})).probability,.95);assert.equal(calls,1,'cache survives a browser restart');
local.jevKey='';const nokey=await send({type:'classify',text:'no key'});assert.match(nokey.error,/API key/);assert.equal(nokey.short,'no API key');assert.equal(calls,1);local.jevKey='TEST-KEY';
mode='fail';const failed=await send({type:'classify',text:'failure'});assert.match(failed.error,/429/);assert.match(local.lastError,/429/);assert.equal(failed.short,'API error 429');
mode='success';const ok=await send({type:'classify',text:'another'});assert.equal(calls,3);assert.equal(ok.short,undefined);
mode='invalid';const invalid=await send({type:'classify',text:'bad answer'});assert.match(invalid.error,/valid probability/);assert.equal(invalid.short,'invalid answer');assert.equal(calls,4);mode='success';
const capped=await send({type:'classify',text:'over limit'});assert.match(capped.error,/limit/);assert.equal(capped.short,'request limit reached');assert.equal(calls,4);
local.enabled=false;const off=await send({type:'classify',text:'disabled'});assert.equal(off.disabled,true);assert.equal(off.short,undefined);assert.equal(calls,4);
assert.equal(maxActive,1);

// Every category goes out in one request and comes back as scores, plus the category list for the page.
{
 local.enabled=true;local.limit=100;for(const k of Object.keys(session))delete session[k];
 const first=bodies[0];assert.deepEqual(first,['slop','brainrot','advert','opportunity','nourishment']);
 const r=await send({type:'classify',text:'categories please'});
 assert.equal(r.probability,.95);assert.deepEqual(r.scores,{slop:.95,brainrot:.1,advert:.7,opportunity:.1,nourishment:.1});
 assert.deepEqual(r.categories.map(c=>[c.id,c.name,c.fold]),[['slop','Slop',true],['brainrot','Brainrot',false],['advert','Advert',false],['opportunity','Opportunity',false],['nourishment','Nourishment',false]]);
 assert.equal(JSON.stringify(r).includes('instructions'),false,'definitions are not sent to the page');
 const entry=local[Object.keys(local).filter(k=>k.startsWith('cache:')).at(-1)];assert.equal(entry.p,.95);assert.equal(entry.s.advert,.7);
 const again=await send({type:'classify',text:'categories please'});assert.deepEqual(again.scores,r.scores);
 // Editing categories changes the configuration the page sees, starts fresh scores, and the custom category is asked.
 const before=calls;const cfg=(await send({type:'settings'})).configuration;
 local.categories=[...categoryList(local),{id:'hot',name:'Hot takes',instructions:'Is this a hot take?',fold:true}];
 assert.notEqual((await send({type:'settings'})).configuration,cfg);
 const edited=await send({type:'classify',text:'categories please'});assert.equal(calls,before+1);assert.equal(bodies.at(-1).includes('hot'),true);assert.equal(edited.categories.at(-1).fold,true);
 // Changing only a fold choice changes the configuration too, so open feeds pick it up (scores come from the cache).
 const cfg2=(await send({type:'settings'})).configuration;local.categories=local.categories.map(c=>c.id==='advert'?{...c,fold:true}:c);
 assert.notEqual((await send({type:'settings'})).configuration,cfg2);
 const refolded=await send({type:'classify',text:'categories please'});assert.equal(calls,before+1,'fold change needs no new request');assert.equal(refolded.categories.find(c=>c.id==='advert').fold,true);
 // Slop missing from the answer leaves the post visible with an error.
 mode='noslop';const missing=await send({type:'classify',text:'no slop answer'});assert.match(missing.error,/valid probability/);mode='success';
 // A provider that refuses several questions gets the slop question alone, and we stop sending the rest.
 local.categories=null;mode='multi400';const c1=calls;
 const fb=await send({type:'classify',text:'fallback one'});assert.equal(fb.probability,.95);assert.deepEqual(Object.keys(fb.scores),['slop']);assert.equal(calls,c1+2);assert.deepEqual(bodies.at(-1),['slop']);assert.equal(session.singleOnly,true);
 await send({type:'classify',text:'fallback two'});assert.equal(calls,c1+3,'after the fallback only one request per post');
 mode='success';delete session.singleOnly;
}
console.log('PASS: sender restriction, credential isolation, deduplication/cache, API errors with short reasons, persistent cache, session cap, disable, serial requests');
