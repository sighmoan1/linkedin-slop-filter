import {createHash} from 'node:crypto';
import {categorySummary} from './category-evaluation-core.mjs';

const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hexHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validScore = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const median = values => {
  const sorted = values.filter(x => Number.isFinite(x) && x >= 0).sort((a,b) => a-b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

// The hash is computed before running either rubric, includes actual post text but never outputs it.
// Sorting by opaque ID makes a run's input order irrelevant while preserving labels.
export function corpusFingerprint(cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('A nonempty labelled corpus is required.');
  return sha256(cases.map(row => ({id: row.id, text: row.text, yes: [...row.yes].sort(),
    useful: row.useful ?? null, ambiguous: row.ambiguous ?? null})).sort((a,b) => a.id.localeCompare(b.id)));
}
export const rubricFingerprint = categories => sha256(categories);

// Accepted format is stdout from evaluate:categories: one JSON row per case followed by
// its final JSON summary. Never accept raw text or credentials in an evaluation run.
export function parseCategoryRun(ndjson) {
  if (typeof ndjson !== 'string' || !ndjson.trim()) throw new Error('Empty evaluation run.');
  let records;
  try { records = ndjson.trim().split(/\r?\n/).map(line => JSON.parse(line)); }
  catch { throw new Error('Expected line-delimited JSON output from evaluate:categories.'); }
  const metadata = records.pop();
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      typeof metadata.provider !== 'string' || typeof metadata.model !== 'string' ||
      !hexHash(metadata.corpusHash) || !hexHash(metadata.rubricHash) || !metadata.summary || !records.length)
    throw new Error('Run must end with provider, model, corpusHash, rubricHash and summary. Re-run the current evaluator.');
  const ids = new Set();
  for (const row of records) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.id !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,79}$/.test(row.id) || ids.has(row.id) ||
        !Array.isArray(row.expected) || row.expected.some(id => typeof id !== 'string') ||
        new Set(row.expected).size !== row.expected.length ||
        (row.useful !== undefined && typeof row.useful !== 'boolean') ||
        (row.ambiguous !== undefined && typeof row.ambiguous !== 'boolean') ||
        (row.durationMs !== undefined && (!Number.isFinite(row.durationMs) || row.durationMs < 0)) ||
        (row.scores !== undefined && (!row.scores || typeof row.scores !== 'object' || Array.isArray(row.scores) ||
          Object.values(row.scores).some(score => !validScore(score)))) ||
        (row.error !== undefined && typeof row.error !== 'string') ||
        Object.hasOwn(row, 'text') || Object.hasOwn(row, 'key') || Object.hasOwn(row, 'apiKey')) {
      throw new Error('Invalid, duplicate or privacy-unsafe evaluation row.');
    }
    ids.add(row.id);
  }
  return {rows: records, metadata};
}

function verifyRubrics(baseline, candidate) {
  if (!Array.isArray(baseline?.categories) || !Array.isArray(candidate?.categories) ||
      !baseline.categories.length || !same(baseline.categories.map(c => [c.id,c.name,c.action,c.threshold]),
        candidate.categories.map(c => [c.id,c.name,c.action,c.threshold])))
    throw new Error('The two rubrics must use identical categories, names, actions and thresholds; compare prompt wording only.');
  for (const rubric of [baseline, candidate]) {
    if (new Set(rubric.categories.map(c => c.id)).size !== rubric.categories.length ||
        rubric.categories.some(c => typeof c.id !== 'string' || typeof c.instructions !== 'string' ||
          !c.instructions.trim() || c.instructions.length > 2000 ||
          !['hide','highlight','label','off'].includes(c.action) || !validScore(c.threshold)))
      throw new Error('Invalid rubric category or definition.');
  }
  if (rubricFingerprint(baseline.categories) === rubricFingerprint(candidate.categories))
    throw new Error('There is no changed rubric definition to evaluate.');
}

export function compareRubricRuns(baselineRun, candidateRun, baselineRubric, candidateRubric) {
  verifyRubrics(baselineRubric, candidateRubric);
  const a = baselineRun.metadata, b = candidateRun.metadata;
  if (!hexHash(a.corpusHash) || a.corpusHash !== b.corpusHash ||
      a.rubricHash !== rubricFingerprint(baselineRubric.categories) ||
      b.rubricHash !== rubricFingerprint(candidateRubric.categories))
    throw new Error('Corpus or rubric fingerprint mismatch. Freshly score the same labelled cases under each rubric.');
  if (a.provider !== b.provider || a.model !== b.model || !same(a.options ?? null,b.options ?? null))
    throw new Error('Provider, model and evaluation options must match for a prompt-only comparison.');
  const baselineById = new Map(baselineRun.rows.map(r => [r.id,r]));
  if (baselineById.size !== baselineRun.rows.length || baselineById.size !== candidateRun.rows.length)
    throw new Error('Runs have a different number of cases or duplicate IDs.');
  const orderedCandidate = [];
  for (const [id, previous] of baselineById) {
    const next = candidateRun.rows.find(r => r.id === id);
    if (!next || !same([...previous.expected].sort(), [...next.expected].sort()) ||
        (previous.useful ?? null) !== (next.useful ?? null) ||
        (previous.ambiguous ?? null) !== (next.ambiguous ?? null))
      throw new Error('Case IDs, expected labels or usefulness/ambiguity annotations differ between runs.');
    for (const row of [previous,next]) {
      if (row.expected.some(label => !baselineRubric.categories.some(c => c.id === label)) ||
          row.scores && Object.keys(row.scores).some(label => !baselineRubric.categories.some(c => c.id === label)))
        throw new Error('Run contains an unknown category label or score.');
    }
    orderedCandidate.push(next);
  }
  const oldSummary = categorySummary(baselineRun.rows,baselineRubric.categories);
  const newSummary = categorySummary(orderedCandidate,candidateRubric.categories);
  const usefulCount = baselineRun.rows.filter(r => r.useful === true && r.ambiguous !== true).length;
  const assessed = baselineRun.rows.filter(r => r.ambiguous !== true);
  const expectedHidden = assessed.filter(r => baselineRubric.categories.some(c => c.action === 'hide' && r.expected.includes(c.id))).length;
  const coverageComplete = oldSummary.complete === baselineRun.rows.length && newSummary.complete === orderedCandidate.length;
  const reasons = [];
  if (baselineRun.rows.length < 20) reasons.push('Fewer than 20 labelled cases; evidence is too small for a positive recommendation.');
  if (usefulCount < 5) reasons.push('Fewer than five explicitly useful-labelled cases.');
  if (expectedHidden < 5 || assessed.length - expectedHidden < 5) reasons.push('Need at least five expected-to-hide and five expected-to-keep cases.');
  if (!coverageComplete) reasons.push('At least one run has missing, partial or failed classification; compare only complete runs before approval.');
  const oldActions = oldSummary.actions, newActions = newSummary.actions;
  const regression = newActions.wronglyHidden > oldActions.wronglyHidden ||
    newActions.expectedHiddenLeftVisible > oldActions.expectedHiddenLeftVisible ||
    newActions.usefulWronglyHidden !== null && oldActions.usefulWronglyHidden !== null &&
      newActions.usefulWronglyHidden > oldActions.usefulWronglyHidden;
  if (regression) reasons.push('Candidate increases incorrect Hide decisions, missed Hide decisions or wrongly hidden useful posts.');
  const improvement = newActions.wronglyHidden < oldActions.wronglyHidden ||
    newActions.expectedHiddenLeftVisible < oldActions.expectedHiddenLeftVisible ||
    newSummary.exactMatches > oldSummary.exactMatches;
  if (!improvement) reasons.push('No observed improvement in incorrect Hide, missed Hide or complete category agreement.');
  // Coverage/sample insufficiency takes precedence: do not call a failed run a measured regression.
  const verdict = !coverageComplete || baselineRun.rows.length < 20 || usefulCount < 5 ||
    expectedHidden < 5 || assessed.length-expectedHidden < 5 ? 'insufficient-evidence' :
      regression ? 'regression' : !improvement ? 'no-improvement' : 'eligible-for-human-review';
  return {
    verdict, eligibleForHumanReview: verdict === 'eligible-for-human-review', reasons,
    provider: a.provider, model: a.model, corpusHash: a.corpusHash,
    sample: {cases: baselineRun.rows.length, unambiguous: assessed.length, usefulAnnotated: usefulCount,
      expectedHidden, expectedVisible: assessed.length - expectedHidden},
    baseline: {rubricHash: a.rubricHash, ...oldSummary, medianDurationMs: median(baselineRun.rows.map(r => r.durationMs))},
    candidate: {rubricHash: b.rubricHash, ...newSummary, medianDurationMs: median(orderedCandidate.map(r => r.durationMs))},
    limitations: 'Selected local labels and uncalibrated model scores, not representative accuracy. No automatic changes to saved settings.'
  };
}
