import {DEFAULTS, requestFor, probability, thresholdFor, classificationKey,CACHE_PREFIX,cacheFresh,cacheEvictions} from "./core.mjs";
// API keys remain in trusted extension contexts.
chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
let chain = Promise.resolve();
const pending = new Map();
const failure = (message, short) => Object.assign(new Error(message), {short});
const hash = async text => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,"0")).join("");
};
const view = async s => ({enabled:s.enabled, threshold:thresholdFor(s), provider:s.provider, configuration:await hash(classificationKey(s))});
const stillCurrent = async s => {
  const current = await chrome.storage.local.get(DEFAULTS);
  return current.enabled && classificationKey(current) === classificationKey(s);
};
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  try {
    const url = new URL(sender.url);
    if (url.origin !== "https://www.linkedin.com" || !(url.pathname === "/feed" || url.pathname.startsWith("/feed/"))) return false;
  } catch { return false; }
  if (message.type === "settings") {
    chrome.storage.local.get(DEFAULTS).then(view).then(respond).catch(()=>respond({enabled:false}));
    return true;
  }
  if (message.type !== "classify" || typeof message.text !== "string") return false;
  const work = (async () => {
    const s = await chrome.storage.local.get(DEFAULTS);
    if (!s.enabled) return {disabled:true};
    const text = message.text.trim().slice(0,s.provider === "ollama" ? 2000 : 12000);
    if (!text) throw new Error("No post text");
    const configuration = await hash(classificationKey(s));
    const id = CACHE_PREFIX + await hash(s.provider === "ollama" ? JSON.stringify([configuration,text]) : JSON.stringify([s.provider,s.rule,text]));
    const cacheStorage=s.provider === "ollama" ? chrome.storage.session : chrome.storage.local;
    const req = requestFor(s,text);
    const result = async p => {
      const current = await chrome.storage.local.get(DEFAULTS);
      if (!current.enabled || classificationKey(current) !== classificationKey(s)) return {disabled:true};
      return {probability:p,...await view(current)};
    };
    const cached = (await cacheStorage.get(id))[id];
    if (cacheFresh(cached)) return result(cached.p);
    if (!pending.has(id)) {
      const job = chain.then(async () => {
        if (!await stillCurrent(s)) return undefined;
        const current = await chrome.storage.local.get(DEFAULTS);
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
          if (!response.ok) throw failure(s.provider === "ollama" ? "Ollama HTTP "+response.status+(response.status === 403 ? ". Allow this extension origin in OLLAMA_ORIGINS. Post left visible." : ". Check the service and downloaded model. Post left visible.") : "API request failed (HTTP "+response.status+"). Check your key, credit and model access.",s.provider === "ollama" ? "Ollama error "+response.status : "API error "+response.status);
          let data;
          try { data = await response.json(); } catch { throw new Error("Provider returned invalid JSON. Post left visible."); }
          let p;
          try {p=probability(s.provider,data);} catch(error) {throw failure(error.message,"invalid answer");}
          await cacheStorage.set({[id]:{p,t:Date.now()}});
          await cacheStorage.remove(cacheEvictions(await cacheStorage.get(null)));
          await chrome.storage.local.remove("lastError");
          return p;
        } finally { clearTimeout(timeout); }
      });
      chain = job.catch(()=>{});
      pending.set(id,job);
      job.finally(()=>pending.delete(id)).catch(()=>{});
    }
    const p = await pending.get(id);
    return p === undefined ? {disabled:true} : result(p);
  })();
  work.then(respond).catch(async error => {
    const message = error.name === "AbortError" ? "Classification timed out. Post left visible." : error.message;
    await chrome.storage.local.set({lastError:message});
    respond({error:message,short:error.name === "AbortError" ? "timed out" : error.short || "error"});
  });
  return true;
});
