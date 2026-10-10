import {loadSettings, categoryList, activeCategories, displayCategories, requestFor, validScores, scoringKey, CACHE_PREFIX, cacheFresh, cacheEvictions} from "./core.mjs";
// API keys remain in trusted extension contexts.
chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
let chain = Promise.resolve();
const pending = new Map();
const failure = (message, short, status) => Object.assign(new Error(message), {short, status});
const load = () => loadSettings(chrome.storage.local);
const hash = async text => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,"0")).join("");
};
// What the feed page may know: no keys and no definitions.
const view = async s => ({enabled:s.enabled, provider:s.provider, configuration:await hash(scoringKey(s)), categories:displayCategories(categoryList(s))});
const stillCurrent = async s => {
  const current = await load();
  return current.enabled && scoringKey(current) === scoringKey(s);
};
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  try {
    const url = new URL(sender.url);
    if (url.origin !== "https://www.linkedin.com" || !(url.pathname === "/feed" || url.pathname.startsWith("/feed/"))) return false;
  } catch { return false; }
  if (message.type === "settings") {
    load().then(view).then(respond).catch(()=>respond({enabled:false}));
    return true;
  }
  if (message.type !== "classify" || typeof message.text !== "string") return false;
  const work = (async () => {
    const s = await load();
    if (!s.enabled) return {disabled:true};
    const text = message.text.trim().slice(0,s.provider === "ollama" ? 2000 : 12000);
    if (!text) throw new Error("No post text");
    const cats = activeCategories(categoryList(s));
    const key = scoringKey(s);
    const configuration = await hash(key);
    // The cache key covers every question asked, so editing a definition or switching a category on starts fresh scores.
    const id = CACHE_PREFIX + await hash(JSON.stringify([key,text]));
    const cacheStorage = s.provider === "ollama" ? chrome.storage.session : chrome.storage.local;
    // Scores are returned with the display settings current now, so action and threshold changes apply without a new request.
    const result = async sc => {
      const current = await load();
      if (!current.enabled || scoringKey(current) !== key) return {disabled:true};
      return {scores:sc,...await view(current)};
    };
    const cached = (await cacheStorage.get(id))[id];
    if (cacheFresh(cached)) return result(cached.s);
    if (!pending.has(id)) {
      const job = chain.then(async () => {
        if (!await stillCurrent(s)) return undefined;
        const current = await load();
        // Each attempt counts against the session limit.
        const ask = async questions => {
          const req = requestFor(s, text, questions);
          const state = await chrome.storage.session.get({requests:0});
          if (state.requests >= current.limit) throw failure("Session request limit reached. Increase the limit in settings or restart Chrome.","request limit reached");
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
        // A provider that refuses several questions at once (HTTP 400/422) is asked only the hide categories,
        // for as long as these settings stay the same. Changing settings tries every category again.
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
          await chrome.storage.local.set({lastError:"The provider refused several questions at once (HTTP "+error.status+"), so only categories set to hide are being scored. Change settings to try all categories again."});
        }
        await cacheStorage.set({[id]:{s:sc,t:Date.now()}});
        await cacheStorage.remove(cacheEvictions(await cacheStorage.get(null)));
        if (!fellBack) await chrome.storage.local.remove("lastError");
        return sc;
      });
      chain = job.catch(()=>{});
      pending.set(id,job);
      job.finally(()=>pending.delete(id)).catch(()=>{});
    }
    const sc = await pending.get(id);
    return sc === undefined ? {disabled:true} : result(sc);
  })();
  work.then(respond).catch(async error => {
    const message = error.name === "AbortError" ? "Classification timed out. Post left visible." : error.message;
    await chrome.storage.local.set({lastError:message});
    respond({error:message,short:error.name === "AbortError" ? "timed out" : error.short || "error"});
  });
  return true;
});
