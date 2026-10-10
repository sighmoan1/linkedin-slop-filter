import {loadSettings, categoryList, activeCategories, displayCategories, requestFor, validScores, scoringKey, CACHE_PREFIX, cacheFresh, cacheEvictions, APPEARANCE_DEFAULTS, normalizeAppearance, CORRECTIONS_KEY, MAX_CORRECTIONS, normalizeCorrections, makeCorrection, isFeedUrl} from "./core.mjs";
// API keys remain in trusted extension contexts.
chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
let chain = Promise.resolve();
let edits = Promise.resolve();
let usageEdits = Promise.resolve();
const pending = new Map();
const failure = (message, short, status) => Object.assign(new Error(message), {short, status});
const load = () => loadSettings(chrome.storage.local);
const hash = async text => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,"0")).join("");
};
// What the feed page may know: no keys and no definitions.
const view = async s => ({enabled:s.enabled, provider:s.provider, configuration:await hash(scoringKey(s)), categories:displayCategories(categoryList(s))});
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
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes.lastError) badge(changes.lastError.newValue || "");
});
chrome.storage.local.get("lastError").then(s => badge(s.lastError || "")).catch(() => {});

function senderKind(sender) {
  if (sender?.id && chrome.runtime.id && sender.id !== chrome.runtime.id) return null;
  try {
    const url = new URL(sender?.url);
    if (isFeedUrl(sender.url)) return "feed";
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

async function classify(rawText, manual = false) {
    const s = await load();
    if (!manual && !s.enabled) return {disabled:true};
    const text = rawText.trim().slice(0,s.provider === "ollama" ? 2000 : 12000);
    if (!text) throw new Error("No post text");
    const cats = activeCategories(categoryList(s));
    if (!cats.length) throw failure("Switch at least one category on before trying a post.", "no active categories");
    const key = scoringKey(s);
    const configuration = await hash(key);
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
      const job = chain.then(async () => {
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
              throw new Error(s.provider === "ollama" ? "Ollama unavailable. Start its loopback service and check extension origin access. Post left visible." : "Provider unavailable. Post left visible.");
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
      chain = job.catch(()=>{});
      pending.set(jobId,job);
      job.finally(()=>pending.delete(jobId)).catch(()=>{});
    }
    const sc = await pending.get(jobId);
    return sc === undefined ? {disabled:true} : result(sc);
}

async function handle(message, sender, kind) {
  const tabId = tabFor(kind, sender, message);
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
    const section = ["feed","categories","provider","corrections","playground"].includes(message.section) ? message.section : "feed";
    if (section !== "feed" && chrome.tabs?.create && chrome.runtime.getURL) {
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
    const correction = makeCorrection(message, categoryList(s), {
      id:crypto.randomUUID(),at:Date.now(),provider:s.provider,configuration:await hash(scoringKey(s))
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
    await usageEdits;
    const s = await load();
    const state = await chrome.storage.session.get({requests:0,usage:{}});
    const {lastError = ""} = await chrome.storage.local.get("lastError");
    return {requests:state.requests,limit:s.limit,scored:state.usage.scored || 0,folded:state.usage.folded || 0,cacheHits:state.usage.cacheHits || 0,errors:state.usage.errors || 0,lastError};
  }
  return classify(message.text, message.type === "playground");
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const kind = senderKind(sender);
  if (!kind || !message || typeof message !== "object") return false;
  const shared = ["settings","experience","appearance","showEverything","openSettings","correction"];
  const allowed = kind === "feed" ? [...shared,"classify","folded"] : [...shared,"usage","corrections","playground"];
  if (!allowed.includes(message.type)) return false;
  if (["classify","playground"].includes(message.type) && (typeof message.text !== "string" || message.text.length > 12000)) return false;
  const isClassification = ["classify","playground"].includes(message.type);
  const work = handle(message, sender, kind);
  work.then(respond).catch(async error => {
    const message = error.name === "AbortError" ? "Classification timed out. Post left visible." : error.message;
    if (isClassification) {
      await bumpUsage("errors");
      await chrome.storage.local.set({lastError:message});
      await badge(message);
    }
    respond({error:message,short:error.name === "AbortError" ? "timed out" : error.short || "error"});
  });
  return true;
});
