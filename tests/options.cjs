const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
const KEY='sk-or-SECRET-TEST-KEY';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e));
 await page.route('https://ext.test/**',route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  const file=path.join(root,name);
  if(!name||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:types[path.extname(name)]||'text/plain',body:fs.readFileSync(file)});
 });
 // Extension storage and provider calls are mocked; nothing here touches a real provider.
 await page.addInitScript(()=>{
  const read=()=>JSON.parse(localStorage.getItem('chromeStore')||'{}');
  const write=o=>localStorage.setItem('chromeStore',JSON.stringify(o));
  window.chrome={storage:{local:{
   get:async q=>typeof q==='string'?{[q]:read()[q]}:{...q,...read()},
   set:async v=>write({...read(),...v}),
   remove:async k=>{const d=read();delete d[k];write(d);}
  }}};
  window.fetchCalls=[];window.mode={status:200};
  const good={jev:{answers:{slop:{type:'noul',noul:.3}}},openai:{answers:[{name:'slop',type:'predicate',probability:.3}]}};
  window.fetch=async(url,req)=>{
   window.fetchCalls.push({url,auth:req.headers.Authorization});
   await new Promise(r=>setTimeout(r,30));
   const m=window.mode;
   return {ok:m.status>=200&&m.status<300,status:m.status,json:async()=>url.includes('openai.com')?good.openai:good.jev};
  };
 });
 const open=async()=>{await page.goto('https://ext.test/options.html#provider');await page.waitForFunction(()=>document.querySelectorAll('.cat').length>0);};
 const text=id=>page.locator('#'+id).innerText();
 await open();

 // Empty key: friendly message, no request.
 await page.click('#jevKeyTest');
 assert.match(await text('jevKeyStatus'),/Enter your OpenRouter key first/);
 assert.equal(await page.evaluate(()=>window.fetchCalls.length),0);

 // Working key: shows progress, disables the button while testing, then a pass.
 await page.fill('#jevKey',KEY);
 await page.click('#jevKeyTest');
 assert.equal(await page.locator('#jevKeyTest').isDisabled(),true);
 await page.waitForFunction(()=>/Key works/.test(document.getElementById('jevKeyStatus').textContent));
 assert.equal(await page.locator('#jevKeyTest').isDisabled(),false);
 assert.match(await text('jevKeyStatus'),/^✓ Key works.*Checked /);
 assert.match(await page.locator('#jevKeyStatus').getAttribute('class'),/\bok\b/);
 const call=await page.evaluate(()=>window.fetchCalls[0]);
 assert.equal(call.url,'https://openrouter.ai/api/alpha/decisions');assert.equal(call.auth,'Bearer '+KEY);

 // Failures show a specific explanation, never the key.
 await page.evaluate(()=>window.mode={status:401});
 await page.click('#jevKeyTest');
 await page.waitForFunction(()=>/rejected/.test(document.getElementById('jevKeyStatus').textContent));
 assert.match(await text('jevKeyStatus'),/^✗ /);
 assert.match(await page.locator('#jevKeyStatus').getAttribute('class'),/\bbad\b/);
 // Only the selected provider's key fields are shown.
 assert.equal(await page.locator('#openaiKey').isVisible(),false);assert.equal(await page.locator('#ollamaEndpoint').isVisible(),false);
 await page.selectOption('#provider','openai');
 assert.equal(await page.locator('#jevKey').isVisible(),false);
 await page.fill('#openaiKey','sk-OPENAI-SECRET');
 await page.evaluate(()=>window.mode={status:402});
 await page.click('#openaiKeyTest');
 await page.waitForFunction(()=>/no credit/.test(document.getElementById('openaiKeyStatus').textContent));
 assert.equal((await page.evaluate(()=>window.fetchCalls.at(-1))).url,'https://api.openai.com/v1/decisions');
 const visible=await page.evaluate(()=>document.body.innerText);
 assert.equal(visible.includes(KEY)||visible.includes('sk-OPENAI-SECRET'),false);

 // The result is remembered for the saved key, and hidden once the key is edited.
 await page.evaluate(()=>window.mode={status:200});
 await page.selectOption('#provider','jev');
 await page.click('#jevKeyTest');
 await page.waitForFunction(()=>/Key works/.test(document.getElementById('jevKeyStatus').textContent));
 await page.click('[data-panel=feed]');await page.check('#enabled');
 await page.click('button[type=submit]');
 await page.waitForFunction(()=>/Saved/.test(document.getElementById('status').textContent));
 await open();
 assert.match(await text('jevKeyStatus'),/^✓ Key works.*Checked /);
 await page.fill('#jevKey',KEY+'x');
 assert.equal(await text('jevKeyStatus'),'');
 await page.fill('#jevKey',KEY);
 await page.click('#jevKeyTest');
 await page.waitForFunction(()=>/Key works/.test(document.getElementById('jevKeyStatus').textContent));

 // Deleting keys clears results and the stored record.
 await page.click('[data-panel=provider]');await page.locator('.cache-tools summary').click();
 await page.click('#forget');
 await page.waitForFunction(()=>/Keys deleted/.test(document.getElementById('status').textContent));
 assert.equal(await text('jevKeyStatus'),'');
 assert.equal(await page.evaluate(()=>'keyCheck' in JSON.parse(localStorage.getItem('chromeStore'))),false);
 await open();
 assert.equal(await text('jevKeyStatus'),'');
 assert.equal(await page.evaluate(()=>localStorage.getItem('chromeStore').includes('SECRET')),false);
 assert.deepEqual(pageErrors.map(e=>e.message),[]);
 console.log('PASS: settings key test (empty key, pass, failures, remembered result, edit, delete, no key shown)');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
