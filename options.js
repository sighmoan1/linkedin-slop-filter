import {DEFAULTS, KEY_FIELDS, PROVIDER_NAMES, verifyKey, keyFingerprint, CACHE_PREFIX} from "./core.mjs";
const s=await chrome.storage.local.get(DEFAULTS);
for (const id of Object.keys(DEFAULTS)) {
  const el=document.getElementById(id);
  if (id==="enabled") el.checked=s[id];
  else el.value=id==="threshold" ? s[id]*100 : s[id];
}
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
document.getElementById("settings").addEventListener("submit",async event=>{
  event.preventDefault();
  const next={};
  for (const id of Object.keys(DEFAULTS)) next[id]=document.getElementById(id).value.trim();
  next.enabled=document.getElementById("enabled").checked;
  next.threshold=Number(next.threshold)/100;next.limit=Number(next.limit);
  if (next.enabled && !(next.provider==="jev" ? next.jevKey : next.openaiKey)) {
    document.getElementById("status").textContent="Add a key for the selected provider first.";return;
  }
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
  document.getElementById("cacheStatus").textContent="Cleared "+keys.length+" cached score"+(keys.length===1?"":"s")+". Reload your feed to rescore.";
});
