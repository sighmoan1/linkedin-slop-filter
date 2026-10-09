import assert from 'node:assert/strict';
import {CACHE_PREFIX,CACHE_TTL_MS,CACHE_MAX,cacheFresh,cacheEvictions} from '../core.mjs';
const now=1_000_000_000_000,e=(p,age)=>({p,t:now-age});
assert.equal(cacheFresh(e(.5,1000),now),true);
assert.equal(cacheFresh(e(.5,CACHE_TTL_MS+1),now),false,'expired');
for(const bad of [undefined,null,{},{p:'.5',t:now},{p:2,t:now},{p:-1,t:now},{p:.5},{p:.5,t:now+3_600_000}])assert.equal(cacheFresh(bad,now),false);
// Expired and malformed entries go; unrelated keys are never touched.
const all={enabled:true,jevKey:'k',[CACHE_PREFIX+'a']:e(.1,10),[CACHE_PREFIX+'old']:e(.1,CACHE_TTL_MS+5),[CACHE_PREFIX+'bad']:{p:'x',t:now}};
assert.deepEqual(cacheEvictions(all,now).sort(),[CACHE_PREFIX+'bad',CACHE_PREFIX+'old']);
// Over the cap the oldest go first.
const many={};for(let i=0;i<10;i++)many[CACHE_PREFIX+i]=e(.1,i*1000);
assert.deepEqual(cacheEvictions(many,now,7).sort(),[CACHE_PREFIX+'7',CACHE_PREFIX+'8',CACHE_PREFIX+'9']);
assert.deepEqual(cacheEvictions(many,now,10),[]);
assert.equal(CACHE_MAX,2000);
console.log('PASS: cache freshness, expiry, malformed entries, size cap evicts oldest, unrelated keys untouched');
