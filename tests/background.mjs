import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DEFAULTS,requestFor,probability} from '../core.mjs';
const local={...DEFAULTS,enabled:true,jevKey:'TEST-KEY',limit:3};
const session={};
const storage=data=>({get:async query=>typeof query==='string'?{[query]:data[query]}:{...query,...data},set:async value=>Object.assign(data,value),remove:async key=>delete data[key],setAccessLevel:async()=>{}});
let handler,calls=0,mode='success',active=0,maxActive=0;
const context=vm.createContext({DEFAULTS,requestFor,probability,crypto:webcrypto,TextEncoder,AbortController,URL,setTimeout,clearTimeout,
 chrome:{storage:{local:storage(local),session:storage(session)},runtime:{onMessage:{addListener:h=>handler=h}}},
 fetch:async(url,req)=>{calls++;active++;maxActive=Math.max(maxActive,active);assert.equal(req.headers.Authorization,'Bearer TEST-KEY');await new Promise(r=>setTimeout(r,5));active--;return {ok:mode!=='fail',status:mode==='fail'?429:200,json:async()=>({answers:{slop:{type:'noul',noul:.95}}})};}
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
mode='fail';const failed=await send({type:'classify',text:'failure'});assert.match(failed.error,/429/);assert.match(local.lastError,/429/);
mode='success';await send({type:'classify',text:'another'});assert.equal(calls,3);
const capped=await send({type:'classify',text:'over limit'});assert.match(capped.error,/limit/);assert.equal(calls,3);
local.enabled=false;const off=await send({type:'classify',text:'disabled'});assert.equal(off.disabled,true);assert.equal(calls,3);
assert.equal(maxActive,1);
console.log('PASS: sender restriction, credential isolation, deduplication/cache, API errors, session cap, disable, serial requests');
