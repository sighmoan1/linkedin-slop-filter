import assert from 'node:assert/strict';
import {DEFAULTS,DEFAULT_CATEGORIES,MAX_CATEGORIES,normalizeCategories,categoryList,makeCategory,scores,requestFor,verifyRequest,probability} from '../core.mjs';

// The five starting categories, in order, each with a usable definition that treats the post as untrusted.
assert.deepEqual(DEFAULT_CATEGORIES.map(c=>c.name),['Slop','Brainrot','Advert','Opportunity','Nourishment']);
assert.deepEqual(DEFAULT_CATEGORIES.map(c=>c.id),['slop','brainrot','advert','opportunity','nourishment']);
for(const c of DEFAULT_CATEGORIES){assert.ok(c.instructions.length>80&&c.instructions.length<=2000,c.id);assert.match(c.instructions,/untrusted/,c.id+' must guard against instructions in posts');}
assert.equal(DEFAULT_CATEGORIES[0].instructions,DEFAULTS.rule,'slop keeps its existing definition');
assert.equal(new Set(DEFAULT_CATEGORIES.map(c=>c.instructions)).size,5);

// Without categories, requests are exactly what they were: one slop question.
assert.deepEqual(Object.keys(requestFor(DEFAULTS,'x').body.questions),['slop']);
assert.deepEqual(requestFor({...DEFAULTS,provider:'openai'},'x').body.questions.map(q=>q.name),['slop']);
assert.equal(requestFor(DEFAULTS,'x').body.questions.slop.instructions,DEFAULTS.rule);
// The key test stays a single question even if categories exist.
assert.deepEqual(Object.keys(verifyRequest('jev','k').body.questions),['slop']);
assert.equal(verifyRequest('openai','k').body.questions.length,1);

// With categories, one request carries every question, for both providers.
const all={...DEFAULTS,categories:DEFAULT_CATEGORIES};
const jev=requestFor(all,'post');
assert.deepEqual(Object.keys(jev.body.questions),DEFAULT_CATEGORIES.map(c=>c.id));
assert.equal(jev.body.questions.advert.type,'noul');assert.equal(jev.body.state.post_text,'post');
const oa=requestFor({...all,provider:'openai'},'post');
assert.deepEqual(oa.body.questions.map(q=>q.name),DEFAULT_CATEGORIES.map(c=>c.id));
assert.ok(oa.body.questions.every(q=>q.type==='predicate'&&q.instructions));
assert.equal(JSON.parse(oa.body.input).post_text,'post');

// Slop's definition always comes from the rule setting.
assert.equal(categoryList({rule:'MY RULE',categories:DEFAULT_CATEGORIES})[0].instructions,'MY RULE');
assert.equal(requestFor({...all,rule:'MY RULE'},'x').body.questions.slop.instructions,'MY RULE');
assert.equal(categoryList({rule:'',categories:DEFAULT_CATEGORIES})[0].instructions,DEFAULTS.rule);

// Normalising: bad entries are dropped, slop is always present, duplicates and oversize lists are cut.
const good={id:'jobs',name:'Jobs',instructions:'Is this a job ad?'};
const messy=normalizeCategories([null,5,'x',{id:'Bad Id',name:'a',instructions:'b'},{id:'noname',name:' ',instructions:'b'},{id:'noins',name:'n',instructions:''},{id:'long',name:'x'.repeat(41),instructions:'b'},{id:'huge',name:'n',instructions:'b'.repeat(2001)},good,{...good,name:'Dup'},{id:'../x',name:'n',instructions:'b'}],'R');
assert.deepEqual(messy.map(c=>c.id),['slop','jobs'],'slop restored at the front, junk and duplicate dropped');
assert.equal(messy[0].instructions,'R');assert.equal(messy[1].name,'Jobs');
assert.deepEqual(normalizeCategories(undefined).map(c=>c.id),['slop']);
assert.deepEqual(normalizeCategories('nope').map(c=>c.id),['slop']);
const many=Array.from({length:30},(_,i)=>({id:'c'+i,name:'C'+i,instructions:'q'}));
assert.equal(normalizeCategories(many).length,MAX_CATEGORIES);
assert.equal(normalizeCategories(many)[0].id,'slop');
assert.deepEqual(Object.keys(normalizeCategories([{id:'x',name:' Padded ',instructions:' i ',extra:'ignored'}])[1]),['id','name','instructions','fold']);

// Only slop folds by default; fold is kept when set and must be a boolean.
assert.deepEqual(DEFAULT_CATEGORIES.map(c=>c.fold),[true,false,false,false,false]);
assert.deepEqual(normalizeCategories([{id:'a',name:'A',instructions:'q',fold:true},{id:'b',name:'B',instructions:'q',fold:'yes'}]).map(c=>[c.id,c.fold]),[['slop',true],['a',true],['b',false]]);
assert.equal(normalizeCategories([{id:'slop',name:'Slop',instructions:'q',fold:false}])[0].fold,false,'slop folding can be switched off');

// Custom categories: ids come from names, are unique and valid, and bad input is refused.
assert.deepEqual(makeCategory('  Hot Takes! ','Is this a hot take?',DEFAULT_CATEGORIES),{id:'hot-takes',name:'Hot Takes!',instructions:'Is this a hot take?',fold:false});
assert.equal(makeCategory('Slop','x',DEFAULT_CATEGORIES).id,'slop-2');
assert.equal(makeCategory('Slop','x',[...DEFAULT_CATEGORIES,{id:'slop-2'}]).id,'slop-3');
assert.equal(makeCategory('日本語','x').id,'category');
assert.equal(makeCategory('','x'),null);assert.equal(makeCategory('n',''),null);assert.equal(makeCategory('n'.repeat(41),'x'),null);assert.equal(makeCategory(undefined,undefined),null);
for(const name of ['Hot Takes!','Ünïcode café','a'.repeat(40),'---','C++'])assert.match(makeCategory(name,'x').id,/^[a-z0-9][a-z0-9-]{0,31}$/,name);
const made=makeCategory('Hot Takes','Is this a hot take?',DEFAULT_CATEGORIES);
assert.deepEqual(normalizeCategories([...DEFAULT_CATEGORIES,made]).at(-1),made,'a made category survives normalising');

// Parsing: every valid score comes through; missing, refused or out-of-range answers are left out.
const cats=DEFAULT_CATEGORIES;
const jevAnswer={answers:{slop:{type:'noul',noul:.9},brainrot:{type:'noul',noul:0},advert:{type:'noul',noul:1},opportunity:{type:'refusal'},nourishment:{type:'noul',noul:1.5}}};
assert.deepEqual(scores('jev',jevAnswer,cats),{slop:.9,brainrot:0,advert:1});
const oaAnswer={answers:[{name:'slop',type:'predicate',probability:.2},{name:'advert',type:'predicate',probability:.7},{name:'brainrot',type:'refusal'},{name:'nourishment',type:'predicate',probability:'0.5'},{name:'other',type:'predicate',probability:.5}]};
assert.deepEqual(scores('openai',oaAnswer,cats),{slop:.2,advert:.7});
for(const data of [null,undefined,{},{answers:null},{answers:[]},{answers:'x'},{answers:[null]}])for(const provider of ['jev','openai'])assert.deepEqual(scores(provider,data,cats),{},provider);
assert.deepEqual(scores('jev',{answers:[{name:'slop'}]},cats),{},'array answers are not valid for jev');
// The existing slop-only parser agrees with the new one.
assert.equal(probability('jev',jevAnswer),scores('jev',jevAnswer,cats).slop);
assert.equal(probability('openai',oaAnswer),scores('openai',oaAnswer,cats).slop);
console.log('PASS: categories (defaults, requests for both providers, slop rule, validation, custom ids, per-category scores)');
