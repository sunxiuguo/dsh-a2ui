// Actual official CLI package lifecycle only. Never boot a host or generate login credentials.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,lstat,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
const [currentArg,previousArg,outArg]=process.argv.slice(2);
assert.ok(currentArg&&previousArg&&outArg);
const current=resolve(currentArg),previous=resolve(previousArg),out=resolve(outArg);
const {runPrivate,stopPrivateCommands}=await import(pathToFileURL(join(current,'scripts/full-host/process.mjs')));
const runtime=join(current,'scripts/full-host/runtime');
const req=createRequire(join(runtime,'package.json'));
assert.equal(req('@deepseek-ai/dsh/package.json').version,'0.2.0-rc.2');
assert.equal(req('pnpm/package.json').version,'11.25.0');
const cli=req.resolve('@deepseek-ai/dsh/package.json').replace(/package\.json$/,'lib/bin.js');
const versions={current:'0.1.0-alpha.13',previous:'0.1.0-alpha.8'};
for(const [name,path]of[['current',current],['previous',previous]])assert.equal(JSON.parse(await readFile(join(path,'package.json'),'utf8')).version,versions[name]);
const world=await mkdtemp(join(tmpdir(),'a2ui-cli-lifecycle-'));
const home=join(world,'home'),cwd=join(world,'workspace');
for(const p of[home,cwd,join(world,'agents'),join(world,'skills')])await mkdir(p,{recursive:true});
for(const p of['npmrc','npm-globalrc'])await writeFile(join(world,p),'');
const env={PATH:join(runtime,'node_modules/.bin')+':'+process.env.PATH,HOME:home,DSH_HOME:home,DSH_AGENTS_HOME:join(world,'agents'),DSH_BUNDLED_SKILL_DIR:join(world,'skills'),DSH_TELEMETRY_DISABLED:'1',XDG_CONFIG_HOME:join(world,'xdg-config'),XDG_CACHE_HOME:join(world,'xdg-cache'),XDG_DATA_HOME:join(world,'xdg-data'),XDG_STATE_HOME:join(world,'xdg-state'),TMPDIR:world,CI:'1',LANG:'en_US.UTF-8',NPM_CONFIG_IGNORE_SCRIPTS:'true',npm_config_ignore_scripts:'true',NPM_CONFIG_USERCONFIG:join(world,'npmrc'),NPM_CONFIG_GLOBALCONFIG:join(world,'npm-globalrc'),NPM_CONFIG_REGISTRY:'https://registry.npmjs.org/',npm_config_registry:'https://registry.npmjs.org/',NPM_CONFIG_CACHE:join(world,'npm-cache'),npm_config_cache:join(world,'npm-cache'),PNPM_HOME:join(world,'pnpm-home')};
const profile=join(home,'profiles/native-lifecycle');
const manifestFile=join(profile,'package.json');
const installed=join(profile,'node_modules/dsh-a2ui');
const readManifest=async()=>JSON.parse(await readFile(manifestFile,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const receipt={scope:'Official DSH rc.2 CLI install, replace, rollback and remove on a stopped disposable profile. No host, browser, auth, model or history-restoration acceptance.',sourceCommit:'a8744445f4475c5a0fceb32a018a00617a954038',previousCommit:'a8bb06d8acdfdc9bcffb005fd34a378ec741c312',started:new Date().toISOString(),hostBooted:false,credentialsCreated:null,steps:[],packages:{},cleanup:false};
async function absent(path){await lstat(path).then(()=>{throw new Error('Unexpected path exists');},e=>{if(e.code!=='ENOENT')throw e;});}
async function noAuth(){
 try{await absent(join(home,'.credentials.yaml'));receipt.credentialsCreated=false;}catch(error){receipt.credentialsCreated=true;throw error;}
}
async function run(args){const result=await runPrivate(process.execPath,[cli,...args],{cwd,env,timeout:240000});await noAuth();return result;}
async function files(dir,prefix=''){const result={};for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name),key=prefix+e.name;assert.ok(!e.isSymbolicLink());if(e.isDirectory())Object.assign(result,await files(path,key+'/'));else{assert.ok(e.isFile());result[key]=hash(await readFile(path));}}return result;}
async function checkVersion(name,{enabled=true}={}){
 const source=name==='current'?current:previous;
 const pkg=JSON.parse(await readFile(join(installed,'package.json'),'utf8'));
 assert.equal(pkg.version,versions[name]);
 assert.deepEqual(await files(join(installed,'lib')),frozen[name].lib,'Actual installed server/client bytes must match the built exact source');
 assert.equal(hash(await readFile(join(installed,'cordis.patch.yml'))),frozen[name].patch);
 const manifest=await readManifest();
 assert.equal(manifest.description,'synthetic metadata to retain');
 assert.deepEqual(manifest.dsh.profile.bundles,enabled?[...baseBundles,'dsh-a2ui']:baseBundles);
 assert.ok(manifest.dependencies['dsh-a2ui']);
 await run(['plugin','--profile','native-lifecycle','list','dsh-a2ui']);
 receipt.steps.push({name,enabled,version:pkg.version,installedLibHashes:await files(join(installed,'lib')),profile:await profileEvidence(),at:new Date().toISOString()});
}
const frozen={};
for(const[name,source]of[['current',current],['previous',previous]])frozen[name]={lib:await files(join(source,'lib')),patch:hash(await readFile(join(source,'cordis.patch.yml')))};
const protectedFiles=[fileURLToPath(import.meta.url),join(current,'scripts/full-host/process.mjs'),join(current,'scripts/full-host/runtime/package-lock.json'),join(current,'package-lock.json'),join(previous,'package-lock.json')];
const protectedHashes=await Promise.all(protectedFiles.map(async p=>hash(await readFile(p))));
receipt.sourceBuilds=frozen;receipt.protectedFileHashes=protectedHashes;
async function profileEvidence(){
 const packages=new Set();
 async function scan(modules){
  let entries;try{entries=await readdir(modules,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const item of entries){if(item.name.startsWith('.'))continue;const path=join(modules,item.name);
   if(item.name.startsWith('@')){await scan(path);continue;}
   if(!item.isDirectory()&&!item.isSymbolicLink())continue;
   const pkg=JSON.parse(await readFile(join(path,'package.json'),'utf8'));packages.add(pkg.name+'@'+pkg.version);
   if(!item.isSymbolicLink())await scan(join(path,'node_modules'));
  }
 }
 await scan(join(profile,'node_modules'));assert.ok(packages.has('dsh-a2ui@'+JSON.parse(await readFile(join(installed,'package.json'),'utf8')).version));
 return {lockSha256:hash(await readFile(join(profile,'pnpm-lock.yaml'))),resolvedPackages:[...packages].sort(),resolutionScope:'Profile dependencies are independently resolved by pnpm; runtime npm lock does not pin these resolutions.'};
}
let baseBundles,failed=false;
try{
 await run(['--profile','native-lifecycle','--from-default-profile','web','--dump-config']);
 const initial=await readManifest();baseBundles=[...initial.dsh.profile.bundles];
 assert.deepEqual(baseBundles,['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']);
 initial.description='synthetic metadata to retain';await writeFile(manifestFile,JSON.stringify(initial,null,2)+'\n');
 const tarballs={};
 for(const[name,source]of[['previous',previous],['current',current]]){
  const pack=JSON.parse(await runPrivate('npm',['pack','--ignore-scripts','--json','--pack-destination',world],{cwd:source,env}));
  assert.equal(pack.length,1);assert.equal(pack[0].version,versions[name]);
  tarballs[name]=join(world,pack[0].filename);receipt.packages[name]={version:versions[name],sha256:hash(await readFile(tarballs[name]))};
 }
 await run(['plugin','--profile','native-lifecycle','add',tarballs.previous,'--ignore-scripts']);await checkVersion('previous');
 await run(['plugin','--profile','native-lifecycle','add',tarballs.current,'--ignore-scripts']);await checkVersion('current');
 await run(['plugin','--profile','native-lifecycle','add',tarballs.previous,'--ignore-scripts']);await checkVersion('previous');
 const disabled=await readManifest();disabled.dsh.profile.bundles=[...baseBundles];await writeFile(manifestFile,JSON.stringify(disabled,null,2)+'\n');
 await run(['plugin','--profile','native-lifecycle','add',tarballs.current,'--ignore-scripts']);await checkVersion('current',{enabled:false});
 const enabled=await readManifest();enabled.dsh.profile.bundles=[...baseBundles,'dsh-a2ui'];await writeFile(manifestFile,JSON.stringify(enabled,null,2)+'\n');
 await run(['plugin','--profile','native-lifecycle','remove','dsh-a2ui','--config.ignore-scripts=true']);
 const removed=await readManifest();assert.deepEqual(removed.dsh.profile.bundles,baseBundles);assert.equal(removed.description,'synthetic metadata to retain');assert.ok(!removed.dependencies?.['dsh-a2ui']);await absent(installed);
 await run(['plugin','--profile','native-lifecycle','list','dsh-a2ui']);receipt.steps.push({name:'removed',at:new Date().toISOString()});
 await run(['plugin','--profile','native-lifecycle','add',tarballs.previous,'--ignore-scripts']);await checkVersion('previous');
 await noAuth();receipt.result='PASS';
}catch(error){failed=true;receipt.result='FAIL';receipt.failureClass=error?.name??'Error';}
finally{
 try{
  await stopPrivateCommands();
 }catch(error){failed=true;receipt.result='FAIL';receipt.processCleanup=false;}
 try{
  await noAuth();
  assert.deepEqual(await Promise.all(protectedFiles.map(async p=>hash(await readFile(p)))),protectedHashes);
  for(const[name,source]of[['current',current],['previous',previous]])assert.deepEqual({lib:await files(join(source,'lib')),patch:hash(await readFile(join(source,'cordis.patch.yml')))},frozen[name]);
  receipt.sourceIntegrity=true;
 }catch(error){failed=true;receipt.result='FAIL';receipt.integrityOrAuthFailure=true;}
 finally{
  try{await rm(world,{recursive:true,force:true});await absent(world);receipt.cleanup=true;}catch(error){failed=true;receipt.result='FAIL';receipt.cleanup=false;}
  receipt.finished=new Date().toISOString();await mkdir(out,{recursive:true});await writeFile(join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 }
}
assert.equal(failed,false,'Official CLI lifecycle validation failed; see sanitized receipt.');
console.log('Actual official CLI install/update/rollback/remove passed; no host launched; disposable profile removed.');
