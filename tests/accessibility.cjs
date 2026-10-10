const assert=require('node:assert/strict');
const axe=require('axe-core');

async function audit(page,context='body') {
 if(!await page.evaluate(()=>!!window.axe))await page.addScriptTag({content:axe.source});
 const violations=await page.evaluate(async context=>(await axe.run(context,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),context);
 assert.deepEqual(violations,[],`WCAG A/AA failures on ${page.url()}`);
}

async function controlContrast(locator) {
 const appearance=await locator.evaluate(e=>{
  const rgb=s=>s.match(/[\d.]+/g).map(Number);
  const luminance=s=>rgb(s).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  let surface=e;while(getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)'&&surface.parentElement)surface=surface.parentElement;
  const style=getComputedStyle(e),front=luminance(style.color),back=luminance(getComputedStyle(surface).backgroundColor);
  return {ratio:(Math.max(front,back)+.05)/(Math.min(front,back)+.05),outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)};
 });
 assert(appearance.ratio>=4.5,`Control text contrast ${appearance.ratio.toFixed(2)} must be at least 4.5:1`);
 return appearance;
}

async function controlStates(page,selector) {
 for(const control of await page.locator(selector).all()){
  if(!await control.isVisible()||!await control.isEnabled())continue;
  await page.mouse.move(0,0);await controlContrast(control);
  await control.hover();await controlContrast(control);
  await page.mouse.down();try{await controlContrast(control);}finally{await page.mouse.move(0,0);await page.mouse.up();}
  await page.keyboard.press('Tab');await control.focus();
  const appearance=await controlContrast(control);
  assert(appearance.outline!=='none'&&appearance.outlineWidth>=2,'keyboard focus has a visible outline');
 }
}

async function textSpacing(page,selector='body') {
 const style=await page.addStyleTag({content:`${selector}, ${selector} * {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} ${selector} p {margin-bottom:2em!important}`});
 try {
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'text spacing does not require horizontal scrolling');
  for(const button of await page.locator(`${selector} button`).all())if(await button.isVisible())assert(await button.evaluate(e=>e.scrollWidth<=e.clientWidth+2&&e.scrollHeight<=e.clientHeight+2),'button text remains available with WCAG text spacing');
 } finally {await style.evaluate(e=>e.remove());}
}

module.exports={audit,controlStates,textSpacing};
