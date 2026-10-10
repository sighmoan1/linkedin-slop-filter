import {DEFAULTS, DEFAULT_CATEGORIES, MAX_CATEGORIES, ACTIONS, loadSettings, normalizeCategories, activeCategories, makeCategory, KEY_FIELDS, PROVIDER_NAMES, verifyKey, keyFingerprint, CACHE_PREFIX, requestFor} from "./core.mjs";
const FIELDS=["enabled","provider","jevKey","openaiKey","ollamaEndpoint","ollamaModel","limit"];
const ACTION_LABELS={hide:"Hide",highlight:"Highlight",label:"Show on chip",off:"Off"};
const $=id=>document.getElementById(id);
const s=await loadSettings(chrome.storage.local);
for (const id of FIELDS) {
  if (id==="enabled") $(id).checked=s[id];
  else $(id).value=s[id];
}
// Only the selected provider's fields are shown; the others keep their values.
const updateProvider=()=>{
  const provider=$("provider").value;
  for (const name of ["jev","openai","ollama"]) $(name+"-settings").hidden=name!==provider;
  for (const id of ["ollamaEndpoint","ollamaModel"]) $(id).disabled=provider!=="ollama";
};
$("provider").addEventListener("change",updateProvider);
updateProvider();
const err=(await chrome.storage.local.get("lastError")).lastError;
$("error").textContent=err || "";

// Key testing: checks the key as typed (saved or not) with one tiny real request.
const getChecks=async()=>(await chrome.storage.local.get({keyCheck:{}})).keyCheck;
function showCheck(provider,result,at){
  const status=$(KEY_FIELDS[provider]+"Status");
  const mark=result.ok?"✓ ":"✗ ";
  status.textContent=mark+result.message+(at?" Checked "+new Date(at).toLocaleString()+".":"");
  status.className="key-status "+(result.ok?"ok":"bad");
}
function clearCheck(provider,text=""){
  const status=$(KEY_FIELDS[provider]+"Status");
  status.textContent=text;status.className="key-status";
}
const saved=await getChecks();
for (const provider of Object.keys(KEY_FIELDS)) {
  const input=$(KEY_FIELDS[provider]);
  const button=$(KEY_FIELDS[provider]+"Test");
  const last=saved[provider];
  // Only show a remembered result while the key it was for is still the one entered.
  if (last && input.value.trim() && last.fp === await keyFingerprint(input.value.trim())) showCheck(provider,last,last.at);
  input.addEventListener("input",()=>clearCheck(provider));
  button.addEventListener("click",async()=>{
    const key=input.value.trim();
    if (!key) {showCheck(provider,{ok:false,message:"Enter your "+PROVIDER_NAMES[provider]+" key first."});return;}
    button.disabled=true;clearCheck(provider,"Testing…");
    const result=await verifyKey(provider,key);
    if (input.value.trim() === key) {
      const checks=await getChecks();
      checks[provider]={ok:result.ok,code:result.code,message:result.message,at:Date.now(),fp:await keyFingerprint(key)};
      await chrome.storage.local.set({keyCheck:checks});
      showCheck(provider,result,checks[provider].at);
    } else clearCheck(provider);
    button.disabled=false;
  });
}

// Categories: edited in memory, written with the rest of the settings when Save is pressed.
let cats=s.categories.map(c=>({...c}));
const listEl=$("categoryList"), catStatus=$("catStatus");
const el=(tag,props={},...children)=>{const e=Object.assign(document.createElement(tag),props);e.append(...children);return e;};
function move(c,step){
  const i=cats.indexOf(c), j=i+step;
  if (j<0||j>=cats.length) return;
  [cats[i],cats[j]]=[cats[j],cats[i]];renderCats();
  listEl.querySelector(`.cat[data-id="${c.id}"] .cat-${step<0?"up":"down"}`)?.focus();
}
function renderCats(){
  listEl.replaceChildren();
  cats.forEach((c,i)=>{
    const row=el("div",{className:"cat"});row.dataset.id=c.id;
    const name=el("input",{className:"cat-name",value:c.name,maxLength:40});name.setAttribute("aria-label","Category name");
    name.addEventListener("input",()=>{c.name=name.value;});
    const action=el("select",{className:"cat-action"},...ACTIONS.map(a=>el("option",{value:a,textContent:ACTION_LABELS[a]})));
    action.value=c.action;action.setAttribute("aria-label",c.name+" action");
    action.addEventListener("change",()=>{c.action=action.value;});
    const threshold=el("input",{className:"cat-threshold",type:"number",min:1,max:100,step:1,required:true,value:Math.round(c.threshold*100)});
    threshold.setAttribute("aria-label",c.name+" threshold (%)");
    threshold.addEventListener("input",()=>{c.threshold=Number(threshold.value)/100;});
    const up=el("button",{type:"button",className:"secondary cat-up",textContent:"↑",disabled:i===0});up.setAttribute("aria-label","Move "+c.name+" up");
    const down=el("button",{type:"button",className:"secondary cat-down",textContent:"↓",disabled:i===cats.length-1});down.setAttribute("aria-label","Move "+c.name+" down");
    up.addEventListener("click",()=>move(c,-1));down.addEventListener("click",()=>move(c,1));
    const remove=el("button",{type:"button",className:"secondary cat-remove",textContent:"Remove"});remove.setAttribute("aria-label","Remove "+c.name);
    remove.addEventListener("click",()=>{cats=cats.filter(x=>x!==c);catStatus.textContent="Removed "+c.name+". Press Save settings to keep this.";renderCats();});
    const text=el("textarea",{rows:4,maxLength:2000,value:c.instructions});text.setAttribute("aria-label",c.name+" definition");
    text.addEventListener("input",()=>{c.instructions=text.value;});
    row.append(
      el("div",{className:"cat-head"},name,el("span",{className:"cat-order"},up,down),remove),
      el("div",{className:"cat-rule"},el("label",{className:"inline"},"When ",action),el("label",{className:"inline"},"above ",threshold,"%")),
      text);
    listEl.append(row);
  });
  $("addCat").disabled=cats.length>=MAX_CATEGORIES;
}
renderCats();
$("addCat").addEventListener("click",()=>{
  const nameEl=$("newCatName"), ruleBox=$("newCatRule");
  const made=makeCategory(nameEl.value,ruleBox.value,cats);
  if (!made) {catStatus.textContent="Give the category a name (up to 40 characters) and say what counts (up to 2,000).";return;}
  cats=[...cats,made];nameEl.value="";ruleBox.value="";
  catStatus.textContent="Added "+made.name+". Press Save settings to keep this.";renderCats();
});
$("resetCats").addEventListener("click",()=>{
  cats=DEFAULT_CATEGORIES.map(c=>({...c}));
  catStatus.textContent="Categories reset to the five defaults. Press Save settings to keep this.";renderCats();
});
$("settings").addEventListener("submit",async event=>{
  event.preventDefault();
  const status=$("status");
  const next={};
  for (const id of FIELDS) next[id]=id==="enabled"?$(id).checked:$(id).value.trim();
  next.limit=Number(next.limit);
  // Every row must survive validation, otherwise saving would silently drop it.
  const bad=cats.find(c=>!c.name.trim()||!c.instructions.trim()||!(c.threshold>=0.01&&c.threshold<=1));
  if (bad) {status.textContent="Each category needs a name, a definition and a threshold from 1 to 100%.";return;}
  next.categories=normalizeCategories(cats);
  if (next.enabled && !activeCategories(next.categories).length) {status.textContent="Switch at least one category on.";return;}
  if (next.enabled && next.provider!=="ollama" && !(next.provider==="jev" ? next.jevKey : next.openaiKey)) {
    status.textContent="Add a key for the selected provider first.";return;
  }
  try {if (next.enabled) requestFor(next,"Settings validation");}
  catch (error) {status.textContent=error.message;return;}
  await chrome.storage.local.set({...next,schema:DEFAULTS.schema});
  // An old error may not apply to the new settings.
  await chrome.storage.local.remove("lastError");$("error").textContent="";
  status.textContent="Saved. Open feeds pick up the change within a few seconds.";
});
$("forget").addEventListener("click",async()=>{
  await chrome.storage.local.set({enabled:false,jevKey:"",openaiKey:""});
  await chrome.storage.local.remove("keyCheck");
  for (const provider of Object.keys(KEY_FIELDS)) clearCheck(provider);
  $("jevKey").value="";$("openaiKey").value="";$("enabled").checked=false;
  $("status").textContent="Keys deleted. Filtering disabled.";
});
$("clearCache").addEventListener("click",async()=>{
  const keys=Object.keys(await chrome.storage.local.get(null)).filter(k=>k.startsWith(CACHE_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  const sessionKeys=(chrome.storage.session ? Object.keys(await chrome.storage.session.get(null)) : []).filter(k=>k.startsWith(CACHE_PREFIX));
  if (sessionKeys.length) await chrome.storage.session.remove(sessionKeys);
  const count=keys.length+sessionKeys.length;
  $("cacheStatus").textContent="Cleared "+count+" cached score"+(count===1?"":"s")+". Open feeds rescore as you scroll.";
});
