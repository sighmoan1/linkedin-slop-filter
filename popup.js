import {loadSettings, activeCategories, requestFor} from "./core.mjs";
const $=id=>document.getElementById(id);
const THEME_IDS=["native","punchy","reader"];
let settings=await loadSettings(chrome.storage.local), appearance={theme:"native",groupHidden:false,labels:"matches"}, showEverything=false, tabId, experienceAvailable=false, revealPending=false;
const status=message=>{$("popupStatus").textContent=message;};
async function send(message){
  if (!chrome.runtime?.sendMessage) throw new Error("Extension service unavailable.");
  const result=await chrome.runtime.sendMessage(message);
  if (!result || result.error) throw new Error(result?.error||"Extension service unavailable.");
  return result;
}
function renderFiltering(){
  $("enabled").checked=settings.enabled;
  renderExperience();
}
function renderExperience(){
  $("filteringStatus").textContent=settings.enabled?(showEverything?"On · this tab shows everything":"On · category rules apply"):"Paused · all posts stay visible";
  for (const input of document.querySelectorAll('input[name="theme"]')) input.checked=input.value===appearance.theme;
  $("showEverything").textContent=showEverything?"Restore filtering":"Show everything";
  $("showEverything").setAttribute("aria-pressed",String(showEverything));
  $("showEverything").disabled=!experienceAvailable||!Number.isInteger(tabId)||!settings.enabled||revealPending;
  $("revealNote").textContent=!experienceAvailable?"Feed controls are unavailable. Reopen the popup or reload the extension.":!Number.isInteger(tabId)?"Open this popup from your LinkedIn feed to temporarily show hidden posts.":!settings.enabled?"Filtering is paused, so all posts are already visible. Resume filtering to use this tab control.":showEverything?"Hidden posts are visible in this tab. Your saved rules are unchanged.":"Temporarily reveal hidden posts in this tab. Saved rules stay the same.";
}
async function refresh(){
  try {
    const experience=await send({type:"experience",...(Number.isInteger(tabId)?{tabId}:{})});
    appearance=experience.appearance;showEverything=experience.showEverything===true;experienceAvailable=true;renderExperience();
  } catch {
    experienceAvailable=false;renderExperience();
    for (const input of document.querySelectorAll('input[name="theme"]')) input.disabled=true;
  }
  try {
    const usage=await send({type:"usage"});
    for (const key of ["requests","folded","cacheHits"]) $(key).textContent=Number.isFinite(usage[key])?usage[key].toLocaleString():"—";
    $("requestLimit").textContent=Number.isFinite(usage.limit)?"/ "+usage.limit.toLocaleString():"";
    $("usageNote").textContent=usage.requests>=usage.limit?"Session limit reached. New posts stay visible.":"Cached scores save repeat requests. Cloud API usage is billed separately.";
    $("serviceIssue").hidden=!usage.lastError;
    $("lastError").textContent=typeof usage.lastError==="string"?usage.lastError:"";
  } catch {$("usageNote").textContent="Session usage is unavailable. Reopen the popup or reload the extension.";}
}
renderFiltering();
$("usageProvider").textContent={jev:"Jev",openai:"OpenAI",ollama:"Local Ollama"}[settings.provider]||"";
try {
  const tab=(await chrome.tabs?.query({active:true,currentWindow:true}))?.[0];
  if(Number.isInteger(tab?.id)) {
    if(tab.url) {
      const url=new URL(tab.url);
      if(url.origin==="https://www.linkedin.com"&&(url.pathname==="/feed"||url.pathname==="/feed/"))tabId=tab.id;
    } else if((await chrome.tabs?.sendMessage?.(tab.id,{type:"feedStatus"}))?.isFeed===true)tabId=tab.id;
  }
} catch {}
await refresh();
$("enabled").addEventListener("change",async()=>{
  const next=$("enabled").checked;
  try {
    if (next) {
      if (!activeCategories(settings.categories).length) throw new Error("Switch a category on in full settings first.");
      if (settings.provider!=="ollama" && !(settings.provider==="jev"?settings.jevKey:settings.openaiKey)) throw new Error("Add a provider key in full settings first.");
      requestFor(settings,"Settings validation");
    }
    await chrome.storage.local.set({enabled:next});settings.enabled=next;renderFiltering();status(next?(showEverything?"Filtering enabled. This tab is still showing everything.":"Filtering enabled."):"Filtering paused. All posts stay visible.");
  } catch(error) {renderFiltering();status(error.message);}
});
$("showEverything").addEventListener("click",async()=>{
  if(!experienceAvailable||!Number.isInteger(tabId)||!settings.enabled||revealPending)return;
  revealPending=true;renderExperience();
  try {const result=await send({type:"showEverything",value:!showEverything,tabId});appearance=result.appearance;showEverything=result.showEverything===true;renderExperience();status(showEverything?"Showing everything in this tab.":"Category rules restored in this tab.");}
  catch(error){status(error.message);}
  finally {revealPending=false;renderExperience();}
});
for (const input of document.querySelectorAll('input[name="theme"]')) input.addEventListener("change",async()=>{
  if (!THEME_IDS.includes(input.value)) return;
  const previous=appearance;
  try {const result=await send({type:"appearance",appearance:{...appearance,theme:input.value}});appearance=result.appearance;renderExperience();status("Feed appearance saved. Category rules stay the same.");}
  catch(error){appearance=previous;renderExperience();status(error.message);}
});
$("openSettings").addEventListener("click",()=>chrome.runtime.openOptionsPage());
