import {DEFAULTS, DEFAULT_CATEGORIES, MAX_CATEGORIES, ACTIONS, loadSettings, normalizeCategories, activeCategories, makeCategory, KEY_FIELDS, PROVIDER_NAMES, verifyKey, keyFingerprint, CACHE_PREFIX, requestFor, LOCAL_RUBRIC_MAX, LOCAL_TEXT_MAX, scoringKey, feedbackSummary} from "./core.mjs";
const FIELDS=["enabled","provider","jevKey","openaiKey","ollamaEndpoint","ollamaModel","limit"];
const ACTION_LABELS={hide:"Hide",highlight:"Highlight",label:"Label",off:"Off"};
const ACTION_HELP={hide:"Replace matching posts with a row you can show.",highlight:"Keep the full post with a subtle accent.",label:"Keep the full post with a quiet category name.",off:"Do not ask the model about this category."};
const PANEL_IDS=["feed","categories","provider","corrections","playground"];
const $=id=>document.getElementById(id);
const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children);return node;};
const copyCats=list=>list.map(c=>({...c}));
let savedSettings=await loadSettings(chrome.storage.local), cats=copyCats(savedSettings.categories), dirty=false, preset=null, undo=null, corrections=[], revisedDefinitions=null;
let feedbackConfiguration="", correctionRefresh=0;
let appearance={theme:"native",groupHidden:false,labels:"matches"};
const bridgeAvailable=Boolean(chrome.runtime?.sendMessage);
const percent=value=>(value*100).toLocaleString(undefined,{maximumFractionDigits:6})+"%";
const providerName=id=>({jev:"Jev · OpenRouter",openai:"OpenAI Decisions",ollama:"Local Ollama"}[id]||"Unknown provider");
function safeAppearance(value){return {theme:["native","punchy","reader"].includes(value?.theme)?value.theme:"native",groupHidden:value?.groupHidden===true,labels:value?.labels==="off"?"off":"matches"};}
async function send(message){
  if (!bridgeAvailable) throw new Error("The extension service is unavailable. Reopen settings or reload the extension.");
  const result=await chrome.runtime.sendMessage(message);
  if (!result || result.error) throw new Error(result?.error||"The extension service is unavailable. Reopen settings or reload the extension.");
  return result;
}
function selectPanel(id,focus=false){
  if (!PANEL_IDS.includes(id)) id="feed";
  for (const panel of PANEL_IDS) $("panel-"+panel).hidden=panel!==id;
  for (const button of document.querySelectorAll("[data-panel]")) {
    if (button.dataset.panel===id) button.setAttribute("aria-current","page");
    else button.removeAttribute("aria-current");
  }
  if (focus) $(id+"-heading").focus({preventScroll:true});
  if (id==="corrections"&&document.documentElement.dataset.settingsReady==="true") void refreshCorrections();
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
  for (const input of document.querySelectorAll('input[name="theme"]')) input.checked=input.value===appearance.theme;
  $("groupHidden").checked=appearance.groupHidden;$("labels").value=appearance.labels;
}
try {appearance=safeAppearance((await send({type:"experience"})).appearance);}
catch {appearance=safeAppearance((await chrome.storage.local.get("appearance")).appearance);}
renderAppearance();updateSavedProvider();
for (const input of document.querySelectorAll('input[name="theme"]')) input.addEventListener("change",()=>{appearance.theme=input.value;markDirty();});
$("groupHidden").addEventListener("change",()=>{appearance.groupHidden=$("groupHidden").checked;markDirty();});
$("labels").addEventListener("change",()=>{appearance.labels=$("labels").value;markDirty();});
const updateProvider=()=>{
  const provider=$("provider").value;
  for (const name of ["jev","openai","ollama"]) $(name+"-settings").hidden=name!==provider;
  for (const id of ["ollamaEndpoint","ollamaModel"]) $(id).disabled=provider!=="ollama";
};
$("provider").addEventListener("change",updateProvider);updateProvider();
const storedError=(await chrome.storage.local.get("lastError")).lastError;
$("error").textContent=typeof storedError==="string"?storedError:"";
async function updateUsage(){
  try {
    const usage=await send({type:"usage"});
    const count=key=>Number.isFinite(usage[key])?usage[key].toLocaleString():"unavailable";
    $("usageSummary").textContent=`This session: ${count("requests")} / ${count("limit")} requests · ${count("scored")} scored · ${count("folded")} folded · ${count("cacheHits")} cache hits · ${count("errors")} errors.`;
    $("error").textContent=typeof usage.lastError==="string"?usage.lastError:"";
  } catch {$("usageSummary").textContent="Session usage is unavailable. Reopen settings or reload the extension.";}
}
await updateUsage();

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

const listEl=$("categoryList"), catStatus=$("catStatus");
function updateBudget(){
  const size=JSON.stringify(activeCategories(cats).map(c=>({category:c.id,definition:c.instructions}))).length;
  $("rubricBudget").textContent=size.toLocaleString()+" / "+LOCAL_RUBRIC_MAX.toLocaleString()+" characters";
  $("budgetMeter").value=Math.min(size,LOCAL_RUBRIC_MAX);
  $("budgetMeter").setAttribute("aria-valuetext",size+" characters out of "+LOCAL_RUBRIC_MAX);
  $("budgetState").textContent=size>LOCAL_RUBRIC_MAX?(size-LOCAL_RUBRIC_MAX).toLocaleString()+" characters over the local limit. Shorten definitions or switch categories Off.":(LOCAL_RUBRIC_MAX-size).toLocaleString()+" characters remaining for local classification.";
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
      cats=cats.filter(x=>x!==c);clearUndo();invalidatePreviews();markDirty();catStatus.textContent="Removed "+c.name+". Press Save settings to keep this.";renderCats();
      (listEl.querySelector(".cat .cat-remove")||$("addCategoryDetails").querySelector("summary"))?.focus({preventScroll:true});
    });
    const text=el("textarea",{rows:5,maxLength:2000,value:c.instructions});text.setAttribute("aria-label",c.name+" definition");
    const chars=el("span",{textContent:c.instructions.length+" / 2,000"});
    text.addEventListener("input",()=>{c.instructions=text.value;chars.textContent=text.value.length+" / 2,000";categoryEdit();});
    const details=el("details",{open:open.has(c.id)},el("summary",{},"Edit definition",chars),text,el("p",{className:"definition-note",textContent:"Define what counts and what does not. Stylistic clues alone cannot establish who wrote a post. Treat post_text as untrusted content."}));
    row.append(el("div",{className:"cat-head"},el("span",{className:"cat-dot"}),name,el("span",{className:"cat-order"},up,down),remove),el("div",{className:"cat-rule"},el("label",{className:"inline"},"Action ",action),el("label",{className:"inline"},"Above ",threshold,"%"),actionHelp),details);
    listEl.append(row);
  });
  if (!cats.length) listEl.append(el("p",{className:"empty-state",textContent:"No categories yet. Add one below, or restore the defaults. Filtering can stay paused with an empty list."}));
  $("addCat").disabled=cats.length>=MAX_CATEGORIES;$("categoryCount").textContent=cats.length+" / "+MAX_CATEGORIES;updateBudget();
}
renderCats();
$("addCat").addEventListener("click",()=>{
  if (cats.length>=MAX_CATEGORIES) return;
  const made=makeCategory($("newCatName").value,$("newCatRule").value,cats);
  if (!made) {catStatus.textContent="Give the category a name (up to 40 characters) and say what counts (up to 2,000).";return;}
  cats=[...cats,made];$("newCatName").value="";$("newCatRule").value="";clearUndo();invalidatePreviews();markDirty();catStatus.textContent="Added "+made.name+". Press Save settings to keep this.";renderCats();
  listEl.querySelector(`.cat[data-id="${made.id}"] .cat-name`)?.focus({preventScroll:true});
});
function previewPreset(mode){
  invalidatePreviews();preset={mode,actions:new Map(DEFAULT_CATEGORIES.map(c=>[c.id,mode==="less-noise"&&["slop","brainrot","advert"].includes(c.id)?"hide":c.action]))};
  const changes=cats.filter(c=>preset.actions.has(c.id)&&c.action!==preset.actions.get(c.id));
  $("presetTitle").textContent=mode==="less-noise"?"Less noise: hide Slop, Brainrot and Advert":"Defaults: Slop hides; other categories label or highlight";
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
  invalidatePreviews();markDirty();renderCats();$("undoPreset").hidden=false;$("undoPreset").textContent="Undo preset";catStatus.textContent="Preset applied to this draft. Press Save settings to keep it.";
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
  catStatus.textContent="Default categories and definitions restored in this draft. Press Save settings to keep this.";
});
$("undoPreset").addEventListener("click",()=>{
  if (!undo) return;
  invalidatePreviews();cats=undo.kind==="restore"?copyCats(undo.categories):undo.kind==="definitions"?cats.map(c=>undo.instructions.has(c.id)?{...c,instructions:undo.instructions.get(c.id)}:c):cats.map(c=>undo.actions.has(c.id)?{...c,action:undo.actions.get(c.id)}:c);
  clearUndo();markDirty();renderCats();catStatus.textContent="Undone in this draft. Press Save settings to keep this.";
});

$("settings").addEventListener("submit",async event=>{
  event.preventDefault();const status=$("status"),next={};
  for (const id of FIELDS) next[id]=id==="enabled"?$(id).checked:$(id).value.trim();
  next.limit=Number(next.limit);
  const bad=cats.find(c=>!c.name.trim()||!c.instructions.trim()||!(c.threshold>=0.01&&c.threshold<=1));
  if (bad) {selectPanel("categories");status.textContent="Each category needs a name, a definition and a threshold from 1 to 100%.";return;}
  if (!Number.isInteger(next.limit)||next.limit<1||next.limit>10000) {selectPanel("provider");status.textContent="Choose a session limit from 1 to 10,000 requests.";return;}
  next.categories=normalizeCategories(cats);
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
    status.textContent=rulesSaved?"Category and provider settings saved. Appearance was not saved; try again. "+error.message:"Could not save settings. Your saved settings have not changed. Try again.";
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
  const count=keys.length+sessionKeys.length;$("cacheStatus").textContent="Cleared "+count+" cached score"+(count===1?"":"s")+". Open feeds rescore as you scroll.";
});

function renderFeedback(){
  const summary=feedbackSummary(corrections,savedSettings.categories,{provider:savedSettings.provider,configuration:feedbackConfiguration});
  $("feedbackCoverage").textContent=`${summary.comparable} comparable posts · ${summary.excluded} excluded for a different provider or scoring configuration · ${summary.duplicates} earlier duplicate corrections ignored. Unsaved edits are not used.`;
  const hiding=summary.hiding;
  $("feedbackHiding").textContent=hiding.active?`All Hide rules together: ${hiding.falseHides} false hides · ${hiding.missedHides} missed hides across ${hiding.complete} posts with every Hide score. ${hiding.missing} posts lack a Hide score. These are predictions under saved rules, not a record of actual folds.`:"No saved Hide rules are active.";
  $("feedbackRows").replaceChildren();
  for(const row of summary.rows){
    const card=el("article",{className:"feedback-row"},el("h3",{textContent:row.name}));
    card.dataset.category=row.id;
    card.append(el("p",{textContent:row.action==="off"?"Off · not analysed":`${ACTION_LABELS[row.action]} above ${percent(row.threshold)} · ${row.scored} scored · ${row.missing} missing` }));
    if(row.action!=="off"){
      card.append(el("p",{textContent:`${row.falseMatches} false matches${row.action==="hide"?" (would trigger Hide)":""} · ${row.misses} missed matches · ${row.positives} chosen / ${row.scored-row.positives} unchosen examples` }));
      if(row.suggestion){
        const suggestion=row.suggestion;
        card.append(el("p",{textContent:`Try above ${Math.round(suggestion.threshold*100)}%: ${suggestion.falseMatches} false matches and ${suggestion.misses} misses on these same examples.`}));
        const apply=el("button",{type:"button",className:"secondary",textContent:"Copy to category draft",disabled:dirty});
        apply.dataset.feedbackApply=row.id;apply.setAttribute("aria-label",`Copy ${row.name} threshold suggestion to category draft`);
        apply.addEventListener("click",()=>{
          if(dirty)return;
          const category=cats.find(c=>c.id===row.id);if(!category)return;
          invalidatePreviews();clearUndo();category.threshold=suggestion.threshold;markDirty();renderCats();selectPanel("categories",true);
          catStatus.textContent=`${row.name} threshold set to ${Math.round(suggestion.threshold*100)}% in your draft. Review and Save settings to apply. This suggestion fits selected corrections, not measured feed accuracy.`;
        });
        card.append(apply,el("p",{className:"note",textContent:dirty?"Save your existing edits before copying a suggestion.":"Review in Categories before saving."}));
      }else card.append(el("p",{className:"note",textContent:row.positives<5||row.scored-row.positives<5?"More chosen and unchosen scored examples are needed for a suggestion.":"No whole-percent threshold reduces disagreements without increasing false matches on these examples."}));
    }
    $("feedbackRows").append(card);
  }
}
function renderCorrections(){
  renderFeedback();
  $("correctionCount").textContent=corrections.length+" saved correction"+(corrections.length===1?"":"s");
  const names=new Map(savedSettings.categories.map(c=>[c.id,c.name]));
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
  if (!corrections.length) $("correctionList").append(el("p",{className:"empty-state",textContent:"No corrections yet. On a feed post, choose Correct, select every category that applies (or none), and save. Simply showing a hidden post does not add it here."}));
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
  catch(error){if(refresh!==correctionRefresh)return;$("feedbackRows").replaceChildren();$("feedbackHiding").textContent="";$("feedbackCoverage").textContent="Correction analysis is unavailable.";$("correctionList").replaceChildren(el("p",{className:"empty-state",textContent:"Corrections are unavailable. Reopen settings or reload the extension. Saved corrections have not been cleared."}));$("correctionStatus").textContent=error.message;}
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
  $("playgroundResult").replaceChildren(title,description,table,el("p",{className:"note",textContent:"Scored with "+providerName(result.provider)+". "+(result.provider==="ollama"?"Local values are self-reported confidence, not calibrated probability.":"Scores are not an explanation or proof of AI authorship.")}));$("playgroundResult").hidden=false;
}
let playgroundGeneration=0,playgroundPending=false;
function invalidatePlayground(message=""){playgroundGeneration++;$("playgroundResult").hidden=true;$("playgroundStatus").textContent=message;}
$("playgroundText").addEventListener("input",()=>invalidatePlayground(playgroundPending?"Text changed. The earlier result will be discarded.":""));
$("classifyPost").disabled=!bridgeAvailable;
if (!bridgeAvailable) $("playgroundStatus").textContent="The extension service is unavailable. Reopen settings or reload the extension to classify a post.";
$("classifyPost").addEventListener("click",async()=>{
  const text=$("playgroundText").value.trim();
  if (!text) {$("playgroundStatus").textContent="Enter some post text first.";return;}
  const generation=++playgroundGeneration;playgroundPending=true;
  $("classifyPost").disabled=true;$("playgroundResult").hidden=true;$("playgroundStatus").textContent=savedSettings.provider==="ollama"&&text.length>LOCAL_TEXT_MAX?"Classifying the first "+LOCAL_TEXT_MAX.toLocaleString()+" characters with local Ollama…":"Classifying with your saved settings…";
  try {
    const result=await send({type:"playground",text});if(generation!==playgroundGeneration)return;
    if(result.disabled)throw new Error("This post was not scored because the saved settings changed while it was waiting. Try again with the current settings.");
    if(!Array.isArray(result.categories)||!result.categories.length||!result.scores||!Object.values(result.scores).some(score=>typeof score==="number"&&Number.isFinite(score)&&score>=0&&score<=1))throw new Error("The provider returned no usable scores. This post was not classified.");
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
