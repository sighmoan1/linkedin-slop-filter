import {DEFAULTS, requestFor, probability} from "./core.mjs";
// Content scripts never receive the API keys.
chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
let chain = Promise.resolve();
const pending = new Map();
// Errors carry a few words for the per-post badge; the full message goes to the settings page.
const failure = (message, short) => Object.assign(new Error(message), {short});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  try {
    const url = new URL(sender.url);
    if (url.origin !== "https://www.linkedin.com" || !(url.pathname === "/feed" || url.pathname.startsWith("/feed/"))) return false;
  } catch { return false; }
  if (message.type === "settings") {
    chrome.storage.local.get(DEFAULTS).then(s => respond({enabled:s.enabled, threshold:s.threshold}));
    return true;
  }
  if (message.type !== "classify" || typeof message.text !== "string") return false;
  const text = message.text.trim().slice(0, 12000);
  if (!text) { respond({error:"No post text"}); return false; }
  const work = (async () => {
    const s = await chrome.storage.local.get(DEFAULTS);
    if (!s.enabled) return {disabled:true};
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([s.provider,s.rule,text])));
    const id = "cache:" + Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,"0")).join("");
    const cached = (await chrome.storage.session.get(id))[id];
    if (cached !== undefined) return {probability:cached, threshold:s.threshold};
    if (!pending.has(id)) {
      const job = chain.then(async () => {
        const current = await chrome.storage.local.get(DEFAULTS);
        if (!current.enabled) return {disabled:true};
        const state = await chrome.storage.session.get({requests:0});
        if (state.requests >= current.limit) throw failure("Session request limit reached. Increase the limit in settings or restart Chrome.", "request limit reached");
        const req = requestFor(s,text);
        if (!req.key) throw failure("Add your provider API key in extension settings.", "no API key");
        await chrome.storage.session.set({requests:state.requests+1});
        const controller = new AbortController();
        const timeout = setTimeout(()=>controller.abort(),20000);
        try {
          const response = await fetch(req.url, {
            method:"POST", headers:{"Authorization":"Bearer "+req.key,"Content-Type":"application/json"},
            body:JSON.stringify(req.body), signal:controller.signal, redirect:"error"
          });
          if (!response.ok) throw failure("API request failed (HTTP "+response.status+"). Check your key, credit and model access.", "API error "+response.status);
          let p;
          try { p = probability(s.provider,await response.json()); }
          catch (error) { throw failure(error.message, "invalid answer"); }
          await chrome.storage.session.set({[id]:p});
          await chrome.storage.local.remove("lastError");
          return {probability:p,threshold:s.threshold};
        } finally { clearTimeout(timeout); }
      });
      chain = job.catch(()=>{});
      pending.set(id, job);
      job.finally(()=>pending.delete(id)).catch(()=>{});
    }
    return pending.get(id);
  })();
  work.then(respond).catch(async error => {
    const message = error.name === "AbortError" ? "API timed out. Post left visible." : error.message;
    const short = error.name === "AbortError" ? "timed out" : (error.short || "error");
    await chrome.storage.local.set({lastError:message});
    respond({error:message, short});
  });
  return true;
});
