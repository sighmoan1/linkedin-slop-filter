import assert from 'node:assert/strict';
import {DEFAULTS,requestFor,probability,shouldFold} from '../core.mjs';
assert.equal(DEFAULTS.provider,'jev');
assert.equal(DEFAULTS.threshold,.8);
assert.equal(DEFAULTS.jevKey,'');
assert.equal(DEFAULTS.openaiKey,'');
assert.equal(shouldFold(.8,.8),false);
assert.equal(shouldFold(.80001,.8),true);
assert.equal(probability('jev',{answers:{slop:{type:'noul',noul:.95}}}),.95);
assert.equal(probability('openai',{answers:[{name:'slop',type:'predicate',probability:.91}]}),.91);
for(const bad of [-1,2,'0.9',null,NaN]) assert.throws(()=>probability('jev',{answers:{slop:{type:'noul',noul:bad}}}));
assert.throws(()=>probability('openai',{answers:[{name:'slop',type:'refusal'}]}));
for (const data of [null,undefined,{}, {answers:{}},{answers:[null]},{answers:'invalid'}]) {
 assert.throws(()=>probability('openai',data),/valid probability/);
 assert.throws(()=>probability('jev',data),/valid probability/);
}
assert.equal(requestFor(DEFAULTS,'test').body.questions.slop.type,'noul');
assert.equal(requestFor({...DEFAULTS,provider:'openai'},'test').body.questions[0].type,'predicate');
console.log('PASS: provider schemas, malformed/refused answers, strict 80% boundary');
