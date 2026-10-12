// Explicit, optional local-only evaluation. No cloud providers, credentials, feed collection or corpus text output.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DEFAULTS, DEFAULT_CATEGORIES, DEFAULT_RUBRIC_VERSION, normalizeCategories, activeCategories, requestFor, validScores} from '../core.mjs';
import {categoryDecisions, categorySummary, validateCategoryDataset} from './category-evaluation-core.mjs';
import {corpusFingerprint} from './rubric-comparison-core.mjs';

const [datasetFile, rubricFile] = process.argv.slice(2);
if (!datasetFile || process.argv.length > 4) {
  console.error('Usage: npm run evaluate:categories -- <labelled-cases.json> [rubric-snapshot.json]');
  process.exit(2);
}
let categories, cases, version;
try {
  const rubric = rubricFile ? JSON.parse(fs.readFileSync(rubricFile, 'utf8')) : {categories: DEFAULT_CATEGORIES, version: DEFAULT_RUBRIC_VERSION};
  categories = normalizeCategories(rubric.categories);
  if (!Array.isArray(rubric.categories) || !categories.length || categories.length !== rubric.categories.length ||
      categories.some((c, i) => c.id !== rubric.categories[i].id || c.instructions !== rubric.categories[i].instructions ||
        c.name !== rubric.categories[i].name || c.action !== rubric.categories[i].action || c.threshold !== rubric.categories[i].threshold)) throw new Error();
  cases = validateCategoryDataset(JSON.parse(fs.readFileSync(datasetFile, 'utf8')), categories);
  version = typeof rubric.version === 'string' && /^[a-z0-9.-]{1,80}$/i.test(rubric.version) ? rubric.version : 'custom';
} catch {
  console.error('Invalid corpus or rubric. Use known independent yes labels, opaque unique ids, at most 2,000 text characters and valid categories/actions/thresholds. Nothing was sent.');
  process.exit(2);
}
const settings = {...DEFAULTS, provider: 'ollama', categories,
  ollamaModel: process.env.OLLAMA_MODEL || DEFAULTS.ollamaModel,
  ollamaEndpoint: process.env.OLLAMA_ENDPOINT || DEFAULTS.ollamaEndpoint};
const active = activeCategories(categories);
try { requestFor(settings, 'Preflight only; no request.'); }
catch { console.error('Invalid local model, loopback endpoint, empty active rubric or definitions over the local context limit. Nothing was sent.'); process.exit(2); }
const rubricHash = createHash('sha256').update(JSON.stringify(categories)).digest('hex');
const rows = [];
for (const post of cases) {
  const row = {id: post.id, expected: post.yes, ...(post.useful === undefined ? {} : {useful: post.useful}),
    ...(post.ambiguous === undefined ? {} : {ambiguous: post.ambiguous})};
  const start = performance.now();
  try {
    const req = requestFor(settings, post.text, active);
    const response = await fetch(req.url, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(req.body), redirect: 'error', signal: AbortSignal.timeout(req.timeout)});
    if (!response.ok) throw new Error();
    row.scores = validScores('ollama', await response.json(), active);
    row.applied = categoryDecisions(row.scores, active);
  } catch { row.error = 'Unavailable, HTTP error, timeout or invalid response; left visible.'; }
  row.durationMs = Math.round(performance.now() - start);
  rows.push(row);
  console.log(JSON.stringify(row));
}
console.log(JSON.stringify({provider: 'ollama', model: settings.ollamaModel, rubricVersion: version, rubricHash,
  corpusHash: corpusFingerprint(cases), options: {temperature: 0, num_ctx: 4096, think: false}, summary: categorySummary(rows, categories)}));
if (rows.some(row => row.error)) process.exitCode = 1;
