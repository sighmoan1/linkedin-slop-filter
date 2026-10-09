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
  window.calls=[];window.mockEnabled=true;
  const score=t=>t.includes('SLOP')?.95:t.includes('HIGH')?.7:t.includes('MID')?.5:t.includes('SLOW')?.2:t.includes('LOW')?.1:.8;
  window.chrome={runtime:{sendMessage:async m=>{
   if(m.type==='settings')return {enabled:window.mockEnabled,threshold:.8};
   window.calls.push(m.text);
   if(m.text.includes('FAIL'))return {error:'API unavailable',short:'API error 500'};
   if(m.text.includes('NOKEY'))return {error:'Add your provider API key in extension settings.',short:'no API key'};
   if(m.text.includes('SLOW'))await new Promise(r=>{window.releaseSlow=r;});
   if(m.text.includes('MULTI')){
    const cats=[{id:'slop',name:'Slop',fold:true},{id:'advert',name:'Advert',fold:!m.text.includes('NOFOLD')},{id:'nourishment',name:'Nourishment',fold:false}];
    const advert=m.text.includes('ADVERT')?.9:m.text.includes('MAYBE')?.6:.1;
    return {probability:.1,scores:{slop:.1,advert,nourishment:m.text.includes('NOURISH')?.97:.2},categories:cats};
   }
   return {probability:score(m.text)};
  }}};
 });
 await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../content.js'),'utf8')});
 async function card(id,text){await page.evaluate(({id,text})=>{const p=document.createElement('article');p.id=id;p.className='feed-shared-update-v2';const t=document.createElement('div');t.className='update-components-text';t.textContent=text;p.append(t);document.getElementById('feed').append(p);},{id,text});}
 const badge=id=>page.locator('#'+id+' .lsf-badge');
 const badgeText=async id=>(await badge(id).innerText()).trim();
 const waitBadge=(id,re)=>page.waitForFunction(({id,src})=>new RegExp(src).test(document.querySelector('#'+id+' .lsf-badge')?.textContent||''),{id,src:re.source});

 // Folded above the threshold: the existing bar shows the score, and no badge is added on top of it.
 await card('slop','SLOP generic wisdom');
 await page.waitForSelector('#slop.lsf-folded');
 assert.equal(await page.locator('#slop .update-components-text').isVisible(),false);
 assert.equal(await badge('slop').count(),0);
 assert.match(await page.locator('#slop .lsf-bar span').innerText(),/95%/);
 // After "Show anyway" the revealed post shows its score.
 await page.locator('#slop button').click();
 assert.equal(await page.locator('#slop .update-components-text').isVisible(),true);
 assert.equal(await page.locator('#slop .lsf-bar').count(),0);
 assert.equal(await badgeText('slop'),'Slop likelihood: 95%');
 assert.match(await badge('slop').getAttribute('class'),/lsf-high/);
 assert.match(await badge('slop').getAttribute('title'),/not proof of AI authorship/);

 // Exactly at the threshold stays visible, with its score shown.
 await card('edge','Useful real story at exact threshold');
 await page.waitForFunction(()=>window.calls.length>=2);
 assert.equal(await page.locator('#edge').evaluate(e=>e.classList.contains('lsf-folded')),false);
 await waitBadge('edge',/Slop likelihood: 80%/);

 // API failure leaves the post visible and says why it was not scored.
 await card('error','FAIL service error');
 await page.waitForFunction(()=>window.calls.length>=3);
 assert.equal(await page.locator('#error .update-components-text').isVisible(),true);
 await waitBadge('error',/Not scored: API error 500/);
 assert.match(await badge('error').getAttribute('title'),/API unavailable/);
 assert.match(await badge('error').getAttribute('class'),/lsf-muted/);
 await card('nokey','NOKEY missing key');
 await waitBadge('nokey',/Not scored: no API key/);

 // Low, middle and high scores that stay visible.
 await card('low','LOW useful technical post');await card('mid','MID some filler');await card('high','HIGH nearly slop');
 await waitBadge('low',/Slop likelihood: 10%/);await waitBadge('mid',/Slop likelihood: 50%/);await waitBadge('high',/Slop likelihood: 70%/);
 assert.match(await badge('low').getAttribute('class'),/lsf-low/);
 assert.match(await badge('mid').getAttribute('class'),/lsf-mid/);
 assert.match(await badge('high').getAttribute('class'),/lsf-high/);
 for(const id of ['low','mid','high'])assert.equal(await page.locator('#'+id).evaluate(e=>e.classList.contains('lsf-folded')),false);

 // A post being scored says so, then shows its score.
 await card('slow','SLOW still thinking');
 await waitBadge('slow',/Scoring…/);
 await page.waitForFunction(()=>typeof window.releaseSlow==='function');
 await page.evaluate(()=>window.releaseSlow());
 await waitBadge('slow',/Slop likelihood: 20%/);

 // Recycled cards: a folded post whose text changes loses its fold and gets the new post's score, once.
 await card('dynamic','SLOP another dynamically loaded post');
 await page.waitForSelector('#dynamic.lsf-folded');
 await page.evaluate(()=>document.querySelector('#dynamic .update-components-text').textContent='Recycled card with useful text');
 await page.waitForFunction(()=>!document.querySelector('#dynamic').classList.contains('lsf-folded'));
 await waitBadge('dynamic',/Slop likelihood: 80%/);
 assert.equal(await badge('dynamic').count(),1);
 assert.equal(await page.locator('#dynamic .lsf-bar').count(),0);

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
 await waitBadge('far',/Slop score: waiting/);
 assert.equal(await page.evaluate(()=>window.calls.length),before);
 await page.locator('#far').scrollIntoViewIfNeeded();
 await waitBadge('far',/Slop likelihood: 10%/);

 // Current LinkedIn markup: hashed classes, role=listitem cards with componentkey update-card*, body in data-testid=expandable-text-box.
 await page.evaluate(()=>{
  const feed=document.getElementById('feed');
  const make=(id,key,text)=>{const li=document.createElement('div');li.id=id;li.setAttribute('role','listitem');if(key)li.setAttribute('componentkey',key);li.className='fmb1a2b3c';
   const box=document.createElement('div');box.setAttribute('data-testid','expandable-text-box');box.textContent=text;li.append(box);feed.append(li);};
  make('newlow','update-card-focus-1','LOW new markup useful post');
  make('newslop','update-card-focus-2','SLOP new markup generic wisdom');
  make('notcard','something-else','SLOP this listitem is not a post');
 });
 await waitBadge('newlow',/Slop likelihood: 10%/);
 await page.waitForSelector('#newslop.lsf-folded');
 assert.match(await page.locator('#newslop .lsf-bar span').innerText(),/95%/);
 assert.equal(await page.locator('#newslop [data-testid=expandable-text-box]').isVisible(),false);
 await page.locator('#newslop button').click();
 await waitBadge('newslop',/Slop likelihood: 95%/);
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

 // Categories: a folding category above the threshold folds the post and names itself on the bar.
 await card('advert','MULTI ADVERT buy my course now');
 await page.waitForSelector('#advert.lsf-folded');
 assert.match(await page.locator('#advert .lsf-bar span').innerText(),/^Possible Advert · 90% model estimate$/);
 assert.equal(await page.locator('#advert .lsf-badge').count(),0);
 await page.locator('#advert button').click();
 await waitBadge('advert',/^Slop likelihood: 10% · Advert 90%$/);
 assert.match(await badge('advert').getAttribute('title'),/All scores: Slop 10%, Advert 90%, Nourishment 20%\./);
 // A category that is not set to fold only marks the chip, and only when the model thinks it applies.
 await card('nofold','MULTI ADVERT NOFOLD still visible');
 await waitBadge('nofold',/^Slop likelihood: 10% · Advert 90%$/);
 assert.equal(await page.locator('#nofold').evaluate(e=>e.classList.contains('lsf-folded')),false);
 await card('maybe','MULTI MAYBE borderline NOFOLD');
 await waitBadge('maybe',/^Slop likelihood: 10% · Advert 60%$/);
 await card('nourish','MULTI NOURISH solid analysis');
 await waitBadge('nourish',/^Slop likelihood: 10% · Nourishment 97%$/);
 assert.equal(await page.locator('#nourish').evaluate(e=>e.classList.contains('lsf-folded')),false,'nourishment does not fold');
 await card('plain','MULTI nothing notable');
 await waitBadge('plain',/^Slop likelihood: 10%$/);

 // Turning filtering off removes folds and every badge.
 await card('pause','SLOP pause me');await page.waitForSelector('#pause.lsf-folded');
 await page.evaluate(()=>window.mockEnabled=false);
 await page.waitForFunction(()=>!document.querySelector('#pause').classList.contains('lsf-folded')&&document.querySelectorAll('.lsf-badge').length===0,{},{timeout:8000});
 console.log('PASS: dynamic feed, collapse, reveal, threshold, API failure, recycled card, disable, score badges (scored, scoring, waiting, not scored, revealed, stable, removed)');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
