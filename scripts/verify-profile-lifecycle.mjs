// Synthetic package placement; not a pnpm, running-host or browser acceptance test.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,unlinkSync,rmSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readProfilePlugins,reconcileProfilePlugins} from '@deepseek-ai/dsh-app-boot';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pkg=resolve(process.argv[2]);
const installed=JSON.parse(readFileSync(join(pkg,'package.json'),'utf8'));
assert.equal(installed.name,'dsh-a2ui');
const profile=mkdtempSync(join(root,'.profile-lifecycle-'));
const location={binName:'synthetic-a2ui',profileDir:profile,installAnchor:join(root,'package.json')};
const file=join(profile,'package.json');
const read=()=>JSON.parse(readFileSync(file,'utf8'));
const write=value=>writeFileSync(file,JSON.stringify(value));
const reconcile=before=>reconcileProfilePlugins({...location,before,preserveDisabled:true}).plugins;
try {
 mkdirSync(join(profile,'node_modules'));
 write({name:'synthetic-lifecycle',private:true,description:'retain unrelated metadata',dependencies:{},dsh:{manifestVersion:1,profile:{bundles:['synthetic-template']}}});
 const before=readProfilePlugins(location);
 symlinkSync(pkg,join(profile,'node_modules/dsh-a2ui'));
 write({...read(),dependencies:{'dsh-a2ui':'file:'+pkg}});
 let result=reconcile(before);
 assert.deepEqual(result.manifest.dsh.profile.bundles,['synthetic-template','dsh-a2ui']);
 assert.equal(result.dependencies[0].version,installed.version);
 // Change only the dependency spec; the installed symlink/version remains unchanged.
 // This tests reconciliation, not package replacement or module-cache refresh.
 const beforeReplacement=readProfilePlugins(location);
 write({...read(),dependencies:{'dsh-a2ui':'file:./replacement.tgz'}});
 result=reconcile(beforeReplacement);
 assert.deepEqual(result.manifest.dsh.profile.bundles,['synthetic-template','dsh-a2ui']);
 // A deliberately disabled bundle remains disabled on replacement.
 let manifest=read(); manifest.dsh.profile.bundles=['synthetic-template'];write(manifest);
 const beforeDisabledReplacement=readProfilePlugins(location);
 write({...read(),dependencies:{'dsh-a2ui':'file:./another-replacement.tgz'}});
 result=reconcile(beforeDisabledReplacement);
 assert.deepEqual(result.manifest.dsh.profile.bundles,['synthetic-template']);
 // Removal prunes a selected dependency-managed bundle, not unrelated entries.
 manifest=read();manifest.dsh.profile.bundles.push('dsh-a2ui');write(manifest);
 const beforeRemoval=readProfilePlugins(location);
 unlinkSync(join(profile,'node_modules/dsh-a2ui'));
 write({...read(),dependencies:{}});
 result=reconcile(beforeRemoval);
 assert.deepEqual(result.manifest.dsh.profile.bundles,['synthetic-template']);
 assert.deepEqual(result.dependencies,[]);
 assert.equal(result.manifest.description,'retain unrelated metadata');
 console.log(JSON.stringify({result:'PASS',packageVersion:installed.version,checks:['new bundle selected','dependency-spec change not duplicated','disabled dependency-spec change stays disabled','removed bundle pruned','unrelated metadata retained'],scope:'official rc.2 dependency-spec reconciliation after synthetic package placement; same installed symlink/version; no CLI installation, package-version swap, running-host replacement, restart, browser or history restoration'}));
} finally {rmSync(profile,{recursive:true,force:true});}
