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
 const open=async()=>{await page.goto('https://ext.test/options.html');await page.waitForFunction(()=>document.getElementById('threshold').value!==''&&document.querySelectorAll('.cat').length>0);};
 const rows=()=>page.evaluate(()=>[...document.querySelectorAll('.cat')].map(r=>({id:r.dataset.id,name:r.querySelector('.cat-name').textContent,fold:r.querySelector('.cat-fold input').checked,hasText:!!r.querySelector('textarea'),hasRemove:!!r.querySelector('.cat-remove')})));
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('chromeStore')||'{}'));
 const save=async()=>{await page.click('button[type=submit]');await page.waitForFunction(()=>/Saved/.test(document.getElementById('status').textContent));};
 const status=()=>page.locator('#catStatus').innerText();

 // Fresh install: the five defaults, only Slop folding, Slop has no separate definition box.
 await open();
 let r=await rows();
 assert.deepEqual(r.map(x=>x.name),['Slop','Brainrot','Advert','Opportunity','Nourishment']);
 assert.deepEqual(r.map(x=>x.fold),[true,false,false,false,false]);
 assert.deepEqual(r.map(x=>x.hasText),[false,true,true,true,true]);
 assert.deepEqual(r.map(x=>x.hasRemove),[false,true,true,true,true]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false,'fits popup width');
 assert.match(await page.locator('#categories .cat[data-id=advert] textarea').inputValue(),/Is this post an advert\?/);

 // Add: bad input is refused with a message; a good one appears at the end, not folding.
 await page.click('#addCat');assert.match(await status(),/Give the category a name/);
 await page.fill('#newCatName','<img src=x onerror=alert(1)> Hot takes');await page.click('#addCat');assert.match(await status(),/Give the category a name/);
 await page.fill('#newCatRule','Is this post a hot take?');await page.click('#addCat');
 r=await rows();assert.equal(r.length,6);assert.equal(r[5].name,'<img src=x onerror=alert(1)> Hot takes');assert.equal(r[5].fold,false);
 assert.equal(await page.locator('#categoryList img').count(),0,'names are shown as text');
 assert.equal(await page.inputValue('#newCatName'),'');assert.match(await status(),/Added .*Press Save/);

 // Nothing is stored until Save. Then folding choices and edited definitions persist.
 assert.equal('categories' in await stored(),false);
 await page.check('#categories .cat[data-id=advert] .cat-fold input');
 await page.uncheck('#categories .cat[data-id=slop] .cat-fold input');
 await page.fill('#categories .cat[data-id=brainrot] textarea','Is this brainrot? EDITED');
 await page.fill('#rule','MY SLOP RULE');
 await save();
 let st=await stored();
 assert.deepEqual(st.categories.map(c=>c.id),['slop','brainrot','advert','opportunity','nourishment','img-src-x-onerror-alert']);
 assert.deepEqual(st.categories.map(c=>c.fold),[false,false,true,false,false,false]);
 assert.equal(st.categories[0].instructions,'MY SLOP RULE','slop takes its definition from the rule field');
 assert.equal(st.categories[1].instructions,'Is this brainrot? EDITED');
 await open();
 r=await rows();assert.deepEqual(r.map(x=>x.fold),[false,false,true,false,false,false]);
 assert.equal(await page.locator('#categories .cat[data-id=brainrot] textarea').inputValue(),'Is this brainrot? EDITED');

 // Remove a custom and a default category; Save keeps it; Slop cannot be removed.
 await page.click('.cat[data-id=opportunity] .cat-remove');
 assert.equal((await rows()).length,5);assert.match(await status(),/Removed Opportunity/);
 await save();assert.equal((await stored()).categories.some(c=>c.id==='opportunity'),false);
 await open();assert.equal((await rows()).length,5);
 assert.equal(await page.locator('.cat[data-id=slop] .cat-remove').count(),0);

 // Reset restores the five defaults (Slop keeps the rule field's text) once saved.
 await page.click('#resetCats');
 r=await rows();assert.deepEqual(r.map(x=>x.name),['Slop','Brainrot','Advert','Opportunity','Nourishment']);assert.deepEqual(r.map(x=>x.fold),[true,false,false,false,false]);
 assert.match(await page.locator('.cat[data-id=brainrot] textarea').inputValue(),/Define brainrot as/);
 await save();st=await stored();assert.equal(st.categories.length,5);assert.equal(st.categories[0].instructions,'MY SLOP RULE');

 // The limit: adding stops at 12 categories.
 for(let i=0;i<7;i++){await page.fill('#newCatName','Extra '+i);await page.fill('#newCatRule','Is this extra '+i+'?');await page.click('#addCat');}
 assert.equal((await rows()).length,12);assert.equal(await page.locator('#addCat').isDisabled(),true);
 await page.click('.cat:last-child .cat-remove');assert.equal(await page.locator('#addCat').isDisabled(),false);

 // Duplicate names get distinct ids.
 await page.fill('#newCatName','Extra 0');await page.fill('#newCatRule','Again');await page.click('#addCat');
 const ids=(await rows()).map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
 assert.deepEqual(pageErrors.map(e=>e.message),[]);
 console.log('PASS: category settings (defaults, add with validation, text-only names, fold choice, edit, remove, reset, limit, ids, persistence)');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
