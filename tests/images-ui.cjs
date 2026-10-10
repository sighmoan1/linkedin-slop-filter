const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true});const errors=[];
 try {
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.linkedin.com/feed/',r=>r.fulfill({contentType:'text/html',body:'<html><body><main style="padding-top:900px"></main></body></html>'}));
  await page.route('https://media.licdn.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="grey"/></svg>'}));
  await page.goto('https://www.linkedin.com/feed/');await page.addStyleTag({content:fs.readFileSync(path.join(root,'content.css'),'utf8')});
  await page.evaluate(()=>{
   window.calls=[];window.trial=true;window.imageAction='label';window.showAll=false;
   const interval=window.setInterval.bind(window);window.setInterval=(fn,ms)=>interval(fn,ms===5000?70:ms);
   window.chrome={runtime:{id:'images-ui',sendMessage:async m=>{
    const view=()=>({enabled:true,provider:'jev',configuration:window.trial?'images':'text',categories:[{id:'slop',name:'Slop',action:'hide',threshold:.8},{id:'nourishment',name:'Good post',action:'highlight',threshold:.8},...(window.trial?[{id:'lsf-visual-slop',name:'Visual slop',action:window.imageAction,threshold:.8}]:[])],...(window.trial?{images:{enabled:true,model:'cloudflare/clef-flash'}}:{})});
    if(m.type==='settings')return view();
    if(m.type==='experience')return {appearance:{theme:'native',labels:'matches',groupHidden:false},showEverything:window.showAll};
    if(m.type==='people')return {people:[]};
    if(m.type==='showEverything'){window.showAll=m.value;return {appearance:{theme:'native',labels:'matches',groupHidden:false},showEverything:window.showAll};}
    if(m.type!=='classify')return {ok:true};
    window.calls.push(m);
    const visual=m.imageUrls?.length?.valueOf()>0;
    const score=m.imageUrls?.[0]?.includes('second')?.1:m.text==='Boundary'?.8:.95;
    return {...view(),scores:{slop:.1,nourishment:.95,...(visual?{'lsf-visual-slop':score}:{})},imageStatus:visual?(m.text==='Failure'?'unavailable':'scored'):'no-image',...(visual&&m.text!=='Failure'?{imageModel:'cloudflare/clef-flash',imageUsage:{inputTokens:1234,cost:.00005}}:{}) ,...(m.text==='Failure'?{scores:{slop:.1,nourishment:.95}}:{})};
   }}};
   const card=(id,text,image)=>{const p=document.createElement('article');p.id=id;p.className='feed-shared-update-v2';p.innerHTML='<div class="update-components-actor"><img class="update-components-image__image" src="https://media.licdn.com/dms/image/avatar"></div><div class="update-components-text"></div><div class="update-components-image"></div><div class="comments-comment-item"><img class="update-components-image__image" src="https://media.licdn.com/dms/image/comment"></div>';p.querySelector('.update-components-text').textContent=text;if(image){const img=document.createElement('img');img.src='https://media.licdn.com/dms/image/'+id;img.style.cssText='width:400px;height:100px';p.querySelector('.update-components-image').append(img);}document.querySelector('main').append(p);};
   card('cartoon','Generic lesson',true);card('boundary','Boundary',true);card('failure','Failure',true);card('imageonly','',true);card('plain','Plain text',false);
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'content.js'),'utf8')});
  await page.waitForFunction(()=>document.querySelector('#cartoon .lsf-badge')?.textContent==='Visual slop');
  assert.equal(await page.locator('#cartoon').evaluate(e=>e.classList.contains('lsf-highlight')),false,'visual match removes Good post highlight');
  const urls=await page.evaluate(()=>window.calls.find(m=>m.text==='Generic lesson').imageUrls);assert.deepEqual(urls,['https://media.licdn.com/dms/image/cartoon']);
  assert.equal(await page.locator('#cartoon').evaluate(e=>e.classList.contains('lsf-folded')),false,'trial begins label-only');
  await page.locator('#cartoon .lsf-tools button').filter({hasText:'Review scores'}).click();
  await page.locator('#cartoon .lsf-score-help summary').click();assert.match(await page.locator('#cartoon .lsf-correction').innerText(),/1,?234|1234/);
  await page.locator('#cartoon .lsf-correction button').filter({hasText:'Cancel'}).click();
  // Display-only changes reuse the original image score and normal recovery controls.
  const count=await page.evaluate(()=>window.calls.length);await page.evaluate(()=>{window.imageAction='hide';document.activeElement.blur();window.scrollTo(0,0);});
  await page.mouse.move(0,0);await page.waitForSelector('#cartoon.lsf-folded');assert.equal(await page.evaluate(()=>window.calls.length),count);
  await page.locator('#cartoon .lsf-bar button').click();assert.equal(await page.locator('#cartoon .update-components-image').isVisible(),true);
  await page.locator('#cartoon .lsf-bar button').click();assert.equal(await page.locator('#cartoon').evaluate(e=>e.classList.contains('lsf-folded')),true);
  await page.evaluate(()=>{window.showAll=true;});await page.waitForFunction(()=>!document.querySelector('#cartoon').classList.contains('lsf-folded'));
  await page.evaluate(()=>{window.showAll=false;window.scrollTo(0,0);});await page.waitForSelector('#cartoon.lsf-folded');
  await page.evaluate(()=>document.querySelector('#cartoon .update-components-image img').src='https://media.licdn.com/dms/image/second');
  await page.waitForFunction(()=>document.querySelector('#cartoon .lsf-badge')?.textContent==='Good post');
  assert.equal(await page.locator('#cartoon').evaluate(e=>e.classList.contains('lsf-folded')),false,'replacement image invalidates the old fold');
  await page.locator('#boundary').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.calls.some(m=>m.text==='Boundary'));await page.waitForFunction(()=>document.querySelector('#boundary .lsf-badge')?.textContent==='Good post');
  assert.equal(await page.locator('#boundary').evaluate(e=>e.classList.contains('lsf-folded')),false,'exact threshold does not apply');
  await page.locator('#failure').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#failure .lsf-badge')?.textContent.includes('Image unchecked'));
  assert.equal(await page.locator('#failure').evaluate(e=>e.classList.contains('lsf-folded')),false);
  await page.locator('#imageonly').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.calls.some(m=>m.text===''&&m.imageUrls.length===1));
  await page.evaluate(()=>{window.trial=false;});await page.waitForFunction(()=>!document.querySelector('#imageonly .lsf-tools')&&!document.querySelector('#imageonly .lsf-bar'));
  await page.close();

  const options=await browser.newPage();options.on('pageerror',e=>errors.push(e.message));
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
  await options.route('https://ext.test/**',r=>{const f=path.join(root,new URL(r.request().url()).pathname);return r.fulfill({contentType:types[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});});
  await options.addInitScript(()=>{
   window.store={schema:2,enabled:false,jevKey:'SYNTHETIC-KEY',provider:'jev'};window.permission=true;window.sent=[];
   window.chrome={permissions:{request:async()=>window.permission,contains:async()=>window.permission},storage:{local:{get:async q=>typeof q==='string'?{[q]:window.store[q]}:{...q,...window.store},set:async v=>Object.assign(window.store,v),remove:async()=>{}}},runtime:{sendMessage:async m=>{
    window.sent.push(m);
    if(m.type==='experience'||m.type==='appearance')return {appearance:{theme:'native',groupHidden:false,labels:'matches'}};
    if(m.type==='corrections')return {corrections:[]};if(m.type==='people')return {people:[]};if(m.type==='settings')return {configuration:'a'.repeat(64)};
    if(m.type==='compareImages')return {results:[{model:'cloudflare/clef-flash',scores:{'lsf-visual-slop':.9},imageUsage:{inputTokens:5000,cost:.00019},durationMs:40},{model:'openai/gpt-6-luna-decisions',scores:{'lsf-visual-slop':.2},imageUsage:{inputTokens:4000,cost:.0004},durationMs:60}]};
    return {};
   }}};
  });
  await options.goto('https://ext.test/options.html#feed');await options.waitForFunction(()=>document.documentElement.dataset.settingsReady==='true');
  assert.equal(await options.locator('#imageEnabled').isChecked(),false);assert.equal(await options.locator('#imageAction').inputValue(),'label');
  await options.evaluate(()=>{window.permission=false;});await options.locator('#imageEnabled').click();await options.waitForFunction(()=>!document.querySelector('#imageEnabled').checked);
  assert.match(await options.locator('#imagePermissionStatus').innerText(),/not granted/);
  await options.evaluate(()=>{window.permission=true;});await options.locator('#imageEnabled').check();await options.getByRole('button',{name:'Save settings'}).click();await options.waitForFunction(()=>window.store.imageAnalysis?.enabled===true);
  assert.equal(await options.evaluate(()=>window.store.imageAnalysis.action),'label');assert.equal(await options.evaluate(()=>window.store.jevKey),'SYNTHETIC-KEY');
  await options.locator('[data-panel=playground]').click();
  const png=await options.evaluate(()=>{const c=document.createElement('canvas');c.width=20;c.height=20;c.getContext('2d').fillRect(0,0,20,20);return c.toDataURL().split(',')[1];});
  await options.locator('#comparisonImages').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await options.fill('#playgroundText','Synthetic caption');
  assert.equal(await options.evaluate(()=>window.sent.some(m=>m.type==='compareImages')),false,'selection and typing send nothing');
  await options.locator('#compareImages').click();await options.waitForFunction(()=>document.querySelector('#imageComparisonResult tbody')?.children.length===2);
  assert.match(await options.locator('#imageComparisonResult').innerText(),/90.0%/);assert.match(await options.locator('#imageComparisonResult').innerText(),/0.00019/);
  assert.equal(await options.evaluate(()=>window.sent.find(m=>m.type==='compareImages').images[0].startsWith('data:image/jpeg;base64,')),true);
  await options.fill('#playgroundText','Changed caption');assert.equal(await options.locator('#imageComparisonResult tbody').count(),0,'changed input clears the previous comparison');
  assert.deepEqual(errors,[]);
  console.log('PASS: attachment boundaries, label-first trial, hide precedence, strict threshold, reveal/re-hide, temporary recovery, recycled images, image-only cards, permission denial, saved settings and explicit model comparison');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
