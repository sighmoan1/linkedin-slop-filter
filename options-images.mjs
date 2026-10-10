// Explicit comparison only. Selecting files or typing never makes a provider request.
export function installImageComparison(send) {
  const $=id=>document.getElementById(id);
  let generation=0;
  const invalidate=()=>{generation++;$("imageComparisonResult").replaceChildren();$("imageComparisonStatus").textContent="";};
  $("clearPlayground").addEventListener("click",()=>{$("comparisonImages").value="";invalidate();});
  $("comparisonImages").addEventListener("change",invalidate);
  $("playgroundText").addEventListener("input",invalidate);
  $("compareImages").addEventListener("click",async()=>{
    const files=[...$("comparisonImages").files],text=$("playgroundText").value.trim(),token=++generation;
    if(!files.length||files.length>4){$("imageComparisonStatus").textContent="Choose one to four post images.";return;}
    $("compareImages").disabled=true;$("imageComparisonResult").replaceChildren();$("imageComparisonStatus").textContent="Comparing Clef Flash and Luna through OpenRouter…";
    try {
      const images=[];
      for(const file of files) {
        if(file.size>6*1024*1024||!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Use PNG, JPEG or WebP images up to 6 MB each.");
        const bitmap=await createImageBitmap(file);
        try {
          if(bitmap.width*bitmap.height>40000000)throw new Error("Image dimensions exceed the trial limit.");
          const scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
          const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
          images.push(canvas.toDataURL("image/jpeg",0.7));
        } finally {bitmap.close();}
      }
      if(images.reduce((n,x)=>n+x.length,0)>150000)throw new Error("These images exceed the combined trial size. Compare fewer images.");
      if(token!==generation)return;
      const reply=await send({type:"compareImages",text,images});
      if(token!==generation)return;
      const table=document.createElement("table");table.className="results-table";
      const header=document.createElement("tr");
      for(const label of ["Model","Visual slop score","Input tokens","Cost (USD)","Time"]){const th=document.createElement("th");th.textContent=label;header.append(th);}
      const head=document.createElement("thead");head.append(header);table.append(head);
      const body=document.createElement("tbody");
      for(const r of reply.results||[]) {
        const row=document.createElement("tr"),score=r.scores?.["lsf-visual-slop"];
        for(const value of [r.model,typeof score==="number"?(score*100).toFixed(1)+"%":r.disabled?"Settings changed":r.error||"Unavailable",r.imageUsage?.inputTokens??"Not returned / cached",r.imageUsage?.cost!==undefined?"$"+r.imageUsage.cost:"Not returned / cached",r.durationMs+" ms"]){const td=document.createElement("td");td.textContent=value;row.append(td);}
        body.append(row);
      }
      table.append(body);$("imageComparisonResult").replaceChildren(table);
      $("imageComparisonStatus").textContent="Comparison finished. Review each result against your own judgement; no images or captions were saved.";
    } catch(error){if(token===generation)$("imageComparisonStatus").textContent=error.message;}
    finally {$("compareImages").disabled=false;}
  });
}
