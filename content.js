(() => {
  // LinkedIn now uses hashed class names, so the current markup is found through stable attributes:
  // each post is a role="listitem" whose componentkey starts "update-card", and its body is data-testid="expandable-text-box".
  // The older class-based selectors are kept for accounts still served the previous markup.
  const POST = '[role="listitem"][componentkey^="update-card"], .feed-shared-update-v2, [data-urn^="urn:li:activity:"]';
  const TEXT = '[data-testid="expandable-text-box"], .update-components-text, .feed-shared-update-v2__description, .feed-shared-text';
  // Read the selected body without relying on layout: a folded post keeps the same identity.
  // Block boundaries and <br> separate words, while inline formatting remains contiguous.
  function bodyText(post) {
    const element = post.querySelector(TEXT);
    if (!element) return "";
    const blocks = new Set(["P","DIV","LI","UL","OL","BLOCKQUOTE","PRE","H1","H2","H3","H4","H5","H6","TR"]);
    const excluded = new Set(["BUTTON","INPUT","TEXTAREA","SCRIPT","STYLE"]);
    const parts = [];
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) { parts.push(node.nodeValue || ""); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || excluded.has(node.tagName) || node.hasAttribute("data-lsf-ui")) return;
      if (node.tagName === "BR") { parts.push("\n"); return; }
      const block = blocks.has(node.tagName);
      if (block) parts.push("\n");
      for (const child of node.childNodes) visit(child);
      if (block) parts.push("\n");
    };
    visit(element);
    return parts.join("").replace(/[^\S\n]+/g," ").replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim();
  }
  const records = new Map();
  let settings = {enabled:false,categories:[]};
  let timer;
  const isFeed = () => location.pathname === "/feed" || location.pathname.startsWith("/feed/");
  const pct = p => Math.round(p * 100) + "%";
  // Categories whose score is strictly above their own threshold, strongest first.
  function applying(record) {
    if (!record.scores) return [];
    return settings.categories
      .filter(c => typeof record.scores[c.id] === "number" && record.scores[c.id] > c.threshold)
      .map(c => ({...c, p: record.scores[c.id]}))
      .sort((a, b) => b.p - a.p);
  }
  function clearFold(post, record) {
    if (post.classList.contains("lsf-folded")) post.classList.remove("lsf-folded");
    record.bar?.remove();
    record.bar = null;
  }
  function clearBadge(record) {
    record.badge?.remove();
    record.badge = null;
  }
  function setHighlight(post, on) {
    if (post.classList.contains("lsf-highlight") !== on) post.classList.toggle("lsf-highlight", on);
  }
  // What the chip on an unfolded post should say right now.
  function badgeFor(record, hits) {
    if (record.scores) {
      const local = record.provider === "ollama";
      const all = settings.categories.filter(c => typeof record.scores[c.id] === "number").map(c => c.name + " " + pct(record.scores[c.id])).join(", ");
      const level = hits.some(c => c.action === "hide") ? "lsf-c-hide" : hits.some(c => c.action === "highlight") ? "lsf-c-highlight" : hits.length ? "lsf-c-label" : "lsf-c-none";
      return {
        text: hits.length ? hits.map(c => c.name + " " + pct(c.p)).join(" · ") : "No category",
        level,
        title: (local ? "Local self-reported confidence, not a calibrated probability. " : "Model estimates, not proof of AI authorship. ") + "A category applies when its score is above its threshold." + (all ? " All scores: " + all + "." : "")
      };
    }
    if (record.pending) return {text: "Scoring…", level: "lsf-muted", title: "Waiting for the model's estimate."};
    if (record.error) return {text: "Not scored" + (record.short ? ": " + record.short : ""), level: "lsf-muted", title: record.error + " The post stays visible and will be retried."};
    return {text: "Waiting to score", level: "lsf-muted", title: "Posts are scored as they come into view."};
  }
  // Idempotent on purpose: touching the DOM here would retrigger the page-wide MutationObserver.
  function renderBadge(post, record, hits) {
    const want = badgeFor(record, hits);
    if (!record.badge || record.badge.parentElement !== post) {
      record.badge?.remove();
      record.badge = document.createElement("div");
      post.prepend(record.badge);
    }
    const cls = "lsf-badge " + want.level;
    if (record.badge.className !== cls) record.badge.className = cls;
    if (record.badge.textContent !== want.text) record.badge.textContent = want.text;
    if (record.badge.title !== want.title) record.badge.title = want.title;
  }
  function apply(post, record) {
    if (!isFeed() || !settings.enabled) {
      clearFold(post,record); clearBadge(record); setHighlight(post,false); return;
    }
    const hits = applying(record);
    const hide = hits.find(c => c.action === "hide");
    setHighlight(post, !hide && hits.some(c => c.action === "highlight"));
    if (record.revealed || !hide) {
      clearFold(post,record); renderBadge(post,record,hits); return;
    }
    clearBadge(record);
    const label = "Hidden as " + hide.name + " · " + pct(hide.p) + (record.provider === "ollama" ? " local self-reported confidence" : " model estimate");
    if (record.bar?.dataset.label !== label) {
      record.bar?.remove();
      const bar = document.createElement("div");
      bar.className = "lsf-bar"; bar.dataset.label = label;
      const text = document.createElement("span");
      text.textContent = label;
      const button = document.createElement("button");
      button.type = "button"; button.textContent = "Show anyway";
      button.addEventListener("click",e => {e.preventDefault(); e.stopPropagation(); record.revealed=true; apply(post,record);});
      bar.append(text,button); post.prepend(bar); record.bar=bar;
    }
    if (!post.classList.contains("lsf-folded")) post.classList.add("lsf-folded");
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !settings.enabled || !isFeed()) continue;
      const post=entry.target, record=records.get(post);
      if (!record || record.pending || record.scores || Date.now() < (record.retryAt || 0)) continue;
      record.pending=true; apply(post,record);
      chrome.runtime.sendMessage({type:"classify",text:record.text}).then(result => {
        if (records.get(post) !== record || bodyText(post) !== record.text) return;
        record.pending=false;
        if (result?.error || result?.disabled) {
          record.retryAt=Date.now()+60000;
          record.error=result.error || null; record.short=result.short || "";
          apply(post,record); return;
        }
        const sc = result?.scores;
        if (!sc || typeof sc !== "object" || !Object.keys(sc).length || !Object.values(sc).every(p => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1)) {
          record.retryAt=Date.now()+60000; record.error="The extension returned no score."; record.short="error";
          apply(post,record); return;
        }
        if (result.configuration && result.configuration !== settings.configuration) {record.retryAt=0;apply(post,record);return;}
        if (Array.isArray(result.categories)) settings.categories=result.categories;
        record.provider=result.provider || settings.provider;
        record.error=null; record.short=""; record.scores=sc;
        apply(post,record);
      }).catch(()=>{
        if (records.get(post) !== record || bodyText(post) !== record.text) return;
        record.pending=false; record.retryAt=Date.now()+60000;
        record.error="Could not reach the extension. Reload the page."; record.short="extension unavailable";
        apply(post,record);
      });
    }
  },{rootMargin:"300px"});
  function forget(post, record) {
    clearFold(post,record); clearBadge(record); setHighlight(post,false);
  }
  function scan() {
    for (const [post,record] of records) {
      if (!post.isConnected) {observer.unobserve(post); records.delete(post);}
      else if (!isFeed()) forget(post,record);
    }
    if (!isFeed()) return;
    for (const candidate of document.querySelectorAll(POST)) {
      // Prefer the outer update card, avoiding nested reposts and duplicate processing.
      const post=candidate.closest(".feed-shared-update-v2") || candidate;
      if (post.parentElement?.closest(POST)) continue;
      // textContent, not innerText: folded bodies must retain their identity.
      const text=bodyText(post);
      const old=records.get(post);
      if (!text) {
        if (old) {
          forget(post,old);
          observer.unobserve(post);
          records.delete(post);
        }
        continue;
      }
      if (old?.text === text) {apply(post,old); continue;}
      if (old) {forget(post,old); observer.unobserve(post);}
      const record={text,revealed:false};
      records.set(post,record);
      apply(post,record);
      observer.observe(post);
    }
  }
  const schedule=()=>{clearTimeout(timer); timer=setTimeout(scan,250);};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
  async function refresh() {
    try {
      const next=await chrome.runtime.sendMessage({type:"settings"}) || {enabled:false};
      if (!Array.isArray(next.categories)) next.categories=[];
      // New scoring settings need new scores. Display-only changes (name, action, threshold) reuse the scores already here.
      if (next.configuration !== settings.configuration) {
        for (const [post,record] of records) {
          forget(post,record); observer.unobserve(post);
          records.set(post,{text:record.text,revealed:record.revealed});
        }
      }
      settings=next;
    } catch {settings.enabled=false;}
    scan();
    // Re-observe unclassified cards when enabled, including cards already in view.
    for (const [post,record] of records) {
      if (!record.scores && !record.pending) {observer.unobserve(post);observer.observe(post);}
    }
  }
  refresh(); setInterval(refresh,5000);
})();
