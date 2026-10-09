const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://ext.test/**',r=>{const f=path.join(root,new URL(r.request().url()).pathname.slice(1));return fs.existsSync(f)&&fs.statSync(f).isFile()?r.fulfill({contentType:types[path.extname(f)]||'text/plain',body:fs.readFileSync(f)}):r.fulfill({status:404,body:''});});
 await page.addInitScript(()=>{
  if(!localStorage.getItem('s'))localStorage.setItem('s',JSON.stringify({'cache:a':{p:.1,t:1},'cache:b':{p:.9,t:1},jevKey:'keep-me',threshold:.8}));
  const rd=()=>JSON.parse(localStorage.getItem('s')),wr=o=>localStorage.setItem('s',JSON.stringify(o));
  window.chrome={storage:{local:{get:async q=>q===null?rd():typeof q==='string'?{[q]:rd()[q]}:{...q,...rd()},set:async v=>wr({...rd(),...v}),remove:async k=>{const d=rd();for(const x of [].concat(k))delete d[x];wr(d);}}}};
 });
 await page.goto('https://ext.test/options.html');
 await page.waitForFunction(()=>document.getElementById('threshold').value!=='');
 await page.click('#clearCache');
 await page.waitForFunction(()=>/Cleared 2 cached scores/.test(document.getElementById('cacheStatus').textContent));
 const left=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('s'))).sort());
 assert.deepEqual(left,['jevKey','threshold'],'only cache entries are removed');
 await page.click('#clearCache');
 await page.waitForFunction(()=>/Cleared 0 cached scores/.test(document.getElementById('cacheStatus').textContent));
 assert.deepEqual(errors,[]);
 console.log('PASS: clear score cache removes only cache entries');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
