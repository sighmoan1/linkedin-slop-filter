import {DEFAULTS, CACHE_PREFIX} from "./core.mjs";
const s=await chrome.storage.local.get(DEFAULTS);
for (const id of Object.keys(DEFAULTS)) {
  const el=document.getElementById(id);
  if (id==="enabled") el.checked=s[id];
  else el.value=id==="threshold" ? s[id]*100 : s[id];
}
const err=(await chrome.storage.local.get("lastError")).lastError;
document.getElementById("error").textContent=err || "";
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
  document.getElementById("jevKey").value="";document.getElementById("openaiKey").value="";document.getElementById("enabled").checked=false;
  document.getElementById("status").textContent="Keys deleted. Filtering disabled.";
});
document.getElementById("clearCache").addEventListener("click",async()=>{
  const keys=Object.keys(await chrome.storage.local.get(null)).filter(k=>k.startsWith(CACHE_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  document.getElementById("cacheStatus").textContent="Cleared "+keys.length+" cached score"+(keys.length===1?"":"s")+". Reload your feed to rescore.";
});
