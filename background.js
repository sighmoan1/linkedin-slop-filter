import {loadSettings, categoryList, activeCategories, displayCategories, requestFor, validScores, scoringKey, CACHE_PREFIX, cacheFresh, cacheEvictions, APPEARANCE_DEFAULTS, normalizeAppearance, CORRECTIONS_KEY, MAX_CORRECTIONS, normalizeCorrections, makeCorrection, isFeedUrl, isPeopleUrl, profileUrl, normalizePeople, PEOPLE_KEY, MAX_PEOPLE, normalizeImages, visualCategory, imageScoringKey, imageRequest, prepareAttachment, attachmentUrl, IMAGE_PERMISSION, IMAGE_MODELS, VISUAL_ID} from "./core.mjs";
// API keys remain in trusted extension contexts.
chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
let chain = Promise.resolve();
let edits = Promise.resolve();
let usageEdits = Promise.resolve();
let serviceStatusEdits = Promise.resolve();
const pending = new Map();
const statusRecorded = Symbol("statusRecorded");
const failure = (message, short, status) => Object.assign(new Error(message), {short, status});
const load = () => loadSettings(chrome.storage.local);
const hash = async text => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,"0")).join("");
};
// What the feed page may know: no keys and no definitions.
const feedKey = s => normalizeImages(s.imageAnalysis).enabled ? JSON.stringify([scoringKey(s),imageScoringKey(s.imageAnalysis)]) : scoringKey(s);
const feedCategories = s => {const cats=categoryList(s);return normalizeImages(s.imageAnalysis).enabled?cats.concat(visualCategory(s.imageAnalysis)):cats;};
const view = async s => ({enabled:s.enabled, provider:s.provider, configuration:await hash(feedKey(s)), categories:displayCategories(feedCategories(s)),
  ...(normalizeImages(s.imageAnalysis).enabled?{images:{enabled:true,model:normalizeImages(s.imageAnalysis).model}}:{})});
const stillCurrent = async (s, manual = false) => {
  const current = await load();
  return (manual || current.enabled) && scoringKey(current) === scoringKey(s);
};
const bumpUsage = field => {
  const job = usageEdits.then(async () => {
    const {usage = {}} = await chrome.storage.session.get("usage");
    await chrome.storage.session.set({usage: {...usage, [field]: (Number.isFinite(usage[field]) ? usage[field] : 0) + 1}});
  });
  usageEdits = job.catch(() => {});
  return job;
};
async function badge(message = "") {
  // Deliberately use only our error messages, never provider response bodies.
  try {
    await chrome.action?.setBadgeText?.({text: message ? "!" : ""});
    if (message) await chrome.action?.setBadgeBackgroundColor?.({color: "#a34b29"});
    await chrome.action?.setTitle?.({title: message ? "LinkedIn Slop Filter: " + message : "LinkedIn Slop Filter"});
  } catch { /* A toolbar that is unavailable must not affect the feed. */ }
}
const classificationMessage = (error, image = false) => error.name === "AbortError" ? (image ? "Image check timed out. Post left visible." : "Classification timed out. Post left visible.") : error.message;
const recordedStatus = error => error && typeof error === "object" && error[statusRecorded] === true;
async function recordClassificationFailure(field, message, error) {
  if (recordedStatus(error)) return;
  const job = serviceStatusEdits.then(async () => {
    await bumpUsage(field);
    await chrome.storage.local.set({lastError:message});
    await badge(message);
  });
  serviceStatusEdits = job.catch(() => {});
  await job;
  if (error && typeof error === "object") error[statusRecorded] = true;
}
async function waitForServiceStatus() {
  await usageEdits;
  await serviceStatusEdits;
  await usageEdits;
}
function usageSnapshot(settings, state, lastError = "") {
  const usage = state.usage && typeof state.usage === "object" ? state.usage : {};
  const count = value => Number.isFinite(value) && value >= 0 ? value : 0;
  return {requests:count(state.requests),limit:settings.limit,scored:count(usage.scored),folded:count(usage.folded),cacheHits:count(usage.cacheHits),errors:count(usage.errors),imageScored:count(usage.imageScored),imageErrors:count(usage.imageErrors),lastError};
}
async function currentUsage() {
  await waitForServiceStatus();
  const settings = await load();
  const state = await chrome.storage.session.get({requests:0,usage:{}});
  const {lastError = ""} = await chrome.storage.local.get("lastError");
  return usageSnapshot(settings,state,typeof lastError === "string" ? lastError : "");
}
function resetUsage() {
  const job = chain.then(async () => {
    await waitForServiceStatus();
    await chrome.storage.session.set({requests:0,usage:{}});
    await chrome.storage.local.remove("lastError");
    await badge();
    return currentUsage();
  });
  chain = job.catch(() => {});
  return job;
}
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes.lastError) badge(changes.lastError.newValue || "");
});
chrome.storage.local.get("lastError").then(s => badge(s.lastError || "")).catch(() => {});

function senderKind(sender) {
  if (sender?.id && chrome.runtime.id && sender.id !== chrome.runtime.id) return null;
  try {
    const url = new URL(sender?.url);
    if (isFeedUrl(sender.url)) return "feed";
    if (isPeopleUrl(sender.url)) return "people";
    const base = chrome.runtime.getURL?.("");
    if (base) {
      const own = new URL(base);
      if (url.protocol === own.protocol && url.host === own.host && ["/options.html", "/popup.html"].includes(url.pathname)) return "trusted";
    }
  } catch { /* Reject malformed and missing senders. */ }
  return null;
}
const tabFor = (kind, sender, message) => {
  const id = kind === "feed" ? sender.tab?.id : message.tabId;
  return Number.isInteger(id) && id >= 0 ? id : null;
};
const overrideKey = tabId => "showEverything:" + tabId;
async function experience(tabId) {
  const saved = await chrome.storage.local.get({appearance: APPEARANCE_DEFAULTS});
  const temporary = tabId === null ? {} : await chrome.storage.session.get(overrideKey(tabId));
  return {appearance: normalizeAppearance(saved.appearance), showEverything: tabId !== null && temporary[overrideKey(tabId)] === true};
}
chrome.tabs?.onRemoved?.addListener(tabId => chrome.storage.session.remove(overrideKey(tabId)).catch(() => {}));

async function classifyText(rawText, manual = false) {
    const s = await load();
    if (!manual && !s.enabled) return {disabled:true};
    const text = rawText.trim().slice(0,s.provider === "ollama" ? 2000 : 12000);
    if (!text) throw new Error("No post text");
    const cats = activeCategories(categoryList(s));
    if (!cats.length) throw failure("Switch at least one category on before trying a post.", "no active categories");
    const key = scoringKey(s);
    const configuration = await hash(feedKey(s));
    // The cache contains only a text hash, scores and time, never the original body.
    const id = CACHE_PREFIX + await hash(JSON.stringify([key,text]));
    const jobId = id + (manual ? ":manual" : ":feed");
    const cacheStorage = s.provider === "ollama" ? chrome.storage.session : chrome.storage.local;
    const result = async sc => {
      const current = await load();
      if ((!manual && !current.enabled) || scoringKey(current) !== key) return {disabled:true};
      return {scores:sc,...await view(current)};
    };
    const cached = (await cacheStorage.get(id))[id];
    if (cacheFresh(cached)) {await bumpUsage("cacheHits"); return result(cached.s);}
    if (!pending.has(jobId)) {
      const baseJob = chain.then(async () => {
        if (!await stillCurrent(s, manual)) return undefined;
        // A feed request and a deliberate playground request may have queued the same text.
        // Reuse the result completed ahead of this job before spending another attempt.
        const completed = (await cacheStorage.get(id))[id];
        if (cacheFresh(completed)) {await bumpUsage("cacheHits"); return completed.s;}
        const current = await load();
        const ask = async questions => {
          const req = requestFor(s, text, questions);
          const state = await chrome.storage.session.get({requests:0});
          const limit = Number.isFinite(current.limit) && current.limit >= 1 ? current.limit : 100;
          if (state.requests >= limit) throw failure("Session request limit reached. Increase the limit in settings or restart Chrome.","request limit reached");
          if (s.provider !== "ollama" && !req.key) throw failure("Add your provider API key in extension settings.","no API key");
          await chrome.storage.session.set({requests:state.requests+1});
          const controller = new AbortController();
          const timeout = setTimeout(()=>controller.abort(),req.timeout || 20000);
          try {
            const headers = {"Content-Type":"application/json"};
            if (req.key) headers.Authorization = "Bearer "+req.key;
            let response;
            try {
              response = await fetch(req.url, {method:"POST",headers,body:JSON.stringify(req.body),signal:controller.signal,redirect:"error",credentials:"omit"});
            } catch (error) {
              if (error.name === "AbortError") throw error;
              throw new Error(s.provider === "ollama" ? "Ollama unavailable. Start Ollama on this computer and check extension access in Provider settings. Post left visible." : "Provider unavailable. Post left visible.");
            }
            if (!response.ok) throw failure(s.provider === "ollama" ? "Ollama HTTP "+response.status+(response.status === 403 ? ". Allow this extension origin in OLLAMA_ORIGINS. Post left visible." : ". Check the service and downloaded model. Post left visible.") : "API request failed (HTTP "+response.status+"). Check your key, credit and model access.",s.provider === "ollama" ? "Ollama error "+response.status : "API error "+response.status,response.status);
            let data;
            try { data = await response.json(); } catch { throw new Error("Provider returned invalid JSON. Post left visible."); }
            try { return validScores(s.provider,data,questions); } catch(error) { throw failure(error.message,"invalid answer"); }
          } finally { clearTimeout(timeout); }
        };
        const hideOnly = cats.filter(c => c.action === "hide");
        const canFallBack = hideOnly.length > 0 && hideOnly.length < cats.length;
        const refused = canFallBack && (await chrome.storage.session.get({multiRefused:null})).multiRefused === configuration;
        let sc, fellBack = refused;
        try { sc = await ask(refused ? hideOnly : cats); }
        catch (error) {
          if (refused || !canFallBack || (error.status !== 400 && error.status !== 422)) throw error;
          sc = await ask(hideOnly);
          fellBack = true;
          await chrome.storage.session.set({multiRefused:configuration});
          const warning = "The provider refused several questions at once (HTTP "+error.status+"), so only categories set to hide are being scored. Change settings to try all categories again.";
          await chrome.storage.local.set({lastError:warning});
          await badge(warning);
        }
        await cacheStorage.set({[id]:{s:sc,t:Date.now()}});
        await cacheStorage.remove(cacheEvictions(await cacheStorage.get(null)));
        await bumpUsage("scored");
        if (!fellBack) {await chrome.storage.local.remove("lastError"); await badge();}
        return sc;
      });
      const job = baseJob.catch(async error => {
        await recordClassificationFailure("errors", classificationMessage(error), error);
        throw error;
      });
      chain = job.catch(()=>{});
      pending.set(jobId,job);
      job.finally(()=>pending.delete(jobId)).catch(()=>{});
    }
    const sc = await pending.get(jobId);
    return sc === undefined ? {disabled:true} : result(sc);
}

// Same sequential queue and request cap as text. Image bytes live only for the current request.
async function classifyImages(s,text,urls,{manual=false,model,preparedImages,recordFailure=false}={}) {
  if(!preparedImages&&(!Array.isArray(urls)||!urls.length||urls.length>4))throw new Error("Image count exceeds the trial limit. Image check unavailable.");
  const checked=preparedImages?[]:[...new Set(urls.map(attachmentUrl))];
  const images=normalizeImages({...s.imageAnalysis,...(model?{model}:{})}),key=feedKey(s);
  const same = async()=>{const now=await load();return (manual||now.enabled)&&feedKey(now)===key;};
  const baseJob=chain.then(async()=>{
    if(!await same())return {disabled:true};
    if(!s.jevKey)throw new Error("Add an OpenRouter API key in Provider settings to check images.");
    if(!preparedImages&&!await chrome.permissions?.contains({origins:[IMAGE_PERMISSION]}))throw new Error("Allow post image access in Settings to check images.");

    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try {
      imageRequest(images,text,["data:image/jpeg;base64,AA=="]);
      const prepared=preparedImages?[...preparedImages]:[];
      for(const url of checked)prepared.push(await prepareAttachment(url,controller.signal));
      const req=imageRequest(images,text,prepared);
      const imageFingerprint=await hash(JSON.stringify(prepared));
      const id=CACHE_PREFIX+await hash(JSON.stringify([imageScoringKey({...images,enabled:true}),text,imageFingerprint]));
      const cached=(await chrome.storage.local.get(id))[id];
      if(!await same())return {disabled:true};
      if(cacheFresh(cached)&&typeof cached.s?.[VISUAL_ID]==="number"){
        await bumpUsage("cacheHits");return {scores:cached.s,imageStatus:"scored",imageModel:images.model,imageFingerprint};
      }
      if(!await same())return {disabled:true};
      const state=await chrome.storage.session.get({requests:0}),now=await load();
      if(state.requests>=now.limit)throw new Error("Session request limit reached. Image check unavailable.");
      await chrome.storage.session.set({requests:state.requests+1});
      let response;
      try {response=await fetch(req.url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+s.jevKey},
        body:JSON.stringify(req.body),signal:controller.signal,credentials:"omit",redirect:"error"});}
      catch {throw new Error("Image provider unavailable. Post left visible.");}
      if(!response.ok)throw new Error("Image provider request failed (HTTP "+response.status+"). Post left visible.");
      let data;try{data=await response.json();}catch{throw new Error("Image provider returned invalid JSON. Post left visible.");}
      const scores=validScores("jev",data,[visualCategory(images)]);
      if(!await same())return {disabled:true};
      await chrome.storage.local.set({[id]:{s:scores,t:Date.now()}});
      await chrome.storage.local.remove(cacheEvictions(await chrome.storage.local.get(null)));
      await bumpUsage("imageScored");
      const usage=data.usage,imageUsage={model:images.model};
      if(Number.isFinite(usage?.input_tokens)&&usage.input_tokens>=0)imageUsage.inputTokens=usage.input_tokens;
      if(Number.isFinite(usage?.cost)&&usage.cost>=0)imageUsage.cost=usage.cost;
      return {scores,imageStatus:"scored",imageModel:images.model,imageFingerprint,imageUsage};
    } finally {clearTimeout(timer);}
  });
  const job=recordFailure?baseJob.catch(async error=>{await recordClassificationFailure(recordFailure,classificationMessage(error,true),error);throw error;}):baseJob;
  chain=job.catch(()=>{});return job;
}
async function classify(text,manual=false,imageUrls) {
  const s=await load();
  if(!manual&&!s.enabled)return {disabled:true};
  const imageEnabled=!manual&&normalizeImages(s.imageAnalysis).enabled;
  if(imageEnabled&&categoryList(s).some(c=>c.id===VISUAL_ID))throw new Error("Rename the reserved Visual slop category before enabling image checks.");
  const result=text.trim()?await classifyText(text,manual):imageEnabled&&imageUrls?.length?{scores:{},...await view(s)}:await classifyText(text,manual);
  if(manual&&result.categories)result.categories=result.categories.filter(c=>c.id!==VISUAL_ID);
  if(result.disabled||!imageEnabled)return result;
  if(feedKey(await load())!==feedKey(s))return {disabled:true};
  if(!imageUrls?.length)return {...result,imageStatus:"no-image"};
  if(activeCategories(categoryList(s)).some(c=>c.action==="hide"&&result.scores[c.id]>c.threshold))return {...result,imageStatus:"skipped-hidden"};
  try {
    const visual=await classifyImages(s,text.trim(),imageUrls,{recordFailure:"imageErrors"});
    if(visual.disabled)return visual;
    return {...result,...visual,scores:{...result.scores,...visual.scores}};
  } catch(error) {
    await recordClassificationFailure("imageErrors",classificationMessage(error,true),error);
    return {...result,imageStatus:"unavailable"};
  }
}

async function handle(message, sender, kind) {
  const tabId = tabFor(kind, sender, message);
  if (message.type === "people") {
    const job = edits.then(async () => {
      let people = normalizePeople((await chrome.storage.local.get(PEOPLE_KEY))[PEOPLE_KEY]);
      if (message.action === "set") {
        const url = profileUrl(message.url);
        if (!url || typeof message.value !== "boolean") throw new Error("Choose a LinkedIn profile and whether to keep it visible.");
        people = people.filter(p => p.url !== url);
        if (message.value) {
          if (people.length >= MAX_PEOPLE) throw new Error("The never-hide list is full. Remove someone first.");
          people.push({url, name: typeof message.name === "string" ? message.name.trim().slice(0,100) : ""});
        }
        await chrome.storage.local.set({[PEOPLE_KEY]:people});
      } else if (message.action !== "list") throw new Error("Unknown people action.");
      return {people: kind === "feed" ? people.map(p => p.url) : people};
    });
    edits = job.catch(() => {});
    return job;
  }
  if(message.type==="compareImages") {
    const saved=await load(),results=[];
    for(const model of IMAGE_MODELS){const started=Date.now();try {
      const result=await classifyImages(saved,message.text,[],{manual:true,model,preparedImages:message.images});
      results.push({model,...result,durationMs:Date.now()-started});
    } catch {results.push({model,error:"Image check unavailable. Check provider status, request limit and input limits.",durationMs:Date.now()-started});}}
    return {results};
  }
  if (message.type === "settings") return view(await load());
  if (message.type === "experience") return experience(tabId);
  if (message.type === "appearance") {
    if (!message.appearance || typeof message.appearance !== "object" || Array.isArray(message.appearance)) throw new Error("Choose feed appearance preferences.");
    const current = await experience(tabId);
    await chrome.storage.local.set({appearance: normalizeAppearance({...current.appearance,...message.appearance})});
    return experience(tabId);
  }
  if (message.type === "showEverything") {
    if (tabId === null || typeof message.value !== "boolean") throw new Error("Open a LinkedIn feed tab to use Show everything.");
    await chrome.storage.session.set({[overrideKey(tabId)]:message.value});
    return experience(tabId);
  }
  if (message.type === "openSettings") {
    const section = ["feed","categories","provider","corrections","playground","people"].includes(message.section) ? message.section : null;
    if (section && chrome.tabs?.create && chrome.runtime.getURL) {
      await chrome.tabs.create({url:chrome.runtime.getURL("options.html#" + section)});
    } else await chrome.runtime.openOptionsPage();
    return {ok:true};
  }
  if (message.type === "folded") {
    await bumpUsage("folded");
    return {ok:true};
  }
  if (message.type === "correction") {
    const s = await load();
    const correction = makeCorrection(message, feedCategories(s), {
      id:crypto.randomUUID(),at:Date.now(),provider:s.provider,configuration:await hash(feedKey(s))
    });
    const job = edits.then(async () => {
      const stored = await chrome.storage.local.get(CORRECTIONS_KEY);
      const corrections = [...normalizeCorrections(stored[CORRECTIONS_KEY]),correction].slice(-MAX_CORRECTIONS);
      await chrome.storage.local.set({[CORRECTIONS_KEY]:corrections});
    });
    edits = job.catch(() => {});
    await job;
    return {ok:true,id:correction.id};
  }
  if (message.type === "corrections") {
    const job = edits.then(async () => {
      const stored = await chrome.storage.local.get(CORRECTIONS_KEY);
      let corrections = normalizeCorrections(stored[CORRECTIONS_KEY]);
      if (message.action === "remove") {
        if (typeof message.id !== "string") throw new Error("Choose a correction to remove.");
        corrections = corrections.filter(c => c.id !== message.id);
      } else if (message.action === "clear") corrections = [];
      else if (message.action !== "list") throw new Error("Unknown correction action.");
      if (message.action !== "list") await chrome.storage.local.set({[CORRECTIONS_KEY]:corrections});
      return {corrections};
    });
    edits = job.catch(() => {});
    return job;
  }
  if (message.type === "usage") {
    return currentUsage();
  }
  if (message.type === "resetUsage") {
    return resetUsage();
  }
  return classify(message.text, message.type === "playground", message.imageUrls);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const kind = senderKind(sender);
  if (!kind || !message || typeof message !== "object") return false;
  const shared = ["settings","experience","appearance","showEverything","openSettings","correction"];
  const allowed = kind === "feed" ? [...shared,"classify","folded"] : [...shared,"usage","resetUsage","corrections","playground","compareImages"];
  if (kind === "people" && message.type !== "people") return false;
  if (message.type === "people") {
    if (kind === "feed" && message.action !== "list") return false;
  } else if (!allowed.includes(message.type)) return false;
  if (["classify","playground","compareImages"].includes(message.type) && (typeof message.text !== "string" || message.text.length > 12000)) return false;
  if(message.imageUrls!==undefined&&(!Array.isArray(message.imageUrls)||message.imageUrls.length>5||message.imageUrls.some(x=>typeof x!=="string"||x.length>4096)))return false;
  if(message.type==="compareImages"&&(!Array.isArray(message.images)||!message.images.length||message.images.length>4||message.images.some(x=>typeof x!=="string"||x.length>150000)||message.images.reduce((n,x)=>n+x.length,0)>150000))return false;
  const isClassification = ["classify","playground"].includes(message.type);
  const work = handle(message, sender, kind);
  work.then(respond).catch(async error => {
    const message = classificationMessage(error);
    if (isClassification) {
      await recordClassificationFailure("errors",message,error);
    }
    respond({error:message,short:error.name === "AbortError" ? "timed out" : error.short || "error"});
  });
  return true;
});
