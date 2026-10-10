// Real MV3 worker, graphics APIs and content bridge; synthetic attachments and provider responses.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'lsf-images-'));
 let context;
 try {
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--disable-extensions-except='+root,'--load-extension='+root]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const origin=worker.url().replace('background.js','');
  const graphics=await worker.evaluate(()=>({bitmap:typeof createImageBitmap,canvas:typeof OffscreenCanvas}));assert.deepEqual(graphics,{bitmap:'function',canvas:'function'});
  const core=await import('../core.mjs');
  await worker.evaluate(async settings=>{
   await chrome.storage.local.set(settings);
   // This mock is confined to a disposable test profile and a single synthetic image URL.
   chrome.permissions.contains=async()=>true;
   globalThis.syntheticBodies=[];
   globalThis.fetch=async(url,req)=>{
    if(url==='https://media.licdn.com/dms/image/synthetic'){
     const canvas=new OffscreenCanvas(900,900),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,900,900);ctx.fillStyle='#123';ctx.fillRect(50,50,300,200);
     return new Response(await canvas.convertToBlob({type:'image/png'}),{headers:{'content-type':'image/png'}});
    }
    if(url!=='https://openrouter.ai/api/alpha/decisions')throw new Error('Unexpected synthetic transport');
    const body=JSON.parse(req.body);globalThis.syntheticBodies.push(body);
    return new Response(JSON.stringify({answers:Object.fromEntries(Object.keys(body.questions).map(id=>[id,{type:'noul',noul:id==='lsf-visual-slop'?.95:id==='nourishment'?.95:.1}])),usage:{input_tokens:3000,cost:.000114}}),{headers:{'content-type':'application/json'}});
   };
  },{...core.DEFAULTS,schema:2,enabled:true,jevKey:'SYNTHETIC-KEY',categories:core.DEFAULT_CATEGORIES,imageAnalysis:{...core.IMAGE_DEFAULTS,enabled:true}});
  const feed=await context.newPage();
  await feed.route('https://www.linkedin.com/feed/',r=>r.fulfill({contentType:'text/html',body:'<html><body><main><article class="feed-shared-update-v2"><div class="update-components-text">Synthetic visual lesson caption.</div><div class="update-components-image"><img src="https://media.licdn.com/dms/image/synthetic" width="400" height="300"></div></article></main></body></html>'}));
  await feed.route('https://media.licdn.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"/>'}));
  await feed.goto('https://www.linkedin.com/feed/');await feed.waitForFunction(()=>document.querySelector('.lsf-badge')?.textContent==='Visual slop');
  assert.equal(await feed.locator('.lsf-folded').count(),0,'real install starts label-only');
  const data=await worker.evaluate(()=>syntheticBodies.map(b=>({model:b.model,image:b.state?.[1]?.image_url?.url,ids:Object.keys(b.questions)})));
  assert.equal(data.length,2);assert.equal(data[0].model,'typesafe/jev-1.13');assert.equal(data[1].model,'cloudflare/clef-flash');assert.match(data[1].image,/^data:image\/jpeg;base64,/);
  const size=await feed.evaluate(async image=>{const bitmap=await createImageBitmap(await (await fetch(image)).blob());const out={width:bitmap.width,height:bitmap.height};bitmap.close();return out;},data[1].image);
  assert.deepEqual(size,{width:768,height:768});
  const options=await context.newPage();await options.goto(origin+'options.html#playground');await options.waitForFunction(()=>document.documentElement.dataset.settingsReady==='true');
  const comparison=await options.evaluate(async image=>chrome.runtime.sendMessage({type:'compareImages',text:'Synthetic comparison',images:[image]}),data[1].image);
  assert.equal(comparison.results.length,2);assert.equal(comparison.results.every(r=>r.scores?.['lsf-visual-slop']===.95),true);
  const stored=await worker.evaluate(()=>chrome.storage.local.get(null));assert.equal(JSON.stringify(stored).includes('data:image'),false);assert.equal(JSON.stringify(stored).includes('Synthetic comparison'),false);
  console.log('PASS: actual unpacked MV3 worker, bounded attachment resize, credential-isolated feed bridge and trusted image-model comparison');
 } finally {await context?.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
