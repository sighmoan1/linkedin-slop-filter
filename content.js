(() => {
  const POST = '.feed-shared-update-v2, [data-urn^="urn:li:activity:"]';
  const TEXT = '.update-components-text, .feed-shared-update-v2__description, .feed-shared-text';
  const records = new Map();
  let settings = {enabled:false,threshold:0.8};
  let timer;
  const isFeed = () => location.pathname === "/feed" || location.pathname.startsWith("/feed/");
  function clearFold(post, record) {
    post.classList.remove("lsf-folded");
    record.bar?.remove();
    record.bar = null;
  }
  function apply(post, record) {
    if (!isFeed() || !settings.enabled || record.revealed || !(record.probability > settings.threshold)) {
      clearFold(post,record); return;
    }
    if (!record.bar) {
      const bar = document.createElement("div");
      bar.className = "lsf-bar";
      const label = document.createElement("span");
      label.textContent = "Possible AI slop · " + Math.round(record.probability * 100) + "% model estimate";
      const button = document.createElement("button");
      button.type = "button"; button.textContent = "Show anyway";
      button.addEventListener("click",e => {e.preventDefault(); e.stopPropagation(); record.revealed=true; clearFold(post,record);});
      bar.append(label,button); post.prepend(bar); record.bar=bar;
    }
    post.classList.add("lsf-folded");
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !settings.enabled || !isFeed()) continue;
      const post=entry.target, record=records.get(post);
      if (!record || record.pending || record.probability !== undefined || Date.now() < (record.retryAt || 0)) continue;
      record.pending=true;
      chrome.runtime.sendMessage({type:"classify",text:record.text}).then(result => {
        if (records.get(post) !== record) return;
        record.pending=false;
        if (result?.error || result?.disabled) { record.retryAt=Date.now()+60000; return; }
        record.probability=result?.probability; apply(post,record);
      }).catch(()=>{record.pending=false; record.retryAt=Date.now()+60000;});
    }
  },{rootMargin:"300px"});
  function scan() {
    for (const [post,record] of records) {
      if (!post.isConnected) {observer.unobserve(post); records.delete(post);}
      else if (!isFeed()) clearFold(post,record);
    }
    if (!isFeed()) return;
    for (const candidate of document.querySelectorAll(POST)) {
      // Prefer the outer update card, avoiding nested reposts and duplicate processing.
      const post=candidate.closest(".feed-shared-update-v2") || candidate;
      if (post.parentElement?.closest(POST)) continue;
      const element=post.querySelector(TEXT);
      const text=(element?.innerText || element?.textContent || "").trim();
      if (!text) continue;
      const old=records.get(post);
      if (old?.text === text) {apply(post,old); continue;}
      if (old) {clearFold(post,old); observer.unobserve(post);}
      records.set(post,{text,revealed:false});
      observer.observe(post);
    }
  }
  const schedule=()=>{clearTimeout(timer); timer=setTimeout(scan,250);};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
  async function refresh() {
    try {settings=await chrome.runtime.sendMessage({type:"settings"}) || settings;} catch {settings.enabled=false;}
    scan();
    // Re-observe unclassified cards when enabled, including cards already in view.
    for (const [post,record] of records) {
      if (record.probability === undefined && !record.pending) {observer.unobserve(post);observer.observe(post);}
    }
  }
  refresh(); setInterval(refresh,5000);
})();
