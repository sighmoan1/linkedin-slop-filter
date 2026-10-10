const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.route('https://settings.test/**',async route=>{
   const file=new URL(route.request().url()).pathname.slice(1)||'options.html';
   if(!['options.html','options.css','options.js','core.mjs'].includes(file)&&!/^core\/[a-z]+\.mjs$/.test(file)) return route.abort();
   await route.fulfill({contentType:file.endsWith('html')?'text/html':file.endsWith('css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(__dirname,'..',file),'utf8')});
  });
  await page.addInitScript(()=>{
   window.saved={threshold:.85};
   window.savedSession={'cache:local':{s:{slop:.9},t:Date.now()},requests:8};
   window.chrome={storage:{local:{get:async q=>typeof q==='string'?{[q]:window.saved[q]}:{...q,...window.saved},set:async data=>Object.assign(window.saved,data),remove:async keys=>{for(const key of [].concat(keys))delete window.saved[key];}},session:{get:async()=>window.savedSession,remove:async keys=>{for(const key of [].concat(keys))delete window.savedSession[key];}}}};
  });
  await page.goto('https://settings.test/options.html');
  await page.waitForFunction(()=>document.querySelectorAll('.cat-threshold').length===5);
  assert.equal(await page.locator('#provider').inputValue(),'jev');
  // A saved slop-era threshold becomes every category's threshold, and the old keys are gone.
  assert.deepEqual(await page.$$eval('.cat-threshold',els=>els.map(e=>e.value)),['85','85','85','85','85']);
  assert.equal(await page.evaluate(()=>'threshold' in window.saved),false);assert.equal(await page.evaluate(()=>window.saved.schema),2);
  assert.equal(await page.locator('#ollamaEndpoint').isVisible(),false);
  await page.click('[data-panel=provider]');await page.locator('#provider').selectOption('ollama');
  assert.equal(await page.locator('#ollamaEndpoint').isVisible(),true);
  let localCalls=0,mode='ok',seen,release;
  await page.route('http://127.0.0.1:11435/api/chat',async route=>{
   localCalls++;seen={body:route.request().postDataJSON(),headers:route.request().headers()};
   if(mode==='hold')await new Promise(resolve=>{release=resolve;});
   const status=mode==='403'?403:mode==='404'?404:200;
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(mode==='invalid'?{}:{done:true,done_reason:'stop',message:{role:'assistant',content:'{"slop":0.4}'}})});
  });
  const beforeTest=await page.evaluate(()=>({saved:window.saved,session:window.savedSession}));
  await page.locator('#ollamaEndpoint').fill('http://127.0.0.1:11435');
  await page.locator('#ollamaModel').fill('llama3.1:8b');
  assert.equal(localCalls,0,'typing sends nothing');
  await page.getByRole('button',{name:'Test local Ollama'}).click();
  await page.waitForFunction(()=>document.querySelector('#ollamaStatus').textContent.includes('Local Ollama works'));
  assert.equal(localCalls,1);assert.equal(seen.body.model,'llama3.1:8b');assert.deepEqual(seen.body.format.required,['slop']);
  assert.equal(seen.headers.authorization,undefined);
  assert.deepEqual(await page.evaluate(()=>({saved:window.saved,session:window.savedSession})),beforeTest,'test does not save settings or change session limits');
  await page.locator('#ollamaModel').fill('llama3.1:8b');
  assert.equal(await page.locator('#ollamaStatus').innerText(),'');
  for(const [response,text] of [['403','OLLAMA_ORIGINS'],['404','ollama pull'],['invalid','valid classification']]){
   mode=response;await page.click('#ollamaTest');
   await page.waitForFunction(text=>document.querySelector('#ollamaStatus').textContent.includes(text),text);
   assert.equal(await page.locator('#ollamaTest').isEnabled(),true);
  }
  const callsBeforeInvalid=localCalls;
  await page.locator('#ollamaEndpoint').fill('http://remote.example:11434');await page.click('#ollamaTest');
  assert.match(await page.locator('#ollamaStatus').innerText(),/loopback/);assert.equal(localCalls,callsBeforeInvalid);
  await page.locator('#ollamaEndpoint').fill('http://127.0.0.1:11435');mode='hold';
  await page.click('#ollamaTest');
  await page.waitForFunction(()=>document.querySelector('#ollamaTest').disabled);
  while(!release)await new Promise(resolve=>setTimeout(resolve,10));
  await page.locator('#ollamaModel').fill('other-model');await page.locator('#ollamaModel').fill('llama3.1:8b');
  release();await page.waitForFunction(()=>!document.querySelector('#ollamaTest').disabled);
  assert.equal(await page.locator('#ollamaStatus').innerText(),'','an edited then reverted configuration discards the pending result');
  mode='ok';await page.click('#ollamaTest');
  await page.waitForFunction(()=>document.querySelector('#ollamaStatus').textContent.includes('Local Ollama works'));
  await page.locator('#provider').selectOption('jev');await page.locator('#provider').selectOption('ollama');
  assert.equal(await page.locator('#ollamaStatus').innerText(),'','provider changes invalidate results');
  await page.locator('#ollamaEndpoint').fill('http://127.0.0.1:11434');await page.locator('#ollamaModel').fill('qwen3.5:4b-q4_K_M');
  await page.click('[data-panel=feed]');await page.locator('#enabled').check();
  await page.click('[data-panel=categories]');await page.locator('.cat[data-id=slop] .cat-threshold').fill('91');
  await page.getByRole('button',{name:'Save settings'}).click();
  await page.waitForFunction(()=>window.saved.provider==='ollama');
  const saved=await page.evaluate(()=>window.saved);
  assert.equal(saved.jevKey,'');assert.equal(saved.openaiKey,'');assert.deepEqual(saved.categories.map(c=>c.threshold),[.91,.85,.85,.85,.85]);
  await page.click('[data-panel=provider]');await page.locator('#ollamaEndpoint').fill('http://remote.example:11434');
  await page.getByRole('button',{name:'Save settings'}).click();
  assert.match(await page.locator('#status').innerText(),/loopback/);
  assert.equal(await page.evaluate(()=>window.saved.ollamaEndpoint),'http://127.0.0.1:11434');
  await page.click('[data-panel=feed]');await page.locator('#enabled').uncheck();
  await page.getByRole('button',{name:'Save settings'}).click();
  await page.waitForFunction(()=>window.saved.enabled===false);
  await page.click('[data-panel=provider]');await page.locator('#provider').selectOption('jev');
  await page.click('[data-panel=feed]');await page.locator('#enabled').check();
  await page.getByRole('button',{name:'Save settings'}).click();
  assert.match(await page.locator('#status').innerText(),/Add a key/);
  await page.locator('#jevKey').fill('TEST-KEY');
  await page.getByRole('button',{name:'Save settings'}).click();
  await page.waitForFunction(()=>window.saved.provider==='jev');
  await page.click('[data-panel=provider]');await page.locator('.cache-tools summary').click();await page.getByRole('button',{name:'Clear score cache'}).click();
  await page.waitForFunction(()=>document.querySelector('#cacheStatus').textContent.includes('Cleared 1 cached score'));
  assert.deepEqual(await page.evaluate(()=>window.savedSession),{requests:8});
  await page.getByRole('button',{name:'Delete keys & disable'}).click();
  assert.equal(await page.evaluate(()=>window.saved.enabled),false);
  assert.equal(await page.evaluate(()=>window.saved.jevKey),'');
  console.log('PASS: local test with unsaved values and paused filtering, no credentials or settings/session writes, errors and stale results; migration, switching and delete/disable');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
