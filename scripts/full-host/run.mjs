// One approved real-host acceptance only. Not a default build or user-profile command.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm,stat,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium,expect} from '@playwright/test';
import {runPrivate,startPrivateHost,stopPrivateCommands} from './process.mjs';
import {makeOverlay} from './make-overlay.mjs';
import {failureSite} from './diagnostics.mjs';
import {exerciseHost,checkRestoredHost} from './scenario.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=resolve(root,'scripts/full-host/runtime');
const out=resolve(root,'full-host-evidence');
assert.equal(process.env.DSH_A2UI_APPROVED_ATTEMPT,'20261024T110240Z');
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','This approval does not cover automatic reruns.');
assert.match(process.env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
const req=createRequire(join(runtime,'package.json'));
for(const p of ['dsh','dsh-web-app','dsh-web-frontend','dsh-llm','dsh-session-persistence-jsonl'])assert.equal(req('@deepseek-ai/'+p+'/package.json').version,'0.2.0-rc.2');
assert.equal(req('@deepseek-ai/cordis/package.json').version,'4.0.5');
const cli=req.resolve('@deepseek-ai/dsh/package.json').replace(/package\.json$/,'lib/bin.js');
const world=await mkdtemp(join(tmpdir(),'dsh-a2ui-one-shot-'));
const home=join(world,'home');const cwd=join(world,'workspace');const documents=join(world,'Documents');const persistence=join(world,'sessions');
for(const p of [home,cwd,documents,persistence,join(world,'agents'),join(world,'skills')])await mkdir(p,{recursive:true});
await writeFile(join(world,'npmrc'),'');await writeFile(join(world,'npm-globalrc'),'');
const env={NPM_CONFIG_IGNORE_SCRIPTS:'true',npm_config_ignore_scripts:'true',NPM_CONFIG_USERCONFIG:join(world,'npmrc'),NPM_CONFIG_GLOBALCONFIG:join(world,'npm-globalrc'),NPM_CONFIG_REGISTRY:'https://registry.npmjs.org/',npm_config_registry:'https://registry.npmjs.org/',PNPM_HOME:join(world,'pnpm-home'),PATH:join(runtime,'node_modules/.bin')+':'+process.env.PATH,HOME:home,DSH_HOME:home,DSH_AGENTS_HOME:join(world,'agents'),DSH_BUNDLED_SKILL_DIR:join(world,'skills'),DSH_TELEMETRY_DISABLED:'1',XDG_CONFIG_HOME:join(world,'xdg-config'),XDG_CACHE_HOME:join(world,'xdg-cache'),XDG_DATA_HOME:join(world,'xdg-data'),XDG_STATE_HOME:join(world,'xdg-state'),LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8',TMPDIR:world,NPM_CONFIG_CACHE:join(world,'npm-cache'),npm_config_cache:join(world,'npm-cache'),CI:'1'};
let host,browser,context;let stage='initialize';let failure;let beforeRestart;const steps=[];const network={rpc:0,mux:0,external:0,pageErrors:0};
const receipt={started:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA,syntheticProvider:true,liveModel:false,host:'official DSH 0.2.0-rc.2 CLI and Web shell',transport:'HTTP RPC + WebSocket',steps,network,cleanup:false};
const checkpoint=name=>{steps.push({name,observedAt:new Date().toISOString()});};
let cleanupPromise;let interrupted=false;
const assertActive=()=>{if(interrupted)throw new Error('One-shot acceptance interrupted');};
function cleanup(){return cleanupPromise??=(async()=>{
 let clean=true;
 try{await stopPrivateCommands();}catch{clean=false;}
 try{if(context)await context.close();}catch{clean=false;}
 try{if(browser)await browser.close();}catch{clean=false;}
 try{if(host)await host.stop();}catch{clean=false;}
 try{assert.ok(world.startsWith(join(tmpdir(),'dsh-a2ui-one-shot-')));await rm(world,{recursive:true,force:true});await stat(world).then(()=>{throw new Error('Test world remained');},e=>{if(e.code!=='ENOENT')throw e;});}catch{clean=false;}
 return clean;
})();}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]])process.once(signal,()=>{interrupted=true;process.exitCode=code;void cleanup();});

async function openBrowser(login){
 assertActive();
 context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',serviceWorkers:'block'});if(interrupted){await context.close();context=undefined;assertActive();}context.setDefaultTimeout(15000);
 const origin=login.origin;
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();network.external++;return route.abort();});
 await context.routeWebSocket('**/*',socket=>{const u=new URL(socket.url());if(u.origin===origin.replace('http:','ws:')&&u.pathname==='/api/remote.mux'){network.mux++;socket.connectToServer();return;}network.external++;socket.close();});
 const page=await context.newPage();page.on('pageerror',()=>network.pageErrors++);
 page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/api/'))network.rpc++;});
 // Do not allow navigation errors to print the token-bearing URL.
 try{await page.goto(login.href);}catch{throw new Error('Native local login navigation failed; URL withheld');}
 await page.waitForURL(url=>url.origin===origin&&!url.searchParams.has('token'));
 assert.equal(new URL(page.url()).search,'');
 const credentialStat=await stat(join(home,'.credentials.yaml'));assert.equal(credentialStat.mode & 0o777,0o600);
 assert.ok((await context.cookies()).some(c=>c.httpOnly),'Native signed browser session must exist without exporting it');
 return page;
}
async function boot(){
 assertActive();
 const args=['--import',resolve(root,'scripts/full-host/network-guard.mjs'),cli,'--profile','a2ui-e2e','--patch',join(world,'synthetic-overlay.yml'),'--host','127.0.0.1','--port','0','--no-open'];
 host=startPrivateHost(process.execPath,args,{cwd,env});const login=await host.loginUrl();return openBrowser(login);
}
try{
 await runPrivate(process.execPath,[cli,'--profile','a2ui-e2e','--from-default-profile','web','--dump-config'],{cwd,env});checkpoint('Official CLI initializes empty Web profile without boot');
 assertActive();stage='pack-install';
 const packed=JSON.parse(await runPrivate('npm',['pack','--ignore-scripts','--json','--pack-destination',world],{cwd:root,env}));
 const tarball=join(world,packed[0].filename);receipt.packageSha256=createHash('sha256').update(await readFile(tarball)).digest('hex');
 assertActive();await runPrivate(process.execPath,[cli,'plugin','--profile','a2ui-e2e','add',tarball,'--ignore-scripts'],{cwd,env,timeout:180000});
 const profile=JSON.parse(await readFile(join(home,'profiles/a2ui-e2e/package.json'),'utf8'));
 assert.deepEqual(profile.dsh.profile.bundles,['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-a2ui']);checkpoint('Packed plugin installed through native CLI and discovered in profile');
 const provider=join(runtime,'provider.mjs');await copyFile(resolve(root,'scripts/full-host/provider.mjs'),provider);
 await writeFile(join(world,'synthetic-overlay.yml'),makeOverlay({providerPath:provider,documentsDirectory:documents,persistenceRoot:persistence}));
 assertActive();browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,env});
 if(interrupted){await browser.close();browser=undefined;assertActive();}
 stage='first-host';const page=await boot();checkpoint('Actual native shell through real local auth, HTTP and WebSocket');
 beforeRestart=await exerciseHost({page,expect,host,checkpoint});
 await mkdir(out,{recursive:true});await page.screenshot({path:join(out,'session-a.png'),fullPage:true});receipt.visualReview='pending';
 assert.equal(host.egressRejected(),false);assert.equal(network.external,0);assert.equal(network.pageErrors,0);assert.ok(network.rpc>0&&network.mux>0);
 stage='restart';await context.close();context=undefined;await host.stop();host=undefined;
 async function countStored(dir){let count=0;for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())count+=await countStored(p);else if(e.isFile()&&(await stat(p)).size>0)count++;}return count;}
 receipt.nonemptyPersistenceFiles=await countStored(persistence);assert.ok(receipt.nonemptyPersistenceFiles>=2,'Both synthetic sessions must have durable backend files before restart');
 const reopened=await boot();await checkRestoredHost({page:reopened,expect,host,beforeRestart,checkpoint});
 await reopened.screenshot({path:join(out,'session-b-restored.png'),fullPage:true});
 assert.equal(host.egressRejected(),false);assert.equal(network.external,0);assert.equal(network.pageErrors,0);
 receipt.result='PASS';
}catch(error){failure=error;receipt.result='FAIL';receipt.failedStage=stage;receipt.failureClass=error?.name??'Error';receipt.failureSite=failureSite(error);receipt.providerEvents=Object.fromEntries(['request','finished','awaiting-cancel','cancelled'].map(event=>[event,host?.observations().filter(item=>item.event===event).length??0]));}
finally{
 if(cleanupPromise){await cleanupPromise;cleanupPromise=undefined;}
 const clean=await cleanup();
 if(interrupted){receipt.result='FAIL';receipt.failedStage='interrupted';}
 if(!clean){receipt.result='FAIL';receipt.failedStage='cleanup';}
 receipt.cleanup=clean;receipt.finished=new Date().toISOString();await mkdir(out,{recursive:true});await writeFile(join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 if(!clean)throw new Error('Test-world cleanup did not verify; no raw paths or credentials are exported');
}
if(failure||receipt.result!=='PASS')throw new Error(`Full host acceptance failed in ${stage}; raw exception intentionally withheld`);
console.log('Full host synthetic acceptance passed; test credentials and browser context removed.');
