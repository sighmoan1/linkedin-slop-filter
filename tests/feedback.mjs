import assert from "node:assert/strict";
import {feedbackSummary} from "../core.mjs";

const configuration="a".repeat(64), context={provider:"jev",configuration};
const cats=[{id:"slop",name:"Slop",action:"hide",threshold:.8},
  {id:"advert",name:"Advert",action:"hide",threshold:.8},
  {id:"useful",name:"Useful",action:"highlight",threshold:.8},
  {id:"off",name:"Off",action:"off",threshold:.8}];
const record=(id,scores,categoryIds=[],extra={})=>({id,text:id,at:1,scores,categoryIds,...context,...extra});
const records=[
  record("boundary",{slop:.8,advert:0,useful:.8},["slop"]),
  record("false-hide",{slop:.81,advert:0,useful:.9},["useful"]),
  record("advert-wins",{slop:.9,advert:.95,useful:0},["advert"]),
  record("partial",{slop:.9},[]),
  record("stale",{slop:1},[],{configuration:"b".repeat(64)}),
  record("other-provider",{slop:1},[],{provider:"openai"}),
  record("duplicate",{slop:1,advert:0},[]),
  record("latest",{slop:0,advert:0},[],{text:"duplicate",at:2}),
  record("invalid",{slop:NaN,advert:"0.9",useful:2}),
];
const summary=feedbackSummary(records,cats,context);
assert.equal(summary.unique,8);assert.equal(summary.duplicates,1);
assert.equal(summary.comparable,6);assert.equal(summary.excluded,2);
assert.deepEqual(summary.hiding,{active:true,complete:4,missing:2,falseHides:1,missedHides:1});
assert.deepEqual(summary.rows[0],{...cats[0],scored:5,missing:1,positives:1,falseMatches:3,misses:1,suggestion:null});
assert.equal(summary.rows[2].falseMatches,0);assert.equal(summary.rows[2].missing,3);
assert.equal(summary.rows[3].scored,0);assert.equal(summary.rows[3].suggestion,null);
// The newest user label supersedes earlier copies even when it has new-model scores.
assert.equal(feedbackSummary([record("old",{slop:1}),record("new",{slop:1},[],{text:"old",at:2,configuration:"b".repeat(64)})],cats,context).comparable,0);
// Invalid/missing contexts and scores must not manufacture matches or suggestions.
assert.equal(feedbackSummary(records,cats,{...context,configuration:""}).comparable,0);
assert.deepEqual(feedbackSummary([],cats,context).hiding,{active:true,complete:0,missing:0,falseHides:0,missedHides:0});
assert.equal(feedbackSummary(records,cats.map(c=>({...c,action:"label"})),context).hiding.active,false);

const examples=Array.from({length:10},(_,i)=>record("example-"+i,{slop:i<5?.9:.97},i<5?[]:["slop"]));
const recommendation=feedbackSummary(examples,cats,context).rows[0];
assert.equal(recommendation.falseMatches,5);
assert.deepEqual(recommendation.suggestion,{threshold:.9,falseMatches:0,misses:0});
assert.equal(feedbackSummary(examples.slice(1),cats,context).rows[0].suggestion,null,"both labels need five scored examples");
assert.equal(feedbackSummary(examples,cats.map(c=>({...c,threshold:.9})),context).rows[0].suggestion,null,"already matching cutoffs need no recommendation");
const inseparable=examples.map(r=>({...r,scores:{slop:.9}}));
assert.equal(feedbackSummary(inseparable,cats,context).rows[0].suggestion,null,"moving all errors to misses is not improvement");
const lowScores=examples.map((r,i)=>({...r,scores:{slop:i<5?.1:.6}}));
assert.deepEqual(feedbackSummary(lowScores,cats,context).rows[0].suggestion,{threshold:.59,falseMatches:0,misses:0},"choose the nearest equally good cutoff and preserve strict boundary");
assert.equal(feedbackSummary([...examples,record("missing",{})],cats,context).rows[0].missing,1);
assert.equal(feedbackSummary(examples,cats,context).rows[0].suggestion.threshold,.9,"analysis does not mutate settings or records");
assert.equal(cats[0].threshold,.8);
console.log("PASS: correction comparability, latest labels, strict boundaries, partial Hide coverage, safe small-sample threshold suggestions");
