export function installPostExceptions(send) {
  const $=id=>document.getElementById(id);
  let revision=0;
  async function refresh() {
    const current=++revision;
    try {
      const result=await send({type:"postExceptions",action:"list"});
      if(current!==revision)return;
      if(!Array.isArray(result.postExceptions))throw new Error("Saved post choices are unavailable.");
      $("postExceptionList").replaceChildren();
      for(const record of result.postExceptions) {
        const row=document.createElement("div");row.className="button-row";
        const label=document.createElement("span");label.textContent="Saved "+new Date(record.at).toLocaleString()+" · "+record.id.slice(0,8);
        const remove=document.createElement("button");remove.type="button";remove.className="secondary";remove.textContent="Remove";remove.setAttribute("aria-label","Remove saved post choice "+record.id.slice(0,8));
        remove.addEventListener("click",async()=>{remove.disabled=true;try{await send({type:"postExceptions",action:"remove",id:record.id});await refresh();($("postExceptionList").querySelector("button")||$("refreshPostExceptions")).focus();$("postExceptionStatus").textContent="Choice removed. Normal filtering resumes on the next feed refresh.";}catch(error){$("postExceptionStatus").textContent=error.message;remove.disabled=false;}});
        row.append(label,remove);$("postExceptionList").append(row);
      }
      if(!result.postExceptions.length)$("postExceptionList").textContent="No saved post choices.";
      $("clearPostExceptions").disabled=!result.postExceptions.length;
    }catch(error){$("postExceptionStatus").textContent=error.message;}
  }
  $("refreshPostExceptions").addEventListener("click",refresh);
  $("clearPostExceptions").addEventListener("click",async()=>{const button=$("clearPostExceptions");button.disabled=true;try{await send({type:"postExceptions",action:"clear"});await refresh();$("refreshPostExceptions").focus();$("postExceptionStatus").textContent="Saved post choices cleared. Normal filtering resumes on the next feed refresh.";}catch(error){$("postExceptionStatus").textContent=error.message;button.disabled=false;}});
  return refresh;
}
