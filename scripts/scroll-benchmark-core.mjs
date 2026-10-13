import {DEFAULTS, DEFAULT_CATEGORIES, requestFor, scores} from '../core.mjs';
import {localSchema, localEndpoint} from '../core/providers.mjs';
export const variants = ['ollama', 'tev1', 'jev', 'openai', 'responses'];
export const cases = [
  'Our database migration reduced query time from 240 ms to 38 ms. We added a composite index on tenant_id and created_at because every query filters on both. Check EXPLAIN before adding indexes: write costs and disk usage increase.',
  'I was rejected 100 times. Today I am a CEO. Never give up. Your mindset is your superpower. Agree? Comment YES if you believe in yourself.',
  'We are hiring a backend engineer to maintain our billing service. Remote within the UK, salary £70–90k. Apply by 30 November at the careers page, reference BACKEND-42.',
  'Our new analytics product launches today. Plans start at £20 per month. Book a demo on our website to see how it works.',
  'After five years with the team, I am starting a new role next week. Thank you to everyone who helped me along the way.'
];
export function makeRequest(variant, text, env = process.env) {
  if (!variants.includes(variant)) throw new Error('Unknown variant');
  const settings = {...DEFAULTS, provider: variant, jevKey:env.OPENROUTER_API_KEY, openaiKey:env.OPENAI_API_KEY,
    ollamaEndpoint:env.OLLAMA_ENDPOINT || DEFAULTS.ollamaEndpoint, ollamaModel:env.OLLAMA_MODEL || DEFAULTS.ollamaModel};
  const categories = DEFAULT_CATEGORIES;
  const input = text.trim().slice(0,2000);
  if (variant === 'tev1') return {url:localEndpoint(settings.ollamaEndpoint)+'/v1/systemone', timeout:30000,
    body:{model:env.TEV_MODEL || 'tev1:latest', state:{post_text:input}, questions:Object.fromEntries(categories.map(c=>[c.id,{type:'noul',instructions:c.instructions,criteria:{false:'The post does not belong to this category.',true:'The post belongs to this category.'}}]))}};
  if (variant === 'responses') {
    const local = requestFor({...settings,provider:'ollama'},input,categories);
    return {url:'https://api.openai.com/v1/responses', key:env.OPENAI_API_KEY, timeout:30000,
      body:{model:env.OPENAI_MODEL || 'gpt-6-astra', store:false, reasoning:{effort:env.OPENAI_REASONING || 'low'},
        input:local.body.messages, max_output_tokens:2048,
        text:{format:{type:'json_schema', name:'category_scores', strict:true, schema:localSchema(categories)}}}};
  }
  return requestFor(settings,input,categories);
}
export function readScores(variant,data) {
  if (variant !== 'responses') return scores(variant === 'tev1' ? 'jev' : variant,data,DEFAULT_CATEGORIES);
  if (data?.status !== 'completed' || !Array.isArray(data.output)) return {};
  const content = data.output.filter(x=>x.type==='message').flatMap(x=>x.content || []);
  if (content.some(x=>x.type==='refusal')) return {};
  const texts=content.filter(x=>x.type==='output_text');
  if(texts.length!==1) return {};
  try { return scores('ollama',{done:true,done_reason:'stop',message:{role:'assistant',content:texts[0].text}},DEFAULT_CATEGORIES); } catch {return {};}
}
export const percentile = (values,p) => values.length ? [...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)] : null;
// Replay one uncached sequential queue. Failures consume time but never meet a decision deadline.
export function replay(rows, intervalMs) {
  let finish=0;
  const delays=rows.map((row,i)=>{finish=Math.max(finish,i*intervalMs)+row.durationMs;return finish-i*intervalMs;});
  return {intervalMs, deadlineMs:intervalMs, completeOnTime:rows.filter((r,i)=>r.status==='complete' && delays[i]<=intervalMs).length,
    attempts:rows.length, p95CompletionMs:percentile(delays,.95), finalBacklogMs:Math.max(0,finish-rows.length*intervalMs)};
}
export function summarize(rows) {
  const complete=rows.filter(x=>x.status==='complete');
  const subsequent=rows.slice(1).filter(x=>x.status==='complete');
  return {attempts:rows.length, complete:complete.length, partial:rows.filter(x=>x.status==='partial').length, errors:rows.filter(x=>x.status==='error').length,
    firstAttempt:rows[0] || null, p50Ms:percentile(complete.map(x=>x.durationMs),.5), p95Ms:percentile(complete.map(x=>x.durationMs),.95),
    subsequentP50Ms:percentile(subsequent.map(x=>x.durationMs),.5), sequentialReplay:[500,1000,2000].map(t=>replay(rows,t))};
}
export async function attempt(variant,text,env=process.env,fetcher=fetch) {
  const req=makeRequest(variant,text,env);
  if (['jev','openai','responses'].includes(variant) && !req.key) throw new Error('Missing credential');
  const start=performance.now();
  let row={status:'error'};
  try {
    const headers={'Content-Type':'application/json'};if(req.key) headers.Authorization='Bearer '+req.key;
    const response=await fetcher(req.url,{method:'POST',headers,body:JSON.stringify(req.body),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(req.timeout || 20000)});
    if(!response.ok) row.httpStatus=response.status;
    else {
      const data=await response.json(), result=readScores(variant,data), count=Object.keys(result).length;
      row={status:count===DEFAULT_CATEGORIES.length?'complete':count?'partial':'error', answeredCategories:count};
      // Scores are retained for diagnostics, not interpreted as calibrated or labelled accuracy.
      row.scores=result;
      for(const [source,target] of [['load_duration','loadMs'],['prompt_eval_duration','promptMs'],['eval_duration','generationMs']])
        if(Number.isFinite(data[source]) && data[source]>=0) row[target]=Math.round(data[source]/1e6);
      const usage=data.usage;
      if(usage) row.usage=Object.fromEntries(['input_tokens','output_tokens','total_tokens','cost'].filter(k=>Number.isFinite(usage[k]) && usage[k]>=0).map(k=>[k,usage[k]]));
    }
  } catch { /* Never emit provider response, exception text, input or credentials. */ }
  return {...row,durationMs:Math.round(performance.now()-start)};
}
