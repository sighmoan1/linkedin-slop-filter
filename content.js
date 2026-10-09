(() => {
  // LinkedIn now uses hashed class names, so the current markup is found through stable attributes:
  // each post is a role="listitem" whose componentkey starts "update-card", and its body is data-testid="expandable-text-box".
  // The older class-based selectors are kept for accounts still served the previous markup.
  const POST = '[role="listitem"][componentkey^="update-card"], .feed-shared-update-v2, [data-urn^="urn:li:activity:"]';
  const TEXT = '[data-testid="expandable-text-box"], .update-components-text, .feed-shared-update-v2__description, .feed-shared-text';
  const records = new Map();
  let settings = {enabled:false,threshold:0.8};
  let timer;
  const isFeed = () => location.pathname === "/feed" || location.pathname.startsWith("/feed/");
  function clearFold(post, record) {
    if (post.classList.contains("lsf-folded")) post.classList.remove("lsf-folded");
    record.bar?.remove();
    record.bar = null;
  }
  function clearBadge(record) {
    record.badge?.remove();
    record.badge = null;
  }
  // What the chip on an unfolded post should say right now.
  function badgeFor(record) {
    if (typeof record.probability === "number") {
      const p = record.probability, pct = Math.round(p * 100);
      return {
        text: (record.provider === "ollama" ? "Local slop confidence: " : "Slop likelihood: ") + pct + "%",
        level: p >= 0.65 ? "lsf-high" : p >= 0.35 ? "lsf-mid" : "lsf-low",
        title: (record.provider === "ollama" ? "Local self-reported slop confidence, zero when judged useful; not a calibrated probability. " : "") + "Model estimate of low-value, formulaic writing, not proof of AI authorship. Posts above " + Math.round(settings.threshold * 100) + "% are folded."
      };
    }
    if (record.pending) return {text: "Scoring…", level: "lsf-muted", title: "Waiting for the model's estimate."};
    if (record.error) return {text: "Not scored" + (record.short ? ": " + record.short : ""), level: "lsf-muted", title: record.error + " The post stays visible and will be retried."};
    return {text: "Slop score: waiting", level: "lsf-muted", title: "Posts are scored as they come into view."};
  }
  // Idempotent on purpose: touching the DOM here would retrigger the page-wide MutationObserver.
  function renderBadge(post, record) {
    const want = badgeFor(record);
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
      clearFold(post,record); clearBadge(record); return;
    }
    if (record.revealed || !(record.probability > settings.threshold)) {
      clearFold(post,record); renderBadge(post,record); return;
    }
    clearBadge(record);
    if (!record.bar) {
      const bar = document.createElement("div");
      bar.className = "lsf-bar";
      const label = document.createElement("span");
      label.textContent = "Possible AI slop · " + Math.round(record.probability * 100) + (record.provider === "ollama" ? "% local self-reported confidence" : "% model estimate");
      const button = document.createElement("button");
      button.type = "button"; button.textContent = "Show anyway";
      button.addEventListener("click",e => {e.preventDefault(); e.stopPropagation(); record.revealed=true; apply(post,record);});
      bar.append(label,button); post.prepend(bar); record.bar=bar;
    }
    post.classList.add("lsf-folded");
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !settings.enabled || !isFeed()) continue;
      const post=entry.target, record=records.get(post);
      if (!record || record.pending || record.probability !== undefined || Date.now() < (record.retryAt || 0)) continue;
      record.pending=true; apply(post,record);
      chrome.runtime.sendMessage({type:"classify",text:record.text}).then(result => {
        if (records.get(post) !== record) return;
        record.pending=false;
        if (result?.error || result?.disabled) {
          record.retryAt=Date.now()+60000;
          record.error=result.error || null; record.short=result.short || "";
          apply(post,record); return;
        }
        if (typeof result?.probability !== "number" || !Number.isFinite(result.probability) || result.probability < 0 || result.probability > 1) {
          record.retryAt=Date.now()+60000; record.error="The extension returned no score."; record.short="error";
          apply(post,record); return;
        }
        if (result.configuration && result.configuration !== settings.configuration) {record.retryAt=0;apply(post,record);return;}
        record.provider=result.provider || settings.provider;
        record.error=null; record.short=""; record.probability=result.probability; apply(post,record);
      }).catch(()=>{
        if (records.get(post) !== record) return;
        record.pending=false; record.retryAt=Date.now()+60000;
        record.error="Could not reach the extension. Reload the page."; record.short="extension unavailable";
        apply(post,record);
      });
    }
  },{rootMargin:"300px"});
  function scan() {
    for (const [post,record] of records) {
      if (!post.isConnected) {observer.unobserve(post); records.delete(post);}
      else if (!isFeed()) {clearFold(post,record); clearBadge(record);}
    }
    if (!isFeed()) return;
    for (const candidate of document.querySelectorAll(POST)) {
      // Prefer the outer update card, avoiding nested reposts and duplicate processing.
      const post=candidate.closest(".feed-shared-update-v2") || candidate;
      if (post.parentElement?.closest(POST)) continue;
      const element=post.querySelector(TEXT);
      // textContent, not innerText: innerText changes when the post is folded (display:none), which looked like a new post and re-triggered the fold.
      const text=(element?.textContent || "").replace(/\s+/g," ").trim();
      if (!text) continue;
      const old=records.get(post);
      if (old?.text === text) {apply(post,old); continue;}
      if (old) {clearFold(post,old); clearBadge(old); observer.unobserve(post);}
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
      if (next.configuration !== settings.configuration) {
        for (const [post,record] of records) {
          clearFold(post,record); clearBadge(record); observer.unobserve(post);
          records.set(post,{text:record.text,revealed:record.revealed});
        }
      }
      settings=next;
    } catch {settings.enabled=false;}
    scan();
    // Re-observe unclassified cards when enabled, including cards already in view.
    for (const [post,record] of records) {
      if (record.probability === undefined && !record.pending) {observer.unobserve(post);observer.observe(post);}
    }
  }
  refresh(); setInterval(refresh,5000);
})();
