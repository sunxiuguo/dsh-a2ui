import {realpathSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import React from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';
import {bootInjections} from '@deepseek-ai/dsh-client-modules';
import {loadProfileDirectory,readProfilePlugins,reconcileProfilePlugins,boot} from '@deepseek-ai/dsh-app-boot';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const profile=mkdtempSync(resolve(root,'.profile-'));

const pkg=resolve(process.argv[2]);
const anchor=resolve(root,'package.json');
let ctx;let dom;
try {
 writeFileSync(resolve(profile,'package.json'),JSON.stringify({name:'synthetic-profile',private:true,dependencies:{},dsh:{manifestVersion:1,profile:{bundles:[]}}}));
 const location={binName:'synthetic-a2ui',profileDir:profile,installAnchor:anchor};
 const before=readProfilePlugins(location);
 mkdirSync(resolve(profile,'node_modules'));symlinkSync(pkg,resolve(profile,'node_modules/dsh-a2ui'));
 writeFileSync(resolve(profile,'package.json'),JSON.stringify({name:'synthetic-profile',private:true,dependencies:{'dsh-a2ui':'file:'+pkg},dsh:{manifestVersion:1,profile:{bundles:[]}}}));
 const reconciliation=reconcileProfilePlugins({...location,before,preserveDisabled:true});
 assert.deepEqual(reconciliation.plugins.manifest.dsh.profile.bundles,['dsh-a2ui']);
 const loaded=loadProfileDirectory('synthetic-a2ui',profile,anchor);assert.deepEqual(loaded.skippedBundles,[]);assert.equal(loaded.layers.length,1);
 const config=resolve(profile,'cordis.yml');writeFileSync(config,JSON.stringify([{id:'system',name:'@deepseek-ai/dsh-system-prompt',config:{includeRuntimeContext:false}},{id:'tools',name:'@deepseek-ai/dsh-tools'},{id:'modules',name:'@deepseek-ai/dsh-client-modules'}]));
 ctx=await boot('synthetic-a2ui',config,loaded.layers.flatMap(x=>x.patches));
 await ctx.loader.await();
 const entry=[...ctx.loader.entries()].find(e=>e.options.name==='dsh-a2ui');assert.equal(entry.fiber.state,2);
 assert.ok(ctx.tools.get('render_a2ui'));
 assert.equal(realpathSync(loaded.layers[0].packageDir),realpathSync(pkg));
 // Loader settlement and client graph reconciliation are distinct lifecycles.
 await new Promise((resolve,reject)=>{
  let off=()=>{};let timer;
  const check=()=>{if(ctx.clientModules.graph().entries.some(x=>x.id==='dsh-a2ui')){clearTimeout(timer);off();resolve();}};
  off=ctx.clientModules.onGraphChanged(check);
  timer=setTimeout(()=>{off();reject(new Error('DSH client graph did not discover the active package'));},5000);
  check();
 });
 const graph=ctx.clientModules.graph();assert.ok(graph.entries.some(x=>x.id==='dsh-a2ui'));
 dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{runScripts:'outside-only'});
 dom.window.TextEncoder=TextEncoder;dom.window.TextDecoder=TextDecoder;
 const sandbox=dom.getInternalVMContext();const fetched=[];
 const loadBundle=async url=>{const response=await ctx.clientModules.fetchBundle(new Request(new URL(url,'https://synthetic.invalid/')));assert.equal(response.status,200);fetched.push(url);vm.runInContext(await response.text(),sandbox);};
 const injections=bootInjections(graph);for(const row of injections){if(row.kind==='script')vm.runInContext(row.text,sandbox);if(row.kind==='script-src')await loadBundle(row.src);}
 const system=dom.window.__ModuleLoader__.create({boot:graph,staticModules:{react:React,'react/jsx-runtime':jsx,'react-dom':ReactDOM},loadBundle});
 const globals=Object.getOwnPropertyNames(dom.window).sort();
 await system.prefetch('dsh-a2ui');assert.deepEqual(Object.getOwnPropertyNames(dom.window).sort(),globals);assert.equal(system.loadCache.has('dsh-a2ui'),false);
 const client=await system.import('dsh-a2ui','',{});assert.equal(typeof client.apply,'function');assert.deepEqual([...client.inject],['uiConversation','slots','sessions']);assert.equal(await system.import('dsh-a2ui/client','',{}),client);
 const edges=[...system.loadCache.get('dsh-a2ui').edges].sort();assert.deepEqual(edges,['react','react-dom','react/jsx-runtime']);
 console.log(JSON.stringify({observedAt:new Date().toISOString(),result:'PASS',profileBundle:'auto-activated and actual Loader ACTIVE',client:'actual host-discovered bytes registered lazily and materialized by official DSH module loader',edges,transportRequests:fetched.length,fullHostUI:false,model:false}));

} finally {if(dom)dom.window.close();if(ctx)await ctx.fiber.dispose();rmSync(profile,{recursive:true,force:true});}
