// Offline replay only. This command never calls a provider or reads personal feed data.
import fs from 'node:fs';
import {categorySummary, validateCategoryDataset} from './category-evaluation-core.mjs';
const read = file => JSON.parse(fs.readFileSync(new URL('../tests/fixtures/rubrics/' + file, import.meta.url), 'utf8'));
const previous = read('previous.json'), revised = read('revised.json'), initial = read('initial-draft.json');
const development = read('development.json'), validation = read('validation.json');
validateCategoryDataset(development, revised.categories);
validateCategoryDataset(validation, revised.categories);
const first = read('recorded-development-initial.json'), final = read('recorded-development-revised.json'), fresh = read('recorded-validation.json');
const groups = [
  ['development', previous.version, first.rows.filter(row => row.version === 'current'), previous.categories],
  ['development', initial.version, first.rows.filter(row => row.version === 'draft'), initial.categories],
  ['development', revised.version, final.rows, revised.categories],
  ['fresh validation', previous.version, fresh.rows.filter(row => row.version === 'current'), previous.categories],
  ['fresh validation', revised.version, fresh.rows.filter(row => row.version === 'draft'), revised.categories]
];
const comparisons = groups.map(([dataset, version, rows, categories]) => ({
  dataset, version,
  defaultActions: categorySummary(rows, categories),
  lessNoiseActions: categorySummary(rows, categories.map(c => ['slop', 'brainrot', 'advert'].includes(c.id) ? {...c, action: 'hide'} : c))
}));
console.log(JSON.stringify({
  mode: 'Offline recorded-score replay; no model calls.',
  evidence: {date: first.date, provider: first.provider, model: first.model, options: first.options,
    textLimit: first.textLimit, requests: first.rows.length + final.rows.length + fresh.rows.length},
  limitations: 'Development was tuned. Fresh validation was authored by the same person. Small synthetic samples are not representative accuracy; no independent useful annotations, cloud-provider or signed-in LinkedIn checks.',
  comparisons
}, null, 2));
