// Display preferences and explicit local corrections are independent of model configuration.
export const APPEARANCE_DEFAULTS = {theme: "native", groupHidden: false, labels: "matches"};
export const CORRECTIONS_KEY = "corrections";
export const MAX_CORRECTIONS = 200;
export const CORRECTION_TEXT_MAX = 12000;

export function normalizeAppearance(value) {
  return {
    theme: ["native", "punchy", "reader"].includes(value?.theme) ? value.theme : "native",
    groupHidden: value?.groupHidden === true,
    labels: value?.labels === "off" ? "off" : "matches"
  };
}

// Feed pages can submit one explicit correction, but cannot read this corpus back.
// Copy only known scalar fields. Never keep profile metadata or arbitrary provider output.
export function makeCorrection(input, categories, context) {
  if (typeof input?.text !== "string" || !input.text.trim() || input.text.length > CORRECTION_TEXT_MAX) {
    throw new Error("A correction needs post text of at most 12,000 characters.");
  }
  const known = new Set(categories.map(c => c.id));
  if (!Array.isArray(input.categoryIds) || input.categoryIds.length > categories.length ||
      input.categoryIds.some(id => typeof id !== "string" || !known.has(id))) {
    throw new Error("Choose current categories, or choose none.");
  }
  const categoryIds = [...new Set(input.categoryIds)];
  const scores = {};
  for (const id of known) {
    const p = input.scores?.[id];
    if (typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1) scores[id] = p;
  }
  return {
    id: context.id, at: context.at, text: input.text.trim(), categoryIds, scores,
    configuration: /^[a-f0-9]{64}$/.test(input.configuration ?? "") ? input.configuration : context.configuration,
    provider: ["jev", "openai", "ollama"].includes(input.provider) ? input.provider : context.provider
  };
}

export function normalizeCorrections(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(c => c && typeof c.id === "string" && typeof c.text === "string" &&
    c.text.length <= CORRECTION_TEXT_MAX && Array.isArray(c.categoryIds) && Number.isFinite(c.at))
    .slice(-MAX_CORRECTIONS);
}
