const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
(async()=>{
 const core=await import('../core.mjs');
 // The real UI and real service-worker handler communicate through browser bindings.
 // Storage, sender identity and provider transport are simulated; no live API is called.
 const local={...core.DEFAULTS,schema:2,categories:core.DEFAULT_CATEGORIES.map(c=>({...c})),jevKey:'SYNTHETIC-TEST-KEY',enabled:false,limit:2};
 const session={};const clone=value=>structuredClone(value);
 const storage=data=>({get:async query=>clone(query===null?data:typeof query==='string'?{[query]:data[query]}:{...query,...data}),set:async value=>Object.assign(data,clone(value)),remove:async keys=>{for(const key of [].concat(keys))delete data[key];},setAccessLevel:async()=>{}});
 let handler,calls=0,opened=0;
 const ownId='ui-service-test';
 const feed={id:ownId,url:'https://www.linkedin.com/feed/',tab:{id:7}};
 const worker=vm.createContext({...core,crypto:webcrypto,TextEncoder,AbortController,URL,setTimeout,clearTimeout,
  chrome:{storage:{local:storage(local),session:storage(session)},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},runtime:{id:ownId,getURL:name=>'chrome-extension://'+ownId+'/'+name,openOptionsPage:async()=>{opened++;},onMessage:{addListener:value=>handler=value}}},
  fetch:async(_url,request)=>{
   calls++;assert.equal(request.headers.Authorization,'Bearer SYNTHETIC-TEST-KEY');assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');
   const body=JSON.parse(request.body);assert.equal(typeof body.state.post_text,'string');assert.equal(Object.keys(body.state).length,1);
   return {ok:true,status:200,json:async()=>({answers:Object.fromEntries(Object.keys(body.questions).map(id=>[id,{type:'noul',noul:{slop:.95,brainrot:.2,advert:.96,opportunity:.1,nourishment:.92}[id]}]))})};
  }
 });
 vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8').replace(/^import .*;\n/,''),worker);
 const send=(message,sender)=>new Promise((resolve,reject)=>{if(handler(message,sender,value=>resolve(clone(value)))!==true)reject(new Error('Rejected test message: '+message.type));});
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1000,height:800}});
  const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!=='https://ext.test')return route.abort();const file=path.join(root,url.pathname.slice(1));
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:types[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
  });
  await context.exposeBinding('lsfStorage',async(_source,area,method,arg)=>storage(area==='session'?session:local)[method](arg));
  await context.exposeBinding('lsfRuntime',async(source,message)=>send(message,{id:ownId,url:'chrome-extension://'+ownId+'/'+(new URL(source.page.url()).pathname.endsWith('/popup.html')?'popup.html':'options.html')}));
  await context.exposeBinding('lsfOpenSettings',async()=>{opened++;});
  await context.addInitScript(()=>{
   if(location.origin!=='https://ext.test')return;
   const area=name=>({get:value=>window.lsfStorage(name,'get',value),set:value=>window.lsfStorage(name,'set',value),remove:value=>window.lsfStorage(name,'remove',value)});
   window.chrome={storage:{local:area('local'),session:area('session')},tabs:{query:async()=>[{id:7,url:'https://www.linkedin.com/feed/foryou/'}],sendMessage:async()=>({isFeed:true,posts:8})},runtime:{sendMessage:message=>window.lsfRuntime(message),openOptionsPage:()=>window.lsfOpenSettings()}};
  });
  const page=await context.newPage();await page.goto('https://ext.test/options.html');await page.waitForFunction(()=>document.documentElement.dataset.settingsReady==='true');
  await page.locator('[data-panel=people]').click();
  await page.fill('#personUrl','https://www.linkedin.com/in/synthetic-person/?trk=test');await page.click('#addPerson');
  await page.waitForFunction(()=>document.getElementById('peopleStatus').textContent.startsWith('Saved'));
  assert.equal(local.neverHidePeople[0].url,'https://www.linkedin.com/in/synthetic-person');assert.equal(calls,0);
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.settingsReady==='true');
  await page.getByRole('button',{name:'Remove https://www.linkedin.com/in/synthetic-person from never-hide list'}).click();
  await page.waitForFunction(()=>document.getElementById('peopleStatus').textContent.startsWith('Removed'));
  assert.equal(local.neverHidePeople.length,0);assert.equal(local.jevKey,'SYNTHETIC-TEST-KEY');
  await page.locator('[data-panel=playground]').click();await page.fill('#playgroundText','Synthetic ordinary post body, never stored as text.');
  assert.equal(calls,0,'typing does not call the provider');
  await page.click('#classifyPost');await page.waitForFunction(()=>document.getElementById('playgroundResult').hidden===false);
  assert.match(await page.locator('#playgroundResult h2').innerText(),/Would hide/);assert.equal(calls,1);assert.equal(session.requests,1);
  assert.equal(JSON.stringify(local).includes('Synthetic ordinary post body'),false,'normal scoring/cache never retains the text');assert.equal(local.corrections,undefined);
  await page.click('#classifyPost');await page.waitForFunction(()=>document.getElementById('playgroundStatus').textContent.startsWith('Finished'));
  assert.equal(calls,1,'explicit testing reuses the real worker cache');assert.equal(session.requests,1);assert.equal(session.usage.cacheHits,1);
  await page.locator('[data-panel=feed]').click();assert.equal(await page.locator('input[name=theme]').count(),0);await page.check('#groupHidden');await page.getByRole('button',{name:'Save settings'}).click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Saved'));
  assert.deepEqual(local.appearance,{theme:'native',groupHidden:true,labels:'matches'});assert.equal(calls,1,'appearance does not classify');
  const classified=await send({type:'settings'},feed);assert.deepEqual(Object.keys(classified).sort(),['categories','configuration','enabled','provider']);assert.equal(JSON.stringify(classified).includes('instructions'),false);
  await send({type:'correction',text:'Explicitly corrected synthetic post.',categoryIds:['slop','advert'],scores:{slop:.95,advert:.96},configuration:classified.configuration,provider:'jev'},feed);
  await page.locator('[data-panel=corrections]').click();await page.waitForFunction(()=>document.querySelectorAll('.correction').length===1);assert.equal(await page.locator('.correction-labels').innerText(),'Slop\nAdvert');
  await page.locator('.correction .text-button').click();await page.waitForFunction(()=>document.querySelectorAll('.correction').length===0);assert.equal(local.corrections.length,0);assert.equal(session.requests,1,'correction removal does not reset spending');
  const popup=await context.newPage();await popup.goto('https://ext.test/popup.html');await popup.waitForFunction(()=>document.getElementById('requests').textContent==='1');
  assert.equal(await popup.locator('#showEverything').isDisabled(),true);assert.match(await popup.locator('#revealNote').innerText(),/already visible/);await popup.locator('#enabled').check();await popup.waitForFunction(()=>document.getElementById('showEverything').disabled===false);
  await popup.click('#showEverything');await popup.waitForFunction(()=>document.getElementById('showEverything').textContent==='Restore filtering');assert.equal((await send({type:'experience'},feed)).showEverything,true);assert.equal(local.enabled,true);await popup.locator('#enabled').uncheck();await popup.waitForFunction(()=>document.getElementById('showEverything').disabled===true);assert.equal(local.enabled,false);assert.equal((await send({type:'experience'},feed)).showEverything,true,'pausing preserves the stored tab override');
  assert.equal((await send({type:'classify',text:'Filtering is paused.'},feed)).disabled,true);assert.equal(calls,1);
  assert.equal(await popup.locator('input[name=theme]').count(),0);assert.equal(local.appearance.theme,'native');assert.equal(local.appearance.groupHidden,true);assert.equal(calls,1);
  await page.locator('[data-panel=provider]').click();await page.locator('.cache-tools summary').click();await page.click('#clearCache');await page.waitForFunction(()=>document.getElementById('cacheStatus').textContent.startsWith('Cleared 1'));
  assert.equal(session.requests,1,'cache clear preserves session request cap');
  await page.locator('[data-panel=playground]').click();await page.fill('#playgroundText','Second synthetic test.');await page.click('#classifyPost');await page.waitForFunction(()=>document.getElementById('playgroundStatus').textContent.startsWith('Finished'));assert.equal(calls,2);assert.equal(session.requests,2);
  await page.fill('#playgroundText','Third synthetic test exceeds cap.');await page.click('#classifyPost');await page.waitForFunction(()=>document.getElementById('playgroundStatus').textContent.includes('Session request limit'));assert.equal(calls,2);assert.equal(await page.locator('#playgroundResult').isVisible(),false);
  await popup.reload();await popup.waitForFunction(()=>document.getElementById('usageNote').textContent.includes('Session limit reached'));assert.equal(await popup.locator('#requests').innerText(),'2');assert.equal(await popup.locator('#serviceIssue').isVisible(),true);
  assert.equal((await popup.locator('body').innerText()).includes('SYNTHETIC-TEST-KEY'),false);assert.deepEqual(errors,[]);assert.equal(opened,0);
  console.log('PASS: actual UI-to-worker appearance, tab recovery, paused manual scoring, shared cache/cap, explicit correction privacy/removal and popup error summary');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
