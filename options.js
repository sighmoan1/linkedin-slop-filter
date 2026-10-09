import {DEFAULTS,requestFor,thresholdFor} from "./core.mjs";
const s=await chrome.storage.local.get(DEFAULTS);
for (const id of Object.keys(DEFAULTS)) {
  const el=document.getElementById(id);
  if (id==="enabled") el.checked=s[id];
  else el.value=id.endsWith("Threshold") || id==="threshold" ? (s[id] ?? s.threshold)*100 : s[id];
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
document.getElementById("settings").addEventListener("submit",async event=>{
  event.preventDefault();
  const next={};
  for (const id of Object.keys(DEFAULTS)) next[id]=document.getElementById(id).value.trim();
  next.enabled=document.getElementById("enabled").checked;
  for (const id of ["threshold","openaiThreshold","localThreshold"]) next[id]=Number(next[id])/100;
  next.limit=Number(next.limit);
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
  document.getElementById("jevKey").value="";document.getElementById("openaiKey").value="";document.getElementById("enabled").checked=false;
  document.getElementById("status").textContent="Keys deleted. Filtering disabled.";
});
