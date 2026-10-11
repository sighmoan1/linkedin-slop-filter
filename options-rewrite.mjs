// Generated wording never writes storage: the existing Save settings flow owns persistence.
export function installDefinitionRewrite({details,category,text,send,onApply,isCurrent,snapshot}) {
  const node=(tag,props={})=>Object.assign(document.createElement(tag),props);
  const panel=node('div'),toggle=node('button',{type:'button',className:'secondary',textContent:'Rewrite with local Ollama'}),body=node('div',{hidden:true});
  toggle.setAttribute('aria-expanded','false');toggle.addEventListener('click',()=>{body.hidden=!body.hidden;toggle.setAttribute('aria-expanded',String(!body.hidden));});panel.append(toggle,body);
  const note=node('p',{className:'note',textContent:'Uses your saved Local Ollama address and model. Sends only this definition and your guidance, consumes one session request, and changes nothing until you review and save.'});
  const label=node('label',{textContent:'What should change?'}),guidance=node('input',{type:'text',maxLength:1000});guidance.setAttribute('aria-label',category.name+' rewrite guidance');label.append(guidance);
  const generate=node('button',{type:'button',className:'secondary',textContent:'Generate rewrite'}),status=node('p',{className:'note'});status.setAttribute('role','status');
  const preview=node('section',{hidden:true}),old=node('p'),proposal=node('p'),apply=node('button',{type:'button',textContent:'Use rewrite in draft'}),discard=node('button',{type:'button',className:'secondary',textContent:'Discard rewrite'});
  old.className=proposal.className='definition-wording';preview.append(node('strong',{textContent:'Current definition'}),old,node('strong',{textContent:'Proposed definition'}),proposal,apply,discard);
  body.append(note,label,generate,status,preview);details.append(panel);
  let generation=0, candidate=null;
  const invalidate=()=>{generation++;candidate=null;preview.hidden=true;status.textContent='';};
  guidance.addEventListener('input',invalidate);text.addEventListener('input',invalidate);
  discard.addEventListener('click',invalidate);
  generate.addEventListener('click',async()=>{
    invalidate();const token=generation,original=text.value,requested=guidance.value,draft=snapshot();
    if(!requested.trim()){status.textContent='Describe how the definition should change first.';return;}
    generate.disabled=true;status.textContent='Generating with saved local Ollama settings…';
    try {
      const result=await send({type:'rewriteDefinition',categoryId:category.id,definition:original,guidance:requested});
      if(token!==generation||!panel.isConnected||!isCurrent())return;
      if(draft!==snapshot()){status.textContent='Draft settings changed. Discarded the rewrite; generate a fresh one.';return;}
      candidate={original,draft,definition:result.definition};old.textContent=original;proposal.textContent=result.definition;preview.hidden=false;
      status.textContent='Review the wording before applying it. Saved settings are unchanged.';
    } catch(error){if(token===generation&&panel.isConnected)status.textContent=error.message;}
    finally {generate.disabled=false;}
  });
  apply.addEventListener('click',()=>{
    if(!candidate||text.value!==candidate.original||!isCurrent()||candidate.draft!==snapshot()) {invalidate();status.textContent='Draft settings changed. Generate a fresh rewrite.';return;}
    const definition=candidate.definition;invalidate();onApply(definition);
  });
}
