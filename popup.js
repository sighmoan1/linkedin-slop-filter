import {loadSettings, activeCategories, requestFor} from "./core.mjs";
const $=id=>document.getElementById(id);
const THEME_IDS=["native","punchy","reader"];
let settings=await loadSettings(chrome.storage.local), appearance={theme:"native",groupHidden:false,labels:"matches"}, showEverything=false, tabId;
const status=message=>{$("popupStatus").textContent=message;};
async function send(message){
  if (!chrome.runtime?.sendMessage) throw new Error("Extension service unavailable.");
  const result=await chrome.runtime.sendMessage(message);
  if (!result || result.error) throw new Error(result?.error||"Extension service unavailable.");
  return result;
}
function renderFiltering(){
  $("enabled").checked=settings.enabled;
  $("filteringStatus").textContent=settings.enabled?"On · category rules apply":"Paused · all posts stay visible";
}
function renderExperience(){
  for (const input of document.querySelectorAll('input[name="theme"]')) input.checked=input.value===appearance.theme;
  $("showEverything").textContent=showEverything?"Restore filtering":"Show everything";
  $("showEverything").setAttribute("aria-pressed",String(showEverything));
  $("revealNote").textContent=showEverything?"Hidden posts are visible in this tab. Your saved rules are unchanged.":"Temporarily reveal hidden posts in this tab. Saved rules stay the same.";
}
async function refresh(){
  try {
    const experience=await send({type:"experience",...(Number.isInteger(tabId)?{tabId}:{})});
    appearance=experience.appearance;showEverything=experience.showEverything===true;renderExperience();
    $("showEverything").disabled=!Number.isInteger(tabId);
    if (!Number.isInteger(tabId)) $("revealNote").textContent="Open this popup from your LinkedIn feed to temporarily show hidden posts.";
  } catch {
    $("showEverything").disabled=true;
    $("revealNote").textContent="Feed controls are unavailable. Reopen the popup or reload the extension.";
    for (const input of document.querySelectorAll('input[name="theme"]')) input.disabled=true;
  }
  try {
    const usage=await send({type:"usage"});
    for (const key of ["requests","scored","cacheHits"]) $(key).textContent=Number.isFinite(usage[key])?usage[key].toLocaleString():"—";
    $("requestLimit").textContent=Number.isFinite(usage.limit)?"/ "+usage.limit.toLocaleString():"";
    $("usageNote").textContent=usage.requests>=usage.limit?"Session limit reached. New posts stay visible.":"Cached scores save repeat requests. Cloud API usage is billed separately.";
    $("serviceIssue").hidden=!usage.lastError;
    $("lastError").textContent=typeof usage.lastError==="string"?usage.lastError:"";
  } catch {$("usageNote").textContent="Session usage is unavailable. Reopen the popup or reload the extension.";}
}
renderFiltering();renderExperience();
$("usageProvider").textContent={jev:"Jev",openai:"OpenAI",ollama:"Local Ollama"}[settings.provider]||"";
try {tabId=(await chrome.tabs?.query({active:true,currentWindow:true}))?.[0]?.id;} catch {}
await refresh();
$("enabled").addEventListener("change",async()=>{
  const next=$("enabled").checked;
  try {
    if (next) {
      if (!activeCategories(settings.categories).length) throw new Error("Switch a category on in full settings first.");
      if (settings.provider!=="ollama" && !(settings.provider==="jev"?settings.jevKey:settings.openaiKey)) throw new Error("Add a provider key in full settings first.");
      requestFor(settings,"Settings validation");
    }
    await chrome.storage.local.set({enabled:next});settings.enabled=next;renderFiltering();status(next?"Filtering enabled.":"Filtering paused. All posts stay visible.");
  } catch(error) {renderFiltering();status(error.message);}
});
$("showEverything").addEventListener("click",async()=>{
  $("showEverything").disabled=true;
  try {const result=await send({type:"showEverything",value:!showEverything,tabId});appearance=result.appearance;showEverything=result.showEverything===true;renderExperience();status(showEverything?"Showing everything in this tab.":"Category rules restored in this tab.");}
  catch(error){status(error.message);}
  finally {$("showEverything").disabled=!Number.isInteger(tabId);}
});
for (const input of document.querySelectorAll('input[name="theme"]')) input.addEventListener("change",async()=>{
  if (!THEME_IDS.includes(input.value)) return;
  const previous=appearance;
  try {const result=await send({type:"appearance",appearance:{...appearance,theme:input.value}});appearance=result.appearance;renderExperience();status("Feed appearance saved. Category rules stay the same.");}
  catch(error){appearance=previous;renderExperience();status(error.message);}
});
$("openSettings").addEventListener("click",()=>chrome.runtime.openOptionsPage());
