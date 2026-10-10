const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const cats=[
 {id:'slop',name:'Slop',action:'hide',threshold:.8},
 {id:'brainrot',name:'Brainrot',action:'label',threshold:.8},
 {id:'advert',name:'Advert',action:'label',threshold:.8},
 {id:'opportunity',name:'Opportunity',action:'highlight',threshold:.8},
 {id:'nourishment',name:'Nourishment',action:'highlight',threshold:.8},
 {id:'custom',name:'Custom',action:'label',threshold:.8}
];
const escape=t=>String(t).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const allScores=(extra={})=>Object.fromEntries(cats.map(c=>[c.id,extra[c.id]??.1]));
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const folded=(page,id)=>page.locator('#'+id).evaluate(e=>e.classList.contains('lsf-folded'));
const atTop=(page,id,top=60)=>page.locator('#'+id).evaluate((e,top)=>window.scrollTo({top:window.scrollY+e.getBoundingClientRect().top-top,behavior:'instant'}),top);
(async()=>{
 const browser=await chromium.launch({headless:true});
 const pages=[];
 async function fixture(posts,{top=0,theme='native',groupHidden=false,anchor=true,width=1000,clipCard=false,route='/feed/'}={}) {
  const page=await browser.newPage({viewport:{width,height:720}});pages.push(page);page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cards=posts.map(p=>`<article id="${p.id}" class="feed-shared-update-v2"><header class="native-header"><span class="avatar">A</span><div><strong>Avery Example</strong><div>Researcher · synthetic demonstration</div></div></header><div class="update-components-text"><p>[${p.id}] ${escape(p.text||'A useful original post with specific detail.')}</p>${p.long?'<p>'+escape('Here is the original paragraph the reader is following. '.repeat(typeof p.long==='number'?p.long:8))+'</p>':''}<p><a href="https://example.com/example">Original post link</a></p></div><div class="native-controls"><button>Like</button><button>Comment</button></div><section class="native-comments">COMMENT TEXT — excluded from classification</section></article>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${!anchor?'html{overflow-anchor:none}':''}body{margin:0;background:#f4f2ee;color:#263238;font:14px/1.55 system-ui,sans-serif}nav{height:52px;padding:12px 24px;background:white;border-bottom:1px solid #ddd;box-sizing:border-box}main{max-width:620px;margin:24px auto;padding:0 12px;padding-top:${top}px}.feed-shared-update-v2{${clipCard?'overflow:hidden;':''}margin-bottom:12px;border:1px solid #d9dee2;border-radius:9px;background:#fff}.native-header{display:flex;gap:10px;align-items:center;padding:16px}.native-header strong{display:block}.native-header div div{font-size:12px;color:#64727a}.avatar{display:grid;place-items:center;width:34px;height:34px;background:#e8edf1;border-radius:50%;color:#456}.update-components-text{padding:0 18px}.update-components-text p{margin:0 0 16px}.native-controls{display:flex;gap:12px;padding:10px 18px;border-top:1px solid #eee}.native-controls button{background:transparent;border:0;padding:4px;font:inherit;color:#64727a}.native-comments{padding:10px 18px;font:12px/1.5 system-ui;color:#64727a}#outside{padding:20px;font:14px system-ui}a{color:#0a66c2}</style></head><body><nav id="global-nav">LinkedIn · Home · My network · Messages</nav><main id="feed">${cards}<div style="height:2000px"></div></main><aside id="outside">Messages and profiles stay unchanged.</aside></body></html>`;
  await page.route('https://www.linkedin.com/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('https://www.linkedin.com'+route);
  await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'../content.css'),'utf8')});
  await page.evaluate(({posts,cats,theme,groupHidden})=>{
   window.calls=[];window.messages=[];window.corrections=[];window.releases={};window.inflight=0;window.maxInFlight=0;
   window.config='c1';window.enabled=true;window.categories=cats;window.experience={appearance:{theme,groupHidden,labels:'matches'},showEverything:false};window.plan=Object.fromEntries(posts.map(p=>[p.id,p]));
   const copy=v=>JSON.parse(JSON.stringify(v));
   const interval=window.setInterval.bind(window);window.setInterval=(fn,ms)=>interval(fn,ms===5000?80:ms);
   const view=()=>({enabled:window.enabled,provider:'ollama',configuration:window.config,categories:copy(window.categories.filter(c=>c.action!=='off'))});
   window.chrome={runtime:{id:'test-extension',onMessage:{addListener(fn){window.feedStatusListener=fn;}},sendMessage:async m=>{
    window.messages.push(copy(m));
    if(m.type==='settings')return view();
    if(m.type==='experience')return copy(window.experience);
    if(m.type==='appearance'){window.experience.appearance=copy(m.appearance);return copy(window.experience);}
    if(m.type==='showEverything'){window.experience.showEverything=m.value;return copy(window.experience);}
    if(m.type==='correction'){if(window.correctionError)return {error:'Not saved'};if(window.holdCorrection)await new Promise(r=>window.releaseCorrection=r);window.corrections.push(copy(m));return {ok:true,id:'local-'+window.corrections.length};}
    if(m.type!=='classify')return {ok:true};
    window.calls.push(m.text);window.inflight++;window.maxInFlight=Math.max(window.maxInFlight,window.inflight);
    const id=m.text.match(/^\[([^\]]+)\]/)?.[1],p=window.plan[id]||{},snapshot=view(),snapshotScores=copy(p.scores);
    try{if(p.hold&&!p.released)await new Promise(r=>window.releases[id]=()=>{p.released=true;r();});
     if(p.disabledOnce){p.disabledOnce=false;return {disabled:true};}if(p.rejectOnce){p.rejectOnce=false;throw new Error('Synthetic old-context rejection');}
     if(p.error)return {error:p.error};return {...snapshot,scores:snapshotScores};
    }finally{window.inflight--;}
   }}};
  },{posts:posts.map(p=>({...p,scores:p.scores||allScores()})),cats,theme,groupHidden});
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../content.js'),'utf8')});
  await page.waitForSelector('.lsf-feed-toolbar');await settle(page);return {page,errors};
 }
 // A late result keeps the reader's actual paragraph and original native controls in place.
 {
  const {page,errors}=await fixture([{id:'late',long:80,hold:true,scores:allScores({slop:.95})}]);
  await page.waitForFunction(()=>!!window.releases.late);
  const paragraph=page.locator('#late .update-components-text p').nth(1);
  const before=await paragraph.evaluate(e=>e.getBoundingClientRect().top);
  await page.evaluate(()=>window.releases.late());await page.waitForSelector('#late .lsf-arrived:not([hidden])');await settle(page);
  assert.equal(await folded(page,'late'),false);assert.ok(Math.abs((await paragraph.evaluate(e=>e.getBoundingClientRect().top))-before)<=2);
  assert.equal(await page.locator('#late a').isVisible(),true);assert.equal(await page.locator('#late .native-controls button').first().isVisible(),true);
  await atTop(page,'late',-2500);await page.waitForSelector('#late.lsf-folded');await atTop(page,'late',100);await settle(page);
  const rowTop=await page.locator('#late').evaluate(e=>e.getBoundingClientRect().top);
  await page.locator('#late .lsf-bar button').filter({hasText:'Show'}).click();await settle(page);
  assert.equal(await folded(page,'late'),false);assert.ok(Math.abs((await page.locator('#late').evaluate(e=>e.getBoundingClientRect().top))-rowTop)<=2);
  assert.equal(await page.locator('#late .lsf-revealed-bar button').filter({hasText:'Hide again'}).evaluate(e=>e===document.activeElement),true);assert.equal(await page.locator('#late .lsf-revealed-bar button').filter({hasText:'Hide again'}).isVisible(),true);
  const visibleTop=await page.locator('#late').evaluate(e=>e.getBoundingClientRect().top);
  await page.locator('#late .lsf-revealed-bar button').filter({hasText:'Hide again'}).click();await settle(page);
  assert.equal(await folded(page,'late'),true);assert.ok(Math.abs((await page.locator('#late').evaluate(e=>e.getBoundingClientRect().top))-visibleTop)<=2);
  assert.equal(await page.locator('#late .lsf-bar button').filter({hasText:'Show'}).evaluate(e=>e===document.activeElement),true);
  await page.locator('#late .lsf-bar button').filter({hasText:'Show'}).click();await settle(page);await page.evaluate(()=>window.scrollTo({top:scrollY+600,behavior:'instant'}));await settle(page);const sticky=page.locator('#late .lsf-revealed-bar button').filter({hasText:'Hide again'}),stickyTop=await sticky.evaluate(e=>e.getBoundingClientRect().top);assert.ok(stickyTop>=60&&stickyTop<130);await sticky.click();await settle(page);assert.ok(Math.abs((await page.locator('#late .lsf-bar button').filter({hasText:'Show'}).evaluate(e=>e.getBoundingClientRect().top))-stickyTop)<=2,'long-post collapse retains the visible originating control');
  assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.type==='folded').length),1);assert.equal(await page.evaluate(()=>window.corrections.length),0);assert.equal(await page.evaluate(()=>window.calls.length),1);assert.deepEqual(errors,[]);
 }
 // Clipped native cards still offer a reachable collapse control at the end of a long reveal.
 {
  const {page,errors}=await fixture([{id:'clipped',long:80,scores:allScores({slop:.95})}],{top:900,clipCard:true});await page.waitForSelector('#clipped.lsf-folded');
  await page.locator('#clipped .lsf-bar button').filter({hasText:'Show'}).click();await settle(page);
  const header=page.locator('#clipped .lsf-revealed-bar button').filter({hasText:'Hide again'});assert.equal(await header.evaluate(e=>e===document.activeElement),true);
  await page.evaluate(()=>window.scrollTo({top:scrollY+600,behavior:'instant'}));await settle(page);assert.ok(await header.evaluate(e=>e.getBoundingClientRect().bottom<0),'overflow:hidden can defeat a sticky header');
  for(const source of ['Correct','Details']){
   const origin=page.locator('#clipped .lsf-tools button').filter({hasText:new RegExp('^'+source+'$')});await origin.click();await origin.evaluate(e=>window.correctionOrigin=e);
   if(source==='Details')await page.locator('#clipped .lsf-panel button').filter({hasText:'Correct this post'}).click();
   await settle(page);assert.equal(await page.locator('#clipped .lsf-correction input').first().evaluate(e=>e===document.activeElement&&e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().bottom<innerHeight),true,'correction focus stays visible at the end of a long card');
   await page.locator('#clipped .lsf-correction button').filter({hasText:'Cancel'}).click();await settle(page);assert.equal(await origin.evaluate(e=>e===document.activeElement&&e===window.correctionOrigin&&e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().bottom<innerHeight),true,'Cancel returns to the same visible footer control');
  }
  const footer=page.locator('#clipped .lsf-tools button').filter({hasText:/^Hide again$/});await footer.scrollIntoViewIfNeeded();await footer.focus();await settle(page);const before=await footer.evaluate(e=>e.getBoundingClientRect().top);
  await page.keyboard.press('Enter');await settle(page);const show=page.locator('#clipped .lsf-bar button').filter({hasText:'Show'});assert.equal(await folded(page,'clipped'),true);assert.equal(await show.evaluate(e=>e===document.activeElement),true);assert.ok(Math.abs((await show.evaluate(e=>e.getBoundingClientRect().top))-before)<=2,'footer collapse retains the originating control position');assert.equal(await page.evaluate(()=>window.calls.length),1);assert.deepEqual(errors,[]);
 }
 // Details controls keep their identity and focus when a pending result updates the scores.
 for(const offscreen of [false,true]){
  const {page,errors}=await fixture([{id:'detailfocus',long:true,hold:true,scores:allScores({slop:.95})},{id:'detailreader',long:true}]);await page.waitForFunction(()=>!!window.releases.detailfocus);
  await page.locator('#detailfocus .lsf-tools button').filter({hasText:'Details'}).click();const manage=page.locator('#detailfocus .lsf-panel button').filter({hasText:'Manage categories'});await manage.focus();await manage.evaluate(e=>window.originalManage=e);
  if(offscreen)await atTop(page,'detailreader',-150);
  await page.evaluate(()=>window.releases.detailfocus());await page.waitForFunction(()=>document.querySelector('#detailfocus .lsf-score-table td:nth-child(2)')?.textContent==='95%');await settle(page);
  assert.equal(await manage.evaluate(e=>e===document.activeElement&&e===window.originalManage),true);assert.equal(await folded(page,'detailfocus'),false,'a focused Details panel cannot be folded by its arriving result');assert.deepEqual(errors,[]);
 }
 // A rejected obsolete request cannot postpone scoring the current questions.
 {
  const {page,errors}=await fixture([{id:'obsoleteerror',hold:true,rejectOnce:true,scores:allScores()}],{top:900});await page.waitForFunction(()=>!!window.releases.obsoleteerror);
  await page.evaluate(()=>{window.config='c2';window.settingsBefore=window.messages.filter(m=>m.type==='settings').length;});await page.waitForFunction(()=>window.messages.filter(m=>m.type==='settings').length>window.settingsBefore);
  await page.evaluate(()=>window.releases.obsoleteerror());await page.waitForFunction(()=>window.calls.length===2);await page.waitForFunction(()=>document.querySelector('#obsoleteerror .lsf-badge')?.textContent==='No category');assert.equal(await folded(page,'obsoleteerror'),false);assert.deepEqual(errors,[]);
 }
 // Paused responses are transient; resuming the same configuration retries immediately.
 {
  const {page,errors}=await fixture([{id:'resumed',hold:true,disabledOnce:true,scores:allScores()}]);await page.waitForFunction(()=>!!window.releases.resumed);
  await page.evaluate(()=>{window.enabled=false;});await page.waitForFunction(()=>document.querySelector('.lsf-toolbar-status')?.textContent.includes('paused'));await page.evaluate(()=>window.releases.resumed());await page.waitForFunction(()=>window.inflight===0);assert.equal(await page.evaluate(()=>window.calls.length),1);
  await page.evaluate(()=>window.enabled=true);await page.waitForFunction(()=>window.calls.length===2);await page.waitForFunction(()=>document.querySelector('#resumed .lsf-badge')?.textContent==='No category');assert.deepEqual(errors,[]);
 }
 // Resuming global filtering does not collapse a scored post the reader opened while paused.
 {
  const {page,errors}=await fixture([{id:'pausedread',long:true,scores:allScores({slop:.95})}],{top:900});await page.waitForSelector('#pausedread.lsf-folded');await page.evaluate(()=>window.enabled=false);await page.waitForFunction(()=>!document.getElementById('pausedread').classList.contains('lsf-folded'));await atTop(page,'pausedread',60);
  await page.evaluate(()=>window.enabled=true);await page.waitForFunction(()=>document.querySelector('#pausedread .lsf-arrived')?.textContent.includes('result arrived'));assert.equal(await folded(page,'pausedread'),false);assert.equal(await page.locator('#pausedread .update-components-text').isVisible(),true);assert.equal(await page.evaluate(()=>window.calls.length),1);assert.deepEqual(errors,[]);
 }
 // The popup probe accepts only this extension, returns no post data, and follows SPA navigation.
 {
  const {page,errors}=await fixture([{id:'probe'}]);const reply=await page.evaluate(()=>{let own,foreign,other;window.feedStatusListener({type:'feedStatus'},{id:'test-extension'},v=>own=v);window.feedStatusListener({type:'feedStatus'},{id:'other-extension'},v=>foreign=v);window.feedStatusListener({type:'settings'},{id:'test-extension'},v=>other=v);history.pushState({},'', '/feed/detail/');let nested;window.feedStatusListener({type:'feedStatus'},{id:'test-extension'},v=>nested=v);history.pushState({},'', '/messaging/');let away;window.feedStatusListener({type:'feedStatus'},{id:'test-extension'},v=>away=v);return {own,foreign:foreign??null,other:other??null,nested,away};});assert.deepEqual(reply,{own:{isFeed:true,posts:1},foreign:null,other:null,nested:{isFeed:false},away:{isFeed:false}});assert.deepEqual(errors,[]);
 }
 // Observed current feed routes score only feed bodies and clean up on navigation away.
 for(const route of ['/feed/foryou/','/feed/network/']){
  const {page,errors}=await fixture([{id:'currentroute'}],{route});await page.waitForFunction(()=>window.calls.length===1);
  assert.deepEqual(await page.evaluate(()=>{let reply;window.feedStatusListener({type:'feedStatus'},{id:'test-extension'},r=>reply=r);return reply;}),{isFeed:true,posts:1});
  await page.evaluate(()=>{history.pushState({},'', '/messaging/');document.querySelector('#feed').insertAdjacentHTML('beforeend','<article class="feed-shared-update-v2"><div class="update-components-text">SYNTHETIC PRIVATE MESSAGE MUST NOT BE SCORED</div></article>');});
  await page.waitForFunction(()=>document.querySelectorAll('.lsf-feed-card,.lsf-feed-toolbar').length===0);await settle(page);assert.equal(await page.evaluate(()=>window.calls.length),1,'navigation away never extracts or scores private-page content');assert.deepEqual(errors,[]);
 }
 // Keyboard focus still protects an offscreen card, then leaving focus permits its fold.
 {
  const {page,errors}=await fixture([{id:'focus',hold:true,long:true,scores:allScores({slop:.95})},{id:'reader',long:true}]);
  await page.waitForFunction(()=>!!window.releases.focus);
  await page.locator('#focus .native-controls button').first().focus();await atTop(page,'reader',-40);await page.evaluate(()=>window.releases.focus());
  await page.waitForFunction(()=>document.querySelector('#focus .lsf-arrived')?.textContent.includes('result arrived'));
  assert.equal(await folded(page,'focus'),false);assert.equal(await page.locator('#focus .native-controls button').first().evaluate(e=>e===document.activeElement),true);
  await page.locator('#global-nav').evaluate(e=>{e.tabIndex=-1;e.focus({preventScroll:true});});await page.waitForSelector('#focus.lsf-folded');assert.deepEqual(errors,[]);
 }
 // Several settings-driven folds above the reader are batched and stay within 2px,
 // both with native anchoring and when the measured fallback is required.
 for(const anchor of [true,false]){
  const {page,errors}=await fixture([{id:'above1',long:true,scores:allScores({slop:.95})},{id:'above2',long:true,scores:allScores({slop:.95})},{id:'read',long:true}],{anchor});
  await page.evaluate(()=>window.categories=window.categories.map(c=>c.id==='slop'?{...c,action:'label'}:c));
  await page.waitForFunction(()=>document.querySelector('.lsf-toolbar-status')?.textContent.startsWith('No Hide rules'));
  await page.waitForFunction(()=>window.calls.length===3);await page.waitForFunction(()=>document.querySelector('#above2 .lsf-badge')?.textContent==='Slop');
  await atTop(page,'read',-40);await settle(page);
  const paragraph=page.locator('#read .update-components-text p').nth(1),before=await paragraph.evaluate(e=>e.getBoundingClientRect().top);
  await page.evaluate(()=>{window.compensations=0;const original=window.scrollBy.bind(window);window.scrollBy=(...args)=>{window.compensations++;original(...args);};window.categories=window.categories.map(c=>c.id==='slop'?{...c,action:'hide'}:c);});
  await page.waitForSelector('#above1.lsf-folded');await page.waitForSelector('#above2.lsf-folded');await settle(page);
  assert.ok(Math.abs((await paragraph.evaluate(e=>e.getBoundingClientRect().top))-before)<=2,'multiple above-reader folds preserve paragraph position');
  if(!anchor)assert.ok(await page.evaluate(()=>window.compensations)>0,'disabled native anchoring uses measured compensation');
  assert.equal(await page.evaluate(()=>window.calls.length),3);assert.deepEqual(errors,[]);
 }
 // Grouping uses the original adjacent native nodes and never crosses a visible card.
 {
  const {page,errors}=await fixture([{id:'s1',scores:allScores({slop:.95})},{id:'b1',scores:allScores({brainrot:.96})},{id:'good'},{id:'s2',scores:allScores({slop:.95})},{id:'s3',scores:allScores({slop:.95})}],{top:900});
  await page.evaluate(()=>window.categories=window.categories.map(c=>c.id==='brainrot'?{...c,action:'hide'}:c));
  await atTop(page,'s3',800);await page.waitForFunction(()=>window.calls.length===5);await page.waitForSelector('#s3.lsf-folded');await atTop(page,'s3',-250);await page.waitForSelector('#s2.lsf-folded');
  assert.equal(await page.locator('.lsf-group-bar').count(),0,'one row per post is the default');
  const originalOrder=await page.locator('#feed > article').evaluateAll(es=>es.map(e=>e.id));
  await page.evaluate(()=>window.experience.appearance.groupHidden=true);await page.waitForFunction(()=>document.querySelectorAll('.lsf-group-bar:not([hidden])').length===2);
  assert.equal(await page.locator('#s1 .lsf-group-name').innerText(),'2 hidden posts · Slop ×1, Brainrot ×1');
  assert.deepEqual(await page.locator('#feed > article').evaluateAll(es=>es.map(e=>e.id)),originalOrder);
  await page.locator('#s1 .lsf-group-bar button').click();assert.equal(await page.locator('#b1 .lsf-bar').isVisible(),true);await page.locator('#s1 .lsf-group-bar button').click();assert.equal(await page.locator('#s1 .lsf-group-bar button').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#b1 .lsf-bar').isVisible(),false);await page.locator('#s1 .lsf-group-bar button').click();assert.equal(await page.locator('#b1 .lsf-bar').isVisible(),true);
  await page.locator('#b1 .lsf-bar button').filter({hasText:'Show'}).click();await settle(page);
  assert.equal(await folded(page,'b1'),false);assert.equal(await page.locator('#b1 .update-components-text').isVisible(),true);assert.equal(await folded(page,'good'),false);assert.equal(await page.evaluate(()=>window.calls.length),5);assert.deepEqual(errors,[]);
 }
 // A regrouped run preserves a keyboard-focused individual row even with a new group key.
 {
  const {page,errors}=await fixture([{id:'beforegroup',long:true,scores:allScores({custom:.95})},{id:'g1',scores:allScores({slop:.95})},{id:'g2',scores:allScores({slop:.95})}],{groupHidden:true});await page.waitForFunction(()=>window.calls.length===3);await atTop(page,'g2',-450);await page.waitForFunction(()=>document.querySelector('#g1 .lsf-group-bar:not([hidden])'));
  await page.locator('#g1 .lsf-group-bar button').click();const target=page.locator('#g2 .lsf-bar button').filter({hasText:'Show'});await target.focus();await atTop(page,'g2',60);await settle(page);
  const before=await page.locator('#g2').evaluate(e=>e.getBoundingClientRect().top);await page.evaluate(()=>window.categories=window.categories.map(c=>c.id==='custom'?{...c,action:'hide'}:c));await page.waitForFunction(()=>document.getElementById('beforegroup').classList.contains('lsf-group-open'));await settle(page);
  assert.equal(await target.isVisible(),true);assert.equal(await target.evaluate(e=>e===document.activeElement),true);assert.equal(await page.locator('#g2').evaluate(e=>e.classList.contains('lsf-group-suppressed')),false);assert.ok(Math.abs((await page.locator('#g2').evaluate(e=>e.getBoundingClientRect().top))-before)<=2);assert.deepEqual(errors,[]);
 }
 // A focused group summary follows its run when a newly hidden card becomes the lead.
 for(const expanded of [false,true]){
  const {page,errors}=await fixture([{id:'newlead',long:true,scores:allScores({custom:.95})},{id:'lead',scores:allScores({slop:.95})},{id:'last',scores:allScores({slop:.95})}],{groupHidden:true});await page.waitForFunction(()=>window.calls.length===3);await atTop(page,'last',-450);await page.waitForFunction(()=>document.querySelector('#lead .lsf-group-bar:not([hidden])'));
  if(expanded)await page.locator('#lead .lsf-group-bar button').click();await page.locator('#lead .lsf-group-bar button').focus();await atTop(page,'lead',-60);await settle(page);await page.evaluate(()=>window.categories=window.categories.map(c=>c.id==='custom'?{...c,action:'hide'}:c));await page.waitForFunction(()=>document.querySelector('#newlead .lsf-group-bar:not([hidden])'));await settle(page);
  assert.equal(await page.locator('#newlead .lsf-group-bar button').evaluate(e=>e===document.activeElement),true);assert.equal(await page.locator('#newlead .lsf-group-bar button').isVisible(),true);assert.equal(await page.locator('#newlead .lsf-group-bar button').getAttribute('aria-expanded'),String(expanded));assert.deepEqual(errors,[]);
 }
 // Every category can hide; themes and temporary recovery keep the same decisions.
 {
  const {page,errors}=await fixture([{id:'mix',long:true,scores:allScores({slop:.95,advert:.94,nourishment:.97,custom:.92})}],{top:900});
  await page.evaluate(()=>window.categories=window.categories.map(c=>['advert','nourishment','custom'].includes(c.id)?{...c,action:'hide'}:c));await page.waitForSelector('#mix.lsf-folded');
  await page.waitForFunction(()=>document.querySelector('#mix .lsf-fold-name')?.textContent.includes('Custom'));
  const names=await page.locator('#mix .lsf-fold-name').innerText();for(const name of ['Slop','Advert','Nourishment','Custom'])assert.ok(names.includes(name));assert.ok(!names.includes('%'));
  const originals=await page.evaluate(()=>({outside:getComputedStyle(document.getElementById('outside')).fontFamily,nav:getComputedStyle(document.getElementById('global-nav')).backgroundColor,comments:getComputedStyle(document.querySelector('.native-comments')).fontFamily,categories:JSON.stringify(window.categories)}));
  assert.equal(await page.locator('.lsf-feed-toolbar select').count(),0);assert.equal(await page.locator('#mix').getAttribute('data-lsf-theme'),'native');assert.equal(await page.locator('#mix .lsf-fold-name').innerText(),names);
  assert.deepEqual(await page.evaluate(()=>({outside:getComputedStyle(document.getElementById('outside')).fontFamily,nav:getComputedStyle(document.getElementById('global-nav')).backgroundColor,comments:getComputedStyle(document.querySelector('.native-comments')).fontFamily,categories:JSON.stringify(window.categories)})),originals);
  await page.locator('.lsf-feed-toolbar button').filter({hasText:'Show everything'}).click();await page.waitForFunction(()=>!document.getElementById('mix').classList.contains('lsf-folded'));
  assert.match(await page.locator('.lsf-toolbar-status').innerText(),/temporarily/);assert.equal(await page.locator('#mix .update-components-text').isVisible(),true);
  await page.locator('.lsf-feed-toolbar button').filter({hasText:'Restore filtering'}).click();await page.waitForSelector('#mix.lsf-folded');assert.equal(await page.evaluate(()=>JSON.stringify(window.categories)),originals.categories);
  await page.locator('#mix .lsf-bar button').filter({hasText:'Details'}).click();assert.match(await page.locator('#mix .lsf-panel').innerText(),/Nourishment\s+97%\s+Hide above 80%/);assert.match(await page.locator('#mix .lsf-panel').innerText(),/Off categories are not requested/);
  await page.locator('#mix .lsf-panel button').filter({hasText:'Manage categories'}).click();assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.type==='openSettings').at(-1).section),'categories');
  await page.locator('#mix .lsf-panel button').filter({hasText:'Correct this post'}).click();assert.equal(await page.locator('#mix .lsf-correction input').first().evaluate(e=>e===document.activeElement),true);await page.locator('#mix .lsf-correction button').filter({hasText:'Cancel'}).click();assert.equal(await page.locator('#mix .lsf-bar button').filter({hasText:'Details'}).evaluate(e=>e===document.activeElement),true);await page.locator('#mix .lsf-bar button').filter({hasText:/^Correct$/}).click();assert.equal(await page.locator('#mix .lsf-correction input').first().evaluate(e=>e===document.activeElement),true);await page.locator('#mix .lsf-correction input').evaluateAll(es=>es.forEach(e=>e.checked=false));
  await page.locator('#mix .lsf-correction input[value=nourishment]').check();await page.locator('#mix .lsf-correction input[value=custom]').check();await page.locator('#mix .lsf-correction button').filter({hasText:'Keep visible'}).click();await page.waitForFunction(()=>window.corrections.length===1);
  assert.equal(await folded(page,'mix'),false);assert.equal(await page.locator('#mix .lsf-fold-name').innerText(),'Shown · Nourishment · Custom');assert.equal(await page.locator('#mix').evaluate(e=>e.dataset.lsfTone),'nourishment');assert.deepEqual(await page.evaluate(()=>window.corrections[0].categoryIds),['nourishment','custom']);const stored=await page.evaluate(()=>window.corrections[0].text);assert.match(stored,/^\[mix\]/);assert.ok(!stored.includes('Avery')&&!stored.includes('COMMENT TEXT')&&!stored.includes('Like'));
  await page.locator('#mix .lsf-bar button').filter({hasText:'Hide again'}).click();await page.waitForSelector('#mix.lsf-folded');assert.equal(await page.locator('#mix .lsf-fold-name').innerText(),'Nourishment · Custom');await page.locator('#mix .lsf-bar button').filter({hasText:/^Show$/}).click();
  await page.locator('#mix .lsf-tools button').filter({hasText:'Corrected'}).click();await page.locator('#mix .lsf-correction input').evaluateAll(es=>es.forEach(e=>e.checked=false));await page.locator('#mix .lsf-correction button').filter({hasText:'Keep visible'}).click();await page.waitForFunction(()=>window.corrections.length===2);assert.deepEqual(await page.evaluate(()=>window.corrections[1].categoryIds),[]);await settle(page);assert.equal(await page.locator('#mix .lsf-badge').innerText(),'No category');assert.equal(await page.locator('#mix .lsf-bar').isVisible(),false);assert.equal(await page.locator('#mix .lsf-tools button').filter({hasText:'Hide again'}).isVisible(),false);await page.locator('#mix .lsf-tools button').filter({hasText:/^Details$/}).click();assert.match(await page.locator('#mix .lsf-panel:not(.lsf-correction)').innerText(),/original model scores/);assert.match(await page.locator('#mix .lsf-panel:not(.lsf-correction)').innerText(),/Slop\s+95%/);
  assert.equal(await page.evaluate(()=>window.calls.length),1);assert.deepEqual(errors,[]);
 }
 // Corrected highlights, failed saves, and recycled cards cannot use stale manual labels.
 {
  const {page,errors}=await fixture([{id:'manual',scores:allScores({slop:.95})}],{top:900});await page.waitForSelector('#manual.lsf-folded');
  await page.locator('#manual .lsf-bar button').filter({hasText:/^Correct$/}).click();
  await page.locator('#manual .lsf-correction input').evaluateAll(es=>es.forEach(e=>e.checked=false));await page.locator('#manual .lsf-correction input[value=opportunity]').check();
  await page.evaluate(()=>window.correctionError=true);await page.locator('#manual .lsf-correction button').filter({hasText:'Keep visible'}).click();await page.waitForFunction(()=>document.querySelector('#manual .lsf-correction').textContent.includes('Could not save'));
  assert.equal(await folded(page,'manual'),true);assert.equal(await page.locator('#manual .lsf-fold-name').innerText(),'Slop');assert.equal(await page.evaluate(()=>window.corrections.length),0);
  await page.evaluate(()=>window.correctionError=false);await page.locator('#manual .lsf-correction button').filter({hasText:'Keep visible'}).click();await page.waitForSelector('#manual.lsf-highlight');
  assert.equal(await folded(page,'manual'),false);assert.equal(await page.locator('#manual .lsf-badge').innerText(),'Opportunity');assert.match(await page.locator('#manual .lsf-badge').getAttribute('title'),/saved correction/);
  assert.equal(await page.evaluate(()=>window.calls.length),1);assert.deepEqual(await page.evaluate(()=>window.corrections[0].scores),allScores({slop:.95}));
  await page.locator('#manual .lsf-tools button').filter({hasText:'Corrected'}).click();await page.locator('#manual .lsf-correction input[value=slop]').check();await page.evaluate(()=>window.holdCorrection=true);
  await page.locator('#manual .lsf-correction button').filter({hasText:'Keep visible'}).click();await page.waitForFunction(()=>!!window.releaseCorrection);
  await page.evaluate(scores=>{window.plan.replacement={scores};document.querySelector('#manual .update-components-text p').textContent='[replacement] A different post body';window.releaseCorrection();},allScores());
  await page.waitForFunction(()=>document.querySelector('#manual .lsf-badge')?.textContent==='No category');assert.equal(await page.locator('#manual .lsf-tools button').filter({hasText:'Corrected'}).count(),0);assert.equal(await folded(page,'manual'),false);assert.deepEqual(errors,[]);
 }
 // Active category metadata stays current without losing the correction draft or keyboard focus.
 {
  const {page,errors}=await fixture([{id:'edit',scores:allScores({slop:.95})}],{top:900});await page.waitForSelector('#edit.lsf-folded');
  await page.locator('#edit .lsf-bar button').filter({hasText:/^Correct$/}).click();const advert=page.locator('#edit .lsf-correction input[value=advert]');await advert.check();await advert.focus();
  await page.evaluate(()=>window.categories=window.categories.map(c=>c.id==='custom'?{...c,name:'Renamed custom'}:c));await page.waitForFunction(()=>document.querySelector('#edit .lsf-correction')?.textContent.includes('Renamed custom'));
  assert.equal(await advert.evaluate(e=>e===document.activeElement),true);assert.equal(await advert.isChecked(),true);
  await page.evaluate(()=>{window.categories=window.categories.map(c=>c.id==='advert'?{...c,action:'off'}:c);window.categories.push({id:'fresh',name:'Fresh category',action:'label',threshold:.8});window.config='c2';window.plan.edit.hold=true;window.plan.edit.released=false;});
  await page.waitForFunction(()=>!!window.releases.edit&&!!document.querySelector('#edit .lsf-correction input[value=fresh]'));
  assert.equal(await page.locator('#edit .lsf-correction input[value=advert]').count(),0);assert.equal(await page.locator('#edit .lsf-correction .lsf-panel-heading').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('#edit .lsf-correction input[value=slop]').isChecked(),true);assert.equal(await folded(page,'edit'),false,'new questions cannot use stale scores to hide');
  await page.evaluate(()=>window.releases.edit());await page.waitForFunction(()=>document.querySelector('#edit .lsf-arrived')?.textContent.includes('result arrived'));assert.equal(await folded(page,'edit'),false,'focused correction protects the replacement result');
  await page.locator('#edit .lsf-correction button').filter({hasText:'Cancel'}).click();assert.equal(await page.locator('#edit .lsf-tools button').filter({hasText:/^Correct$/}).evaluate(e=>e===document.activeElement),true);assert.equal(await page.evaluate(()=>window.corrections.length),0);assert.deepEqual(errors,[]);
 }
 // Details precision explains strict boundary matches rather than displaying equal percentages.
 {
  const {page,errors}=await fixture([{id:'precision',scores:allScores({slop:.804,custom:.8000000001})}],{top:900});await page.waitForSelector('#precision.lsf-folded');await page.locator('#precision .lsf-bar button').filter({hasText:'Details'}).click();const details=await page.locator('#precision .lsf-panel').innerText();assert.match(details,/Slop\s+80\.4%\s+Hide above 80%/);assert.match(details,/Custom\s+80% \(just above\)/);assert.deepEqual(errors,[]);
 }
 // Partial, failed and invalid answers remain readable and never become fabricated rationales.
 {
  const {page,errors}=await fixture([{id:'partial',scores:{slop:.3}},{id:'error',error:'API unavailable SECRET-TEST-MARKER'},{id:'invalid',scores:{slop:'0.99'}}]);
  await page.waitForFunction(()=>window.calls.length===3);await page.waitForFunction(()=>document.querySelector('#partial .lsf-badge')?.textContent==='Partly scored');
  for(const id of ['partial','error','invalid'])assert.equal(await folded(page,id),false);
  await page.locator('#partial .lsf-tools button').filter({hasText:'Details'}).click();assert.match(await page.locator('#partial .lsf-panel').innerText(),/Partly scored/);assert.match(await page.locator('#partial .lsf-panel').innerText(),/Nourishment\s+Not returned/);
  assert.ok(!(await page.locator('body').innerText()).includes('SECRET-TEST-MARKER'));assert.match(await page.locator('.lsf-toolbar-status').innerText(),/could not be scored/);assert.deepEqual(errors,[]);
 }
 // Fast scrolling recomputes unsent work instead of starting a stale multi-post queue.
 {
  const posts=Array.from({length:10},(_,i)=>({id:'q'+i,long:true,hold:i===0,scores:allScores()}));const {page,errors}=await fixture(posts);
  await page.waitForFunction(()=>!!window.releases.q0);await atTop(page,'q9',40);await page.evaluate(()=>window.releases.q0());await page.waitForFunction(()=>window.calls.length>=2);
  assert.match(await page.evaluate(()=>window.calls[1]),/^\[q9\]/);assert.equal(await page.evaluate(()=>window.maxInFlight),1);assert.deepEqual(errors,[]);
 }
 // Compensation respects a new scroll after DOM layout and before its next animation frame.
 {
  const {page,errors}=await fixture([{id:'dragabove',long:true,scores:allScores({custom:.95})},{id:'dragread',long:true}],{anchor:false});await page.waitForFunction(()=>window.calls.length===2);await atTop(page,'dragread',-40);await settle(page);
  await page.evaluate(()=>{window.dragResult=new Promise(resolve=>{const post=document.getElementById('dragabove');const observer=new MutationObserver(()=>{if(!post.classList.contains('lsf-folded'))return;observer.disconnect();const target=scrollY+40;window.scrollTo({top:target,behavior:'instant'});requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({target,actual:scrollY})));});observer.observe(post,{attributes:true,attributeFilter:['class']});});window.categories=window.categories.map(c=>c.id==='custom'?{...c,action:'hide'}:c);});
  const result=await page.evaluate(()=>window.dragResult);assert.ok(Math.abs(result.actual-result.target)<=2,'new programmatic/scrollbar position must not be undone');assert.deepEqual(errors,[]);
 }
 // Responsive, dark and reduced-motion checks exercise the shipped styles, not a drawing.
 {
  const {page,errors}=await fixture([{id:'look1',scores:allScores({slop:.95})},{id:'look2',scores:allScores({brainrot:.96})},{id:'look3',long:true,scores:allScores({nourishment:.96})}],{top:900});
  await page.evaluate(()=>window.categories=window.categories.map(c=>c.id==='brainrot'?{...c,action:'hide'}:c));await page.waitForFunction(()=>window.calls.length===3);await page.waitForSelector('#look2.lsf-folded');
  await atTop(page,'look1',150);
  for(const width of [736,360,320]){await page.setViewportSize({width,height:900});await settle(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow at '+width);}
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  assert.equal(await page.locator('#look1').getAttribute('data-lsf-scheme'),'light','light LinkedIn stays light when the OS prefers dark');
  assert.equal(await page.locator('.lsf-feed-toolbar').getAttribute('data-lsf-scheme'),'light','toolbar follows the native feed surface');
  assert.equal(await page.locator('#look1 .lsf-bar').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  assert.equal(await page.locator('#look3 .update-components-text').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  await page.addStyleTag({content:'.host-dark .feed-shared-update-v2{background:#1b1f23}'});
  await page.evaluate(()=>document.documentElement.classList.add('host-dark'));
  await page.waitForFunction(()=>document.getElementById('look1').dataset.lsfScheme==='dark'&&document.querySelector('.lsf-feed-toolbar').dataset.lsfScheme==='dark');
  await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
  assert.equal(await page.locator('#look1').getAttribute('data-lsf-scheme'),'dark','dark LinkedIn stays dark when the OS prefers light');
  const styles=await page.locator('#look3').evaluate(e=>({card:getComputedStyle(e).backgroundColor,header:getComputedStyle(e.querySelector('.native-header strong')).color,body:getComputedStyle(e.querySelector('.update-components-text')).backgroundColor,link:getComputedStyle(e.querySelector('.update-components-text a')).color,controls:getComputedStyle(e.querySelector('.native-controls button')).color,comments:getComputedStyle(e.querySelector('.native-comments')).color}));
  assert.deepEqual(styles,{card:'rgb(27, 31, 35)',header:'rgb(38, 50, 56)',body:'rgba(0, 0, 0, 0)',link:'rgb(10, 102, 194)',controls:'rgb(100, 114, 122)',comments:'rgb(100, 114, 122)'},'Native leaves extracted text, links, metadata and controls untouched');
  await page.evaluate(()=>document.documentElement.classList.remove('host-dark'));
  await page.waitForFunction(()=>document.getElementById('look1').dataset.lsfScheme==='light');
  const output=process.env.FEED_SCREENSHOTS;if(output){fs.mkdirSync(output,{recursive:true});for(const theme of ['native']){await page.setViewportSize({width:1000,height:1000});await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});await atTop(page,'look1',150);await settle(page);await page.screenshot({path:path.join(output,theme+'.png')});}await page.setViewportSize({width:360,height:900});await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await atTop(page,'look1',180);await settle(page);await page.screenshot({path:path.join(output,'mobile-dark.png')});}
  assert.deepEqual(errors,[]);
 }
 // Reload/disabling invalidates the old content context: restore originals and stop all work.
 {
  const {page,errors}=await fixture([{id:'shutdown1',scores:allScores({slop:.96})},{id:'shutdown2',scores:allScores({slop:.96})}],{top:900,theme:'reader',groupHidden:true});
  await page.waitForSelector('.lsf-group-suppressed',{state:'attached'});
  await page.evaluate(()=>{delete chrome.runtime.id;window.dispatchEvent(new Event('scroll'));});
  await page.waitForFunction(()=>document.querySelectorAll('[data-lsf-ui],.lsf-folded,.lsf-group-suppressed,.lsf-reader-body,.lsf-feed-card').length===0);
  const messages=await page.evaluate(()=>window.messages.length);
  await page.evaluate(()=>{document.querySelector('#shutdown1 .update-components-text').append(document.createTextNode(' Synthetic change after disconnect.'));window.dispatchEvent(new Event('resize'));document.querySelector('#shutdown1 button').focus();});
  await page.waitForTimeout(5500);
  assert.equal(await page.evaluate(()=>window.messages.length),messages,'invalidated context stops polling, scoring and event-driven requests');
  assert.equal(await page.locator('#shutdown2 .update-components-text').isVisible(),true,'group members are restored');assert.deepEqual(errors,[]);
 }
 // A late result and a synchronous invalidation cannot recreate disconnected controls.
 {
  const {page,errors}=await fixture([{id:'lateDisconnect',hold:true,scores:allScores({slop:.96})}]);
  await page.waitForFunction(()=>!!window.releases.lateDisconnect);
  await page.evaluate(()=>{delete chrome.runtime.id;window.dispatchEvent(new Event('scroll'));window.releases.lateDisconnect();});
  await page.waitForFunction(()=>document.querySelectorAll('[data-lsf-ui]').length===0);await settle(page);
  assert.equal(await folded(page,'lateDisconnect'),false);assert.deepEqual(errors,[]);
 }
 {
  const {page,errors}=await fixture([{id:'syncDisconnect'}]);
  await page.evaluate(()=>{chrome.runtime.sendMessage=()=>{throw new Error('Extension context invalidated.');};});
  await page.evaluate(()=>document.querySelector('.lsf-toolbar-main button').click());
  await page.waitForFunction(()=>document.querySelectorAll('[data-lsf-ui]').length===0);assert.deepEqual(errors,[]);
 }
 for(const page of pages)await page.close();await browser.close();
 console.log('PASS: native feed appearance, independent Hide precedence, visible/focused deferral, paragraph anchoring (native/fallback), reveal/re-hide focus including clipped long cards, live Details/group focus, stale rejection and pause recovery, trusted feed probe, one-shot folded usage, grouping/order, temporary recovery, multi-label/none corrections, partial/fail-open, bounded priority queue, responsive/dark/reduced motion');
})().catch(e=>{console.error(e);process.exit(1);});
