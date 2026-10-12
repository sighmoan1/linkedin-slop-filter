// Offline evaluation only: does not contact providers or change extension settings.
import fs from 'node:fs';
import {compareRubricRuns,parseCategoryRun} from './rubric-comparison-core.mjs';

const files=process.argv.slice(2);
if (files.length !== 4) {
  console.error('Usage: npm run compare:rubrics -- <baseline-run.ndjson> <candidate-run.ndjson> <baseline-rubric.json> <candidate-rubric.json>');
  process.exit(2);
}
try {
  const [oldRun,newRun,oldRubric,newRubric]=files.map((file,i) => {
    const source=fs.readFileSync(file,'utf8');
    return i<2 ? parseCategoryRun(source) : JSON.parse(source);
  });
  const comparison=compareRubricRuns(oldRun,newRun,oldRubric,newRubric);
  console.log(JSON.stringify(comparison,null,2));
  console.error(`Rubric comparison: ${comparison.verdict}. No saved settings changed.`);
  if (!comparison.eligibleForHumanReview) process.exitCode=1;
} catch (error) {
  console.error('Comparison refused: '+error.message);
  process.exitCode=2;
}
