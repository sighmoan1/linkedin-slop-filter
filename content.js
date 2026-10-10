(() => {
  const POST = '[role="listitem"][componentkey^="update-card"], .feed-shared-update-v2, [data-urn^="urn:li:activity:"]';
  const TEXT = '[data-testid="expandable-text-box"], .update-components-text, .feed-shared-update-v2__description, .feed-shared-text';
  const UI = '[data-lsf-ui]';
  const records = new Map();
  const openGroups = new Set();
  const defaults = {theme:"native",groupHidden:false,labels:"matches"};
  let settings = {enabled:false,categories:[]};
  let experience = {appearance:{...defaults},showEverything:false};
  let toolbar, timer, frame, activeRequest, poll, mutations, stopped = false, nextId = 0, scrollIntent = 0;
  const listeners = [];
  // Same allowlist as core/feed.mjs; route tests check content, popup and worker.
  const feedPaths = ["/feed", "/feed/", "/feed/foryou", "/feed/foryou/", "/feed/network", "/feed/network/"];
  const isFeed = () => location.origin === "https://www.linkedin.com" && feedPaths.includes(location.pathname);
  const feedStatus = (message,sender,reply)=>{
    if(!connected())return;
    if(chrome.runtime.id&&sender?.id===chrome.runtime.id&&message?.type==="feedStatus")reply(isFeed()?{isFeed:true,posts:records.size}:{isFeed:false});
  };
  chrome.runtime.onMessage?.addListener(feedStatus);
  function stop() {
    if(stopped)return;
    stopped=true;
    const anchor=anchorFor();
    clearInterval(poll);clearTimeout(timer);cancelAnimationFrame(frame);
    mutations?.disconnect();observer.disconnect();
    for(const remove of listeners)remove();listeners.length=0;
    try{chrome.runtime.onMessage?.removeListener(feedStatus);}catch{}
    for(const [post,record]of records)forget(post,record);
    toolbar?.element.remove();toolbar=null;openGroups.clear();activeRequest=null;
    restoreAnchor(anchor);
  }
  function connected() {
    if(stopped)return false;
    try{if(chrome.runtime.id)return true;}catch{}
    stop();return false;
  }
  async function send(message) {
    if(!connected())throw new Error("Extension disconnected. Reload the feed.");
    try{return await chrome.runtime.sendMessage(message);}
    catch(error){
      if(/Extension context invalidated/i.test(error?.message||""))stop();
      else connected();
      throw error;
    }
  }
  function listen(target,type,callback,options) {
    target.addEventListener(type,callback,options);
    listeners.push(()=>target.removeEventListener(type,callback,options));
  }
  const pct = p => (p * 100).toFixed(6).replace(/\.?0+$/,"") + "%";
  const scoreText = (p,threshold) => pct(p)+(p!==threshold&&pct(p)===pct(threshold)?p>threshold?" (just above)":" (just below)":"");
  const safeScores = scores => scores && typeof scores === "object" && !Array.isArray(scores) && Object.keys(scores).length && Object.values(scores).every(p => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1);
  const node = (tag,cls,text) => {const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const textOf = (e,value) => {if(e.textContent!==value)e.textContent=value;};
  const toggle = (post,cls,on) => {if(post.classList.contains(cls)!==on)post.classList.toggle(cls,on);};
  const attr = (e,name,value) => {value=String(value);if(e.getAttribute(name)!==value)e.setAttribute(name,value);};
  const hidden = (e,on) => {on=!!on;if(e.hidden!==on)e.hidden=on;};
  // Inspect only rendered colours, never page content or account data.
  function hostScheme(element) {
    for(let e=element;e;e=e.parentElement) {
      const rgba=getComputedStyle(e).backgroundColor.match(/[\d.]+/g)?.map(Number);
      if(!rgba||rgba.length<3||(rgba[3]!==undefined&&rgba[3]<.99))continue;
      const luminance=rgba.slice(0,3).map(value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;})
        .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
      return luminance<.18?"dark":"light";
    }
    return matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
  }
  function button(text,callback,cls="lsf-button") {
    const b=node("button",cls,text);b.type="button";
    b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();callback(b);});
    return b;
  }
  function shell(cls) {const e=node("div",cls);e.setAttribute("data-lsf-ui","");return e;}
  function bodyText(post) {
    const element = post.querySelector(TEXT);
    if (!element) return "";
    const blocks = new Set(["P","DIV","LI","UL","OL","BLOCKQUOTE","PRE","H1","H2","H3","H4","H5","H6","TR"]);
    const excluded = new Set(["BUTTON","INPUT","TEXTAREA","SCRIPT","STYLE"]);
    const parts = [];
    const visit = n => {
      if (n.nodeType === Node.TEXT_NODE) {parts.push(n.nodeValue||"");return;}
      if (n.nodeType !== Node.ELEMENT_NODE || excluded.has(n.tagName) || n.hasAttribute("data-lsf-ui")) return;
      if (n.tagName === "BR") {parts.push("\n");return;}
      const block=blocks.has(n.tagName);
      if(block)parts.push("\n");
      for(const child of n.childNodes)visit(child);
      if(block)parts.push("\n");
    };
    visit(element);
    return parts.join("").replace(/[^\S\n]+/g," ").replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim();
  }
  const hasCorrection = record => record.corrected && record.correctionConfiguration===settings.configuration;
  function applying(record) {
    // Manual labels apply only to this post and configuration, never the score cache.
    if(hasCorrection(record))return settings.categories.filter(c=>record.correctionIds.includes(c.id)).map(c=>({...c,corrected:true}));
    if (!record.scores || record.configuration!==settings.configuration) return [];
    return settings.categories.filter(c=>typeof record.scores[c.id]==="number"&&record.scores[c.id]>c.threshold)
      .map(c=>({...c,p:record.scores[c.id]})).sort((a,b)=>b.p-a.p);
  }
  const visible = post => {const r=post.getBoundingClientRect();return r.height>0&&r.bottom>0&&r.top<innerHeight;};
  const engaged = (post,record) => visible(post)||record.hover||post.contains(document.activeElement);
  function anchorFor(preferred) {
    if(preferred?.isConnected&&preferred.getClientRects().length)return {post:preferred,top:preferred.getBoundingClientRect().top,intent:scrollIntent};
    const focused=[...records.keys()].find(p=>p.isConnected&&visible(p)&&p.contains(document.activeElement));
    if(focused)return {post:focused,top:focused.getBoundingClientRect().top,intent:scrollIntent};
    const candidates=[...records.keys()].filter(p=>p.isConnected&&visible(p)&&!p.classList.contains("lsf-folded"));
    const post=candidates.find(p=>p.getBoundingClientRect().top>=0)||candidates[0];
    return post?{post,top:post.getBoundingClientRect().top,intent:scrollIntent}:null;
  }
  function restoreAnchor(anchor) {
    if(!anchor||!anchor.post.isConnected)return;
    // Force layout once. Native anchoring may already have removed the entire error.
    if(Math.abs(anchor.post.getBoundingClientRect().top-anchor.top)<=.5)return;
    const afterLayoutScroll=window.scrollY;
    requestAnimationFrame(()=>{
      if(anchor.intent!==scrollIntent||Math.abs(window.scrollY-afterLayoutScroll)>.5||!anchor.post.isConnected||!anchor.post.getClientRects().length)return;
      const delta=anchor.post.getBoundingClientRect().top-anchor.top;
      if(Math.abs(delta)>.5)window.scrollBy({top:delta,behavior:"instant"});
    });
  }
  function paint(preferred,focus) {
    if(!connected())return;
    const anchor=anchorFor(preferred);
    for(const [post,record]of records)render(post,record);
    renderGroups();renderToolbar();
    if(focus)focus.focus({preventScroll:true});
    restoreAnchor(anchor);
  }
  function schedulePaint() {
    if(!connected()||frame)return;
    frame=requestAnimationFrame(()=>{frame=0;paint();pump();});
  }
  function act(post,record,change,focusKind) {
    if(!connected())return;
    const anchor=anchorFor(post);
    const origin=document.activeElement;
    const originTop=post.contains(origin)?origin.getBoundingClientRect().top:null;
    change();
    for(const [p,r]of records)render(p,r);
    renderGroups();renderToolbar();
    const available=(...elements)=>elements.find(e=>e?.isConnected&&e.getClientRects().length);
    const target=focusKind==="show"||focusKind==="row"?record.show:focusKind==="details"?available(record.detailsOrigin,record.foldDetails,record.detailsButton):focusKind==="correction"?(record.correctionInputs?.[0]||record.correctionHeading):focusKind==="correct"||focusKind==="cancel"?available(record.correctionOrigin,record.foldCorrect,record.correctButton,record.foldDetails,record.detailsButton):focusKind==="saved"?(record.bar?record.show:record.correctButton):null;
    if(anchor&&originTop!==null&&target){const rect=target.getBoundingClientRect();if(anchor.top<0||rect.top<0||rect.bottom>innerHeight)anchor.top=originTop-(rect.top-post.getBoundingClientRect().top);}
    target?.focus({preventScroll:true});restoreAnchor(anchor);
  }
  function clearFold(post,record,keepBar=false) {
    toggle(post,"lsf-folded",false);
    if(!keepBar){const focused=record.bar?.contains(document.activeElement);record.bar?.remove();record.bar=null;if(focused)record.detailsButton?.focus({preventScroll:true});}
  }
  function clearTools(record) {record.tools?.remove();record.tools=null;}
  function forget(post,record) {
    for(const e of [record.bar,record.tools,record.panel,record.correction,record.groupBar])e?.remove();
    for(const cls of ["lsf-folded","lsf-highlight","lsf-group-suppressed","lsf-group-lead","lsf-group-open","lsf-feed-card"])toggle(post,cls,false);
    delete post.dataset.lsfTheme;delete post.dataset.lsfTone;delete post.dataset.lsfScheme;
    post.removeEventListener("mouseenter",record.enter);post.removeEventListener("mouseleave",record.leave);
    observer.unobserve(post);records.delete(post);
  }
  function status(record,hits) {
    if(hasCorrection(record))return {text:hits.length?hits.map(c=>c.name).join(" · "):"No category",level:hits.some(c=>c.action==="hide")?"lsf-c-hide":hits.some(c=>c.action==="highlight")?"lsf-c-highlight":hits.length?"lsf-c-label":"lsf-c-none",title:"Your saved correction applies to this post. Details retain the original model scores; no automatic training."};
    if(record.scores&&record.configuration!==settings.configuration)return {text:"Updating scores",level:"lsf-muted",title:"Previous scores are stale. The original post stays visible while the new questions are scored."};
    if(record.scores) {
      const partial=settings.categories.some(c=>typeof record.scores[c.id]!=="number");
      const level=hits.some(c=>c.action==="hide")?"lsf-c-hide":hits.some(c=>c.action==="highlight")?"lsf-c-highlight":hits.length?"lsf-c-label":"lsf-c-none";
      return {text:hits.length?hits.map(c=>c.name).join(" · "):partial?"Partly scored":"No category",level,title:(record.provider==="ollama"?"Local self-reported confidence, not a calibrated probability. ":"Model estimates, not proof of AI authorship. ")+"A category applies only above its threshold. See Details for every available score."};
    }
    if(record.pending)return {text:"Scoring…",level:"lsf-muted",title:"The original post stays visible while the model scores it."};
    if(record.error)return {text:"Not scored",level:"lsf-muted",title:"The post stays visible. Check provider status in extension settings."};
    return {text:"Waiting to score",level:"lsf-muted",title:"Posts are scored a short distance ahead of the reader."};
  }
  function ensureTools(post,record) {
    if(record.tools)return;
    const tools=shell("lsf-tools");
    const badge=node("span","lsf-badge");
    const controls=node("div","lsf-actions");
    const details=button("Details",origin=>act(post,record,()=>{if(!record.detailsOpen)record.detailsOrigin=origin;record.detailsOpen=!record.detailsOpen;},"details"),"lsf-button lsf-flat");
    details.setAttribute("aria-controls","lsf-details-"+record.id);
    const correct=button("Correct",origin=>{const opening=!record.correcting;act(post,record,()=>{record.correcting=opening;if(opening){record.detailsOpen=false;record.correctionOrigin=origin;}},opening?"correction":"correct");},"lsf-button lsf-flat");
        const arrive=node("span","lsf-arrived");
    const hideNow=button("Hide now",()=>act(post,record,()=>{record.foldCommitted=true;record.revealed=false;},"show"));
    const hideAgain=button("Hide again",()=>act(post,record,()=>{record.foldCommitted=true;record.revealed=false;},"row"));
    controls.append(details,correct,hideAgain,hideNow);tools.append(badge,arrive,controls);post.append(tools);
    Object.assign(record,{tools,badge,detailsButton:details,correctButton:correct,arrive,hideNow,hideAgain});
  }
  function ensureBar(post,record) {
    if(record.bar)return;
    const bar=shell("lsf-bar");
    const label=node("span","lsf-fold-name");
    const controls=node("div","lsf-actions");
    const show=button("Show",()=>{const revealing=!record.revealed;act(post,record,()=>{record.revealed=revealing;if(!revealing)record.foldCommitted=true;},"row");});
    const details=button("Details",origin=>act(post,record,()=>{if(!record.detailsOpen)record.detailsOrigin=origin;record.detailsOpen=!record.detailsOpen;},"details"),"lsf-button lsf-flat");
    details.setAttribute("aria-controls","lsf-details-"+record.id);
    const correct=button("Correct",origin=>act(post,record,()=>{record.correcting=true;record.detailsOpen=false;record.correctionOrigin=origin;},"correction"),"lsf-button lsf-flat");
    controls.append(show,details,correct);bar.append(label,controls);post.prepend(bar);
    Object.assign(record,{bar,foldLabel:label,show,foldDetails:details,foldCorrect:correct});
  }
  function renderDetails(post,record) {
    if(!record.detailsOpen){if(record.panel)hidden(record.panel,true);return;}
    const signature=JSON.stringify([settings.categories,record.scores,record.configuration,settings.configuration,record.pending,record.provider,hasCorrection(record),record.correctionIds]);
    if(!record.panel) {
      const panel=shell("lsf-panel");panel.id="lsf-details-"+record.id;panel.setAttribute("role","region");panel.setAttribute("aria-label","Category score details");
      const heading=node("p","lsf-panel-heading"),table=node("table","lsf-score-table"),thead=node("thead"),head=node("tr"),tbody=node("tbody"),note=node("p","lsf-note");
      for(const label of ["Category","Score","Your rule"])head.append(node("th","",label));
      thead.append(head);table.append(thead,tbody);
      const edit=button("Manage categories",()=>openSettings(),"lsf-button lsf-flat");
      const correct=button("Correct this post",()=>act(post,record,()=>{record.correcting=true;record.detailsOpen=false;record.correctionOrigin=record.detailsOrigin;},"correction"),"lsf-button lsf-flat");
      panel.append(heading,table,note,edit,correct);post.append(panel);
      Object.assign(record,{panel,detailsHeading:heading,detailsRows:tbody,detailsNote:note});
    }
    hidden(record.panel,false);
    if(record.detailsSignature===signature)return;
    record.detailsSignature=signature;
    const stale=record.scores&&record.configuration!==settings.configuration;
    const missing=settings.categories.filter(c=>typeof record.scores?.[c.id]!=="number");
    textOf(record.detailsHeading,stale?"Stale scores — original post stays visible":record.scores?(missing.length?"Partly scored":"Category scores"):record.pending?"Scoring — original post stays visible":"Not scored — original post stays visible");
    const rows=[];
    for(const c of settings.categories){const tr=node("tr");const score=record.scores?.[c.id];tr.append(node("td","",c.name),node("td","",typeof score==="number"?scoreText(score,c.threshold):"Not returned"),node("td","",c.action[0].toUpperCase()+c.action.slice(1)+" above "+pct(c.threshold)));rows.push(tr);}
    record.detailsRows.replaceChildren(...rows);
    textOf(record.detailsNote,(hasCorrection(record)?"Your correction determines this post’s categories; these are the original model scores. ":"")+"Scores must be strictly above your thresholds. Off categories are not requested. "+(record.provider==="ollama"?"Local scores are self-reported confidence, not calibrated probabilities.":"Model estimates do not establish AI authorship."));
  }
  function renderCorrection(post,record,hits) {
    if(!record.correcting){if(record.correction)hidden(record.correction,true);return;}
    if(!record.correction) {
      const form=shell("lsf-panel lsf-correction");form.setAttribute("role","region");form.setAttribute("aria-label","Correct post categories");
      const heading=node("p","lsf-panel-heading","Which categories apply?");heading.tabIndex=-1;record.correctionHeading=heading;
      form.append(heading,node("p","lsf-note","Choose every relevant category. Leave all unchecked for none. Only saving records this post body locally; it does not train a model."));
      const fields=node("div","lsf-correction-fields");record.correctionFields=fields;
      const message=node("p","lsf-note");message.setAttribute("role","status");
      const save=button("Keep visible & save correction",async()=>{
        if(bodyText(post)!==record.text){scan();return;}
        save.disabled=true;textOf(message,"Saving locally…");
        const correctionConfiguration=settings.configuration;
        const categoryIds=(record.correctionInputs||[]).filter(i=>i.checked).map(i=>i.value);
        try {
          const reply=await send({type:"correction",text:record.text,categoryIds,scores:record.scores||{},configuration:record.configuration||settings.configuration,provider:record.provider||settings.provider});
          if(!connected())return;
          if(!reply?.ok)throw new Error("not saved");
          if(records.get(post)!==record||bodyText(post)!==record.text){scan();return;}
          act(post,record,()=>{record.correctionIds=categoryIds;record.correctionConfiguration=correctionConfiguration;record.corrected=true;record.revealed=true;record.correcting=false;},"saved");
        }catch{textOf(message,"Could not save the correction. Try again or open settings.");}finally{save.disabled=false;}
      });
      const cancel=button("Cancel",()=>act(post,record,()=>{record.correcting=false;},"cancel"),"lsf-button lsf-flat");
      form.append(fields,message,save,cancel);post.append(form);record.correction=form;
    }
    const signature=JSON.stringify(settings.categories.map(c=>[c.id,c.name]));
    if(record.correctionSignature!==signature) {
      const focused=document.activeElement;
      const focusId=record.correctionFields.contains(focused)?focused.value:null;
      const previous=new Map((record.correctionInputs||[]).map(i=>[i.value,i.checked]));
      const rows=[],inputs=[];
      for(const c of settings.categories){const label=node("label"),input=node("input");input.type="checkbox";input.value=c.id;input.checked=previous.has(c.id)?previous.get(c.id):record.correctionIds?record.correctionIds.includes(c.id):hits.some(h=>h.id===c.id);label.append(input,node("span","",c.name));rows.push(label);inputs.push(input);}
      record.correctionFields.replaceChildren(...rows);record.correctionInputs=inputs;record.correctionSignature=signature;
      if(focusId)(inputs.find(i=>i.value===focusId)||record.correctionHeading).focus({preventScroll:true});
    }
    hidden(record.correction,false);
  }
  function render(post,record) {
    if(!isFeed()){forget(post,record);return;}
    toggle(post,"lsf-feed-card",true);
    attr(post,"data-lsf-scheme",hostScheme(post));
    if(post.dataset.lsfTheme!==experience.appearance.theme)post.dataset.lsfTheme=experience.appearance.theme;
    if(!settings.enabled){clearFold(post,record);clearTools(record);toggle(post,"lsf-highlight",false);if(record.panel)hidden(record.panel,true);if(record.correction)hidden(record.correction,true);return;}
    const hits=applying(record),hiding=hits.filter(c=>c.action==="hide");
    if(!hiding.length)record.foldCommitted=false;
    const folded=hiding.length&&!record.revealed&&!experience.showEverything&&(record.foldCommitted||!engaged(post,record));
    record.deferred=!!(hiding.length&&!record.revealed&&!experience.showEverything&&!folded);
    const tone=(hiding[0]||hits[0])?.id||"none";
    if(post.dataset.lsfTone!==tone)post.dataset.lsfTone=tone;
    toggle(post,"lsf-highlight",!hiding.length&&hits.some(c=>c.action==="highlight"));
    if(!folded) {
      ensureTools(post,record);
      const badge=status(record,hits);
      const cls="lsf-badge "+badge.level;
      if(record.badge.className!==cls)record.badge.className=cls;
      textOf(record.badge,badge.text);if(record.badge.title!==badge.title)record.badge.title=badge.title;
      hidden(record.badge,experience.appearance.labels==="off"||!!record.deferred||(record.revealed&&hiding.length&&!experience.showEverything));
      hidden(record.hideAgain,!(record.revealed&&hiding.length&&!experience.showEverything));
      hidden(record.hideNow,!record.deferred);
      hidden(record.arrive,!record.deferred);
      textOf(record.arrive,record.deferred?hiding.map(c=>c.name).join(" · ")+" result arrived · staying visible":"");
      attr(record.detailsButton,"aria-expanded",!!record.detailsOpen);
      attr(record.correctButton,"aria-expanded",!!record.correcting);
      if(record.corrected){record.correctButton.title="Correction saved locally; no automatic training";textOf(record.correctButton,"Corrected");}
    } else clearTools(record);
    if(folded) {
      ensureBar(post,record);hidden(record.bar,false);
      if(record.bar.className!=="lsf-bar")record.bar.className="lsf-bar";
      textOf(record.show,"Show");
      textOf(record.foldLabel,hiding.map(c=>c.corrected?c.name+" · corrected":c.name+" · "+pct(c.p)+" confidence").join("; "));
      attr(record.bar,"data-label",hiding.map(c=>c.name).join(" · "));
      attr(record.bar,"aria-label","Hidden post: "+record.bar.dataset.label);
      attr(record.show,"aria-label","Show post hidden as "+record.bar.dataset.label);
      attr(record.foldDetails,"aria-expanded",!!record.detailsOpen);
      toggle(post,"lsf-folded",true);record.foldCommitted=true;
      if(!record.foldCounted){record.foldCounted=true;send({type:"folded"}).catch(()=>{});}
    } else if(record.revealed&&hiding.length&&!experience.showEverything) {
      clearFold(post,record,true);ensureBar(post,record);hidden(record.bar,false);
      if(record.bar.className!=="lsf-bar lsf-revealed-bar")record.bar.className="lsf-bar lsf-revealed-bar";
      textOf(record.foldLabel,"Shown · "+hiding.map(c=>c.name).join(" · "));textOf(record.show,"Hide again");
      attr(record.show,"aria-label","Hide this post again");attr(record.bar,"aria-label","Revealed post: "+hiding.map(c=>c.name).join(" · "));attr(record.foldDetails,"aria-expanded",!!record.detailsOpen);
    } else clearFold(post,record);
    renderDetails(post,record);renderCorrection(post,record,hits);
  }
  function renderGroups() {
    const ordered=[...records.keys()].filter(p=>p.isConnected);
    const focused=document.activeElement;
    const focusedSummary=focused.closest?.(".lsf-group-bar");
    const summaryPost=focusedSummary?ordered.find(p=>p.contains(focusedSummary)):null;
    const summaryExpanded=focusedSummary?.querySelector("button")?.getAttribute("aria-expanded")==="true";
    let summaryTarget;
    const runs=[];let run=[];
    const flush=()=>{if(run.length>1)runs.push(run);run=[];};
    for(const post of ordered){const eligible=experience.appearance.groupHidden&&settings.enabled&&!experience.showEverything&&post.classList.contains("lsf-folded");if(!eligible){flush();continue;}if(run.length&&run[run.length-1].nextElementSibling!==post)flush();run.push(post);}flush();
    const leadToRun=new Map(runs.map(items=>[items[0],items]));
    const members=new Set(runs.flat());
    for(const post of ordered){const record=records.get(post);if(!members.has(post)){toggle(post,"lsf-group-suppressed",false);toggle(post,"lsf-group-lead",false);toggle(post,"lsf-group-open",false);}if(!leadToRun.has(post)&&record.groupBar)hidden(record.groupBar,true);}
    for(const items of runs) {
      const first=items[0],record=records.get(first),key=items.map(p=>records.get(p).id).join(",");
      const focusedMember=items.some(p=>p.contains(focused)&&!focusedSummary);
      if(summaryExpanded&&items.includes(summaryPost)&&records.get(summaryPost).groupKey!==key)openGroups.add(key);
      const expanded=openGroups.has(key)||focusedMember;
      if(!record.groupBar){const bar=shell("lsf-group-bar"),label=node("span","lsf-group-name");const toggleButton=button("Show list",()=>{const anchor=anchorFor(first);openGroups.has(record.groupKey)?openGroups.delete(record.groupKey):openGroups.add(record.groupKey);renderGroups();record.groupButton.focus({preventScroll:true});restoreAnchor(anchor);});bar.append(label,toggleButton);first.prepend(bar);Object.assign(record,{groupBar:bar,groupLabel:label,groupButton:toggleButton});}
      record.groupKey=key;hidden(record.groupBar,false);
      if(items.includes(summaryPost))summaryTarget=record.groupButton;
      const counts=new Map();for(const p of items)for(const c of applying(records.get(p)).filter(c=>c.action==="hide"))counts.set(c.name,(counts.get(c.name)||0)+1);
      textOf(record.groupLabel,items.length+" hidden posts · "+[...counts].map(([name,count])=>name+" ×"+count).join(", "));
      textOf(record.groupButton,expanded?"Close list":"Show list");attr(record.groupButton,"aria-expanded",expanded);
      toggle(first,"lsf-group-lead",true);toggle(first,"lsf-group-open",expanded);toggle(first,"lsf-group-suppressed",false);
      for(const p of items.slice(1)){toggle(p,"lsf-group-suppressed",!expanded);toggle(p,"lsf-group-lead",false);toggle(p,"lsf-group-open",false);}
    }
    if(summaryPost){const record=records.get(summaryPost);(summaryTarget||[record.show,record.detailsButton,toolbar?.all].find(e=>e?.isConnected&&e.getClientRects().length))?.focus({preventScroll:true});}
  }
  async function openSettings(section="categories"){try{await send({type:"openSettings",section});}catch{}}
  function setExperience(next) {
    if(stopped||!next||!next.appearance)return;
    const a=next.appearance;
    experience={appearance:{theme:"native",groupHidden:a.groupHidden===true,labels:a.labels==="off"?"off":"matches"},showEverything:next.showEverything===true};
  }
  function renderToolbar() {
    const first=[...records.keys()].find(p=>p.isConnected);
    if(!isFeed()||!first){toolbar?.element.remove();toolbar=null;return;}
    if(!toolbar||!toolbar.element.isConnected) {
      const element=shell("lsf-feed-toolbar");element.setAttribute("role","region");element.setAttribute("aria-label","Feed filter controls");
      const main=node("div","lsf-toolbar-main"),title=node("span","lsf-toolbar-title","Feed filter");
      const all=button("Show everything",async()=>{try{setExperience(await send({type:"showEverything",value:!experience.showEverything}));schedulePaint();}catch{} });
      const categories=button("Categories",()=>openSettings("categories"),"lsf-button lsf-flat");
      const manage=button("Settings",()=>openSettings("feed"),"lsf-button lsf-flat");
      const status=node("p","lsf-toolbar-status");status.setAttribute("role","status");
      main.append(title,all,categories,manage);element.append(main,status);first.before(element);
      toolbar={element,all,status};
    }
    attr(toolbar.element,"data-lsf-theme",experience.appearance.theme);
    attr(toolbar.element,"data-lsf-scheme",hostScheme(first));
    textOf(toolbar.all,experience.showEverything?"Restore filtering":"Show everything");if(toolbar.all.disabled===settings.enabled)toolbar.all.disabled=!settings.enabled;attr(toolbar.all,"aria-pressed",experience.showEverything);
    const hideNames=settings.categories.filter(c=>c.action==="hide").map(c=>c.name).join(", ");
    const failures=[...records.values()].filter(r=>r.error&&!r.scores).length;
    const message=!settings.enabled?"Filtering is paused. Original posts stay visible.":experience.showEverything?"Showing every post temporarily. Your Hide rules are unchanged.":(hideNames?"Hide rules: "+hideNames+". Any matching Hide rule folds a post.":"No Hide rules. Original posts stay visible.")+(failures?" Some posts could not be scored; they stay visible.":"");
    textOf(toolbar.status,message);
  }
  function eligible(post,record) {
    if(!post.isConnected||record.pending||Date.now()<(record.retryAt||0)||(record.scores&&record.configuration===settings.configuration))return false;
    const r=post.getBoundingClientRect();return r.height>0&&r.bottom>=-200&&r.top<=innerHeight+700&&bodyText(post)===record.text;
  }
  function pump() {
    if(!connected()||activeRequest||!settings.enabled||!settings.categories.length||!isFeed())return;
    // Queue is recomputed from the current viewport: at most six nearby candidates,
    // one request in flight, with visible/upcoming cards ahead of old cards above.
    const queue=[...records].filter(([post,r])=>eligible(post,r)).map(([post,r])=>({post,record:r,rect:post.getBoundingClientRect()}))
      .sort((a,b)=>{const priority=r=>r.bottom>0?(r.top<innerHeight?0:1):2;return priority(a.rect)-priority(b.rect)||Math.abs(a.rect.top)-Math.abs(b.rect.top);}).slice(0,6);
    if(!queue.length)return;
    const {post,record}=queue[0],configuration=settings.configuration,text=record.text;
    const token={post,record,configuration};activeRequest=token;record.pending=true;record.error=false;schedulePaint();
    send({type:"classify",text}).then(result=>{
      if(!connected())return;
      if(records.get(post)!==record||bodyText(post)!==text||configuration!==settings.configuration)return;
      if(result?.configuration&&result.configuration!==configuration){record.retryAt=Date.now()+1000;refresh();return;}
      if(result?.disabled){record.retryAt=Date.now()+1000;record.error=false;refresh().then(()=>{if(records.get(post)===record&&configuration===settings.configuration&&settings.enabled){record.retryAt=0;schedulePaint();}});return;}
      if(result?.error||!safeScores(result?.scores)){record.retryAt=Date.now()+60000;record.error=true;return;}
      record.scores=result.scores;record.configuration=configuration;record.provider=result.provider||settings.provider;record.retryAt=0;record.error=false;
    }).catch(()=>{if(records.get(post)===record&&bodyText(post)===text&&configuration===settings.configuration){record.retryAt=Date.now()+60000;record.error=true;}}).finally(()=>{
      if(records.get(post)===record)record.pending=false;
      if(activeRequest===token)activeRequest=null;schedulePaint();
    });
  }
  const observer=new IntersectionObserver(()=>schedulePaint(),{rootMargin:"200px 0px 700px 0px"});
  function scan() {
    if(!connected())return;
    for(const [post,record]of records)if(!post.isConnected||!isFeed())forget(post,record);
    if(!isFeed()){toolbar?.element.remove();toolbar=null;return;}
    for(const candidate of document.querySelectorAll(POST)) {
      const post=candidate.closest(".feed-shared-update-v2")||candidate;
      if(post.parentElement?.closest(POST))continue;
      const text=bodyText(post),old=records.get(post);
      if(!text){if(old)forget(post,old);continue;}
      if(old?.text===text)continue;
      if(old)forget(post,old);
      const record={id:++nextId,text,body:post.querySelector(TEXT),revealed:false};
      record.enter=()=>{record.hover=true;schedulePaint();};record.leave=()=>{record.hover=false;schedulePaint();};
      post.addEventListener("mouseenter",record.enter);post.addEventListener("mouseleave",record.leave);
      records.set(post,record);observer.observe(post);
    }
    // Preserve actual DOM order for grouping even if LinkedIn inserts an older card above.
    const ordered=[...records].sort(([a],[b])=>a===b?0:a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
    records.clear();for(const [post,record]of ordered)records.set(post,record);
    schedulePaint();
  }
  const scheduleScan=()=>{if(!connected())return;clearTimeout(timer);timer=setTimeout(scan,120);};
  mutations=new MutationObserver(changes=>{
    if(!connected())return;
    const nativeClass=value=>(value||"").split(/\s+/).filter(name=>name&&!name.startsWith("lsf-")).sort().join(" ");
    const appearanceChanged=changes.some(m=>m.type==="attributes"&&!m.target.closest?.(UI)&&
      (m.attributeName!=="class"||nativeClass(m.oldValue)!==nativeClass(m.target.getAttribute("class"))));
    if(appearanceChanged)schedulePaint();
    const changed=changes.some(m=>!m.target.closest?.(UI)&&([...m.addedNodes,...m.removedNodes].some(n=>n.nodeType!==Node.ELEMENT_NODE||!n.matches?.(UI))||m.type==="characterData"));
    if(changed)scheduleScan();
  });
  mutations.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeOldValue:true,attributeFilter:["class","style","data-theme","data-color-mode"]});
  listen(matchMedia("(prefers-color-scheme: dark)"),"change",schedulePaint);
  listen(window,"scroll",schedulePaint,{passive:true});listen(window,"resize",schedulePaint,{passive:true});
  listen(document,"focusin",schedulePaint);listen(document,"focusout",schedulePaint);
  for(const type of ["wheel","touchmove"])listen(window,type,()=>{scrollIntent++;},{passive:true});
  listen(window,"keydown",e=>{if(["PageUp","PageDown","Home","End","ArrowUp","ArrowDown"," "].includes(e.key)&&!e.target.closest?.(UI))scrollIntent++;});
  async function refresh() {
    if(!connected())return;
    try {
      const next=await send({type:"settings"})||{enabled:false,categories:[]};
      if(!connected())return;
      if(!Array.isArray(next.categories))next.categories=[];
      const changed=next.configuration!==settings.configuration,resumed=!settings.enabled&&next.enabled;
      if(changed||resumed)for(const record of records.values()){record.foldCommitted=false;record.error=false;record.retryAt=0;}
      settings=next;
    } catch {settings={...settings,enabled:false};}
    if(!connected())return;
    try{setExperience(await send({type:"experience"}));}catch{}
    scan();
  }
  poll=setInterval(refresh,5000);refresh();
})();
