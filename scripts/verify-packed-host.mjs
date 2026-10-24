import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {Context} from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
if(!process.argv[2]) throw new Error('Pass the extracted npm package directory; build:plugin and npm pack first.');
const plugin=await import(pathToFileURL(resolve(process.argv[2],'lib/index.js')).href);
const messages=[
 {version:'v0.9',createSurface:{surfaceId:'synthetic-host',catalogId:'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json'}},
 {version:'v0.9',updateComponents:{surfaceId:'synthetic-host',components:[{id:'root',component:'Text',text:'Synthetic host acceptance'}]}}
];
const require=createRequire(import.meta.url);
const versions={};
for(const [name,expected] of Object.entries({'@deepseek-ai/cordis':'4.0.5','@deepseek-ai/dsh-system-prompt':'0.2.0-rc.2','@deepseek-ai/dsh-tools':'0.2.0-rc.2'})){
 const version=JSON.parse(readFileSync(resolve(dirname(require.resolve(name)),'../package.json'),'utf8')).version;
 assert.equal(version,expected,`Uncertified host dependency: ${name}`);versions[name]=version;
}
const ctx=new Context();const checks=[];
try {
await ctx.plugin(SystemPrompt,{includeRuntimeContext:false});
await ctx.plugin(ToolRuntime);
const mounted=ctx.plugin(plugin);await mounted;
const run=(args,signal=new AbortController().signal)=>ctx.tools.execute({callId:'synthetic-host',name:'render_a2ui',arguments:args,signal});
 assert.equal(mounted.state,2);assert.ok(ctx.tools.get('render_a2ui'));checks.push('packed server plugin active in real Cordis and ToolRuntime');
 const result=await run({messages});assert.equal(result.isError,false,JSON.stringify(result));assert.deepEqual(result.meta.messages,messages);assert.equal(result.meta.kind,'dsh-a2ui/1');assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.meta));assert.ok(Object.isFrozen(result.meta.messages));assert.ok(Object.isFrozen(result.meta.messages[0].createSurface));checks.push('real pipeline validates output and materializes frozen presentation metadata');
 assert.match(JSON.stringify(result.content),/does not confirm display/);checks.push('text fallback does not claim browser display');
 const invalid=await run({messages:[]});assert.equal(invalid.isError,true);assert.equal(invalid.meta,undefined);checks.push('invalid document has no successful presentation metadata');
 for(const version of ['v0.9','v0.9.1']){
  for(const validationRegexp of ['', '^[A-Z]{2}[0-9]{2}$']){
   const incompatible=[{...messages[0],version},{version,updateComponents:{surfaceId:'synthetic-host',components:[{id:'root',component:'TextField',label:'Synthetic',value:'AB12',validationRegexp}]}}];
   const rejected=await run({messages:incompatible});assert.equal(rejected.isError,true);assert.equal(rejected.meta,undefined);assert.match(JSON.stringify(rejected),/COMPATIBILITY: TextField.validationRegexp/);
  }
  const fixture=JSON.parse(readFileSync(new URL('../demo/validation-fixture.json',import.meta.url),'utf8')).map(message=>({...message,version}));
  const checked=await run({messages:fixture});assert.equal(checked.isError,false,JSON.stringify(checked));assert.deepEqual(checked.meta.messages,fixture);
 }
 checks.push('both envelope versions reject ignored validationRegexp (including empty) without metadata and accept explicit checks unchanged');
 const abort=new AbortController();abort.abort();const cancelled=await run({messages},abort.signal);assert.equal(cancelled.isError,true);assert.equal(cancelled.meta,undefined);assert.equal(cancelled.error.info.code,'ABORTED_BEFORE_DISPATCH');checks.push('pre-dispatch cancellation has no successful presentation metadata');
 await mounted.dispose();assert.equal(ctx.tools.get('render_a2ui'),undefined);const removed=await run({messages});assert.equal(removed.isError,true);assert.equal(removed.error.info.code,'UNKNOWN_TOOL');checks.push('plugin unload removes registered tool and dispatch rejects');
 const remount=ctx.plugin(plugin);await remount;assert.equal((await run({messages})).isError,false);checks.push('remount restores real pipeline');
 const receipt={versions,observedAt:new Date().toISOString(),scope:'Packed plugin loaded by actual Cordis 4.0.5 and DSH ToolRuntime 0.2.0-rc.2; no full DSH process, browser client, model or credentials',checks};
 console.log(JSON.stringify(receipt,null,2));
} finally {await ctx.fiber.dispose();}
