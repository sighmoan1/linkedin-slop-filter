import assert from 'node:assert/strict';
import {verifyKey,verifyOllama,verifyRequest,keyFingerprint,DEFAULTS} from '../core.mjs';
const KEY='sk-SECRET-KEY-VALUE';
const good={jev:{answers:{slop:{type:'noul',noul:.4}}},openai:{answers:[{name:'slop',type:'predicate',probability:.4}]}};
const reply=(status,body)=>async()=>({ok:status>=200&&status<300,status,json:async()=>{if(body instanceof Error)throw body;return body;}});

// Requests match what real classification sends, to the right place, with the right credentials.
for(const [provider,url,model] of [['jev','https://openrouter.ai/api/alpha/decisions','typesafe/jev-1.13'],['openai','https://api.openai.com/v1/decisions','gpt-6-luna']]){
  let seen;
  const result=await verifyKey(provider,'  '+KEY+'  ',{fetchImpl:async(u,req)=>{seen={u,req};return reply(200,good[provider])();}});
  assert.equal(result.ok,true);assert.equal(result.code,'ok');
  assert.equal(seen.u,url);assert.equal(seen.req.method,'POST');
  assert.equal(seen.req.headers.Authorization,'Bearer '+KEY,'key is trimmed and sent as a bearer token');
  assert.equal(seen.req.redirect,'error');
  assert.equal(JSON.parse(seen.req.body).model,model);
  assert.equal(verifyRequest(provider,KEY).url,url);
}

// Each failure class gets its own code and a message that never leaks the key.
const cases=[[401,'rejected'],[402,'no_credit'],[403,'no_access'],[404,'not_found'],[429,'rate_limited'],[500,'server_error'],[503,'server_error'],[400,'http_error']];
for(const provider of ['jev','openai']) for(const [status,code] of cases){
  const result=await verifyKey(provider,KEY,{fetchImpl:reply(status,{error:{message:'bad key '+KEY}})});
  assert.equal(result.ok,false);assert.equal(result.code,code,provider+' '+status);assert.equal(result.status,status);
  assert.ok(result.message.length>10);
  assert.equal(JSON.stringify(result).includes(KEY),false,'result must not contain the key or the provider error text');
}
assert.equal(new Set(cases.filter(([s])=>[401,402,403,404,429].includes(s)).map(([,code])=>code)).size,5,'named statuses map to distinct codes');

// Missing key makes no request.
let calls=0;
for(const empty of ['','   ',undefined,null]){
  const result=await verifyKey('jev',empty,{fetchImpl:async()=>{calls++;}});
  assert.equal(result.code,'missing_key');assert.equal(result.ok,false);
}
assert.equal(calls,0);

// A 200 that is not a valid answer is not a pass.
for(const body of [{},{answers:{slop:{type:'refusal'}}},{answers:{slop:{type:'noul',noul:7}}},new Error('not json')]){
  const result=await verifyKey('jev',KEY,{fetchImpl:reply(200,body)});
  assert.equal(result.ok,false);assert.equal(result.code,'invalid_response');
}

// Network failures and timeouts.
const net=await verifyKey('jev',KEY,{fetchImpl:async()=>{throw new TypeError('Failed to fetch '+KEY);}});
assert.equal(net.code,'network');assert.equal(JSON.stringify(net).includes(KEY),false);
const slow=await verifyKey('openai',KEY,{timeoutMs:20,fetchImpl:(u,req)=>new Promise((_,reject)=>req.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))))});
assert.equal(slow.code,'timeout');

// Unknown provider is rejected rather than silently using another provider's endpoint.
assert.throws(()=>verifyRequest('other',KEY));
assert.equal(DEFAULTS.jevKey,'');

// Fingerprints are stable, key-specific, and do not contain the key.
const a=await keyFingerprint(KEY),b=await keyFingerprint(KEY),c=await keyFingerprint(KEY+'x');
assert.equal(a,b);assert.notEqual(a,c);assert.match(a,/^[0-9a-f]{12}$/);
console.log('PASS: key verification requests, every failure class, no key leakage, invalid answers, timeout, fingerprint');

const localGood={done:true,done_reason:'stop',message:{role:'assistant',content:'{"slop":0.4}'}};
let localSeen;
const local=await verifyOllama(' http://localhost:11435 ',' llama3.1:8b ',{fetchImpl:async(url,request)=>{
  localSeen={url,request};return reply(200,localGood)();
}});
assert.equal(local.ok,true);assert.equal(localSeen.url,'http://localhost:11435/api/chat');
assert.deepEqual(localSeen.request.headers,{'Content-Type':'application/json'});
assert.equal(localSeen.request.credentials,'omit');assert.equal(localSeen.request.redirect,'error');
assert.equal(localSeen.request.method,'POST');
const localBody=JSON.parse(localSeen.request.body);
assert.equal(localBody.model,'llama3.1:8b');assert.equal(localBody.stream,false);
assert.deepEqual(localBody.format.required,['slop']);
assert.match(JSON.parse(localBody.messages[1].content).post_text,/Thrilled to share/);
assert.equal(JSON.stringify(localSeen).includes(KEY),false);
let invalidCalls=0;
for(const [endpoint,model] of [['https://127.0.0.1:11434','llama3.1:8b'],['http://remote.example:11434','llama3.1:8b'],['http://localhost/api/chat','llama3.1:8b'],['http://user:pass@localhost','llama3.1:8b'],['http://localhost',''],['http://localhost','qwen3:cloud'],[undefined,undefined]]){
  assert.equal((await verifyOllama(endpoint,model,{fetchImpl:async()=>{invalidCalls++;}})).code,'configuration');
}
assert.equal(invalidCalls,0);
for(const [status,code,help] of [[403,'origin_denied',/OLLAMA_ORIGINS/],[404,'not_found',/ollama pull/],[500,'http_error',/HTTP 500/],[400,'http_error',/HTTP 400/]]){
  const result=await verifyOllama(DEFAULTS.ollamaEndpoint,DEFAULTS.ollamaModel,{fetchImpl:reply(status,{error:KEY})});
  assert.equal(result.ok,false);assert.equal(result.code,code);assert.equal(result.status,status);assert.match(result.message,help);
  assert.equal(JSON.stringify(result).includes(KEY),false);
}
for(const body of [{},{...localGood,done:false},{...localGood,done_reason:'length'},{...localGood,message:{role:'assistant',content:'{"slop":7}'}},new Error(KEY)]){
  const result=await verifyOllama(DEFAULTS.ollamaEndpoint,DEFAULTS.ollamaModel,{fetchImpl:reply(200,body)});
  assert.equal(result.code,'invalid_response');assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes(KEY),false);
}
const localNet=await verifyOllama(DEFAULTS.ollamaEndpoint,DEFAULTS.ollamaModel,{fetchImpl:async()=>{throw new Error(KEY);}});
assert.equal(localNet.code,'network');assert.match(localNet.message,/Start Ollama/);assert.equal(JSON.stringify(localNet).includes(KEY),false);
const localSlow=await verifyOllama(DEFAULTS.ollamaEndpoint,DEFAULTS.ollamaModel,{timeoutMs:20,fetchImpl:(u,req)=>new Promise((_,reject)=>req.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))))});
assert.equal(localSlow.code,'timeout');assert.match(localSlow.message,/ollama run/);
console.log('PASS: local Ollama synthetic verification, keyless loopback requests, configuration, service failures, invalid output and timeout');
