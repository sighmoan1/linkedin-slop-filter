import assert from 'node:assert/strict';
import {CACHE_PREFIX,CACHE_TTL_MS,CACHE_MAX,cacheFresh,cacheEvictions} from '../core.mjs';
const now=1_000_000_000_000,e=(p,age)=>({s:{slop:p,advert:.2},t:now-age});
assert.equal(cacheFresh(e(.5,1000),now),true);
assert.equal(cacheFresh(e(.5,CACHE_TTL_MS+1),now),false,'expired');
for(const bad of [undefined,null,{},{s:{},t:now},{s:{slop:'.5'},t:now},{s:{slop:2},t:now},{s:{slop:-1},t:now},{s:[.5],t:now},{s:{slop:.5}},{s:{slop:.5},t:now+3_600_000},{p:.5,t:now}])assert.equal(cacheFresh(bad,now),false,JSON.stringify(bad));
// Expired and malformed entries go, including slop-only entries from before categories; unrelated keys are never touched.
const all={enabled:true,jevKey:'k',[CACHE_PREFIX+'a']:e(.1,10),[CACHE_PREFIX+'old']:e(.1,CACHE_TTL_MS+5),[CACHE_PREFIX+'bad']:{s:{slop:'x'},t:now},[CACHE_PREFIX+'v1']:{p:.4,t:now}};
assert.deepEqual(cacheEvictions(all,now).sort(),[CACHE_PREFIX+'bad',CACHE_PREFIX+'old',CACHE_PREFIX+'v1']);
// Over the cap the oldest go first.
const many={};for(let i=0;i<10;i++)many[CACHE_PREFIX+i]=e(.1,i*1000);
assert.deepEqual(cacheEvictions(many,now,7).sort(),[CACHE_PREFIX+'7',CACHE_PREFIX+'8',CACHE_PREFIX+'9']);
assert.deepEqual(cacheEvictions(many,now,10),[]);
assert.equal(CACHE_MAX,2000);
console.log('PASS: cache freshness, expiry, malformed and old-format entries, size cap evicts oldest, unrelated keys untouched');
