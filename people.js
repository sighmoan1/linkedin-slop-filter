(() => {
  const paths = new Set(["/mynetwork/invite-connect/connections", "/mynetwork/network-manager/connections", "/mynetwork/network-manager/people-follow/following", "/mynetwork/network-manager/people-follow"]);
  let selected = new Set(), ready = false, stopped = false;
  const controls = new Map();
  const onPage = () => paths.has(location.pathname.replace(/\/$/, ""));
  function identity(link) {
    try { const u = new URL(link.href); return u.origin === "https://www.linkedin.com" && /^\/in\/[^/]+\/?$/.test(u.pathname) ? u.origin+u.pathname.replace(/\/$/, "").toLowerCase() : null; } catch { return null; }
  }
  const paint = (button, url) => { button.textContent = selected.has(url) ? "Never hidden ✓" : "Never hide"; button.setAttribute("aria-pressed", String(selected.has(url))); };
  function scan() {
    if (stopped) return;
    for (const [link, entry] of controls) if (!onPage() || !link.isConnected || identity(link) !== entry.url) {entry.wrap.remove();controls.delete(link);}
    if (!onPage() || !ready) return;
    const seen = new Set([...controls.values()].map(e => e.url));
    for (const link of document.querySelectorAll('main a[href*="/in/"]')) {
      const url = identity(link), name = link.innerText.trim().split("\n")[0]?.trim();
      if (!url || !name || seen.has(url) || link.closest('[data-lsf-people]')) continue;
      const wrap = document.createElement("span"), button = document.createElement("button"), status = document.createElement("span");
      wrap.dataset.lsfPeople = ""; button.type = "button"; status.setAttribute("role", "status");
      button.setAttribute("aria-label", "Never hide posts from " + name); paint(button,url);
      button.addEventListener("click", async e => {
        e.preventDefault(); e.stopPropagation(); button.disabled = true; status.textContent = "";
        try {
          const result = await chrome.runtime.sendMessage({type:"people",action:"set",url,name,value:!selected.has(url)});
          if (!Array.isArray(result?.people)) throw new Error();
          selected = new Set(result.people.map(p => p.url));
          for (const entry of controls.values()) paint(entry.button,entry.url);
          status.textContent = selected.has(url) ? "Saved" : "Removed";
        } catch { status.textContent = "Could not save. Try again."; }
        finally { button.disabled = false; }
      });
      wrap.append(button,status); link.after(wrap); controls.set(link,{url,wrap,button});seen.add(url);
    }
  }
  async function refresh() {
    if (!onPage()) {scan();return;}
    try {
      const result = await chrome.runtime.sendMessage({type:"people",action:"list"});
      if (!Array.isArray(result?.people)) return;
      selected = new Set(result.people.map(p=>p.url)); ready = true;
      for (const entry of controls.values()) paint(entry.button,entry.url);
      scan();
    } catch (error) { if (/context invalidated/i.test(error?.message || "")) {stopped=true;clearInterval(timer);observer.disconnect();for(const entry of controls.values())entry.wrap.remove();} }
  }
  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const timer = setInterval(refresh, 3000);
  void refresh();
})();
