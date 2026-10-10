const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();page.setDefaultTimeout(10000);
 const source=name=>fs.readFileSync(require('node:path').join(__dirname,'../'+name),'utf8');
 await page.route('https://www.linkedin.com/**',r=>r.fulfill({contentType:'text/html',body:'<main><a href="/in/alice/?trk=connections">Alice Example</a><a href="/in/bob">Bob Example</a></main>'}));
 await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/');
 await page.evaluate(()=>{window.saved=[];window.calls=[];window.chrome={runtime:{id:'test',sendMessage:async m=>{window.calls.push(m);if(m.action==='set'){window.saved=window.saved.filter(p=>p.url!==m.url);if(m.value)window.saved.push({url:m.url,name:m.name});}return {people:window.saved};}}};});
 await page.addStyleTag({content:source('people.css')});await page.addScriptTag({content:source('people.js')});
 const alice=page.getByRole('button',{name:'Never hide posts from Alice Example'});
 await alice.click();await page.waitForFunction(()=>document.querySelector('[data-lsf-people] button').getAttribute('aria-pressed')==='true');
 assert.equal(await page.evaluate(()=>window.saved.length),1);
 await page.evaluate(()=>{const a=document.createElement('a');a.href='/in/carol';a.textContent='Carol Example';document.querySelector('main').append(a);});
 await page.getByRole('button',{name:'Never hide posts from Carol Example'}).waitFor();
 await alice.click();assert.equal(await page.evaluate(()=>window.saved.length),0);
 // Feed selection must bypass scoring, while a mention of that person does not.
 await page.goto('https://www.linkedin.com/feed/');
 await page.evaluate(()=>{
 window.calls=[];window.selected=['https://www.linkedin.com/in/alice'];
 const interval=window.setInterval.bind(window);window.setInterval=(fn,ms)=>interval(fn,ms===5000?100:ms);
 window.chrome={runtime:{id:'test',sendMessage:async m=>{
 if(m.type==='settings')return {enabled:true,configuration:'test',categories:[{id:'slop',name:'Slop',action:'hide',threshold:.8}]};
 if(m.type==='people')return {people:window.selected};
 if(m.type==='experience')return {appearance:{theme:'native',labels:'matches'},showEverything:false};
 if(m.type==='classify'){window.calls.push(m.text);return {scores:{slop:.99},configuration:'test'};}return {ok:true};}}};
 document.querySelector('main').innerHTML='<article id="selected" class="feed-shared-update-v2"><a class="update-components-actor__meta-link" href="/in/alice/?trk=feed">Alice</a><div class="update-components-text">Selected slop</div></article><article id="other" class="feed-shared-update-v2"><a class="update-components-actor__meta-link" href="/in/bob">Bob</a><div class="update-components-text">Other slop mentioning <a href="/in/alice">Alice</a></div></article>';
 });
 await page.addStyleTag({content:source('content.css')});await page.addScriptTag({content:source('content.js')});
 await page.waitForFunction(()=>window.calls.length===1);
 assert.equal(await page.locator('#selected .update-components-text').isVisible(),true);
 assert.deepEqual(await page.evaluate(()=>window.calls),['Other slop mentioning Alice']);
 await page.evaluate(()=>window.selected=[]);await page.waitForFunction(()=>window.calls.length===2);
 await page.evaluate(()=>{document.querySelector('main').style.minHeight='3000px';window.scrollTo(0,1500);});await page.locator('#selected.lsf-folded').waitFor();
 await page.evaluate(()=>window.selected=['https://www.linkedin.com/in/alice']);
 await page.waitForFunction(()=>!document.querySelector('#selected').classList.contains('lsf-folded'));
 assert.equal(await page.locator('#selected .update-components-text').isVisible(),true);
 assert.equal((await page.evaluate(()=>window.calls)).length,2);
 await browser.close();console.log('PASS: directory selection, dynamic people, author scoring bypass, mention isolation and live exemption changes');
})().catch(error=>{console.error(error);process.exit(1);});
