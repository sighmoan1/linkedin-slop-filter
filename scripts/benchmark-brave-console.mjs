// Print credential-free code to run in the installed extension's options-page DevTools console.
// Keys are read and used inside that trusted context, never returned or copied out.
import fs from 'node:fs';
const core=fs.readFileSync(new URL('./scroll-benchmark-core.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
console.log(`void (async()=>{
const {DEFAULTS,DEFAULT_CATEGORIES,requestFor,scores}=await import(chrome.runtime.getURL('core.mjs'));
const {localSchema,localEndpoint}=await import(chrome.runtime.getURL('core/providers.mjs'));
${core}
const saved=await chrome.storage.local.get(['openaiKey','jevKey','ollamaModel','ollamaEndpoint']);
const env={OPENAI_API_KEY:saved.openaiKey,OPENROUTER_API_KEY:saved.jevKey,OLLAMA_MODEL:saved.ollamaModel,OLLAMA_ENDPOINT:saved.ollamaEndpoint};
if(!env.OPENAI_API_KEY || !env.OPENROUTER_API_KEY) {console.log('Missing saved key; no benchmark calls sent.');return;}
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
const report={synthetic:true,liveLinkedIn:false,context:'installed-Brave-options',cacheBypassed:true,charactersMax:2000,categories:DEFAULT_CATEGORIES.length,rubricHash:await hash(DEFAULT_CATEGORIES),corpusHash:await hash(cases),startedAt:new Date().toISOString(),results:[]};
window.__lsfBench130={progress:'starting',report};
for(const variant of ['ollama','jev','openai','responses','luna-responses']) {
 const apiVariant=variant==='luna-responses'?'responses':variant;
 const config=variant==='luna-responses'?{...env,OPENAI_MODEL:'gpt-6-luna',OPENAI_REASONING:'none'}:env;
 const request=makeRequest(apiVariant,cases[0],config),rows=[];
 for(let i=0;i<10;i++) {window.__lsfBench130.progress=variant+' '+(i+1)+'/10';const row=await attempt(apiVariant,cases[i%cases.length],config);rows.push({...row,caseIndex:i%cases.length});}
 report.results.push({variant,model:request.body.model,reasoning:request.body.reasoning?.effort,rows,summary:summarize(rows)});
 console.log('BENCHMARK '+JSON.stringify({variant,model:request.body.model,summary:summarize(rows)}));
}
window.__lsfBench130.progress='complete';console.log('BENCHMARK COMPLETE');
})().catch(()=>console.log('Benchmark configuration failed; no credentials or raw error output.'));`);
