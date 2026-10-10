import assert from 'node:assert/strict';
import {DEFAULTS,DEFAULT_CATEGORIES,MAX_CATEGORIES,ACTIONS,normalizeCategories,categoryList,activeCategories,displayCategories,makeCategory,scores,validScores,requestFor,verifyRequest,scoringKey,migrateSettings,loadSettings} from '../core.mjs';

// The five starting categories, in order, each with a usable definition that treats the post as untrusted.
assert.deepEqual(DEFAULT_CATEGORIES.map(c=>c.name),['Slop','Brainrot','Advert','Opportunity','Good post']);
assert.deepEqual(DEFAULT_CATEGORIES.map(c=>c.id),['slop','brainrot','advert','opportunity','nourishment']);
for(const c of DEFAULT_CATEGORIES){assert.ok(c.instructions.length>80&&c.instructions.length<=2000,c.id);assert.match(c.instructions,/untrusted/,c.id+' must guard against instructions in posts');}
assert.equal(new Set(DEFAULT_CATEGORIES.map(c=>c.instructions)).size,5);
// Only Slop hides by default; the positive categories are highlighted.
assert.deepEqual(DEFAULT_CATEGORIES.map(c=>c.action),['hide','label','label','highlight','highlight']);
assert.equal(DEFAULTS.rule,undefined,'no separate slop definition any more');

// One request carries every switched-on question, for both providers.
const jev=requestFor(DEFAULTS,'post');
assert.deepEqual(Object.keys(jev.body.questions),DEFAULT_CATEGORIES.map(c=>c.id));
assert.equal(jev.body.questions.advert.type,'noul');assert.equal(jev.body.state.post_text,'post');
const oa=requestFor({...DEFAULTS,provider:'openai'},'post');
assert.deepEqual(oa.body.questions.map(q=>q.name),DEFAULT_CATEGORIES.map(c=>c.id));
assert.ok(oa.body.questions.every(q=>q.type==='predicate'&&q.instructions));
assert.equal(JSON.parse(oa.body.input).post_text,'post');
// Off categories are not asked.
const someOff={...DEFAULTS,categories:DEFAULT_CATEGORIES.map(c=>c.id==='brainrot'?{...c,action:'off'}:c)};
assert.deepEqual(Object.keys(requestFor(someOff,'x').body.questions),['slop','advert','opportunity','nourishment']);
assert.deepEqual(displayCategories(categoryList(someOff)).map(c=>c.id),['slop','advert','opportunity','nourishment']);
assert.equal(JSON.stringify(displayCategories(DEFAULT_CATEGORIES)).includes('instructions'),false,'the page never gets definitions');
// A subset can be asked explicitly; the key test asks one question only.
assert.deepEqual(Object.keys(requestFor(DEFAULTS,'x',[DEFAULT_CATEGORIES[2]]).body.questions),['advert']);
assert.deepEqual(Object.keys(verifyRequest('jev','k').body.questions),['slop']);
assert.equal(verifyRequest('openai','k').body.questions.length,1);

// Slop is an ordinary category: it can be edited, removed or switched off.
const noSlop=normalizeCategories(DEFAULT_CATEGORIES.slice(1));
assert.deepEqual(noSlop.map(c=>c.id),['brainrot','advert','opportunity','nourishment']);
assert.equal(requestFor({...DEFAULTS,categories:noSlop},'x').body.questions.slop,undefined);
assert.equal(requestFor({...DEFAULTS,categories:[{...DEFAULT_CATEGORIES[0],instructions:'MY RULE'}]},'x').body.questions.slop.instructions,'MY RULE');

// Normalising: bad entries are dropped, duplicates and oversize lists are cut, and junk falls back to defaults.
const good={id:'jobs',name:'Jobs',instructions:'Is this a job ad?',action:'hide',threshold:.6};
const messy=normalizeCategories([null,5,'x',{id:'Bad Id',name:'a',instructions:'b'},{id:'noname',name:' ',instructions:'b'},{id:'noins',name:'n',instructions:''},{id:'long',name:'x'.repeat(41),instructions:'b'},{id:'huge',name:'n',instructions:'b'.repeat(2001)},good,{...good,name:'Dup'},{id:'../x',name:'n',instructions:'b'}]);
assert.deepEqual(messy,[good]);
assert.deepEqual(normalizeCategories(undefined),DEFAULT_CATEGORIES);
assert.deepEqual(normalizeCategories('nope'),DEFAULT_CATEGORIES);
assert.deepEqual(normalizeCategories([null]),DEFAULT_CATEGORIES,'a corrupt nonempty list falls back to the defaults');
assert.deepEqual(normalizeCategories([]),[],'an explicitly empty list stays empty');
assert.deepEqual(categoryList({...DEFAULTS,categories:[]}),[]);
assert.deepEqual(migrateSettings({...DEFAULTS,schema:2,categories:[]}).settings.categories,[]);
assert.deepEqual(migrateSettings({schema:null,categories:[]}).settings.categories,[],'migration respects deliberate removal');
const many=Array.from({length:30},(_,i)=>({id:'c'+i,name:'C'+i,instructions:'q'}));
assert.equal(normalizeCategories(many).length,MAX_CATEGORIES);
assert.deepEqual(Object.keys(normalizeCategories([{id:'x',name:' Padded ',instructions:' i ',extra:'ignored'}])[0]),['id','name','instructions','action','threshold']);
// Unknown actions show on the chip; bad thresholds fall back to 80%.
assert.deepEqual(normalizeCategories([{id:'a',name:'A',instructions:'q',action:'explode',threshold:2},{id:'b',name:'B',instructions:'q',action:'off',threshold:0}]).map(c=>[c.action,c.threshold]),[['label',.8],['off',0]]);
assert.deepEqual(ACTIONS,['hide','highlight','label','off']);
assert.deepEqual(activeCategories(normalizeCategories([{id:'a',name:'A',instructions:'q',action:'off'}])),[]);

// Custom categories: ids come from names, are unique and valid, and bad input is refused.
assert.deepEqual(makeCategory('  Hot Takes! ','Is this a hot take?',DEFAULT_CATEGORIES),{id:'hot-takes',name:'Hot Takes!',instructions:'Is this a hot take?',action:'label',threshold:.8});
assert.equal(makeCategory('Slop','x',DEFAULT_CATEGORIES).id,'slop-2');
assert.equal(makeCategory('Slop','x',[...DEFAULT_CATEGORIES,{id:'slop-2'}]).id,'slop-3');
assert.equal(makeCategory('日本語','x').id,'category');
assert.equal(makeCategory('a'.repeat(23)+' b','x').id,'a'.repeat(23),'no trailing hyphen after truncating');
assert.equal(makeCategory('','x'),null);assert.equal(makeCategory('n',''),null);assert.equal(makeCategory('n'.repeat(41),'x'),null);assert.equal(makeCategory(undefined,undefined),null);
for(const name of ['Hot Takes!','Ünïcode café','a'.repeat(40),'---','C++'])assert.match(makeCategory(name,'x').id,/^[a-z0-9][a-z0-9-]{0,31}$/,name);
const made=makeCategory('Hot Takes','Is this a hot take?',DEFAULT_CATEGORIES);
assert.deepEqual(normalizeCategories([...DEFAULT_CATEGORIES,made]).at(-1),made,'a made category survives normalising');

// The scoring key covers what decides scores, and nothing else.
const key=scoringKey(DEFAULTS);
const display=DEFAULT_CATEGORIES.map(c=>({...c,name:c.name+'!',action:c.action==='hide'?'label':'hide',threshold:.5}));
assert.equal(scoringKey({...DEFAULTS,categories:display}),key,'names, actions and thresholds do not rescore');
assert.equal(scoringKey({...DEFAULTS,categories:[...DEFAULT_CATEGORIES].reverse()}),key,'order does not rescore');
assert.notEqual(scoringKey({...DEFAULTS,categories:DEFAULT_CATEGORIES.map(c=>c.id==='advert'?{...c,instructions:'changed'}:c)}),key);
assert.notEqual(scoringKey(someOff),key,'switching a category off changes what is asked');
assert.notEqual(scoringKey({...DEFAULTS,provider:'openai'}),key);

// Parsing: every valid score comes through; missing, refused or out-of-range answers are left out.
const cats=DEFAULT_CATEGORIES;
const jevAnswer={answers:{slop:{type:'noul',noul:.9},brainrot:{type:'noul',noul:0},advert:{type:'noul',noul:1},opportunity:{type:'refusal'},nourishment:{type:'noul',noul:1.5}}};
assert.deepEqual(scores('jev',jevAnswer,cats),{slop:.9,brainrot:0,advert:1});
const oaAnswer={answers:[{name:'slop',type:'predicate',probability:.2},{name:'advert',type:'predicate',probability:.7},{name:'brainrot',type:'refusal'},{name:'nourishment',type:'predicate',probability:'0.5'},{name:'other',type:'predicate',probability:.5}]};
assert.deepEqual(scores('openai',oaAnswer,cats),{slop:.2,advert:.7});
for(const data of [null,undefined,{},{answers:null},{answers:[]},{answers:'x'},{answers:[null]}])for(const provider of ['jev','openai'])assert.deepEqual(scores(provider,data,cats),{},provider);
assert.deepEqual(scores('jev',{answers:[{name:'slop'}]},cats),{},'array answers are not valid for jev');
// Slop is not required: any one valid score is a result. None at all is an error.
assert.deepEqual(validScores('jev',{answers:{advert:{type:'noul',noul:.4}}},cats),{advert:.4});
assert.throws(()=>validScores('jev',{answers:{slop:{type:'refusal'}}},cats),/valid probability/);

// Migration from the settings of every earlier version.
const fresh=migrateSettings({schema:null});
assert.equal(fresh.changed,true);assert.deepEqual(fresh.settings.categories,DEFAULT_CATEGORIES);assert.equal(fresh.settings.schema,2);
// Slop-only era: a rule and three provider thresholds, no categories.
const v0=migrateSettings({provider:'openai',rule:' MY RULE ',threshold:.7,openaiThreshold:null,localThreshold:.9}).settings;
assert.equal(v0.categories[0].instructions,'MY RULE');assert.ok(v0.categories.every(c=>c.threshold===.7),'OpenAI fell back to the shared threshold');
for(const k of ['rule','threshold','openaiThreshold','localThreshold'])assert.equal(k in v0,false,k+' removed');
assert.ok(migrateSettings({provider:'ollama',threshold:.7,localThreshold:.9}).settings.categories.every(c=>c.threshold===.9));
assert.ok(migrateSettings({provider:'openai',threshold:.7,openaiThreshold:.85}).settings.categories.every(c=>c.threshold===.85));
assert.ok(migrateSettings({threshold:'bad'}).settings.categories.every(c=>c.threshold===.8));
// Categories era: fold flags, a custom category, slop's definition in the rule.
const old=[{id:'slop',name:'Slop',instructions:'ignored',fold:false},{id:'advert',name:'Advert',instructions:'ad?',fold:true},{id:'opportunity',name:'Opportunity',instructions:'opp?',fold:false},{id:'hot',name:'Hot',instructions:'hot?',fold:false}];
const v1=migrateSettings({provider:'jev',rule:'R',threshold:.75,categories:old}).settings;
assert.deepEqual(v1.categories.map(c=>[c.id,c.action,c.threshold]),[['slop','label',.75],['advert','hide',.75],['opportunity','highlight',.75],['hot','label',.75]]);
assert.equal(v1.categories[0].instructions,'R');
// Current settings are left as they are.
const current={...DEFAULTS,schema:2,categories:[good]};
assert.deepEqual(migrateSettings(current),{settings:{...current,categories:[good]},changed:false});
// The old default name changes without changing IDs, definitions, rules or score cache keys.
const legacyPositive={...DEFAULT_CATEGORIES.find(c=>c.id==='nourishment'),name:'Nourishment',instructions:'My saved definition',action:'hide',threshold:.67};
const renameInput={...DEFAULTS,schema:2,jevKey:'test-key',categories:[legacyPositive,{...good,name:'Nourishment'}]};
const renamed=migrateSettings(renameInput);
assert.equal(renamed.changed,true);
assert.deepEqual(renamed.settings,{...renameInput,categories:[{...legacyPositive,name:'Good post'},{...good,name:'Nourishment'}]});
assert.equal(scoringKey(renamed.settings),scoringKey(renameInput));
assert.equal(migrateSettings(renamed.settings).changed,false,'rename is idempotent');
assert.equal(migrateSettings({...renameInput,categories:[{...legacyPositive,name:'Useful reading'}]}).settings.categories[0].name,'Useful reading','custom names survive');
assert.equal(migrateSettings({schema:1,categories:[legacyPositive]}).settings.categories[0].name,'Good post','legacy schema receives the name too');
let renameWrites=0;const renameStore={...renameInput};
const renameArea={get:async q=>({...q,...renameStore}),set:async v=>{renameWrites++;Object.assign(renameStore,v);},remove:async()=>{}};
await loadSettings(renameArea);await loadSettings(renameArea);
assert.equal(renameWrites,1,'persist the name once');
assert.equal(renameStore.jevKey,renameInput.jevKey);
// loadSettings writes a migration back and removes the old keys, once.
const store={rule:'R',threshold:.6,localThreshold:.9,jevKey:'k'};
const area={get:async q=>({...q,...store}),set:async v=>Object.assign(store,v),remove:async keys=>{for(const k of [].concat(keys))delete store[k];}};
const loaded=await loadSettings(area);
assert.equal(loaded.jevKey,'k');assert.equal(store.schema,2);assert.equal(store.categories[0].instructions,'R');assert.equal(store.categories[0].threshold,.6);
assert.deepEqual(Object.keys(store).sort(),['categories','jevKey','schema']);
const before=JSON.stringify(store);await loadSettings(area);assert.equal(JSON.stringify(store),before);
console.log('PASS: categories (defaults, actions, requests for both providers, slop is ordinary, validation, custom ids, scoring key, per-category scores, migration)');
