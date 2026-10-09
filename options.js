import {DEFAULTS, DEFAULT_CATEGORIES, MAX_CATEGORIES, normalizeCategories, makeCategory, KEY_FIELDS, PROVIDER_NAMES, verifyKey, keyFingerprint, CACHE_PREFIX,requestFor,thresholdFor} from "./core.mjs";
const s=await chrome.storage.local.get({...DEFAULTS, categories:null});
for (const id of Object.keys(DEFAULTS)) {
  const el=document.getElementById(id);
  if (id==="enabled") el.checked=s[id];
  else el.value=(id.endsWith("Threshold") || id==="threshold") ? (s[id] ?? s.threshold)*100 : s[id];
}
const updateProvider=()=>{
  const local=document.getElementById("provider").value==="ollama";
  document.getElementById("local-settings").hidden=!local;
  for (const id of ["ollamaEndpoint","ollamaModel"]) document.getElementById(id).disabled=!local;
};
document.getElementById("provider").addEventListener("change",updateProvider);
updateProvider();
const err=(await chrome.storage.local.get("lastError")).lastError;
document.getElementById("error").textContent=err || "";

// Key testing: checks the key as typed (saved or not) with one tiny real request.
const getChecks=async()=>(await chrome.storage.local.get({keyCheck:{}})).keyCheck;
function showCheck(provider,result,at){
  const status=document.getElementById(KEY_FIELDS[provider]+"Status");
  const mark=result.ok?"✓ ":"✗ ";
  status.textContent=mark+result.message+(at?" Checked "+new Date(at).toLocaleString()+".":"");
  status.className="key-status "+(result.ok?"ok":"bad");
}
function clearCheck(provider,text=""){
  const status=document.getElementById(KEY_FIELDS[provider]+"Status");
  status.textContent=text;status.className="key-status";
}
const saved=await getChecks();
for (const provider of Object.keys(KEY_FIELDS)) {
  const input=document.getElementById(KEY_FIELDS[provider]);
  const button=document.getElementById(KEY_FIELDS[provider]+"Test");
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
let cats=normalizeCategories(s.categories ?? DEFAULT_CATEGORIES, s.rule);
const listEl=document.getElementById("categoryList"), catStatus=document.getElementById("catStatus");
const ruleEl=document.getElementById("rule");
function renderCats(){
  listEl.replaceChildren();
  for (const c of cats) {
    const row=document.createElement("div");row.className="cat";row.dataset.id=c.id;
    const head=document.createElement("div");head.className="cat-head";
    const name=document.createElement("span");name.className="cat-name";name.textContent=c.name;
    const foldLabel=document.createElement("label");foldLabel.className="cat-fold";
    const fold=document.createElement("input");fold.type="checkbox";fold.checked=!!c.fold;
    fold.addEventListener("change",()=>{c.fold=fold.checked;});
    foldLabel.append(fold," Fold");
    head.append(name,foldLabel);
    row.append(head);
    if (c.id==="slop") {
      const note=document.createElement("p");note.className="note";note.textContent="Slop is always scored. Edit its definition in the field above.";row.append(note);
    } else {
      const text=document.createElement("textarea");text.rows=4;text.maxLength=2000;text.value=c.instructions;text.setAttribute("aria-label",c.name+" definition");
      text.addEventListener("input",()=>{c.instructions=text.value;});
      const remove=document.createElement("button");remove.type="button";remove.className="secondary cat-remove";remove.textContent="Remove";remove.setAttribute("aria-label","Remove "+c.name);
      remove.addEventListener("click",()=>{cats=cats.filter(x=>x!==c);catStatus.textContent="Removed "+c.name+". Press Save settings to keep this.";renderCats();});
      head.append(remove);row.append(text);
    }
    listEl.append(row);
  }
  document.getElementById("addCat").disabled=cats.length>=MAX_CATEGORIES;
}
renderCats();
document.getElementById("addCat").addEventListener("click",()=>{
  const nameEl=document.getElementById("newCatName"), ruleBox=document.getElementById("newCatRule");
  const made=makeCategory(nameEl.value,ruleBox.value,cats);
  if (!made) {catStatus.textContent="Give the category a name (up to 40 characters) and say what counts (up to 2,000).";return;}
  cats=[...cats,made];nameEl.value="";ruleBox.value="";
  catStatus.textContent="Added "+made.name+". Press Save settings to keep this.";renderCats();
});
document.getElementById("resetCats").addEventListener("click",()=>{
  cats=normalizeCategories(DEFAULT_CATEGORIES.map(c=>({...c})),ruleEl.value.trim()||DEFAULTS.rule);
  catStatus.textContent="Categories reset to the five defaults. Press Save settings to keep this.";renderCats();
});
document.getElementById("settings").addEventListener("submit",async event=>{
  event.preventDefault();
  const next={};
  for (const id of Object.keys(DEFAULTS)) next[id]=document.getElementById(id).value.trim();
  next.enabled=document.getElementById("enabled").checked;
  for (const id of ["threshold","openaiThreshold","localThreshold"]) next[id]=Number(next[id])/100;next.limit=Number(next.limit);
  next.categories=normalizeCategories(cats,next.rule);
  if (next.enabled && next.provider!=="ollama" && !(next.provider==="jev" ? next.jevKey : next.openaiKey)) {
    document.getElementById("status").textContent="Add a key for the selected provider first.";return;
  }
  try {thresholdFor(next);if(next.enabled) requestFor(next,"Settings validation");}
  catch (error) {document.getElementById("status").textContent=error.message;return;}
  await chrome.storage.local.set(next);
  document.getElementById("status").textContent="Saved. Reload your LinkedIn feed to reclassify with changed rules or provider.";
});
document.getElementById("forget").addEventListener("click",async()=>{
  await chrome.storage.local.set({enabled:false,jevKey:"",openaiKey:""});
  await chrome.storage.local.remove("keyCheck");
  for (const provider of Object.keys(KEY_FIELDS)) clearCheck(provider);
  document.getElementById("jevKey").value="";document.getElementById("openaiKey").value="";document.getElementById("enabled").checked=false;
  document.getElementById("status").textContent="Keys deleted. Filtering disabled.";
});
document.getElementById("clearCache").addEventListener("click",async()=>{
  const keys=Object.keys(await chrome.storage.local.get(null)).filter(k=>k.startsWith(CACHE_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  const sessionKeys=(chrome.storage.session ? Object.keys(await chrome.storage.session.get(null)) : []).filter(k=>k.startsWith(CACHE_PREFIX));
  if (sessionKeys.length) await chrome.storage.session.remove(sessionKeys);
  const count=keys.length+sessionKeys.length;
  document.getElementById("cacheStatus").textContent="Cleared "+count+" cached score"+(count===1?"":"s")+". Reload your feed to rescore.";
});
