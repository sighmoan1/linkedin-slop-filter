// Explicit release QA: real unpacked extension APIs, synthetic feed and seeded scores.
// No provider requests, LinkedIn login or user profile. Optional screenshots stay local.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const cases=[
 {id:'brainrot',name:'Alex Example',text:'Rank everyone at work as alpha or NPC. Comment your ranking and tag five colleagues.',yes:['brainrot']},
 {id:'slop-one',name:'Morgan Example',text:'Success is a mindset. Keep showing up. The journey is the destination. Believe, achieve, repeat.',yes:['slop']},
 {id:'slop-two',name:'Sam Example',text:'Today my coffee taught me leadership. Every cup is a lesson. Every lesson is growth. Lead with purpose.',yes:['slop']},
 {id:'advert',name:'Taylor Example',text:'My new course is open. Use OFFER20 to save 20 percent and book a sales call for the premium package.',yes:['advert']},
 {id:'useful',name:'Riley Example',text:'A retry can execute after the first response is lost. Give each request an idempotency key and store it with the result.\n\nOn duplicate requests, return the stored result instead of charging twice. Write the key and the business change in the same transaction so a crash cannot leave only one of them committed.',yes:['nourishment']},
 {id:'slop-three',name:'Jordan Example',text:'The future belongs to those who embrace the future. Unlock your potential and take your journey to the next level.',yes:['slop']},
 {id:'opportunity',name:'Casey Example',text:'We have an open paid accessibility audit contract for November. Apply by 28 October through the application link with a sample audit and your availability.',yes:['opportunity']}
];
const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#f3f2ef;color:#22303d;font:15px/1.55 system-ui,sans-serif}nav{height:56px;background:#fff;border-bottom:1px solid #ddd;display:flex;align-items:center;padding:0 24px;gap:12px}nav strong{color:#0a66c2}main{max-width:620px;margin:20px auto;padding:0 12px}.preview-note{font-size:12px;color:#65737b;margin:0 0 16px}.feed-shared-update-v2{background:#fff;border:1px solid #dbe2e7;border-radius:10px;margin-bottom:12px;min-height:270px;overflow:hidden}header{display:flex;gap:10px;padding:18px 20px 4px}.avatar{border-radius:50%;background:#dce9f5;width:38px;height:38px;display:grid;place-items:center;font-weight:650}.author{font-size:14px;line-height:1.5}.author small{display:block;color:#65737b}.update-components-text{padding:12px 20px 20px;white-space:pre-line}footer{border-top:1px solid #e5e8eb;padding:10px 20px;display:flex;flex-wrap:wrap;gap:12px 24px;color:#65737b;font-size:13px}footer button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.comments{font:12px/1.5 system-ui,sans-serif;padding:8px 20px;color:#65737b}a{color:#0a66c2}@media(prefers-color-scheme:dark){body{background:#182027;color:#e8edf0}nav,.feed-shared-update-v2{background:#22282d;border-color:#46535e}.avatar{background:#344453}.author small,footer,.comments{color:#bbc6ce}}
</style></head><body><nav><strong>in</strong><span id="outside-feed">Synthetic LinkedIn feed preview</span></nav><main><p class="preview-note">Release QA · authored examples and seeded model scores · no live account or provider calls</p><section id="feed">${cases.map(p=>`<article id="${p.id}" class="feed-shared-update-v2"><header><span class="avatar">${p.name[0]}</span><div class="author"><strong>${p.name}</strong><small>Synthetic example · 1h</small></div></header><div class="update-components-text">${escape(p.text)}</div>${p.id==='useful'?'<div class="comments">Synthetic comment: keep original controls and text untouched.</div>':''}<footer><button>Like</button><button>Comment</button><button>Share</button><a href="https://example.com/original">Original link</a></footer></article>`).join('')}</section></main></body></html>`;

(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'slop-release-'));
 const screenshots=process.env.QA_OUTPUT_DIR;
 let context;
 try{
  if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1280,height:900},args:['--disable-extensions-except='+root,'--load-extension='+root]});
  const errors=[],consoleErrors=[],failedResources=[];
  context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});});
  context.on('requestfailed',r=>{if(r.url().startsWith('chrome-extension://'))failedResources.push({url:r.url(),error:r.failure()?.errorText});});
  const providerRequests=[];
  context.on('request',request=>{if(/^https:\/\/(?:openrouter\.ai|api\.openai\.com)\//.test(request.url()))providerRequests.push(request.url());});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const origin=worker.url().replace(/background\.js$/,'');
  // Core imports run in Node; Chrome forbids dynamic import() in service workers.
  const core=await import('../core.mjs');
  const s={...core.DEFAULTS,schema:2,enabled:true,provider:'jev',categories:core.DEFAULT_CATEGORIES.map(c=>({...c,action:['slop','brainrot','advert'].includes(c.id)?'hide':c.action}))};
  const hash=text=>createHash('sha256').update(text).digest('hex');
  const key=core.scoringKey(s),entries={};
  for(const p of cases){entries[core.CACHE_PREFIX+hash(JSON.stringify([key,p.text]))]={t:Date.now(),s:Object.fromEntries(s.categories.map(c=>[c.id,p.yes.includes(c.id)?.96:.05]))};}
  await worker.evaluate(storage=>chrome.storage.local.set(storage),{...s,...entries,appearance:{theme:'native',groupHidden:false,labels:'matches'}});
  const feed=await context.newPage();
  await feed.route('https://www.linkedin.com/**',r=>r.fulfill({contentType:'text/html',body:fixture}));
  await feed.goto('https://www.linkedin.com/feed/foryou/');
  const activeFeedTab=(await worker.evaluate(()=>chrome.tabs.query({active:true,currentWindow:true})))[0];
  assert.equal(Number.isInteger(activeFeedTab.id),true);
  assert.equal(typeof activeFeedTab.url,'undefined','existing permissions expose the tab id, not its URL');
  await feed.waitForSelector('#brainrot.lsf-folded');
  assert.match(await feed.locator('[data-lsf-ui]').first().evaluate(e=>getComputedStyle(e).fontFamily),/Segoe UI/,'feed controls use system typography');
  assert.equal(await feed.locator('#brainrot.lsf-folded').count(),1,'a visible newly scored card folds immediately');
  for(const id of ['brainrot','slop-one','slop-two','advert','slop-three']){
   await feed.locator('#'+id).scrollIntoViewIfNeeded();
   await feed.waitForSelector('#'+id+'.lsf-folded');
  }
  await feed.locator('#useful').scrollIntoViewIfNeeded();
  await feed.waitForFunction(()=>document.getElementById('useful').classList.contains('lsf-highlight'));
  assert.equal(await feed.locator('#useful .update-components-text').textContent(),cases.find(c=>c.id==='useful').text);
  assert.equal(await feed.locator('#useful footer button').count(),3);
  const untouched=await feed.locator('#outside-feed').evaluate(e=>({font:getComputedStyle(e).font,color:getComputedStyle(e).color}));
  const commentFont=await feed.locator('.comments').evaluate(e=>getComputedStyle(e).font);
  await feed.evaluate(()=>window.scrollTo(0,0));
  assert.equal(await feed.locator('.lsf-theme-label select').count(),0);
  assert.equal(await feed.locator('#useful').getAttribute('data-lsf-theme'),'native');
  assert.deepEqual(await feed.locator('#outside-feed').evaluate(e=>({font:getComputedStyle(e).font,color:getComputedStyle(e).color})),untouched);
  assert.equal(await feed.locator('.comments').evaluate(e=>getComputedStyle(e).font),commentFont);
  if(screenshots)await feed.screenshot({path:path.join(screenshots,'feed-native.png'),fullPage:true});
  // Grouping changes the omissions, not DOM order or the original useful post.
  const order=await feed.locator('#feed > article').evaluateAll(posts=>posts.map(p=>p.id));
  await feed.locator('.lsf-toolbar-main button').first().focus();
  await worker.evaluate(()=>chrome.storage.local.set({appearance:{theme:'punchy',groupHidden:true,labels:'matches'}}));
  await feed.waitForSelector('.lsf-group-bar:not([hidden])');
  assert.equal(await feed.locator('.lsf-group-name').first().textContent(),'4 hidden posts · Brainrot ×1, Slop ×2, Advert ×1');
  if(screenshots)await feed.screenshot({path:path.join(screenshots,'feed-grouped.png'),fullPage:true});
  await feed.getByRole('button',{name:'Show list',exact:true}).first().click();
  assert.equal(await feed.locator('.lsf-group-suppressed').count(),0);
  await feed.locator('#slop-one .lsf-bar button').filter({hasText:/^Show post$/}).click();
  assert.equal(await feed.locator('#slop-one .update-components-text').isVisible(),true,'group members reveal the original post');
  await feed.locator('#slop-one .lsf-bar button').filter({hasText:'Hide post again'}).click();
  assert.deepEqual(await feed.locator('#feed > article').evaluateAll(posts=>posts.map(p=>p.id)),order);
  await worker.evaluate(()=>chrome.storage.local.set({appearance:{theme:'reader',groupHidden:false,labels:'matches'}}));
  await feed.waitForFunction(()=>document.querySelectorAll('.lsf-group-suppressed').length===0&&document.getElementById('useful').dataset.lsfTheme==='native');
  // Show everything changes only temporary recovery, not the category actions.
  const before=await worker.evaluate(()=>chrome.storage.local.get('categories'));
  await feed.locator('.lsf-toolbar-main button').filter({hasText:'Show everything'}).click();
  await feed.waitForFunction(()=>document.querySelectorAll('.lsf-folded').length===0);
  assert.deepEqual(await worker.evaluate(()=>chrome.storage.local.get('categories')),before);
  await feed.locator('.lsf-toolbar-main button').filter({hasText:'Restore filtering'}).click();
  await feed.waitForSelector('#brainrot.lsf-folded');
  assert.equal(await feed.locator('#brainrot .lsf-bar button').count(),1,'hidden row only offers reveal');
  await feed.locator('#brainrot .lsf-bar button').filter({hasText:/^Show post$/}).click();
  await feed.locator('#brainrot .lsf-tools button').filter({hasText:/^Review scores$/}).click();
  assert.equal(await feed.locator('#brainrot .lsf-panel').count(),1,'scores and corrections share one panel');
  const correction=feed.locator('#brainrot .lsf-correction');
  for(const c of before.categories)await correction.locator('input[value="'+c.id+'"]').uncheck();
  await correction.locator('input[value="nourishment"]').check();
  await correction.locator('input[value="advert"]').check();
  await correction.getByRole('button',{name:'Save correction'}).click();
  await feed.waitForFunction(()=>!document.getElementById('brainrot').classList.contains('lsf-folded'));
  const records=await worker.evaluate(()=>chrome.storage.local.get('corrections'));
  assert.equal(records.corrections.length,1);assert.deepEqual(records.corrections[0].categoryIds,['advert','nourishment']);
  assert.equal(records.corrections[0].text,cases[0].text);
  const stored=await worker.evaluate(()=>chrome.storage.local.get(null));
  assert.equal(JSON.stringify(stored).includes(cases.find(c=>c.id==='useful').text),false,'ordinary classification never retains body text');
  const options=await context.newPage();await options.goto(origin+'options.html#corrections');
  await options.waitForSelector('#panel-corrections:not([hidden])');
  await options.waitForFunction(()=>document.getElementById('correctionCount').textContent.includes('1 saved'));
  assert.match(await options.locator('#feedbackCoverage').innerText(),/1 post included/,'actual worker corrections match the saved scoring configuration');
  assert.equal(await options.locator('.feedback-row[data-category="brainrot"] td').first().innerText(),'1');
  if(screenshots)await options.screenshot({path:path.join(screenshots,'settings-corrections.png'),fullPage:true});
  await options.locator('[data-panel="playground"]').click();
  await options.locator('#playgroundText').fill('An uncached synthetic example without provider credentials.');
  await options.locator('#classifyPost').click();
  await options.waitForFunction(()=>document.getElementById('playgroundStatus').textContent.includes('API key'));
  assert.equal(await options.locator('#playgroundResult').isVisible(),false,'an API failure is not a negative classification');
  await options.locator('[data-panel="feed"]').click();
  if(screenshots)await options.screenshot({path:path.join(screenshots,'settings-feed.png'),fullPage:true});
  await options.locator('[data-panel="categories"]').click();
  if(screenshots)await options.screenshot({path:path.join(screenshots,'settings-categories.png'),fullPage:true});
  // Open an inactive popup page while the feed remains the actual active tab.
  // This verifies the content probe used when Chrome omits the URL under our permissions.
  await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),activeFeedTab.id);
  const popupReady=context.waitForEvent('page');
  await worker.evaluate(url=>chrome.tabs.create({url,active:false}),origin+'popup.html');
  const popup=await popupReady;await popup.setViewportSize({width:360,height:760});
  await popup.waitForSelector('#requests');
  await popup.waitForFunction(()=>document.getElementById('showEverything').disabled===false);
  assert.match(await popup.locator('#feedConnection').innerText(),/7 posts found/);
  assert.match(await options.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/Segoe UI/,'settings use system typography');
  await popup.locator('#showEverything').click();
  await feed.waitForFunction(()=>document.querySelectorAll('.lsf-folded').length===0);
  await popup.locator('#showEverything').click();
  await feed.waitForSelector('#slop-one.lsf-folded');
  if(screenshots)await popup.screenshot({path:path.join(screenshots,'popup.png'),fullPage:true});
  await feed.setViewportSize({width:320,height:720});await feed.evaluate(()=>scrollTo(0,0));
  assert.equal(await feed.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'feed fits 320px');
  if(screenshots)await feed.screenshot({path:path.join(screenshots,'feed-mobile.png'),fullPage:true});
  await options.setViewportSize({width:320,height:720});await options.locator('[data-panel="feed"]').click();
  assert.equal(await options.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'settings fit 320px');
  if(screenshots)await options.screenshot({path:path.join(screenshots,'settings-mobile.png'),fullPage:true});
  await options.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  if(screenshots)await options.screenshot({path:path.join(screenshots,'settings-dark.png'),fullPage:true});
  await feed.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  assert.equal(await feed.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'dark feed fits 320px');
  if(screenshots)await feed.screenshot({path:path.join(screenshots,'feed-dark-mobile.png'),fullPage:true});
  const state=await worker.evaluate(()=>chrome.storage.session.get({requests:0,usage:{}}));
  assert.equal(state.requests,0,'seeded scores and missing credentials make no provider request');
  assert.deepEqual(providerRequests,[],'release QA makes no cloud request');
  assert.equal(state.usage.folded,5,'first folds count once, reveals/recovery do not add events');
  // A real extension reload must retire the old isolated context without leaving hidden cards.
  // Command-line loading permits the first launch even with Developer mode off;
  // subsequent unpacked reloads require it, just like the documented installation.
  const extensions=await context.newPage();await extensions.goto('chrome://extensions/');
  const developerMode=extensions.getByRole('switch',{name:'Developer mode'});
  if(await developerMode.getAttribute('aria-checked')!=='true')await developerMode.click();
  await extensions.waitForFunction(e=>e.getAttribute('aria-checked')==='true',await developerMode.elementHandle());
  await extensions.close();
  const restarted=context.waitForEvent('serviceworker',{predicate:w=>w!==worker,timeout:15000});
  await worker.evaluate(()=>chrome.runtime.reload()).catch(e=>{if(!/closed|destroyed/i.test(e.message))throw e;});
  await feed.evaluate(()=>window.dispatchEvent(new Event('scroll')));
  await feed.waitForFunction(()=>document.querySelectorAll('[data-lsf-ui],.lsf-feed-card,.lsf-folded,.lsf-group-suppressed,.lsf-reader-body').length===0);
  assert.equal(await feed.locator('#slop-one .update-components-text').isVisible(),true,'reload restores original hidden bodies');
  await feed.evaluate(()=>{document.querySelector('#slop-one .update-components-text').append(document.createTextNode(' Synthetic post-reload change.'));window.dispatchEvent(new Event('resize'));});
  await feed.waitForTimeout(5500);
  assert.equal(await feed.locator('[data-lsf-ui]').count(),0,'old polling and events do not recreate stale controls');
  await feed.reload();await feed.waitForSelector('.lsf-feed-toolbar');
  const nextWorker=await restarted;
  assert.deepEqual(await nextWorker.evaluate(id=>chrome.tabs.sendMessage(id,{type:'feedStatus'}),activeFeedTab.id),{isFeed:true,posts:7},'a page reload reconnects the new content context');
  assert.match(await feed.locator('[data-lsf-ui]').first().evaluate(e=>getComputedStyle(e).fontFamily),/Segoe UI/,'system typography survives extension and page reload');
  await feed.evaluate(()=>history.pushState(null,'','/feed/network/'));
  assert.deepEqual(await nextWorker.evaluate(id=>chrome.tabs.sendMessage(id,{type:'feedStatus'}),activeFeedTab.id),{isFeed:true,posts:7},'the Network tab is a feed');
  await feed.evaluate(()=>history.pushState(null,'','/feed/update/synthetic/'));
  assert.deepEqual(await nextWorker.evaluate(id=>chrome.tabs.sendMessage(id,{type:'feedStatus'}),activeFeedTab.id),{isFeed:false},'a nested route is not the feed');
  await feed.waitForFunction(()=>document.querySelectorAll('.lsf-feed-card,.lsf-feed-toolbar').length===0);
  assert.deepEqual(errors,[]);
  assert.deepEqual(consoleErrors,[],'no console errors throughout the unpacked runtime and reload check');
  assert.deepEqual(failedResources,[],'no failed extension resources throughout the unpacked runtime and reload check');
  console.log('PASS: actual unpacked worker/feed/settings/popup; native appearance, immediate visible folding, reversible groups, temporary recovery, multi-label corrections, no text-bearing ordinary cache, missing-key fail-open, 320px and dark/reduced-motion layouts; real extension reload restores originals, stops stale controls and reconnects after page reload. Console errors: 0. Failed extension resources: 0. Provider calls: 0.');
 }finally{try{if(context)await context.close();}finally{fs.rmSync(profile,{recursive:true,force:true});}}
})().catch(error=>{console.error('Release QA failed: '+error.message);process.exitCode=1;});
