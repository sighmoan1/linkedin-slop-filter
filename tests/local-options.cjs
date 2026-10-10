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
  console.log('PASS: settings migration, optional keyless local, provider-scoped fields, per-category thresholds, endpoint validation, switching and delete/disable');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
