import {normalizeCorrections} from "./experience.mjs";

const validScore = p => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1;
const counts = (examples, threshold) => {
  let falseMatches = 0, misses = 0;
  for (const {score, chosen} of examples) {
    if (score > threshold && !chosen) falseMatches++;
    if (score <= threshold && chosen) misses++;
  }
  return {falseMatches, misses};
};

// Suggestions fit selected corrections, not a representative accuracy sample.
// Whole-percent candidates match the settings control. Never increase false matches.
function suggestionFor(examples, threshold) {
  const positives = examples.filter(e => e.chosen).length;
  if (positives < 5 || examples.length - positives < 5) return null;
  const current = counts(examples, threshold);
  let best = {threshold, ...current};
  for (let percent = 1; percent <= 100; percent++) {
    const candidate = {threshold: percent / 100, ...counts(examples, percent / 100)};
    if (candidate.falseMatches > current.falseMatches) continue;
    const errors = candidate.falseMatches + candidate.misses, bestErrors = best.falseMatches + best.misses;
    if (errors < bestErrors || (errors === bestErrors && (candidate.falseMatches < best.falseMatches ||
        (candidate.falseMatches === best.falseMatches && Math.abs(candidate.threshold - threshold) < Math.abs(best.threshold - threshold))))) best = candidate;
  }
  return best.falseMatches + best.misses < current.falseMatches + current.misses ? best : null;
}

export function feedbackSummary(records, categories, {provider, configuration}) {
  const latest = new Map();
  let duplicates = 0;
  for (const record of normalizeCorrections(records)) {
    if (!record.text.trim() || record.categoryIds.some(id => typeof id !== "string")) continue;
    const identity=JSON.stringify([record.text.trim(),record.imageFingerprint||null]);
    const previous = latest.get(identity);
    if (previous) duplicates++;
    if (!previous || record.at >= previous.at) latest.set(identity, record);
  }
  const comparable = [...latest.values()].filter(r => r.provider === provider &&
    /^[a-f0-9]{64}$/.test(configuration) && r.configuration === configuration);
  const active = categories.filter(c => c.action !== "off");
  const rows = categories.map(category => {
    const examples = category.action === "off" ? [] : comparable.filter(r => validScore(r.scores?.[category.id]))
      .map(r => ({score:r.scores[category.id], chosen:r.categoryIds.includes(category.id)}));
    return {id:category.id, name:category.name, action:category.action, threshold:category.threshold,
      scored:examples.length, missing:category.action === "off" ? 0 : comparable.length - examples.length,
      positives:examples.filter(e => e.chosen).length, ...counts(examples, category.threshold),
      suggestion:suggestionFor(examples, category.threshold)};
  });
  // Partial classifications cannot establish how all Hide rules would have behaved.
  const hide = active.filter(c => c.action === "hide");
  const complete = hide.length ? comparable.filter(r => hide.every(c => validScore(r.scores?.[c.id]))) : [];
  let falseHides = 0, missedHides = 0;
  for (const r of complete) {
    const predicted = hide.some(c => r.scores[c.id] > c.threshold);
    const chosen = hide.some(c => r.categoryIds.includes(c.id));
    if (predicted && !chosen) falseHides++;
    if (!predicted && chosen) missedHides++;
  }
  return {unique:latest.size, comparable:comparable.length, excluded:latest.size - comparable.length,
    duplicates, rows,
    hiding:{active:hide.length > 0, complete:complete.length, missing:hide.length ? comparable.length - complete.length : 0, falseHides, missedHides}};
}
