import {installImageComparison} from "./options-images.mjs";
import {DEFAULTS, DEFAULT_CATEGORIES, MAX_CATEGORIES, ACTIONS, loadSettings, normalizeCategories, activeCategories, makeCategory, KEY_FIELDS, PROVIDER_NAMES, verifyKey, verifyOllama, keyFingerprint, CACHE_PREFIX, requestFor, LOCAL_RUBRIC_MAX, LOCAL_TEXT_MAX, scoringKey, feedbackSummary, normalizeImages, visualCategory, IMAGE_PERMISSION, VISUAL_ID} from "./core.mjs";
const FIELDS=["enabled","provider","jevKey","openaiKey","ollamaEndpoint","ollamaModel","limit"];
const ACTION_LABELS={hide:"Hide",highlight:"Highlight",label:"Label",off:"Off"};
const ACTION_HELP={hide:"Hide matching posts. You can show them again.",highlight:"Keep the post visible with a coloured border.",label:"Keep the post visible with a category label.",off:"Do not ask the model about this category."};
const PANEL_IDS=["feed","categories","provider","corrections","playground","people"];
const $=id=>document.getElementById(id);
const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children);return node;};
const copyCats=list=>list.map(c=>({...c}));
let savedSettings=await loadSettings(chrome.storage.local), cats=copyCats(savedSettings.categories), dirty=false, preset=null, undo=null, corrections=[], revisedDefinitions=null;
let feedbackConfiguration="", correctionRefresh=0;
let appearance={theme:"native",groupHidden:false,showAuthor:false,labels:"matches"};
const bridgeAvailable=Boolean(chrome.runtime?.sendMessage);
const percent=value=>(value*100).toLocaleString(undefined,{maximumFractionDigits:6})+"%";
const providerName=id=>({jev:"Jev · OpenRouter",openai:"OpenAI Decisions",ollama:"Local Ollama"}[id]||"Unknown provider");
function safeAppearance(value){return {theme:"native",groupHidden:value?.groupHidden===true,showAuthor:value?.showAuthor===true,labels:value?.labels==="off"?"off":"matches"};}
async function send(message){
  if (!bridgeAvailable) throw new Error("The extension service is unavailable. Reopen settings or reload the extension.");
  const result=await chrome.runtime.sendMessage(message);
  if (!result || result.error) throw new Error(result?.error||"The extension service is unavailable. Reopen settings or reload the extension.");
  return result;
}
installImageComparison(send);
function selectPanel(id,focus=false){
  if (!PANEL_IDS.includes(id)) id="feed";
  for (const panel of PANEL_IDS) $("panel-"+panel).hidden=panel!==id;
  for (const button of document.querySelectorAll("[data-panel]")) {
    if (button.dataset.panel===id) button.setAttribute("aria-current","page");
    else button.removeAttribute("aria-current");
  }
  if (focus) $(id+"-heading").focus({preventScroll:true});
  if (id==="corrections"&&document.documentElement.dataset.settingsReady==="true") void refreshCorrections();
  if (id==="people") void refreshPeople();
  history.replaceState(null,"","#"+id);
}
for (const button of document.querySelectorAll("[data-panel]")) button.addEventListener("click",()=>selectPanel(button.dataset.panel,true));
window.addEventListener("hashchange",()=>selectPanel(location.hash.slice(1)));
selectPanel(location.hash.slice(1));
function markDirty(){dirty=true;for(const button of document.querySelectorAll("[data-feedback-apply]"))button.disabled=true;$("saveState").textContent="Unsaved changes";$("status").textContent="";}
function clearUndo(){undo=null;$("undoPreset").hidden=true;}
function invalidatePreviews(){preset=null;revisedDefinitions=null;$("presetPreview").hidden=true;$("definitionPreview").hidden=true;}
function updateSavedProvider(){$("savedProvider").textContent=providerName(savedSettings.provider);}
for (const id of FIELDS) {
  if (id==="enabled") $(id).checked=savedSettings[id];
  else $(id).value=savedSettings[id];
  $(id).addEventListener(id==="enabled"||id==="provider"?"change":"input",markDirty);
}
function renderAppearance(){
  $("groupHidden").checked=appearance.groupHidden;$("showAuthor").checked=appearance.showAuthor;$("labels").value=appearance.labels;
}
try {appearance=safeAppearance((await send({type:"experience"})).appearance);}
catch {appearance=safeAppearance((await chrome.storage.local.get("appearance")).appearance);}
renderAppearance();updateSavedProvider();
const imageDraft=normalizeImages(savedSettings.imageAnalysis);
$("imageEnabled").checked=imageDraft.enabled;$("imageModel").value=imageDraft.model;$("imageAction").value=imageDraft.action;$("imageThreshold").value=imageDraft.threshold*100;
for(const id of ["imageModel","imageAction","imageThreshold"])$(id).addEventListener("change",markDirty);
$("imageEnabled").addEventListener("change",async()=>{
  markDirty();
  if(!$("imageEnabled").checked)return;
  try {
    const granted=await chrome.permissions?.request({origins:[IMAGE_PERMISSION]});
    if(!granted){$("imageEnabled").checked=false;$("imagePermissionStatus").textContent="Image access was not granted. Image checks remain off.";}
    else $("imagePermissionStatus").textContent="Image access granted. Save settings to start the trial.";
  } catch {$("imageEnabled").checked=false;$("imagePermissionStatus").textContent="Image access is unavailable. Reload the updated extension and reopen settings.";}
});
$("groupHidden").addEventListener("change",()=>{appearance.groupHidden=$("groupHidden").checked;markDirty();});
$("showAuthor").addEventListener("change",()=>{appearance.showAuthor=$("showAuthor").checked;markDirty();});
$("labels").addEventListener("change",()=>{appearance.labels=$("labels").value;markDirty();});
const updateProvider=()=>{
  const provider=$("provider").value;
  for (const name of ["jev","openai","ollama"]) $(name+"-settings").hidden=name!==provider;
  for (const id of ["ollamaEndpoint","ollamaModel"]) $(id).disabled=provider!=="ollama";
};
$("provider").addEventListener("change",updateProvider);updateProvider();
const storedError=(await chrome.storage.local.get("lastError")).lastError;
$("error").textContent=typeof storedError==="string"?storedError:"";
function renderUsage(usage){
  const count=key=>Number.isFinite(usage[key])?usage[key].toLocaleString():"unavailable";
  $("usageSummary").textContent=`This session: ${count("requests")} / ${count("limit")} requests · ${count("scored")} scored · ${count("folded")} posts hidden · ${count("cacheHits")} saved scores reused · ${count("errors")} errors.`;
  $("imageTrialUsage").textContent=`This session: ${usage.imageScored||0} image checks scored · ${usage.imageErrors||0} image checks unavailable.`;
  $("error").textContent=typeof usage.lastError==="string"?usage.lastError:"";
}
async function updateUsage(){
  try {
    renderUsage(await send({type:"usage"}));$("resetUsage").disabled=false;
  } catch {$("usageSummary").textContent="Session usage is unavailable. Reopen settings or reload the extension.";$("resetUsage").disabled=true;}
}
await updateUsage();
$("resetUsage").addEventListener("click",async()=>{
  $("resetUsage").disabled=true;$("resetUsageStatus").textContent="Resetting…";
  try {renderUsage(await send({type:"resetUsage"}));$("resetUsageStatus").textContent="Counters reset.";}
  catch(error){$("resetUsageStatus").textContent=error.message;}
  finally {$("resetUsage").disabled=false;}
});

// Key tests use the key explicitly entered on this trusted extension page.
const getChecks=async()=>(await chrome.storage.local.get({keyCheck:{}})).keyCheck;
function showCheck(provider,result,at){
  const status=$(KEY_FIELDS[provider]+"Status");
  status.textContent=(result.ok?"✓ ":"✗ ")+result.message+(at?" Checked "+new Date(at).toLocaleString()+".":"");
  status.className="key-status "+(result.ok?"ok":"bad");
}
function clearCheck(provider,text=""){const status=$(KEY_FIELDS[provider]+"Status");status.textContent=text;status.className="key-status";}
const savedChecks=await getChecks();
for (const provider of Object.keys(KEY_FIELDS)) {
  const input=$(KEY_FIELDS[provider]), button=$(KEY_FIELDS[provider]+"Test"), last=savedChecks[provider];
  if (last && input.value.trim() && last.fp===await keyFingerprint(input.value.trim())) showCheck(provider,last,last.at);
  input.addEventListener("input",()=>clearCheck(provider));
  button.addEventListener("click",async()=>{
    const key=input.value.trim();
    if (!key) {showCheck(provider,{ok:false,message:"Enter your "+PROVIDER_NAMES[provider]+" key first."});return;}
    button.disabled=true;clearCheck(provider,"Testing…");
    try {
      const result=await verifyKey(provider,key);
      if (input.value.trim()===key) {
        const checks=await getChecks();
        checks[provider]={ok:result.ok,code:result.code,message:result.message,at:Date.now(),fp:await keyFingerprint(key)};
        await chrome.storage.local.set({keyCheck:checks});showCheck(provider,result,checks[provider].at);
      } else clearCheck(provider);
    } finally {button.disabled=false;}
  });
}

// Local tests never save or enable the entered configuration, or consume the feed cap.
if (chrome.runtime?.id) $("ollamaOrigin").textContent="chrome-extension://"+chrome.runtime.id;
let localTestGeneration=0;
function clearLocalTest(){localTestGeneration++;$("ollamaStatus").textContent="";$("ollamaStatus").className="key-status";}
for (const id of ["ollamaEndpoint","ollamaModel"]) $(id).addEventListener("input",clearLocalTest);
$("provider").addEventListener("change",clearLocalTest);
$("ollamaTest").addEventListener("click",async()=>{
  const generation=++localTestGeneration, button=$("ollamaTest"), status=$("ollamaStatus");
  button.disabled=true;status.className="key-status";status.textContent="Testing local Ollama… The model may need time to load.";
  try {
    const result=await verifyOllama($("ollamaEndpoint").value,$("ollamaModel").value);
    if (generation!==localTestGeneration) return;
    status.textContent=(result.ok?"✓ ":"✗ ")+result.message;
    status.className="key-status "+(result.ok?"ok":"bad");
  } finally {button.disabled=false;}
});

const listEl=$("categoryList"), catStatus=$("catStatus");
function updateBudget(){
  const size=JSON.stringify(activeCategories(cats).map(c=>({category:c.id,definition:c.instructions}))).length;
  $("rubricBudget").textContent=size.toLocaleString()+" / "+LOCAL_RUBRIC_MAX.toLocaleString()+" characters";
  $("budgetMeter").value=Math.min(size,LOCAL_RUBRIC_MAX);
  $("budgetMeter").setAttribute("aria-valuetext",size+" characters out of "+LOCAL_RUBRIC_MAX);
  $("budgetState").textContent=size>LOCAL_RUBRIC_MAX?(size-LOCAL_RUBRIC_MAX).toLocaleString()+" characters over the local limit. Shorten definitions or switch categories Off.":(LOCAL_RUBRIC_MAX-size).toLocaleString()+" characters available for Ollama definitions.";
  $("budgetMeter").closest(".definition-budget").classList.toggle("budget-over",size>LOCAL_RUBRIC_MAX);
}
function categoryEdit(){clearUndo();invalidatePreviews();markDirty();updateBudget();}
function move(c,step){
  const i=cats.indexOf(c),j=i+step;if(i<0||j<0||j>=cats.length)return;
  [cats[i],cats[j]]=[cats[j],cats[i]];clearUndo();invalidatePreviews();markDirty();renderCats();
  listEl.querySelector(`.cat[data-id="${c.id}"] .cat-${step<0?"up":"down"}`)?.focus();
}
function renderCats(){
  const open=new Set([...listEl.querySelectorAll(".cat details[open]")].map(node=>node.closest(".cat").dataset.id));
  listEl.replaceChildren();
  cats.forEach((c,i)=>{
    const row=el("div",{className:"cat"});row.dataset.id=c.id;row.setAttribute("role","group");row.setAttribute("aria-label",c.name+" category");
    const name=el("input",{className:"cat-name",value:c.name,maxLength:40});name.setAttribute("aria-label","Category name");
    name.addEventListener("input",()=>{c.name=name.value;row.setAttribute("aria-label",c.name+" category");action.setAttribute("aria-label",c.name+" action");threshold.setAttribute("aria-label",c.name+" threshold (%)");text.setAttribute("aria-label",c.name+" definition");up.setAttribute("aria-label","Move "+c.name+" up");down.setAttribute("aria-label","Move "+c.name+" down");remove.setAttribute("aria-label","Remove "+c.name);categoryEdit();});
    const action=el("select",{className:"cat-action"},...ACTIONS.map(a=>el("option",{value:a,textContent:ACTION_LABELS[a]})));
    action.value=c.action;action.setAttribute("aria-label",c.name+" action");
    const actionHelp=el("span",{className:"action-description",textContent:ACTION_HELP[c.action]});
    action.addEventListener("change",()=>{c.action=action.value;actionHelp.textContent=ACTION_HELP[c.action];categoryEdit();});
    const threshold=el("input",{className:"cat-threshold",type:"number",min:1,max:100,step:1,required:true,value:Math.round(c.threshold*100)});
    threshold.setAttribute("aria-label",c.name+" threshold (%)");
    threshold.addEventListener("input",()=>{c.threshold=Number(threshold.value)/100;categoryEdit();});
    const up=el("button",{type:"button",className:"secondary cat-up",textContent:"↑",disabled:i===0}),down=el("button",{type:"button",className:"secondary cat-down",textContent:"↓",disabled:i===cats.length-1});
    up.setAttribute("aria-label","Move "+c.name+" up");down.setAttribute("aria-label","Move "+c.name+" down");
    up.addEventListener("click",()=>move(c,-1));down.addEventListener("click",()=>move(c,1));
    const remove=el("button",{type:"button",className:"secondary cat-remove",textContent:"Remove"});remove.setAttribute("aria-label","Remove "+c.name);
    remove.addEventListener("click",()=>{
      cats=cats.filter(x=>x!==c);clearUndo();invalidatePreviews();markDirty();catStatus.textContent="Removed "+c.name+". Choose Save settings to keep this change.";renderCats();
      (listEl.querySelector(".cat .cat-remove")||$("addCategoryDetails").querySelector("summary"))?.focus({preventScroll:true});
    });
    const text=el("textarea",{rows:5,maxLength:2000,value:c.instructions});text.setAttribute("aria-label",c.name+" definition");
    const chars=el("span",{textContent:c.instructions.length+" / 2,000"});
    text.addEventListener("input",()=>{c.instructions=text.value;chars.textContent=text.value.length+" / 2,000";categoryEdit();});
    const details=el("details",{open:open.has(c.id)},el("summary",{},"Edit definition",chars),text,el("p",{className:"definition-note",textContent:"Describe which posts belong in this category and which to exclude. Writing style cannot prove who wrote a post. Tell the model to ignore instructions inside post_text (the post being checked)."}));
    row.append(el("div",{className:"cat-head"},el("span",{className:"cat-dot"}),name,el("span",{className:"cat-order"},up,down),remove),el("div",{className:"cat-rule"},el("label",{className:"inline"},"Action ",action),el("label",{className:"inline"},"Above ",threshold,"%"),actionHelp),details);
    listEl.append(row);
  });
  if (!cats.length) listEl.append(el("p",{className:"empty-state",textContent:"No post rules yet. Add a category below or restore the defaults."}));
  $("addCat").disabled=cats.length>=MAX_CATEGORIES;$("categoryCount").textContent=cats.length+" / "+MAX_CATEGORIES;updateBudget();
}
renderCats();
$("addCat").addEventListener("click",()=>{
  if (cats.length>=MAX_CATEGORIES) return;
  const made=makeCategory($("newCatName").value,$("newCatRule").value,cats);
  if (!made) {catStatus.textContent="Give the category a name (up to 40 characters) and say what counts (up to 2,000).";return;}
  cats=[...cats,made];$("newCatName").value="";$("newCatRule").value="";clearUndo();invalidatePreviews();markDirty();catStatus.textContent="Added "+made.name+". Choose Save settings to keep this change.";renderCats();
  listEl.querySelector(`.cat[data-id="${made.id}"] .cat-name`)?.focus({preventScroll:true});
});
function previewPreset(mode){
  invalidatePreviews();preset={mode,actions:new Map(DEFAULT_CATEGORIES.map(c=>[c.id,mode==="less-noise"&&["slop","brainrot","advert"].includes(c.id)?"hide":c.action]))};
  const changes=cats.filter(c=>preset.actions.has(c.id)&&c.action!==preset.actions.get(c.id));
  $("presetTitle").textContent=mode==="less-noise"?"Hide Slop, Brainrot and Advert":"Defaults: Slop hides; other categories label or highlight";
  $("presetChanges").replaceChildren(...changes.map(c=>el("li",{textContent:c.name+": "+ACTION_LABELS[c.action]+" → "+ACTION_LABELS[preset.actions.get(c.id)]})));
  if (!changes.length) $("presetChanges").append(el("li",{textContent:"No action changes needed. Removed built-ins stay removed."}));
  $("applyPreset").disabled=!changes.length;$("presetPreview").hidden=false;
}
$("previewDefault").addEventListener("click",()=>previewPreset("default"));$("previewLessNoise").addEventListener("click",()=>previewPreset("less-noise"));
$("cancelPreset").addEventListener("click",()=>{$("presetPreview").hidden=true;preset=null;});
$("applyPreset").addEventListener("click",()=>{
  if (!preset) return;
  undo={kind:"actions",actions:new Map(cats.filter(c=>preset.actions.has(c.id)).map(c=>[c.id,c.action]))};
  cats=cats.map(c=>preset.actions.has(c.id)?{...c,action:preset.actions.get(c.id)}:c);
  invalidatePreviews();markDirty();renderCats();$("undoPreset").hidden=false;$("undoPreset").textContent="Undo actions";catStatus.textContent="Actions updated. Choose Save settings to keep the changes.";
});
$("previewDefinitions").addEventListener("click",()=>{
  invalidatePreviews();const defaults=new Map(DEFAULT_CATEGORIES.map(c=>[c.id,c.instructions]));
  const changed=cats.filter(c=>defaults.has(c.id)&&c.instructions!==defaults.get(c.id));
  revisedDefinitions=new Map(changed.map(c=>[c.id,defaults.get(c.id)]));
  $("definitionChanges").replaceChildren(...changed.map(c=>el("details",{className:"definition-comparison"},el("summary",{textContent:c.name}),el("div",{className:"details-body"},el("p",{className:"note",textContent:"Current wording"}),el("p",{className:"definition-wording",textContent:c.instructions}),el("p",{className:"note",textContent:"Revised wording"}),el("p",{className:"definition-wording",textContent:defaults.get(c.id)})))));
  if (!changed.length) $("definitionChanges").append(el("p",{className:"note",textContent:"The built-ins in your list already use the latest definitions. Removed built-ins stay removed."}));
  $("applyDefinitions").disabled=!changed.length;$("definitionPreview").hidden=false;
});
$("cancelDefinitions").addEventListener("click",()=>{$("definitionPreview").hidden=true;revisedDefinitions=null;});
$("applyDefinitions").addEventListener("click",()=>{
  if (!revisedDefinitions) return;
  undo={kind:"definitions",instructions:new Map(cats.filter(c=>revisedDefinitions.has(c.id)).map(c=>[c.id,c.instructions]))};
  cats=cats.map(c=>revisedDefinitions.has(c.id)?{...c,instructions:revisedDefinitions.get(c.id)}:c);
  invalidatePreviews();markDirty();renderCats();$("undoPreset").hidden=false;$("undoPreset").textContent="Undo definition update";
  catStatus.textContent="Revised definitions applied to this draft. Save settings to use them and request fresh scores.";
});
$("resetCats").addEventListener("click",()=>{
  invalidatePreviews();undo={kind:"restore",categories:copyCats(cats)};cats=copyCats(DEFAULT_CATEGORIES);markDirty();renderCats();$("undoPreset").hidden=false;$("undoPreset").textContent="Undo restore";
  catStatus.textContent="Default categories and definitions restored in this draft. Choose Save settings to keep this change.";
});
$("undoPreset").addEventListener("click",()=>{
  if (!undo) return;
  invalidatePreviews();cats=undo.kind==="restore"?copyCats(undo.categories):undo.kind==="definitions"?cats.map(c=>undo.instructions.has(c.id)?{...c,instructions:undo.instructions.get(c.id)}:c):cats.map(c=>undo.actions.has(c.id)?{...c,action:undo.actions.get(c.id)}:c);
  clearUndo();markDirty();renderCats();catStatus.textContent="Undone in this draft. Choose Save settings to keep this change.";
});

$("settings").addEventListener("submit",async event=>{
  event.preventDefault();const status=$("status"),next={};
  for (const id of FIELDS) next[id]=id==="enabled"?$(id).checked:$(id).value.trim();
  next.limit=Number(next.limit);
  const bad=cats.find(c=>!c.name.trim()||!c.instructions.trim()||!(c.threshold>=0.01&&c.threshold<=1));
  if (bad) {selectPanel("categories");status.textContent="Each category needs a name, a definition and a threshold from 1 to 100%.";return;}
  if (!Number.isInteger(next.limit)||next.limit<1||next.limit>10000) {selectPanel("provider");status.textContent="Choose a session limit from 1 to 10,000 requests.";return;}
  next.categories=normalizeCategories(cats);
  const imageThreshold=Number($("imageThreshold").value);
  if(!Number.isFinite(imageThreshold)||imageThreshold<1||imageThreshold>100){selectPanel("feed");status.textContent="Choose an image threshold from 1 to 100%.";return;}
  next.imageAnalysis=normalizeImages({enabled:$("imageEnabled").checked,model:$("imageModel").value,action:$("imageAction").value,threshold:imageThreshold/100});
  if(next.imageAnalysis.enabled){
    if(!next.jevKey){selectPanel("provider");status.textContent="Add your OpenRouter key for image checks. Your text provider stays selected.";return;}
    if(next.categories.some(c=>c.id===VISUAL_ID)){selectPanel("categories");status.textContent="Rename the reserved lsf-visual-slop category before enabling the image trial.";return;}
    if(!await chrome.permissions?.contains({origins:[IMAGE_PERMISSION]})){selectPanel("feed");status.textContent="Switch image checks off and on to grant image access.";return;}
  }
  if (next.enabled&&!activeCategories(next.categories).length) {selectPanel("categories");status.textContent="Switch at least one category on before enabling filtering.";return;}
  if (next.enabled&&next.provider!=="ollama"&&!(next.provider==="jev"?next.jevKey:next.openaiKey)) {selectPanel("provider");status.textContent="Add a key for the selected provider first.";return;}
  try {if (next.enabled) requestFor(next,"Settings validation");}
  catch(error){selectPanel(next.provider==="ollama"&&error.message.includes("definitions")?"categories":"provider");status.textContent=error.message;return;}
  const saveButton=$("settings").querySelector('button[type="submit"]'),restoreSaveFocus=document.activeElement===saveButton;saveButton.disabled=true;$("editableSettings").disabled=true;$("status").textContent="Saving…";let rulesSaved=false;
  try {
    await chrome.storage.local.set({...next,schema:DEFAULTS.schema});rulesSaved=true;
    savedSettings={...next,schema:DEFAULTS.schema};cats=copyCats(next.categories);renderCats();updateSavedProvider();void refreshCorrections();
    if (bridgeAvailable) appearance=safeAppearance((await send({type:"appearance",appearance})).appearance);
    else await chrome.storage.local.set({appearance:safeAppearance(appearance)});
    await chrome.storage.local.remove("lastError").catch(()=>{});$("error").textContent="";
    dirty=false;clearUndo();renderAppearance();$("saveState").textContent="Saved settings";
    status.textContent="Saved. Open feeds pick up the change within a few seconds.";
  } catch(error) {
    dirty=true;$("saveState").textContent=rulesSaved?"Appearance not saved":"Unsaved changes";
    status.textContent=rulesSaved?"Post rules and provider saved. Feed appearance could not be saved. Try again. "+error.message:"Could not save settings. Your saved settings have not changed. Try again.";
  } finally {saveButton.disabled=false;$("editableSettings").disabled=false;if(restoreSaveFocus&&document.activeElement===document.body)saveButton.focus({preventScroll:true});}
});
$("forget").addEventListener("click",async()=>{
  await chrome.storage.local.set({enabled:false,jevKey:"",openaiKey:""});await chrome.storage.local.remove("keyCheck");
  for (const provider of Object.keys(KEY_FIELDS)) clearCheck(provider);
  $("jevKey").value="";$("openaiKey").value="";$("enabled").checked=false;savedSettings={...savedSettings,enabled:false,jevKey:"",openaiKey:""};
  $("status").textContent="Keys deleted. Filtering disabled.";
});
$("clearCache").addEventListener("click",async()=>{
  const keys=Object.keys(await chrome.storage.local.get(null)).filter(k=>k.startsWith(CACHE_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  const sessionKeys=(chrome.storage.session?Object.keys(await chrome.storage.session.get(null)):[]).filter(k=>k.startsWith(CACHE_PREFIX));
  if (sessionKeys.length) await chrome.storage.session.remove(sessionKeys);
  const count=keys.length+sessionKeys.length;$("cacheStatus").textContent="Cleared "+count+" cached score"+(count===1?"":"s")+". Open feeds check posts again as you scroll.";
});

function renderFeedback(){
  const summary=feedbackSummary(corrections,[...savedSettings.categories,...(normalizeImages(savedSettings.imageAnalysis).enabled?[visualCategory(savedSettings.imageAnalysis)]:[])],{provider:savedSettings.provider,configuration:feedbackConfiguration});
  $("feedbackAnalysis").hidden=!corrections.length;
  $("feedbackCoverage").textContent=`${summary.comparable} ${summary.comparable===1?"post":"posts"} included · ${summary.excluded} excluded`;
  $("feedbackRows").closest("table").hidden=!summary.comparable;
  const hiding=summary.hiding;
  $("feedbackHiding").textContent=!summary.comparable?"No corrections match the current provider and definitions.":!hiding.active?"No Hide rules are active.":!hiding.complete?"Not enough Hide scores to compare hidden posts.":`Wrongly hidden: ${hiding.falseHides} · Missed hides: ${hiding.missedHides} · ${hiding.complete} posts checked`;
  $("feedbackDetails").textContent=`${summary.duplicates} earlier duplicate corrections ignored. ${summary.excluded} posts excluded for a different provider or scoring configuration. Hide predictions use ${hiding.complete} posts with every Hide score; ${hiding.missing} posts lack a Hide score. These are predictions under saved rules, not a record of posts actually hidden. Category coverage is listed with each rule.`;
  $("feedbackLabels").textContent=summary.rows.filter(row=>row.action!=="off").map(row=>`${row.name}: ${row.positives} chosen / ${row.scored-row.positives} unchosen scored examples`).join("; ");
  $("feedbackRows").replaceChildren();
  for(const row of summary.rows){
    const off=row.action==="off", card=el("tr",{className:"feedback-row"});card.setAttribute("role","row");card.dataset.category=row.id;
    const category=el("th",{scope:"row"},el("span",{textContent:row.name}),el("small",{textContent:off?"Off":`${ACTION_LABELS[row.action]} above ${percent(row.threshold)} · ${row.scored} scored` }));category.setAttribute("role","rowheader");
    if(!off&&row.missing)category.append(el("small",{textContent:`${row.missing} missing scores`,title:`${row.positives} chosen and ${row.scored-row.positives} unchosen scored examples`}));
    card.append(category);
    for(const [label,value] of [["Wrong matches",row.falseMatches],["Missed matches",row.misses]]){
      const mobileLabel=el("span",{className:"feedback-mobile-label",textContent:label});mobileLabel.setAttribute("aria-hidden","true");
      const cell=el("td",{},mobileLabel,el("span",{textContent:off||!row.scored?"—":String(value)}));cell.setAttribute("role","cell");card.append(cell);
    }
    const threshold=el("td",{className:"feedback-suggestion"});threshold.setAttribute("role","cell");
    if(row.suggestion){
      const suggestion=row.suggestion;
      const apply=el("button",{type:"button",className:"secondary",textContent:`Review ${percent(suggestion.threshold)}`,disabled:dirty});
      apply.dataset.feedbackApply=row.id;apply.setAttribute("aria-label",`Review ${row.name} threshold suggestion: ${percent(suggestion.threshold)}`);
      apply.title=`${suggestion.falseMatches} wrong matches and ${suggestion.misses} misses on these examples`;
      apply.addEventListener("click",()=>{
        if(dirty)return;
        const category=cats.find(c=>c.id===row.id);if(!category)return;
        invalidatePreviews();clearUndo();category.threshold=suggestion.threshold;markDirty();renderCats();selectPanel("categories",true);
        catStatus.textContent=`${row.name} threshold set to ${percent(suggestion.threshold)} in your draft. Review and Save settings to apply.`;
      });
      threshold.append(apply);
      if(dirty)threshold.append(el("small",{textContent:"Save existing edits first."}));
    }else threshold.append(el("span",{textContent:off?"Off":row.positives<5||row.scored-row.positives<5?"More examples needed":"No change suggested"}));
    card.append(threshold);$("feedbackRows").append(card);
  }
}
function renderCorrections(){
  renderFeedback();
  $("correctionCount").textContent=corrections.length+" saved correction"+(corrections.length===1?"":"s");
  const names=new Map([...savedSettings.categories,...(normalizeImages(savedSettings.imageAnalysis).enabled?[visualCategory(savedSettings.imageAnalysis)]:[])].map(c=>[c.id,c.name]));
  $("correctionList").replaceChildren();
  for (const correction of corrections) {
    const remove=el("button",{type:"button",className:"text-button",textContent:"Remove"});remove.setAttribute("aria-label","Remove correction from "+new Date(correction.at).toLocaleString());
    remove.addEventListener("click",async()=>{
      try {const result=await send({type:"corrections",action:"remove",id:correction.id});correctionRefresh++;corrections=result.corrections;renderCorrections();$("correctionStatus").textContent="Correction removed from this profile.";}
      catch(error){$("correctionStatus").textContent=error.message;}
    });
    const labels=correction.categoryIds.length?correction.categoryIds.map(id=>names.get(id)||id):["None · keep visible"];
    const preview=correction.text.length>260?correction.text.slice(0,260)+"…":correction.text;
    const details=el("details",{},el("summary",{textContent:"Full text and original scores"}),el("p",{textContent:correction.text}),el("small",{textContent:"Original provider: "+providerName(correction.provider)+". "+Object.entries(correction.scores||{}).map(([id,value])=>(names.get(id)||id)+" "+Math.round(value*100)+"%").join(" · ")}));
    $("correctionList").append(el("article",{className:"correction"},el("div",{className:"correction-top"},el("time",{textContent:new Date(correction.at).toLocaleString()}),remove),el("div",{className:"correction-labels"},...labels.map(name=>el("span",{textContent:name}))),el("p",{textContent:preview}),details));
  }
  if (!corrections.length) $("correctionList").append(el("p",{className:"empty-state",textContent:"No corrections yet. On a feed post, choose Review scores, select the categories that fit (or none), then Save correction."}));
  $("exportCorrections").disabled=!corrections.length;$("clearCorrections").disabled=!corrections.length;
}
async function refreshCorrections(){
  const refresh=++correctionRefresh, snapshot=savedSettings;
  try {
    const records=(await send({type:"corrections",action:"list"})).corrections;
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(scoringKey(snapshot)));
    if(refresh!==correctionRefresh||snapshot!==savedSettings)return;
    feedbackConfiguration=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
    corrections=records;renderCorrections();
  }
  catch(error){if(refresh!==correctionRefresh)return;$("feedbackAnalysis").hidden=true;$("feedbackRows").replaceChildren();$("correctionList").replaceChildren(el("p",{className:"empty-state",textContent:"Corrections are unavailable. Reopen settings or reload the extension. Saved corrections have not been cleared."}));$("correctionStatus").textContent=error.message;}
}
$("refreshCorrections").addEventListener("click",refreshCorrections);await refreshCorrections();
$("clearCorrections").addEventListener("click",()=>{$("clearCorrectionConfirm").hidden=false;});
$("cancelClearCorrections").addEventListener("click",()=>{$("clearCorrectionConfirm").hidden=true;});
$("confirmClearCorrections").addEventListener("click",async()=>{
  try {const result=await send({type:"corrections",action:"clear"});correctionRefresh++;corrections=result.corrections;renderCorrections();$("clearCorrectionConfirm").hidden=true;$("correctionStatus").textContent="All corrections cleared from this profile.";}
  catch(error){$("correctionStatus").textContent=error.message;}
});
$("exportCorrections").addEventListener("click",()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),corrections},null,2)],{type:"application/json"}));
  const anchor=el("a",{href:url,download:"linkedin-filter-corrections-"+new Date().toISOString().slice(0,10)+".json"});anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $("correctionStatus").textContent="Exported the corrections you explicitly saved, including their post text.";
});

function renderPlayground(result){
  const available=result.scores||{},categories=result.categories||[],active=categories.filter(c=>c.action!=="off");
  const hasScore=c=>typeof available[c.id]==="number"&&Number.isFinite(available[c.id])&&available[c.id]>=0&&available[c.id]<=1;
  const matches=active.filter(c=>hasScore(c)&&available[c.id]>c.threshold),partial=active.some(c=>!hasScore(c));
  const outcome=matches.some(c=>c.action==="hide")?"Would hide this post":matches.some(c=>c.action==="highlight")?"Would highlight this post":matches.length?"Would label this post":"Would keep this post visible";
  const title=el("h2",{textContent:(partial?"Partly scored · ":"")+outcome});
  const description=el("p",{textContent:partial?"Some categories did not return a usable score. Missing scores never apply.":"Every active category returned a score. A match needs a score strictly above its own threshold."});
  const shown=[...categories,...savedSettings.categories.filter(c=>c.action==="off"&&!categories.some(x=>x.id===c.id)).map(({id,name,action,threshold})=>({id,name,action,threshold}))];
  const table=el("table",{className:"results-table"},el("thead",{},el("tr",{},... ["Category","Score","Rule","Result"].map(value=>el("th",{textContent:value})))),el("tbody",{},...shown.map(c=>{
    const scored=hasScore(c),match=scored&&available[c.id]>c.threshold&&c.action!=="off";
    return el("tr",{className:match?"matched":""},el("td",{textContent:c.name}),el("td",{textContent:c.action==="off"?"Not asked":scored?percent(available[c.id]):"Missing"}),el("td",{textContent:c.action==="off"?"Off":ACTION_LABELS[c.action]+" above "+percent(c.threshold)}),el("td",{textContent:c.action==="off"?"Inactive":!scored?"Not scored":match?(percent(available[c.id])===percent(c.threshold)&&available[c.id]!==c.threshold?"Matches · just above":"Matches"):(scored&&percent(available[c.id])===percent(c.threshold)&&available[c.id]!==c.threshold?"No match · just below":"No match")}));
  })));
  $("playgroundResult").replaceChildren(title,description,table,el("p",{className:"note",textContent:"Scored with "+providerName(result.provider)+". "+(result.provider==="ollama"?"Local scores express model confidence and have not been checked against measured probabilities.":"Scores are not an explanation or proof of AI authorship.")}));$("playgroundResult").hidden=false;
}
let playgroundGeneration=0,playgroundPending=false;
function invalidatePlayground(message=""){playgroundGeneration++;$("playgroundResult").hidden=true;$("playgroundStatus").textContent=message;}
$("playgroundText").addEventListener("input",()=>invalidatePlayground(playgroundPending?"Text changed. The earlier result will be discarded.":""));
$("classifyPost").disabled=!bridgeAvailable;
if (!bridgeAvailable) $("playgroundStatus").textContent="The extension service is unavailable. Reopen settings or reload the extension to check a post.";
$("classifyPost").addEventListener("click",async()=>{
  const text=$("playgroundText").value.trim();
  if (!text) {$("playgroundStatus").textContent="Enter some post text first.";return;}
  const generation=++playgroundGeneration;playgroundPending=true;
  $("classifyPost").disabled=true;$("playgroundResult").hidden=true;$("playgroundStatus").textContent=savedSettings.provider==="ollama"&&text.length>LOCAL_TEXT_MAX?"Checking the first "+LOCAL_TEXT_MAX.toLocaleString()+" characters with local Ollama…":"Checking with your saved settings…";
  try {
    const result=await send({type:"playground",text});if(generation!==playgroundGeneration)return;
    if(result.disabled)throw new Error("This post was not scored because the saved settings changed while it was waiting. Try again with the current settings.");
    if(!Array.isArray(result.categories)||!result.categories.length||!result.scores||!Object.values(result.scores).some(score=>typeof score==="number"&&Number.isFinite(score)&&score>=0&&score<=1))throw new Error("The provider returned no usable scores. This post was not checked.");
    renderPlayground(result);$("playgroundStatus").textContent=dirty?"Finished using saved settings. Your unsaved edits were not used.":"Finished. This test was not saved as a correction.";
  } catch(error){if(generation===playgroundGeneration)$("playgroundStatus").textContent=error.message;}
  finally {playgroundPending=false;$("classifyPost").disabled=false;await updateUsage();}
});
$("clearPlayground").addEventListener("click",()=>{$("playgroundText").value="";invalidatePlayground();$("playgroundText").focus();});
// Keep focused fields above the persistent footer, including at narrow widths and long status messages.
function keepFocusedFieldVisible(){
  const focused=document.activeElement;if(!focused||!$("settings").contains(focused)||focused.closest(".save-bar"))return;
  const bottom=focused.getBoundingClientRect().bottom,footer=document.querySelector(".save-bar").getBoundingClientRect().top;
  if(bottom>footer-12)window.scrollBy(0,bottom-footer+16);
}
document.addEventListener("focusin",()=>requestAnimationFrame(keepFocusedFieldVisible));
new ResizeObserver(()=>{const height=document.querySelector(".save-bar").getBoundingClientRect().height;document.documentElement.style.scrollPaddingBottom=(height+28)+"px";document.querySelector(".settings-app").style.paddingBottom=Math.max(120,height+40)+"px";keepFocusedFieldVisible();}).observe(document.querySelector(".save-bar"));
document.documentElement.dataset.settingsReady="true";

async function refreshPeople() {
  try {
    const {people} = await send({type:"people",action:"list"});
    if (!Array.isArray(people)) throw new Error("The never-hide list is unavailable.");
    $("peopleList").replaceChildren(...people.map(person => {
      const link=el("a",{href:person.url,target:"_blank",rel:"noopener noreferrer",textContent:person.name||person.url});
      const remove=el("button",{type:"button",className:"secondary",textContent:"Remove"});
      remove.setAttribute("aria-label","Remove "+(person.name||person.url)+" from never-hide list");
      remove.addEventListener("click",async()=>{remove.disabled=true;try{await send({type:"people",action:"set",url:person.url,value:false});await refreshPeople();$("peopleStatus").textContent="Removed. Normal filtering applies again.";}catch(error){$("peopleStatus").textContent=error.message;remove.disabled=false;}});
      return el("div",{className:"button-row"},link,remove);
    }));
    if (!people.length) $("peopleList").append(el("p",{className:"empty-state",textContent:"No one selected yet."}));
  } catch(error) { $("peopleStatus").textContent=error.message; }
}
$("addPerson").addEventListener("click",async()=>{
  $("addPerson").disabled=true;
  try{await send({type:"people",action:"set",url:$("personUrl").value,value:true});$("personUrl").value="";await refreshPeople();$("peopleStatus").textContent="Saved. This person’s posts stay visible.";}
  catch(error){$("peopleStatus").textContent=error.message;}
  finally{$("addPerson").disabled=false;}
});
