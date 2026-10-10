const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.route('https://www.linkedin.com/feed/',r=>r.fulfill({contentType:'text/html',body:'<html><body><main id="feed"></main></body></html>'}));
 await page.goto('https://www.linkedin.com/feed/');
 await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'../content.css'),'utf8')});
 await page.evaluate(()=>{
  window.calls=[];window.mockEnabled=true;window.mockConfig='c1';window.releaseSlow=null;
  const interval=window.setInterval.bind(window);window.setInterval=(fn,ms)=>interval(fn,ms===5000?100:ms);
  window.mockCats=[{id:'slop',name:'Slop',action:'hide',threshold:.8},{id:'advert',name:'Advert',action:'label',threshold:.8},{id:'nourishment',name:'Nourishment',action:'highlight',threshold:.8}];
  const slop=t=>t.includes('SLOP')?.95:t.includes('HIGH')?.7:t.includes('MID')?.5:t.includes('SLOW')?.2:t.includes('LOW')?.1:.8;
  const view=()=>({enabled:window.mockEnabled,provider:'jev',configuration:window.mockConfig,categories:window.mockCats});
  window.chrome={runtime:{sendMessage:async m=>{
   if(m.type==='settings')return view();
   window.calls.push(m.text);
   if(m.text.includes('FAIL'))return {error:'API unavailable',short:'API error 500'};
   if(m.text.includes('NOKEY'))return {error:'Add your provider API key in extension settings.',short:'no API key'};
   if(m.text.includes('SLOW'))await new Promise(r=>{window.releaseSlow=r;});
   const advert=m.text.includes('ADVERT')?.9:m.text.includes('MAYBE')?.6:.1;
   return {...view(),scores:{slop:m.text.includes('MULTI')?.1:slop(m.text),advert,nourishment:m.text.includes('NOURISH')?.97:.2}};
  }}};
 });
 await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../content.js'),'utf8')});
 async function card(id,text){await page.evaluate(({id,text})=>{const p=document.createElement('article');p.id=id;p.className='feed-shared-update-v2';const t=document.createElement('div');t.className='update-components-text';t.textContent=text;p.append(t);document.getElementById('feed').append(p);},{id,text});}
 const badge=id=>page.locator('#'+id+' .lsf-badge');
 const badgeText=async id=>(await badge(id).innerText()).trim();
 const waitBadge=(id,re)=>page.waitForFunction(({id,src})=>new RegExp(src).test(document.querySelector('#'+id+' .lsf-badge')?.textContent||''),{id,src:re.source});

 // Folded above the threshold: the bar names the category and score, and no badge is added on top of it.
 await card('slop','SLOP generic wisdom');
 await page.waitForSelector('#slop.lsf-folded');
 assert.equal(await page.locator('#slop .update-components-text').isVisible(),false);
 assert.equal(await badge('slop').count(),0);
 assert.equal(await page.locator('#slop .lsf-bar span').innerText(),'Hidden as Slop · 95% model estimate');
 // After "Show anyway" the revealed post shows what applies.
 await page.locator('#slop button').click();
 assert.equal(await page.locator('#slop .update-components-text').isVisible(),true);
 assert.equal(await page.locator('#slop .lsf-bar').count(),0);
 assert.equal(await badgeText('slop'),'Slop 95%');
 assert.match(await badge('slop').getAttribute('class'),/lsf-c-hide/);
 assert.match(await badge('slop').getAttribute('title'),/not proof of AI authorship/);
 assert.match(await badge('slop').getAttribute('title'),/All scores: Slop 95%, Advert 10%, Nourishment 20%\./);

 // Exactly at the threshold stays visible, and nothing applies.
 await card('edge','Useful real story at exact threshold');
 await page.waitForFunction(()=>window.calls.length>=2);
 assert.equal(await page.locator('#edge').evaluate(e=>e.classList.contains('lsf-folded')),false);
 await waitBadge('edge',/^No category$/);
 assert.match(await badge('edge').getAttribute('class'),/lsf-c-none/);

 // API failure leaves the post visible and says why it was not scored.
 await card('error','FAIL service error');
 await page.waitForFunction(()=>window.calls.length>=3);
 assert.equal(await page.locator('#error .update-components-text').isVisible(),true);
 await waitBadge('error',/Not scored: API error 500/);
 assert.match(await badge('error').getAttribute('title'),/API unavailable/);
 assert.match(await badge('error').getAttribute('class'),/lsf-muted/);
 await card('nokey','NOKEY missing key');
 await waitBadge('nokey',/Not scored: no API key/);

 // Scores below every threshold stay visible with a neutral chip.
 await card('low','LOW useful technical post');await card('mid','MID some filler');await card('high','HIGH nearly slop');
 for(const id of ['low','mid','high']){await waitBadge(id,/^No category$/);assert.equal(await page.locator('#'+id).evaluate(e=>e.classList.contains('lsf-folded')),false);}
 assert.match(await badge('high').getAttribute('title'),/Slop 70%/);

 // A post being scored says so, then shows its result.
 await card('slow','SLOW still thinking');
 await waitBadge('slow',/Scoring…/);
 await page.waitForFunction(()=>typeof window.releaseSlow==='function');
 await page.evaluate(()=>window.releaseSlow());
 await waitBadge('slow',/^No category$/);
 await page.evaluate(()=>window.releaseSlow=null);

 // Recycled cards: a folded post whose text changes loses its fold and gets the new post's result, once.
 await card('dynamic','SLOP another dynamically loaded post');
 await page.waitForSelector('#dynamic.lsf-folded');
 await page.evaluate(()=>document.querySelector('#dynamic .update-components-text').textContent='Recycled card with useful text');
 await page.waitForFunction(()=>!document.querySelector('#dynamic').classList.contains('lsf-folded'));
 await waitBadge('dynamic',/^No category$/);
 assert.equal(await badge('dynamic').count(),1);
 assert.equal(await page.locator('#dynamic .lsf-bar').count(),0);

 // A connected recycled card with no body drops every trace of its preceding result.
 await card('gone','SLOP body that will disappear');
 await page.waitForSelector('#gone.lsf-folded');
 await page.evaluate(()=>document.querySelector('#gone .update-components-text').remove());
 await page.waitForFunction(()=>!document.querySelector('#gone').classList.contains('lsf-folded')&&!document.querySelector('#gone .lsf-bar, #gone .lsf-badge'));
 assert.equal(await page.locator('#gone').evaluate(e=>e.classList.contains('lsf-highlight')),false);

 // A pending answer cannot restore old scores after the textless card has been forgotten.
 await card('pendinggone','SLOW SLOP obsolete pending body');
 await waitBadge('pendinggone',/Scoring…/);
 await page.waitForFunction(()=>typeof window.releaseSlow==='function');
 const earlyOldFold=await page.evaluate(async()=>{
  const post=document.getElementById('pendinggone');
  post.querySelector('.update-components-text').remove();
  window.releaseSlow();
  // Resolve the response before the scan's 250ms debounce. It must not briefly hide the replacement.
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return post.classList.contains('lsf-folded') || !!post.querySelector('.lsf-bar');
 });
 assert.equal(earlyOldFold,false,'a response racing the scan cannot briefly fold a textless replacement');
 await page.waitForFunction(()=>!document.querySelector('#pendinggone .lsf-bar, #pendinggone .lsf-badge'));
 assert.equal(await page.locator('#pendinggone.lsf-folded, #pendinggone .lsf-bar, #pendinggone .lsf-badge').count(),0,'obsolete pending response cannot hide a textless replacement');

 // Adding a new body later starts a fresh classification exactly once.
 const beforeRefill=await page.evaluate(()=>window.calls.length);
 await page.evaluate(()=>{const t=document.createElement('div');t.className='update-components-text';t.textContent='LOW replacement after the body vanished';document.getElementById('pendinggone').append(t);});
 await waitBadge('pendinggone',/^No category$/);
 assert.equal(await page.evaluate(()=>window.calls.length),beforeRefill+1);
 assert.equal(await page.locator('#pendinggone .lsf-bar').count(),0);

 // The badge must not retrigger the page-wide observer: nothing changes while idle, and it is never duplicated.
 const stable=await page.evaluate(async()=>{
  const first=document.querySelector('#edge .lsf-badge');let mutations=0;
  const mo=new MutationObserver(list=>{mutations+=list.length;});mo.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true});
  await new Promise(r=>setTimeout(r,1500));mo.disconnect();
  return {mutations,same:document.querySelector('#edge .lsf-badge')===first,maxPerPost:Math.max(...[...document.querySelectorAll('article')].map(a=>a.querySelectorAll('.lsf-badge').length))};
 });
 assert.equal(stable.mutations,0,'idle feed must not mutate');assert.equal(stable.same,true);assert.equal(stable.maxPerPost,1);

 // Posts far below the viewport are not scored yet and say so, then are scored when scrolled to.
 await page.evaluate(()=>{const s=document.createElement('div');s.id='spacer';s.style.height='6000px';document.getElementById('feed').append(s);});
 const before=await page.evaluate(()=>window.calls.length);
 await card('far','LOW far down the feed');
 await waitBadge('far',/Waiting to score/);
 assert.equal(await page.evaluate(()=>window.calls.length),before);
 await page.locator('#far').scrollIntoViewIfNeeded();
 await waitBadge('far',/^No category$/);

 // Current LinkedIn markup: hashed classes, role=listitem cards with componentkey update-card*, body in data-testid=expandable-text-box.
 await page.evaluate(()=>{
  const feed=document.getElementById('feed');
  const make=(id,key,text)=>{const li=document.createElement('div');li.id=id;li.setAttribute('role','listitem');if(key)li.setAttribute('componentkey',key);li.className='fmb1a2b3c';
   const box=document.createElement('div');box.setAttribute('data-testid','expandable-text-box');box.textContent=text;li.append(box);feed.append(li);};
  make('newlow','update-card-focus-1','LOW new markup useful post');
  make('newslop','update-card-focus-2','SLOP new markup generic wisdom');
  make('notcard','something-else','SLOP this listitem is not a post');
 });
 await waitBadge('newlow',/^No category$/);
 await page.waitForSelector('#newslop.lsf-folded');
 assert.match(await page.locator('#newslop .lsf-bar span').innerText(),/Slop · 95%/);
 assert.equal(await page.locator('#newslop [data-testid=expandable-text-box]').isVisible(),false);
 await page.locator('#newslop button').click();
 await waitBadge('newslop',/^Slop 95%$/);
 assert.equal(await page.locator('#newlow .lsf-badge').count(),1);
 assert.equal(await page.locator('#notcard .lsf-badge, #notcard .lsf-bar').count(),0,'list items that are not update cards are ignored');
 assert.equal(await page.locator('#notcard').evaluate(e=>e.classList.contains('lsf-folded')),false);

 // A folded post must stay folded: its text reads the same whether or not it is rendered (no flicker, no repeat requests).
 await page.evaluate(()=>{
  const li=document.createElement('div');li.id='flick';li.setAttribute('role','listitem');li.setAttribute('componentkey','update-card-focus-9');
  const box=document.createElement('div');box.setAttribute('data-testid','expandable-text-box');
  box.innerHTML='SLOP first line<br><br>second   line<p>third paragraph</p>';li.append(box);document.getElementById('feed').append(li);
 });
 await page.waitForSelector('#flick.lsf-folded');
 const flick=await page.evaluate(async()=>{
  const el=document.getElementById('flick');const calls=window.calls.length;let flips=0,last=el.classList.contains('lsf-folded');
  const mo=new MutationObserver(()=>{const now=el.classList.contains('lsf-folded');if(now!==last){flips++;last=now;}});
  mo.observe(el,{attributes:true,attributeFilter:['class']});
  await new Promise(r=>setTimeout(r,2000));mo.disconnect();
  return {flips,newCalls:window.calls.length-calls,folded:el.classList.contains('lsf-folded')};
 });
 assert.deepEqual(flick,{flips:0,newCalls:0,folded:true},'folded post must not flicker or be re-scored');

 // Categories: one shown on the chip only names itself there; one set to highlight also marks the post.
 await card('advert','MULTI ADVERT buy my course now');
 await waitBadge('advert',/^Advert 90%$/);
 assert.match(await badge('advert').getAttribute('class'),/lsf-c-label/);
 assert.equal(await page.locator('#advert').evaluate(e=>e.classList.contains('lsf-folded')||e.classList.contains('lsf-highlight')),false);
 await card('maybe','MULTI MAYBE borderline');
 await waitBadge('maybe',/^No category$/);
 await card('nourish','MULTI NOURISH solid analysis');
 await waitBadge('nourish',/^Nourishment 97%$/);
 assert.match(await badge('nourish').getAttribute('class'),/lsf-c-highlight/);
 assert.equal(await page.locator('#nourish').evaluate(e=>e.classList.contains('lsf-highlight')),true);
 await card('both','MULTI ADVERT NOURISH sponsored but useful');
 await waitBadge('both',/^Nourishment 97% · Advert 90%$/,'strongest first');

 // Changing an action or threshold applies to posts already scored, with no new request and no reset.
 const callsBefore=await page.evaluate(()=>window.calls.length);
 await page.evaluate(()=>{window.mockCats=window.mockCats.map(c=>c.id==='advert'?{...c,action:'hide',threshold:.85}:c);});
 await page.waitForSelector('#advert.lsf-folded');
 assert.equal(await page.locator('#advert .lsf-bar span').innerText(),'Hidden as Advert · 90% model estimate');
 await page.waitForSelector('#both.lsf-folded');
 assert.equal(await page.locator('#both').evaluate(e=>e.classList.contains('lsf-highlight')),false,'a hidden post is not also highlighted');
 assert.equal(await page.locator('#slop .lsf-bar').count(),0,'a post already revealed stays revealed');
 await page.evaluate(()=>{window.mockCats=window.mockCats.map(c=>c.id==='advert'?{...c,threshold:.95}:c);});
 await page.waitForFunction(()=>!document.querySelector('#advert').classList.contains('lsf-folded'));
 await waitBadge('advert',/^No category$/);
 assert.equal(await page.evaluate(()=>window.calls.length),callsBefore,'display changes need no new request');
 // A new scoring configuration starts over: posts are scored again.
 await page.evaluate(()=>{window.mockConfig='c2';});
 await page.waitForFunction(n=>window.calls.length>n,callsBefore);

 // Turning filtering off removes folds and every badge.
 await card('pause','SLOP pause me');await page.waitForSelector('#pause.lsf-folded');
 await page.evaluate(()=>window.mockEnabled=false);
 await page.waitForFunction(()=>!document.querySelector('#pause').classList.contains('lsf-folded')&&document.querySelectorAll('.lsf-badge').length===0&&document.querySelectorAll('.lsf-highlight').length===0,{},{timeout:8000});
 console.log('PASS: dynamic feed, hide/highlight/label by category, reveal, threshold, API failure, recycled card, display-only changes, rescoring, disable, chips (scored, scoring, waiting, not scored, revealed, stable, removed)');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
