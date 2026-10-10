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
let handler, opened = 0, calls = 0, active = 0, maxActive = 0, mode = "success", release;
const badges = [], titles = [], settingsTabs = [];
const ownId = "test-extension";
const feed = {id:ownId,url:"https://www.linkedin.com/feed/",tab:{id:7}};
const trusted = {id:ownId,url:"chrome-extension://test-extension/options.html"};
const popup = {...trusted,url:"chrome-extension://test-extension/popup.html"};
const context = vm.createContext({...core,crypto:webcrypto,TextEncoder,AbortController,URL,setTimeout,clearTimeout,
  chrome:{storage:{local:storage(local),session:storage(session)},
    tabs:{create:async args=>settingsTabs.push(args.url)},
    action:{setBadgeText:async v=>badges.push(v.text),setBadgeBackgroundColor:async()=>{},setTitle:async v=>titles.push(v.title)},
    runtime:{id:ownId,getURL:path=>"chrome-extension://test-extension/"+path,
      openOptionsPage:async()=>{opened++;},onMessage:{addListener:h=>handler=h}}},
  fetch:async (_url, req) => {
    calls++; active++; maxActive = Math.max(maxActive,active);
    try {
      assert.equal(req.headers.Authorization,"Bearer PRIVATE-TEST-KEY");
      assert.equal(req.credentials,"omit"); assert.equal(req.redirect,"error");
      if (mode === "hold") await new Promise(resolve => {release = resolve;});
      await new Promise(r=>setTimeout(r,5));
      if (mode === "network") throw new Error("PRIVATE-TEST-KEY raw network secret");
      const ids = Object.keys(JSON.parse(req.body).questions);
      return {ok:mode !== "fail",status:mode === "fail" ? 429 : 200,
        json:async()=>({answers:Object.fromEntries(ids.filter(id=>mode !== "partial" || id === "advert")
          .map(id=>[id,{type:"noul",noul:id === "slop" ? .95 : .1}]))})};
    } finally {active--;}
  }
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
for (const type of ["usage","corrections","playground"]) rejected({type,text:"test",action:"list"});
rejected({type:"classify",text:"test"},trusted);
rejected({type:"playground",text:"x".repeat(12001)},trusted);
rejected(null);

for(const path of core.FEED_PATHS){const safe=await send({type:"settings"},{...feed,url:"https://www.linkedin.com"+path+"?trk=feed"});assert.deepEqual(Object.keys(safe).sort(),["categories","configuration","enabled","provider"]);assert.equal(JSON.stringify(safe).includes("PRIVATE-TEST-KEY"),false);}
const before = (await send({type:"settings"})).configuration;
assert.deepEqual(Object.keys(await send({type:"settings"})).sort(),["categories","configuration","enabled","provider"]);
const themed = await send({type:"appearance",appearance:{theme:"punchy",groupHidden:true,labels:"off",jevKey:"evil",categories:[]}});
assert.deepEqual(themed.appearance,{theme:"native",groupHidden:true,labels:"off"});
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
await send({type:"openSettings",section:"https://attacker.example/"});
assert.equal(opened,1,"unknown sections only open this extension's default settings");
assert.equal(settingsTabs.length,1,"arbitrary settings URLs are never opened");
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
console.log("PASS: experience bridge sender isolation, per-tab recovery, explicit correction privacy, serial capped playground and usage/badge recovery");
