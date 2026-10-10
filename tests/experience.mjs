import assert from "node:assert/strict";
import {normalizeAppearance, makeCorrection, normalizeCorrections, MAX_CORRECTIONS} from "../core/experience.mjs";

assert.deepEqual(normalizeAppearance({theme:"punchy",groupHidden:true,labels:"off",key:"secret"}),
  {theme:"native",showAuthor:false,groupHidden:true,labels:"off"});
assert.deepEqual(normalizeAppearance({theme:"remote",groupHidden:"true",labels:"everything"}),
  {theme:"native",showAuthor:false,groupHidden:false,labels:"matches"});
for (const theme of ["native", "punchy", "reader", undefined]) assert.deepEqual(normalizeAppearance({theme,groupHidden:true,labels:"off"}), {theme:"native",showAuthor:false,groupHidden:true,labels:"off"});
assert.equal(normalizeAppearance({showAuthor:true}).showAuthor,true);
assert.equal(normalizeAppearance({showAuthor:"true"}).showAuthor,false);
const context = {id:"one",at:42,provider:"jev",configuration:"a".repeat(64)};
const categories = [{id:"slop"},{id:"nourishment"}];
const correction = makeCorrection({text:"  A useful method.  ",categoryIds:["nourishment"],
  scores:{slop:.81,nourishment:1,extra:.9},author:"private profile",key:"secret"},categories,context);
assert.deepEqual(correction,{...context,text:"A useful method.",categoryIds:["nourishment"],scores:{slop:.81,nourishment:1}});
assert.deepEqual(makeCorrection({text:"No category",categoryIds:[]},categories,context).categoryIds,[]);
for (const input of [{text:"",categoryIds:[]},{text:"x".repeat(12001),categoryIds:[]},
  {text:"x",categoryIds:["unknown"]},{text:"x",categoryIds:"slop"}]) assert.throws(() => makeCorrection(input,categories,context));
assert.deepEqual(normalizeCorrections(null),[]);
assert.equal(normalizeCorrections(Array.from({length:205},(_,i)=>({...correction,id:String(i)}))).length,MAX_CORRECTIONS);
console.log("PASS: safe appearance defaults, explicit bounded corrections and allowed metadata");
