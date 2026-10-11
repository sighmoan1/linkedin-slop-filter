import {loadSettings, activeCategories, requestFor, isFeedUrl} from "./core.mjs";
const $=id=>document.getElementById(id);
let settings=await loadSettings(chrome.storage.local), appearance={theme:"native",groupHidden:false,labels:"matches"}, showEverything=false, tabId, activeTabId, knownOtherTab=false, feedPosts=null, experienceAvailable=false, revealPending=false;
let resetPending=false;
const status=message=>{$("popupStatus").textContent=message;};
async function send(message){
  if (!chrome.runtime?.sendMessage) throw new Error("The extension is unavailable. Reopen the popup or reload the extension.");
  const result=await chrome.runtime.sendMessage(message);
  if (!result || result.error) throw new Error(result?.error||"The extension is unavailable. Reopen the popup or reload the extension.");
  return result;
}
function renderFiltering(){
  $("enabled").checked=settings.enabled;
  renderExperience();
}
function renderExperience(){
  $("feedConnection").textContent=Number.isInteger(tabId)?feedPosts===null?"Feed connected.":feedPosts?"Feed connected · "+feedPosts+" "+(feedPosts===1?"post found.":"posts found."):"Feed connected. Waiting for readable posts.":"Feed not connected. Open LinkedIn’s feed and reload it if controls are missing.";
  $("reloadFeed").hidden=Number.isInteger(tabId)||!Number.isInteger(activeTabId)||knownOtherTab;
  $("filteringStatus").textContent=settings.enabled?(showEverything?"On · this tab shows everything":"On · post rules apply"):"Paused · all posts stay visible";
  $("showEverything").textContent=showEverything?"Restore filtering":"Show everything";
  $("showEverything").setAttribute("aria-pressed",String(showEverything));
  $("showEverything").disabled=!experienceAvailable||!Number.isInteger(tabId)||!settings.enabled||revealPending;
  $("revealNote").textContent=!experienceAvailable?"Feed controls are unavailable. Reopen the popup or reload the extension.":!Number.isInteger(tabId)?"Open this popup from your LinkedIn feed after reloading it.":!settings.enabled?"All posts are already visible while filtering is paused.":showEverything?"All posts visible. Your rules stay saved.":"Temporarily shows every post.";
}
function renderUsage(usage){
  for (const key of ["requests","folded","cacheHits"]) $(key).textContent=Number.isFinite(usage[key])?usage[key].toLocaleString():"—";
  $("requestLimit").textContent=Number.isFinite(usage.limit)?"/ "+usage.limit.toLocaleString():"";
  $("usageNote").textContent=usage.requests>=usage.limit?"Session limit reached. New posts stay visible.":"Cloud providers charge your API account.";
  $("serviceIssue").hidden=!usage.lastError;
  $("lastError").textContent=typeof usage.lastError==="string"?usage.lastError:"";
}
async function refresh(){
  try {
    const experience=await send({type:"experience",...(Number.isInteger(tabId)?{tabId}:{})});
    appearance=experience.appearance;showEverything=experience.showEverything===true;experienceAvailable=true;renderExperience();
  } catch {
    experienceAvailable=false;renderExperience();
  }
  try {
    renderUsage(await send({type:"usage"}));$("resetUsage").disabled=resetPending;
  } catch {$("usageNote").textContent="Session usage is unavailable. Reopen the popup or reload the extension.";$("resetUsage").disabled=true;}
}
renderFiltering();
$("usageProvider").textContent={jev:"Jev",openai:"OpenAI",ollama:"Local Ollama"}[settings.provider]||"";
try {
  const tab=(await chrome.tabs?.query({active:true,currentWindow:true}))?.[0];
  if(Number.isInteger(tab?.id)) {
    activeTabId=tab.id;knownOtherTab=!!tab.url&&!isFeedUrl(tab.url);
    if(!tab.url||isFeedUrl(tab.url)) {
      const reply=await chrome.tabs?.sendMessage?.(tab.id,{type:"feedStatus"});
      if(reply?.isFeed===true){tabId=tab.id;feedPosts=Number.isInteger(reply.posts)&&reply.posts>=0?reply.posts:null;}
    }
  }
} catch {}
await refresh();
$("reloadFeed").addEventListener("click",async()=>{
  if(!Number.isInteger(activeTabId)||knownOtherTab)return;
  $("reloadFeed").disabled=true;
  try{await chrome.tabs.reload(activeTabId);status("Tab reloaded. Reopen this popup when the feed finishes loading.");}
  catch{status("Could not reload this tab. Use your browser’s Reload button on the LinkedIn feed.");}
  finally{$("reloadFeed").disabled=false;}
});
$("enabled").addEventListener("change",async()=>{
  const next=$("enabled").checked;
  try {
    if (next) {
      if (!activeCategories(settings.categories).length) throw new Error("Open Post rules in settings and choose an action other than Off for at least one category.");
      if (settings.provider!=="ollama" && !(settings.provider==="jev"?settings.jevKey:settings.openaiKey)) throw new Error("Add a provider key in full settings first.");
      requestFor(settings,"Settings validation");
    }
    await chrome.storage.local.set({enabled:next});settings.enabled=next;renderFiltering();status(next?(showEverything?"Filtering enabled. This tab is still showing everything.":"Filtering enabled."):"Filtering paused. All posts stay visible.");
  } catch(error) {renderFiltering();status(error.message);}
});
$("showEverything").addEventListener("click",async()=>{
  if(!experienceAvailable||!Number.isInteger(tabId)||!settings.enabled||revealPending)return;
  revealPending=true;renderExperience();
  try {const result=await send({type:"showEverything",value:!showEverything,tabId});appearance=result.appearance;showEverything=result.showEverything===true;renderExperience();status(showEverything?"Showing everything in this tab.":"Post rules restored in this tab.");}
  catch(error){status(error.message);}
  finally {revealPending=false;renderExperience();}
});
$("resetUsage").addEventListener("click",async()=>{
  if(resetPending)return;
  resetPending=true;$("resetUsage").disabled=true;status("Resetting counters…");
  try {renderUsage(await send({type:"resetUsage"}));status("Session counters reset.");}
  catch(error){status(error.message);}
  finally {resetPending=false;$("resetUsage").disabled=false;}
});
$("openSettings").addEventListener("click",()=>chrome.runtime.openOptionsPage());
