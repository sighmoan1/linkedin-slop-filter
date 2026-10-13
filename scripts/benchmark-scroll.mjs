import {createHash} from 'node:crypto';
import {DEFAULT_CATEGORIES} from '../core.mjs';
import {variants,cases,makeRequest,attempt,summarize} from './scroll-benchmark-core.mjs';
const selected=(process.argv[2] || 'ollama,tev1').split(',');
const count=Number(process.argv[3] || 10);
if(!selected.length || new Set(selected).size!==selected.length || selected.some(x=>!variants.includes(x)) || !Number.isInteger(count) || count<1 || count*selected.length>100) {
  console.error('Usage: node scripts/benchmark-scroll.mjs <ollama,tev1,jev,openai,responses> [attempts-per-variant]; total cap 100');process.exit(2);
}
// Preflight every requested variant before making any requests, so missing credentials never produce a misleading partial comparison.
try {
  for(const v of selected) {const req=makeRequest(v,cases[0]);if(['jev','openai','responses'].includes(v) && !req.key) throw new Error();}
} catch {console.error('Invalid configuration or missing OPENAI_API_KEY / OPENROUTER_API_KEY. No requests sent.');process.exit(2);}
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report={synthetic:true,liveLinkedIn:false,cacheBypassed:true,charactersMax:2000,categories:DEFAULT_CATEGORIES.length,
  rubricHash:hash(DEFAULT_CATEGORIES),corpusHash:hash(cases),startedAt:new Date().toISOString(),results:[],
  limitations:['Unlabelled synthetic corpus: no accuracy or false-hide conclusion.','Different models/quantization/hardware/API implementations do not isolate causality.','First request is not guaranteed cold; repeated inputs may benefit from server prompt caching.','Queue replay estimates one sequential uncached stream; not a live browser scroll measurement.','Small samples cannot establish production tail latency.']};
// Run each model separately: concurrent local models would compete for RAM/GPU and distort timings.
for(const variant of selected) {
  const request=makeRequest(variant,cases[0]);
  const rows=[];
  for(let i=0;i<count;i++) {const row=await attempt(variant,cases[i%cases.length]);rows.push({...row,caseIndex:i%cases.length});console.error(variant+' '+(i+1)+'/'+count+': '+row.status+' '+row.durationMs+' ms');}
  report.results.push({variant,model:request.body.model,reasoning:request.body.reasoning?.effort,rows,summary:summarize(rows)});
}
console.log(JSON.stringify(report,null,2));
if(report.results.some(r=>r.summary.complete!==count)) process.exitCode=1;
