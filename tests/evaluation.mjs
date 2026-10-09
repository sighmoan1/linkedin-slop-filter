import assert from 'node:assert/strict';
import {summary} from '../scripts/evaluation-core.mjs';
const result=summary([{label:'useful',hidden:true},{label:'useful',hidden:false},{label:'slop',hidden:true},{label:'slop',hidden:false,error:'offline'}]);
assert.equal(result.usefulWronglyHidden,1);assert.equal(result.usefulHiddenRate,.5);assert.equal(result.hiddenPrecision,.5);assert.equal(result.errors,1);assert.equal(result.valid,3);assert.equal(result.slopLeftVisible,1);
assert.equal(summary([]).usefulHiddenRate,null);assert.equal(summary([]).hiddenPrecision,null);
console.log('PASS: evaluation useful false-positive rate, hidden precision and explicit error coverage');
