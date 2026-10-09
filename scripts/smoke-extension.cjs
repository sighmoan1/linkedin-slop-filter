// Opt-in integration check: unpacked worker + synthetic feed + real loopback model.
const {chromium}=require('playwright');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const {DEFAULTS}=await import(pathToFileURL(path.join(root,'core.mjs')));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'slop-filter-smoke-'));
 let context;
 try {
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--disable-extensions-except='+root,'--load-extension='+root]});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const workerURL=new URL(worker.url());
  const extensionOrigin=workerURL.protocol+'//'+workerURL.host;
  if(process.argv.includes('--origin-only')) {
   console.log(extensionOrigin);return;
  }
  const settings={...DEFAULTS,enabled:true,provider:'ollama',ollamaModel:process.env.OLLAMA_MODEL || DEFAULTS.ollamaModel,ollamaEndpoint:process.env.OLLAMA_ENDPOINT || DEFAULTS.ollamaEndpoint};
  await worker.evaluate(async s=>{await chrome.storage.local.set(s);await chrome.storage.session.clear();},settings);
  const page=await context.newPage();
  await page.route('https://www.linkedin.com/**',route=>route.request().url()==='https://www.linkedin.com/feed/'?route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><article class="feed-shared-update-v2"><div class="update-components-text">Synthetic test: Our database migration reduced query time from 240 ms to 38 ms by adding a composite index.</div></article></body></html>'}):route.abort());
  const start=Date.now();
  await page.goto('https://www.linkedin.com/feed/');
  let outcome;
  while(Date.now()-start<45000) {
   outcome=await worker.evaluate(async()=>{
    const data=await chrome.storage.session.get(null);
    const scores=Object.entries(data).filter(([key])=>key.startsWith('cache:')).map(([,score])=>score);
    const {lastError}=await chrome.storage.local.get('lastError');
    return {scores,lastError,requests:data.requests};
   });
   if(outcome.lastError) throw new Error(outcome.lastError);
   if(outcome.scores.length) break;
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!outcome?.scores.length) throw new Error('No classification completed; check service, model and extension origin access.');
  console.log(JSON.stringify({provider:'ollama',model:settings.ollamaModel,extensionOrigin,score:outcome.scores[0],requests:outcome.requests,durationMs:Date.now()-start,syntheticFeed:true,realLocalModel:true,liveLinkedIn:false}));
 } finally {
  if(context) await context.close();
  fs.rmSync(profile,{recursive:true,force:true});
 }
})().catch(error=>{console.error('Extension local smoke failed: '+error.message);process.exit(1)});
