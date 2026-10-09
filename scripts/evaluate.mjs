import fs from 'node:fs';
import {DEFAULTS,requestFor,probability,shouldFold} from '../core.mjs';
import {summary} from './evaluation-core.mjs';
const [provider,file,cutoff='80']=process.argv.slice(2);
if(!['jev','ollama'].includes(provider) || !file || !Number.isFinite(Number(cutoff)) || Number(cutoff)<0 || Number(cutoff)>100) {
 console.error('Usage: npm run evaluate -- <jev|ollama> <private-labels.jsonl> [cutoff-percent]');process.exit(2);
}
const key=process.env.OPENROUTER_API_KEY;
if(provider==='jev' && !key) {console.error('Missing OPENROUTER_API_KEY; set it locally, never commit it.');process.exit(2);}
const s={...DEFAULTS,provider,jevKey:key,ollamaModel:process.env.OLLAMA_MODEL || DEFAULTS.ollamaModel,ollamaEndpoint:process.env.OLLAMA_ENDPOINT || DEFAULTS.ollamaEndpoint};
if(process.env.SLOP_RUBRIC_FILE) {
 try {s.rule=fs.readFileSync(process.env.SLOP_RUBRIC_FILE,'utf8').trim();if(!s.rule) throw new Error();}
 catch {console.error('Cannot read a nonempty SLOP_RUBRIC_FILE.');process.exit(2);}
}
let posts;
try {
 posts=fs.readFileSync(file,'utf8').split('\n').filter(line=>line.trim()).map(line=>JSON.parse(line));
 const ids=new Set();
 for(const row of posts) {
  if(typeof row.id!=='string' || !row.id || ids.has(row.id) || !['useful','slop'].includes(row.label) || typeof row.text!=='string' || !row.text.trim()) throw new Error();
  ids.add(row.id);
 }
 if(!posts.length) throw new Error();
} catch {console.error('Invalid dataset. Each JSONL row needs a unique opaque id, useful/slop label and nonempty text.');process.exit(2);}
const rows=[];
for(const post of posts) {
 const start=performance.now();
 const row={id:post.id,label:post.label,provider,model:provider==='ollama'?s.ollamaModel:'typesafe/jev-1.13',threshold:Number(cutoff)/100,hidden:false};
 try {
  // Equal evidence for both providers; compare the first 2,000 characters.
  const req=requestFor(s,post.text.trim().slice(0,2000));
  const headers={'Content-Type':'application/json'};if(req.key) headers.Authorization='Bearer '+req.key;
  const response=await fetch(req.url,{method:'POST',headers,body:JSON.stringify(req.body),redirect:'error',signal:AbortSignal.timeout(req.timeout || 20000)});
  if(!response.ok) throw new Error();
  row.score=probability(provider,await response.json());row.hidden=shouldFold(row.score,row.threshold);
 } catch {row.error='unavailable, HTTP error or invalid response; left visible';}
 row.durationMs=Math.round(performance.now()-start);rows.push(row);console.log(JSON.stringify(row));
}
console.log(JSON.stringify({summary:summary(rows),provider,threshold:Number(cutoff)/100}));
if(rows.some(row=>row.error)) process.exitCode=1;
