const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:380,height:900}});
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e));
 await page.route('https://ext.test/**',route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  const file=path.join(root,name);
  if(!name||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:types[path.extname(name)]||'text/plain',body:fs.readFileSync(file)});
 });
 await page.addInitScript(()=>{
  const read=()=>JSON.parse(localStorage.getItem('chromeStore')||'{}');
  const write=o=>localStorage.setItem('chromeStore',JSON.stringify(o));
  window.chrome={storage:{local:{get:async q=>typeof q==='string'?{[q]:read()[q]}:{...q,...read()},set:async v=>write({...read(),...v}),remove:async k=>{const d=read();delete d[k];write(d);}}}};
 });
 const open=async()=>{await page.goto('https://ext.test/options.html');await page.waitForFunction(()=>document.querySelectorAll('.cat').length>0||document.getElementById('categoryList').textContent.includes('No categories yet'));};
 const rows=()=>page.evaluate(()=>[...document.querySelectorAll('.cat')].map(r=>({id:r.dataset.id,name:r.querySelector('.cat-name').value,action:r.querySelector('.cat-action').value,threshold:r.querySelector('.cat-threshold').value,hasText:!!r.querySelector('textarea'),hasRemove:!!r.querySelector('.cat-remove')})));
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('chromeStore')||'{}'));
 const save=async(re=/Saved/)=>{await page.click('button[type=submit]');await page.waitForFunction(src=>new RegExp(src).test(document.getElementById('status').textContent),re.source);};
 const status=()=>page.locator('#catStatus').innerText();
 const row=id=>'#categories .cat[data-id='+id+'] ';

 // Fresh install: the five defaults, all alike: each has a name, action, threshold, definition and Remove.
 await open();
 let r=await rows();
 assert.deepEqual(r.map(x=>x.name),['Slop','Brainrot','Advert','Opportunity','Nourishment']);
 assert.deepEqual(r.map(x=>x.action),['hide','label','label','highlight','highlight']);
 assert.deepEqual(r.map(x=>x.threshold),['80','80','80','80','80']);
 assert.ok(r.every(x=>x.hasText&&x.hasRemove),'slop is an ordinary category');
 assert.equal(await page.locator('#rule').count(),0,'no separate slop definition field');
 assert.equal(await page.locator('#threshold, #openaiThreshold, #localThreshold').count(),0,'no per-provider thresholds');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false,'fits popup width');
 assert.match(await page.locator(row('advert')+'textarea').inputValue(),/Is this post an advert\?/);
 assert.match(await page.locator(row('slop')+'textarea').inputValue(),/Is this post AI slop\?/);

 // Add: bad input is refused with a message; a good one appears at the end, shown on the chip only.
 await page.click('#addCat');assert.match(await status(),/Give the category a name/);
 await page.fill('#newCatName','<img src=x onerror=alert(1)> Hot takes');await page.click('#addCat');assert.match(await status(),/Give the category a name/);
 await page.fill('#newCatRule','Is this post a hot take?');await page.click('#addCat');
 r=await rows();assert.equal(r.length,6);assert.equal(r[5].name,'<img src=x onerror=alert(1)> Hot takes');assert.equal(r[5].action,'label');
 assert.equal(await page.locator('#categoryList img').count(),0,'names are shown as text');
 assert.equal(await page.inputValue('#newCatName'),'');assert.match(await status(),/Added .*Press Save/);

 // Nothing is stored until Save. Then actions, thresholds, names, definitions and order persist.
 assert.deepEqual((await stored()).categories.map(c=>c.id),['slop','brainrot','advert','opportunity','nourishment'],'opening saves the migrated defaults, not the unsaved edits');
 await page.selectOption(row('advert')+'.cat-action','hide');
 await page.selectOption(row('slop')+'.cat-action','off');
 await page.fill(row('advert')+'.cat-threshold','65');
 await page.fill(row('brainrot')+'.cat-name','Brain rot');
 await page.fill(row('brainrot')+'textarea','Is this brainrot? EDITED');
 await page.fill(row('slop')+'textarea','MY SLOP RULE');
 await page.click(row('nourishment')+'.cat-up');
 assert.equal(await page.evaluate(()=>document.activeElement.className),'secondary cat-up','focus follows the moved row');
 await save();
 let st=await stored();
 assert.deepEqual(st.categories.map(c=>c.id),['slop','brainrot','advert','nourishment','opportunity','img-src-x-onerror-alert']);
 assert.deepEqual(st.categories.map(c=>c.action),['off','label','hide','highlight','highlight','label']);
 assert.equal(st.categories[2].threshold,.65);assert.equal(st.categories[1].name,'Brain rot');
 assert.equal(st.categories[0].instructions,'MY SLOP RULE');assert.equal(st.categories[1].instructions,'Is this brainrot? EDITED');
 assert.equal(st.schema,2);
 await open();
 r=await rows();assert.deepEqual(r.map(x=>x.action),['off','label','hide','highlight','highlight','label']);assert.equal(r[2].threshold,'65');
 assert.equal(await page.locator(row('brainrot')+'textarea').inputValue(),'Is this brainrot? EDITED');
 assert.equal(await page.locator(row('slop')+'.cat-up').isDisabled(),true);assert.equal(await page.locator('.cat:last-child .cat-down').isDisabled(),true);

 // Rows that would not survive saving are refused; enabling requires an active category.
 await page.fill(row('advert')+'.cat-name','');await save(/needs a name/);
 await page.fill(row('advert')+'.cat-name','Advert');await page.fill(row('advert')+'.cat-threshold','');await save(/threshold from 1 to 100/);
 await page.fill(row('advert')+'.cat-threshold','65');
 for(const id of ['brainrot','advert','nourishment','opportunity','img-src-x-onerror-alert'])await page.selectOption(row(id)+'.cat-action','off');
 await page.check('#enabled');
 await save(/at least one category/);
 assert.equal((await stored()).categories[2].action,'hide','nothing was saved');
 await open();

 // Remove any category, Slop included; Save keeps it.
 await page.click(row('slop')+'.cat-remove');await page.click(row('opportunity')+'.cat-remove');
 assert.equal((await rows()).length,4);assert.match(await status(),/Removed Opportunity/);
 await save();assert.deepEqual((await stored()).categories.map(c=>c.id),['brainrot','advert','nourishment','img-src-x-onerror-alert']);
 await open();assert.equal((await rows()).length,4);

 // Reset restores the five defaults once saved.
 await page.click('#resetCats');
 r=await rows();assert.deepEqual(r.map(x=>x.name),['Slop','Brainrot','Advert','Opportunity','Nourishment']);assert.deepEqual(r.map(x=>x.action),['hide','label','label','highlight','highlight']);
 assert.match(await page.locator(row('brainrot')+'textarea').inputValue(),/Define brainrot as/);
 await save();st=await stored();assert.equal(st.categories.length,5);assert.match(st.categories[0].instructions,/Is this post AI slop\?/);

 // The limit: adding stops at 12 categories.
 for(let i=0;i<7;i++){await page.fill('#newCatName','Extra '+i);await page.fill('#newCatRule','Is this extra '+i+'?');await page.click('#addCat');}
 assert.equal((await rows()).length,12);assert.equal(await page.locator('#addCat').isDisabled(),true);
 await page.click('.cat:last-child .cat-remove');assert.equal(await page.locator('#addCat').isDisabled(),false);

 // Duplicate names get distinct ids.
 await page.fill('#newCatName','Extra 0');await page.fill('#newCatRule','Again');await page.click('#addCat');
 const ids=(await rows()).map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);

 // An intentionally disabled filter can keep every category Off, or remove every category.
 for (const id of (await rows()).map(x=>x.id)) await page.selectOption(row(id)+'.cat-action','off');
 await page.uncheck('#enabled');await save();
 assert.ok((await stored()).categories.every(c=>c.action==='off'));
 await open();assert.ok((await rows()).every(c=>c.action==='off'),'all-Off survives reload');
 await page.check('#enabled');await save(/at least one category/);
 assert.equal((await stored()).enabled,false,'a refused enable preserves disabled state');
 await page.uncheck('#enabled');
 while(await page.locator('.cat-remove').count()) await page.locator('.cat-remove').first().click();
 await save();assert.deepEqual((await stored()).categories,[]);
 await open();assert.equal((await rows()).length,0,'saved empty rows never silently return');
 assert.match(await page.locator('#categoryList').innerText(),/No categories yet/);
 await page.check('#enabled');await save(/at least one category/);
 assert.deepEqual((await stored()).categories,[]);assert.equal((await stored()).enabled,false);
 await page.uncheck('#enabled');await page.click('#resetCats');await save();await open();
 assert.equal((await rows()).length,5,'restoring defaults is explicit');
 assert.deepEqual(pageErrors.map(e=>e.message),[]);
 console.log('PASS: category settings (defaults, slop is ordinary, add with validation, text-only names, action, threshold, rename, reorder, edit, refuse invalid rows, remove, reset, limit, ids, persistence)');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
