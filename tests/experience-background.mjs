import vm from "node:vm";
import fs from "node:fs";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import * as core from "../core.mjs";

const local = {...core.DEFAULTS,schema:2,enabled:true,jevKey:"PRIVATE-TEST-KEY",limit:3};
const session = {};
const storage = data => ({
  get: async query => typeof query === "string" ? {[query]:data[query]} : {...query,...data},
  set: async value => Object.assign(data,value),
  remove: async keys => {for (const k of [].concat(keys)) delete data[k];},
  setAccessLevel: async () => {}
});
let handler, opened = 0, calls = 0, active = 0, maxActive = 0, mode = "success", imageMode = "success", release, imageRelease;
const badges = [], titles = [], settingsTabs = [];
const ownId = "test-extension";
const feed = {id:ownId,url:"https://www.linkedin.com/feed/",tab:{id:7}};
const trusted = {id:ownId,url:"chrome-extension://test-extension/options.html"};
const popup = {...trusted,url:"chrome-extension://test-extension/popup.html"};
const imageUrl = "https://media.licdn.com/dms/image/v2/synthetic/feedshare-shrink_800/test";
const providerMode = visual => visual ? imageMode : mode;
const waitForRelease = (visual, resolve) => { if (visual) imageRelease = resolve; else release = resolve; };
const transport = async (url, req) => {
  if (url.startsWith("https://media.licdn.com/")) return new Response(new Uint8Array([1]),{headers:{"content-type":"image/png"}});
  calls++; active++; maxActive = Math.max(maxActive,active);
  try {
    assert.equal(req.headers.Authorization,"Bearer PRIVATE-TEST-KEY");
    assert.equal(req.credentials,"omit"); assert.equal(req.redirect,"error");
    const body = JSON.parse(req.body);
    const ids = Object.keys(body.questions);
    const visual = ids.includes(core.VISUAL_ID);
    const activeMode = providerMode(visual);
    if (activeMode === "hold" || activeMode === "holdFail") await new Promise(resolve => waitForRelease(visual,resolve));
    await new Promise(r=>setTimeout(r,5));
    if (activeMode === "network") throw new Error("PRIVATE-TEST-KEY raw network secret");
    return {ok:!["fail","holdFail"].includes(activeMode),status:["fail","holdFail"].includes(activeMode) ? 429 : 200,
      json:async()=>({answers:Object.fromEntries(ids.filter(id=>activeMode !== "partial" || id === "advert")
        .map(id=>[id,{type:"noul",noul:id === "slop" || id === core.VISUAL_ID ? .95 : .1}]))})};
  } finally {active--;}
};
globalThis.fetch = transport;
globalThis.createImageBitmap = async blob => ({width:900,height:700,bytes:new Uint8Array(await blob.arrayBuffer()),close(){}});
globalThis.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { return {fillRect(){},drawImage:bitmap=>{this.bitmap=bitmap;}}; }
  async convertToBlob() { return new Blob([this.bitmap.bytes],{type:"image/jpeg"}); }
};
const context = vm.createContext({...core,crypto:webcrypto,TextEncoder,AbortController,URL,setTimeout,clearTimeout,
  chrome:{permissions:{contains:async()=>true},storage:{local:storage(local),session:storage(session)},
    tabs:{create:async args=>settingsTabs.push(args.url)},
    action:{setBadgeText:async v=>badges.push(v.text),setBadgeBackgroundColor:async()=>{},setTitle:async v=>titles.push(v.title)},
    runtime:{id:ownId,getURL:path=>"chrome-extension://test-extension/"+path,
      openOptionsPage:async()=>{opened++;},onMessage:{addListener:h=>handler=h}}},
  fetch:transport,createImageBitmap:globalThis.createImageBitmap,OffscreenCanvas:globalThis.OffscreenCanvas
});
vm.runInContext(fs.readFileSync(new URL("../background.js",import.meta.url),"utf8").replace(/^import .*;\n/,""),context);
const send = (message, sender = feed) => new Promise(resolve => {
  const accepted = handler(message,sender,value => resolve(JSON.parse(JSON.stringify(value))));
  assert.equal(accepted,true,"message must be accepted: " + message.type);
});
const rejected = (message, sender = feed) => assert.equal(handler(message,sender,()=>assert.fail("rejected message responded")),false);

for (const sender of [
  {url:"https://www.linkedin.com/feed/update/urn:li:activity:123/"},{url:"https://www.linkedin.com/feed/foryou/detail/"},{url:"https://www.linkedin.com/messaging/"},{url:"https://www.linkedin.com/in/person/"},
  {url:"chrome-extension://other-extension/options.html"},{url:"chrome-extension://test-extension/untrusted.html"},
  {url:"https://test-extension/options.html"},{...trusted,id:"other"},{}, {url:"bad-url"}
]) rejected({type:"experience"},sender);
for (const type of ["usage","resetUsage","corrections","playground"]) rejected({type,text:"test",action:"list"});
rejected({type:"resetUsage"},{...feed,url:"https://www.linkedin.com/in/person/"});
rejected({type:"classify",text:"test"},trusted);
rejected({type:"playground",text:"x".repeat(12001)},trusted);
rejected(null);

for(const path of core.FEED_PATHS){const safe=await send({type:"settings"},{...feed,url:"https://www.linkedin.com"+path+"?trk=feed"});assert.deepEqual(Object.keys(safe).sort(),["categories","configuration","enabled","provider"]);assert.equal(JSON.stringify(safe).includes("PRIVATE-TEST-KEY"),false);}
const before = (await send({type:"settings"})).configuration;
assert.deepEqual(Object.keys(await send({type:"settings"})).sort(),["categories","configuration","enabled","provider"]);
const themed = await send({type:"appearance",appearance:{theme:"punchy",groupHidden:true,showAuthor:true,labels:"off",jevKey:"evil",categories:[]}});
assert.deepEqual(themed.appearance,{theme:"native",groupHidden:true,showAuthor:true,labels:"off"});
assert.equal(local.jevKey,"PRIVATE-TEST-KEY");
assert.equal((await send({type:"settings"})).configuration,before,"appearance cannot change the scoring key");
assert.equal(calls,0);
await send({type:"showEverything",value:true,tabId:99});
assert.equal((await send({type:"experience"})).showEverything,true);
assert.equal((await send({type:"experience"}, {...feed,tab:{id:99}})).showEverything,false,"a feed cannot choose another tab's override");
assert.equal(local.enabled,true,"temporary recovery does not disable scoring");
assert.equal(JSON.stringify(local).includes("showEverything"),false,"temporary state stays in session storage");
await send({type:"showEverything",value:false,tabId:7},popup);
assert.equal((await send({type:"experience"})).showEverything,false);
assert.match((await send({type:"showEverything",value:true},popup)).error,/feed tab/);
assert.deepEqual(await send({type:"openSettings",section:"categories"}),{ok:true});
assert.equal(opened,0);
assert.deepEqual(settingsTabs,["chrome-extension://test-extension/options.html#categories"]);
assert.deepEqual(await send({type:"openSettings",section:"feed"}),{ok:true});
assert.equal(settingsTabs.at(-1),"chrome-extension://test-extension/options.html#feed","feed settings selects its panel even when options previously showed categories");
await send({type:"openSettings",section:"https://attacker.example/"});
assert.equal(opened,1,"unknown sections only open this extension's default settings");
assert.equal(settingsTabs.length,2,"arbitrary settings URLs are never opened");
await send({type:"openSettings"},popup);
assert.equal(opened,2,"unspecified popup settings keep the standard options-page behavior");
rejected({type:"openSettings",section:"categories"},{url:"https://www.linkedin.com/messaging/"});
assert.equal((await send({type:"folded"})).ok,true);
assert.equal((await send({type:"usage"},trusted)).folded,1);
rejected({type:"folded"},trusted);

// Classification and reveal/display preferences never create text-bearing records.
await send({type:"classify",text:"Ordinary feed text never stored"});
assert.equal(JSON.stringify(local).includes("Ordinary feed text"),false);
assert.equal(local.corrections,undefined);
const correction = {type:"correction",text:"A saved\nsynthetic correction",categoryIds:["nourishment","advert"],
  scores:{slop:.95,advert:.9,nourishment:.9,secret:"PRIVATE-TEST-KEY"},configuration:before,
  provider:"jev",author:"Profile information must be ignored",key:"PRIVATE-TEST-KEY"};
const [savedA,savedB] = await Promise.all([send(correction),send({...correction,text:"Another explicit correction",categoryIds:[]})]);
assert.equal(savedA.ok,true); assert.equal(savedB.ok,true); assert.notEqual(savedA.id,savedB.id);
assert.equal(local.corrections.length,2,"concurrent saves are not lost");
assert.equal(local.corrections[0].text,"A saved\nsynthetic correction");
assert.deepEqual(local.corrections[0].categoryIds,["nourishment","advert"]);
assert.equal(JSON.stringify(local.corrections).includes("Profile information"),false);
assert.equal(JSON.stringify(local.corrections).includes("PRIVATE-TEST-KEY"),false);
assert.equal((await send({type:"correction",text:"x",categoryIds:["fake"]})).ok,undefined);
assert.equal((await send({type:"correction",text:"x".repeat(12001),categoryIds:[]})).ok,undefined);
assert.equal(local.corrections.length,2);
assert.equal((await send({type:"corrections",action:"list"},trusted)).corrections.length,2);
await send({type:"corrections",action:"remove",id:savedA.id},trusted);
assert.equal(local.corrections.length,1);
await send({type:"corrections",action:"clear"},trusted);
assert.equal(local.corrections.length,0);

// A deliberate playground request works while feed filtering is paused, stays serial,
// shares the request cap and never saves its input text.
local.enabled = false;
const [p1,p2] = await Promise.all([send({type:"playground",text:"Playground one"},trusted),send({type:"playground",text:"Playground two"},trusted)]);
assert.equal(p1.scores.slop,.95); assert.equal(p2.scores.slop,.95);
assert.equal(p1.enabled,false); assert.equal(maxActive,1); assert.equal(calls,3);
assert.equal(JSON.stringify(local).includes("Playground one"),false);
const capped = await send({type:"playground",text:"Over cap"},trusted);
assert.match(capped.error,/limit/); assert.equal(calls,3);
assert.equal(badges.at(-1),"!");
let usage = await send({type:"usage"},popup);
assert.equal(usage.requests,3); assert.equal(usage.limit,3); assert.equal(usage.scored,3); assert.equal(usage.errors,1);
assert.match(usage.lastError,/limit/);
await send({type:"playground",text:"Playground one"},trusted);
usage = await send({type:"usage"},trusted);
assert.equal(usage.requests,3); assert.equal(usage.cacheHits,1);
session.multiRefused = before; session["showEverything:7"] = true;
local.neverHidePeople = [{url:"https://www.linkedin.com/in/synthetic",name:"Synthetic"}];
local[core.CACHE_PREFIX+"local-preserve"] = {s:{slop:.2},t:Date.now()};
session[core.CACHE_PREFIX+"session-preserve"] = {s:{slop:.3},t:Date.now()};
const callsBeforeReset = calls;
const reset = await send({type:"resetUsage"},popup);
assert.deepEqual(reset,{requests:0,limit:3,scored:0,folded:0,cacheHits:0,errors:0,imageScored:0,imageErrors:0,lastError:""});
assert.equal(calls,callsBeforeReset,"reset does not call a provider");
assert.equal(local.lastError,undefined);
assert.equal(badges.at(-1),""); assert.equal(titles.at(-1),"LinkedIn Slop Filter");
assert.equal(local.jevKey,"PRIVATE-TEST-KEY"); assert.equal(local.limit,3); assert.equal(local.enabled,false);
assert.deepEqual(local.neverHidePeople,[{url:"https://www.linkedin.com/in/synthetic",name:"Synthetic"}]);
assert.equal(local[core.CACHE_PREFIX+"local-preserve"].s.slop,.2);
assert.equal(session[core.CACHE_PREFIX+"session-preserve"].s.slop,.3);
assert.equal(session.multiRefused,before); assert.equal(session["showEverything:7"],true);
delete session.multiRefused;
assert.equal((await send({type:"usage"},trusted)).requests,0);
local.limit = 5; mode = "hold"; release = null;
const heldBeforeReset = send({type:"playground",text:"Held before reset"},trusted);
while (!release) await new Promise(resolve=>setTimeout(resolve,1));
let resetDone = false;
const orderedReset = send({type:"resetUsage"},popup).then(value => {resetDone = true; return value;});
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(resetDone,false,"reset waits for pre-reset request accounting");
release();
assert.equal((await heldBeforeReset).scores.slop,.95);
assert.deepEqual(await orderedReset,{requests:0,limit:5,scored:0,folded:0,cacheHits:0,errors:0,imageScored:0,imageErrors:0,lastError:""});
assert.equal(session.requests,0);
mode = "holdFail"; release = null;
const heldFailureBeforeReset = send({type:"playground",text:"Held failure before reset"},trusted);
while (!release) await new Promise(resolve=>setTimeout(resolve,1));
let failureResetDone = false;
const failureReset = send({type:"resetUsage"},popup).then(value => {failureResetDone = true; return value;});
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(failureResetDone,false,"reset waits for pre-reset provider failures");
release();
const failedBeforeReset = await heldFailureBeforeReset;
assert.match(failedBeforeReset.error,/API request failed/);
assert.deepEqual(await failureReset,{requests:0,limit:5,scored:0,folded:0,cacheHits:0,errors:0,imageScored:0,imageErrors:0,lastError:""});
assert.equal(session.requests,0);
assert.equal(session.usage?.errors || 0,0);
assert.equal(local.lastError,undefined);
assert.equal(badges.at(-1),""); assert.equal(titles.at(-1),"LinkedIn Slop Filter");
assert.deepEqual(await send({type:"usage"},trusted),{requests:0,limit:5,scored:0,folded:0,cacheHits:0,errors:0,imageScored:0,imageErrors:0,lastError:""});
local.limit = 1; mode = "success";
assert.equal((await send({type:"playground",text:"After reset one"},trusted)).scores.slop,.95);
assert.equal(session.requests,1);
const postResetCap = await send({type:"playground",text:"After reset over cap"},trusted);
assert.match(postResetCap.error,/limit/);
usage = await send({type:"usage"},trusted);
assert.equal(usage.errors,1); assert.match(usage.lastError,/limit/); assert.equal(badges.at(-1),"!");
local.limit = 20; mode = "network";
const failed = await send({type:"playground",text:"Network failed"},trusted);
assert.match(failed.error,/unavailable/);
assert.equal(JSON.stringify({failed,lastError:local.lastError,titles}).includes("PRIVATE-TEST-KEY"),false,"raw fetch errors never reach UI or badges");
mode = "partial";
const partial = await send({type:"playground",text:"Partial"},trusted);
assert.deepEqual(partial.scores,{advert:.1}); assert.equal(partial.error,undefined);
assert.equal(local.lastError,undefined); assert.equal(badges.at(-1),"");
assert.equal(JSON.stringify(partial).includes("instructions"),false);
assert.equal(JSON.stringify(partial).includes("PRIVATE-TEST-KEY"),false);
// Same-text feed and playground work share the newly completed cache entry, even
// when no second API attempt is allowed. Pausing the feed does not cancel the explicit test.
session.requests = 0; local.limit = 1; local.enabled = true; mode = "hold";
const first = send({type:"classify",text:"Shared feed and playground text"});
while (!release) await new Promise(resolve=>setTimeout(resolve,1));
const second = send({type:"playground",text:"Shared feed and playground text"},trusted);
await new Promise(resolve=>setTimeout(resolve,10));
const priorCalls = calls; release();
const [feedResult,manualResult] = await Promise.all([first,second]);
assert.equal(feedResult.scores.slop,.95); assert.equal(manualResult.scores.slop,.95);
assert.equal(calls,priorCalls,"queued cross-context duplicate is cached without another API attempt");
assert.equal(session.requests,1);
session.requests = 0; mode = "hold"; release = null;
const pausedFeed = send({type:"classify",text:"Shared result while pausing the feed"});
while (!release) await new Promise(resolve=>setTimeout(resolve,1));
const explicitWhilePaused = send({type:"playground",text:"Shared result while pausing the feed"},trusted);
await new Promise(resolve=>setTimeout(resolve,10));
local.enabled = false; const callsBeforePause = calls; release();
assert.equal((await pausedFeed).disabled,true);
assert.equal((await explicitWhilePaused).scores.slop,.95);
assert.equal(calls,callsBeforePause); assert.equal(session.requests,1);
await send({type:"resetUsage"},popup);
local.enabled = true; local.limit = 5; mode = "success";
local.categories = core.DEFAULT_CATEGORIES.map(c => c.id === "slop" ? {...c, action:"label"} : c);
local.imageAnalysis = {...core.IMAGE_DEFAULTS, enabled:true};
session.requests = 0; session.usage = {}; delete local.lastError;
imageMode = "holdFail"; imageRelease = null;
const heldImageBeforeReset = send({type:"classify",text:"Held image failure before reset",imageUrls:[imageUrl]});
while (!imageRelease) await new Promise(resolve=>setTimeout(resolve,1));
let imageResetDone = false;
const imageReset = send({type:"resetUsage"},popup).then(value => {imageResetDone = true; return value;});
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(imageResetDone,false,"reset waits for pre-reset image failures");
imageRelease();
const unavailableBeforeReset = await heldImageBeforeReset;
assert.equal(unavailableBeforeReset.imageStatus,"unavailable");
assert.deepEqual(await imageReset,{requests:0,limit:5,scored:0,folded:0,cacheHits:0,errors:0,imageScored:0,imageErrors:0,lastError:""});
assert.equal(session.requests,0);
assert.equal(session.usage?.imageErrors || 0,0);
assert.equal(local.lastError,undefined);
assert.equal(badges.at(-1),""); assert.equal(titles.at(-1),"LinkedIn Slop Filter");
assert.deepEqual(await send({type:"usage"},trusted),{requests:0,limit:5,scored:0,folded:0,cacheHits:0,errors:0,imageScored:0,imageErrors:0,lastError:""});
imageMode = "fail";
const postResetImage = await send({type:"classify",text:"Image failure after reset",imageUrls:[imageUrl]});
assert.equal(postResetImage.imageStatus,"unavailable");
usage = await send({type:"usage"},trusted);
assert.equal(usage.imageErrors,1); assert.match(usage.lastError,/Image provider request failed/); assert.equal(badges.at(-1),"!");
console.log("PASS: experience bridge sender isolation, per-tab recovery, explicit correction privacy, serial capped playground, image and usage/badge recovery");
