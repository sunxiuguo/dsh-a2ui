// Metadata-only preflight: no SDK/plugin code is imported or executed here.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const [consumer, source] = process.argv.slice(2);
const original = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(consumer, 'package.json')));
const fixture = createRequire(path.join(consumer, 'package.json'));
const pluginPath = fixture.resolve('dsh-a2ui/package.json');
const plugin = createRequire(pluginPath);
const versions = {fixtures:{}, pluginPeers:{}};
function check(resolver, name, expected, kind) {
  const filename = resolver.resolve(name + '/package.json');
  const actual = JSON.parse(fs.readFileSync(filename)).version;
  if (actual !== expected) throw Error(`${kind}_VERSION: ${name}: expected ${expected}; found ${actual}`);
  return actual;
}
const fixtureNames = new Set(Object.keys({...manifest.dependencies, ...manifest.devDependencies}).filter(n => n.startsWith('@deepseek-ai/')));
const required = Object.keys({...original.devDependencies, ...original.peerDependencies}).filter(n => n.startsWith('@deepseek-ai/'));
for (const name of ['dsh-agent','dsh-llm','dsh-session','dsh-session-projection','dsh-system-prompt','dsh-api-gateway','dsh-client-ui-primitives']) required.push('@deepseek-ai/' + name);
for (const name of required) {
  if (!fixtureNames.has(name)) throw Error('FIXTURE_INVENTORY: missing ' + name);
}
for (const name of fixtureNames) {
  if (name !== '@deepseek-ai/cordis' && !name.startsWith('@deepseek-ai/dsh-')) throw Error('FIXTURE_INVENTORY: unexpected ' + name);
  versions.fixtures[name] = check(fixture, name, name === '@deepseek-ai/cordis' ? '4.0.5' : '0.2.1-rc.3', 'FIXTURE');
}
for (const name of Object.keys(original.peerDependencies)) {
  versions.pluginPeers[name] = check(plugin, name, name === '@deepseek-ai/cordis' ? '4.0.5' : '0.2.1-rc.3', 'PLUGIN_PEER');
}
// This package declares zod 4.4.3; conversation's browser external is undeclared.
const sdk = createRequire(fixture.resolve('@deepseek-ai/dsh-api-session-controller/package.json'));
versions.sdkZod = check(sdk, 'zod', '4.4.3', 'SDK_ZOD');
versions.pluginDirectory = path.dirname(pluginPath);
console.log(JSON.stringify(versions, null, 2));
