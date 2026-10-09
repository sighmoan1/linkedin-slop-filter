const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
const ALLOWED_HOSTS=new Set(['openrouter.ai','platform.openai.com','developers.openai.com','github.com']);
(async()=>{
 const {requestFor,DEFAULTS}=await import('../core.mjs');
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:380,height:800}});
 const requested=[],pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  requested.push(url.href);
  if(url.origin!=='https://ext.test')return route.abort();
  const file=path.join(root,url.pathname.slice(1));
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:types[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
 });
 await page.addInitScript(()=>{
  const read=()=>JSON.parse(localStorage.getItem('chromeStore')||'{}');
  window.chrome={storage:{local:{get:async q=>({...q,...read()}),set:async()=>{},remove:async()=>{}}}};
 });

 // --- Setup guide page ---
 await page.goto('https://ext.test/setup.html');
 const guide=await page.evaluate(()=>({
  text:document.body.innerText,
  ids:[...document.querySelectorAll('[id]')].map(e=>e.id),
  links:[...document.querySelectorAll('a[href]')].map(a=>({href:a.getAttribute('href'),target:a.target,rel:a.rel})),
  bad:[...document.querySelectorAll('script,img,iframe,object,embed,video,audio,form,input')].map(e=>e.tagName),
  sheets:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.getAttribute('href')),
  rows:document.querySelectorAll('tbody tr').length,
  overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth
 }));
 for(const id of ['openrouter','openai','check','privacy'])assert.ok(guide.ids.includes(id),'missing section #'+id);
 assert.deepEqual(guide.bad,[],'guide must be static text and links only');
 assert.deepEqual(guide.sheets.sort(),['options.css','setup.css']);
 assert.equal(guide.overflow,false,'no horizontal scrolling at popup width');
 assert.equal(guide.rows,7);
 const external=guide.links.filter(l=>!l.href.startsWith('#'));
 assert.ok(external.length>=8);
 for(const l of external){
  const u=new URL(l.href);
  assert.equal(u.protocol,'https:',l.href);
  assert.ok(ALLOWED_HOSTS.has(u.hostname),'unexpected host '+u.hostname);
  assert.equal(l.target,'_blank',l.href);
  assert.match(l.rel,/noopener/,l.href);assert.match(l.rel,/noreferrer/,l.href);
 }
 const hrefs=new Set(external.map(l=>l.href));
 for(const required of ['https://openrouter.ai/settings/keys','https://openrouter.ai/settings/credits','https://platform.openai.com/api-keys','https://platform.openai.com/settings/organization/billing/overview','https://openrouter.ai/blog/insights/what-is-jev/','https://developers.openai.com/api/docs/guides/decisions'])assert.ok(hrefs.has(required),'missing link '+required);
 for(const a of guide.links.filter(l=>l.href.startsWith('#')))assert.ok(guide.ids.includes(a.href.slice(1)),'dead anchor '+a.href);
 // The guide must use the same models the extension really calls.
 assert.ok(guide.text.includes(requestFor(DEFAULTS,'x').body.model),'Jev model name out of date');
 assert.ok(guide.text.includes(requestFor({...DEFAULTS,provider:'openai'},'x').body.model),'OpenAI model name out of date');

 // --- Settings page links into the guide, and names match what the guide tells people to click ---
 await page.goto('https://ext.test/options.html');
 await page.waitForFunction(()=>document.getElementById('threshold').value!=='');
 const options=await page.evaluate(()=>({
  links:[...document.querySelectorAll('a[href]')].map(a=>({href:a.getAttribute('href'),target:a.target,rel:a.rel})),
  buttons:[...document.querySelectorAll('button')].map(b=>b.textContent.trim()),
  labels:[...document.querySelectorAll('label')].map(l=>l.firstChild.textContent.trim()),
  providers:[...document.querySelectorAll('#provider option')].map(o=>o.textContent.trim()),
  guideVisible:document.querySelector('a.guide').getBoundingClientRect().height>0,
  overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth
 }));
 assert.equal(options.guideVisible,true);assert.equal(options.overflow,false);
 assert.deepEqual(options.links.map(l=>l.href).sort(),['setup.html','setup.html#openai','setup.html#openrouter']);
 for(const l of options.links){assert.equal(l.target,'_blank');assert.match(l.rel,/noopener/);assert.match(l.rel,/noreferrer/);}
 for(const l of options.links.filter(l=>l.href.includes('#')))assert.ok(guide.ids.includes(l.href.split('#')[1]),'settings links to missing guide section '+l.href);
 for(const name of ['Test OpenRouter key','Test OpenAI key'])assert.ok(options.buttons.includes(name),'no button '+name);
 for(const name of ['OpenRouter API key','OpenAI API key'])assert.ok(options.labels.includes(name),'no field '+name);
 for(const name of ['Jev · OpenRouter','OpenAI Decisions · GPT-6 Luna'])assert.ok(options.providers.includes(name),'no provider '+name);
 for(const phrase of ['Test OpenRouter key','Test OpenAI key','OpenRouter API key','OpenAI API key','Jev · OpenRouter','OpenAI Decisions · GPT-6 Luna','Decision provider'])assert.ok(guide.text.includes(phrase),'guide does not mention "'+phrase+'"');

 // Nothing outside the extension was ever requested by either page.
 assert.deepEqual(requested.filter(u=>!u.startsWith('https://ext.test/')),[]);
 assert.deepEqual(pageErrors.map(e=>e.message),[]);
 console.log('PASS: setup guide (sections, safe links, no remote assets, names and models match the product, fits popup width)');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
