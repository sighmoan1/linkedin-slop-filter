import {DEFAULTS,requestFor,probability} from '../core.mjs';
const s={...DEFAULTS,provider:'ollama',ollamaModel:process.env.OLLAMA_MODEL || DEFAULTS.ollamaModel,ollamaEndpoint:process.env.OLLAMA_ENDPOINT || DEFAULTS.ollamaEndpoint};
try {
 const req=requestFor(s,'Synthetic test: Our database migration reduced query time from 240 ms to 38 ms by adding a composite index.');
 const start=performance.now();
 const response=await fetch(req.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req.body),redirect:'error',signal:AbortSignal.timeout(req.timeout)});
 if(!response.ok) throw new Error('HTTP '+response.status);
 const data=await response.json();
 console.log(JSON.stringify({provider:'ollama',model:s.ollamaModel,score:probability('ollama',data),scoreKind:'self-reported slop confidence; zero when judged useful',synthetic:true,durationMs:Math.round(performance.now()-start),loadMs:Math.round((data.load_duration || 0)/1e6),promptTokens:data.prompt_eval_count,outputTokens:data.eval_count}));
} catch(error) {
 console.error('Local smoke failed: '+(error.message.startsWith('HTTP ') ? error.message+'; check the service and downloaded model' : error.name==='TimeoutError' ? 'timeout; warm the model and retry' : 'unavailable service, invalid configuration or invalid output'));
 process.exit(1);
}
