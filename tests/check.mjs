import assert from 'node:assert/strict';
import {DEFAULTS,DEFAULT_CATEGORIES,requestFor,validScores,applies,isFeedUrl,FEED_PATHS} from '../core.mjs';
assert.equal(DEFAULTS.provider,'jev');
assert.equal(DEFAULTS.jevKey,'');
assert.equal(DEFAULTS.openaiKey,'');
assert.ok(DEFAULT_CATEGORIES.every(c=>c.threshold===.8),'every default category applies strictly above 80%');
assert.equal(applies(.8,.8),false);
assert.equal(applies(.80001,.8),true);
const slop=[DEFAULT_CATEGORIES[0]];
assert.deepEqual(validScores('jev',{answers:{slop:{type:'noul',noul:.95}}},slop),{slop:.95});
assert.deepEqual(validScores('openai',{answers:[{name:'slop',type:'predicate',probability:.91}]},slop),{slop:.91});
for(const bad of [-1,2,'0.9',null,NaN]) assert.throws(()=>validScores('jev',{answers:{slop:{type:'noul',noul:bad}}},slop));
assert.throws(()=>validScores('openai',{answers:[{name:'slop',type:'refusal'}]},slop));
for (const data of [null,undefined,{}, {answers:{}},{answers:[null]},{answers:'invalid'}]) {
 assert.throws(()=>validScores('openai',data,slop),/valid probability/);
 assert.throws(()=>validScores('jev',data,slop),/valid probability/);
}
assert.equal(requestFor(DEFAULTS,'test').body.questions.slop.type,'noul');
assert.equal(requestFor({...DEFAULTS,provider:'openai'},'test').body.questions[0].type,'predicate');
assert.throws(()=>requestFor(DEFAULTS,'test',[]),/No categories/);
console.log('PASS: provider schemas, malformed/refused answers, strict 80% boundary');

for(const path of FEED_PATHS)assert.equal(isFeedUrl('https://www.linkedin.com'+path+'?trk=feed'),true);
for(const url of ['https://www.linkedin.com/feed/update/123/','https://www.linkedin.com/feed/network/post/','https://www.linkedin.com/messaging/','https://www.linkedin.com/in/example/','https://www.linkedin.com.evil.example/feed/','http://www.linkedin.com/feed/','https://user@www.linkedin.com/feed/',null,'invalid'])assert.equal(isFeedUrl(url),false);
console.log('PASS: known feed routes and exclusion of detail/private/foreign pages');
