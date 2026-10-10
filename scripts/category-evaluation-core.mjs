import {applies} from '../core.mjs';

const isScore = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const asked = categories => categories.filter(c => c.action !== 'off');

// Labels are independent. "Useful" and "ambiguous" are optional annotations, never inferred from category absence.
export function validateCategoryDataset(data, categories) {
  if (!data || !Array.isArray(data.cases) || !data.cases.length) throw new Error('Expected a nonempty cases array.');
  const ids = new Set(), categoryIds = new Set(categories.map(c => c.id));
  for (const row of data.cases) {
    if (!row || typeof row.id !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,79}$/.test(row.id) || ids.has(row.id) ||
        typeof row.text !== 'string' || !row.text.trim() || row.text.trim().length > 2000 ||
        !Array.isArray(row.yes) || new Set(row.yes).size !== row.yes.length || row.yes.some(id => !categoryIds.has(id)) ||
        (row.useful !== undefined && typeof row.useful !== 'boolean') ||
        (row.ambiguous !== undefined && typeof row.ambiguous !== 'boolean')) {
      throw new Error('Each case needs a unique opaque id, 1–2,000 characters of text, and known, distinct yes labels; useful/ambiguous must be booleans when supplied.');
    }
    ids.add(row.id);
  }
  return data.cases;
}

export function categoryDecisions(scores, categories) {
  return asked(categories).filter(c => isScore(scores?.[c.id]) && applies(scores[c.id], c.threshold)).map(c => c.id);
}

// Replay stored scores under the actual actions. Service errors and missing scores never become positive decisions.
export function categorySummary(rows, categories) {
  const active = asked(categories);
  const measured = rows.map(row => {
    const available = active.filter(c => !row.error && isScore(row.scores?.[c.id]));
    const valid = available.length > 0;
    const applied = valid ? categoryDecisions(row.scores, active) : [];
    const expected = active.filter(c => row.expected?.includes(c.id)).map(c => c.id);
    const hidden = active.some(c => c.action === 'hide' && applied.includes(c.id));
    const expectedHidden = active.some(c => c.action === 'hide' && expected.includes(c.id));
    return {...row, valid, complete: valid && available.length === active.length, available, applied, expected, hidden, expectedHidden};
  });
  const assessed = measured.filter(row => row.ambiguous !== true);
  const useful = assessed.filter(row => row.useful === true);
  const perCategory = Object.fromEntries(active.map(c => {
    const available = assessed.filter(row => row.available.some(a => a.id === c.id));
    const counts = {scored: available.length, missing: assessed.length - available.length,
      truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0};
    for (const row of available) {
      const expected = row.expected.includes(c.id), actual = row.applied.includes(c.id);
      counts[expected ? (actual ? 'truePositive' : 'falseNegative') : (actual ? 'falsePositive' : 'trueNegative')]++;
    }
    return [c.id, counts];
  }));
  const complete = assessed.filter(row => row.complete);
  return {
    total: measured.length, valid: measured.filter(row => row.valid).length,
    errors: measured.filter(row => !row.valid).length,
    partial: measured.filter(row => row.valid && !row.complete).length,
    complete: measured.filter(row => row.complete).length,
    ambiguous: measured.length - assessed.length,
    assessedComplete: complete.length,
    exactMatches: complete.filter(row => row.expected.length === row.applied.length && row.expected.every(id => row.applied.includes(id))).length,
    perCategory,
    actions: {
      hidden: measured.filter(row => row.hidden).length,
      expectedHidden: assessed.filter(row => row.expectedHidden).length,
      wronglyHidden: assessed.filter(row => row.hidden && !row.expectedHidden).length,
      expectedHiddenLeftVisible: assessed.filter(row => !row.hidden && row.expectedHidden).length,
      expectedHiddenLeftVisibleWithCompleteScores: complete.filter(row => !row.hidden && row.expectedHidden).length,
      usefulAnnotated: useful.length,
      usefulHidden: useful.length ? useful.filter(row => row.hidden).length : null,
      usefulWronglyHidden: useful.length ? useful.filter(row => row.hidden && !row.expectedHidden).length : null,
      usefulHiddenByExpectedRule: useful.length ? useful.filter(row => row.hidden && row.expectedHidden).length : null
    }
  };
}
