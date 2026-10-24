// Synthetic-only packed acceptance using the official JSONL persistence backend.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {mkdtemp, readFile, rm} from 'node:fs/promises';

const base = tmpdir();
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(source, 'package.json'));
const load = name => import(pathToFileURL(require.resolve(name)).href);
const packed = process.argv[2];
assert.ok(packed, 'Pass the extracted npm package directory');
const manifest = JSON.parse(await readFile(join(packed, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'dsh-a2ui');
assert.equal(manifest.version, JSON.parse(await readFile(join(source,'package.json'),'utf8')).version);
const {Context} = await load('@deepseek-ai/cordis');
const {SessionStore, Session} = await load('@deepseek-ai/dsh-session');
const {createToolResultMessage, createAssistantMessage} = await load('@deepseek-ai/dsh-llm');
const {default: SystemPrompt} = await load('@deepseek-ai/dsh-system-prompt');
const {default: ToolRuntime} = await load('@deepseek-ai/dsh-tools');
const {default: JsonlSessionPersistence} = await load('@deepseek-ai/dsh-session-persistence-jsonl');
const plugin = await import(pathToFileURL(resolve(packed, 'lib/index.js')).href);
const root = await mkdtemp(join(base, 'synthetic-session-logs-'));
const catalogId = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
const documentFor = label => [
  {version:'v0.9',createSurface:{surfaceId:`synthetic-${label}`,catalogId}},
  {version:'v0.9',updateComponents:{surfaceId:`synthetic-${label}`,components:[{id:'root',component:'Text',text:`Synthetic persistence ${label}`}]}}
];
const expected = new Map();
const contexts = [];
const handles = [];
const detaches = [];
const checks = [];
let cold;
try {
  const ctx = new Context(); contexts.push(ctx);
  new SessionStore(ctx);
  const backend = new JsonlSessionPersistence(ctx, {root, compression:'none'});
  await ctx.plugin(SystemPrompt, {includeRuntimeContext:false});
  await ctx.plugin(ToolRuntime);
  const mounted = ctx.plugin(plugin); await mounted;
  assert.equal(mounted.state, 2);
  assert.ok(ctx.tools.get('render_a2ui'));
  for (const label of ['A', 'B']) {
    const id = `synthetic-persistence-${label}`;
    const session = ctx.sessions.prepare(id);
    const writer = await backend.create(session.header); handles.push(writer);
    detaches.push(ctx.sessions.enter(session));
    ctx.sessions.announce(session);
    const events = [];
    const outcomes = [];
    events.push(session.append('turn/start', {turn:1}));
    let step = 0;
    for (const [kind, args] of [['valid', {messages:documentFor(label)}], ['invalid', {messages:[]}]]) {
      step += 1;
      const callId = `${id}-${kind}`;
      events.push(session.append('step/start', {turn:1,step}));
      // Explicit synthetic model advertisement, not a provider call. Released v4
      // requires every durable tool/call to match an earlier assistant tool-call.
      const assistant = createAssistantMessage({source:{provider:'synthetic',model:'persistence-fixture'},content:[{type:'tool-call',id:callId,name:'render_a2ui',arguments:JSON.stringify(args)}]});
      events.push(session.append('assistant/message', {turn:1,step,message:assistant,stream:[]}, {surfaceOp:'append'}));
      outcomes.push(assistant);
      events.push(session.append('tool/call', {turn:1,step,callId,name:'render_a2ui',arguments:JSON.stringify(args)}));
      const result = await ctx.tools.execute({callId,name:'render_a2ui',arguments:args,signal:new AbortController().signal});
      if (kind === 'valid') {
        assert.equal(result.isError, false, JSON.stringify(result));
        assert.deepEqual(result.meta.messages, documentFor(label));
        assert.equal(result.meta.kind, 'dsh-a2ui/1');
        assert.match(JSON.stringify(result.content), /does not confirm display/);
      } else {
        assert.equal(result.isError, true);
        assert.equal(result.meta, undefined);
      }
      const message = createToolResultMessage({callId, content:result.content, isError:result.isError});
      const data = {turn:1,step,message};
      if (result.meta !== undefined) data.meta = result.meta;
      // No fabricated metadata: content and presentation data come from ToolRuntime.
      events.push(session.append('tool/result', data, {surfaceOp:'append'}));
      outcomes.push(message);
      events.push(session.append('step/end', {turn:1,step}));
    }
    events.push(session.append('turn/end', {turn:1,reason:{kind:'completed'}}));
    assert.equal(await ctx.sessions.flush(session), true);
    assert.deepEqual((await writer.read()).events, events);
    expected.set(id, {events,outcomes,header:session.header});
  }
  checks.push('actual packed plugin ToolRuntime success and failure enter official Session live write routing');
  for (const handle of handles.splice(0)) await handle.close();
  for (const detach of detaches.splice(0)) detach();
  await ctx.fiber.dispose(); contexts.splice(contexts.indexOf(ctx), 1);

  // No backend/cache instance survives this boundary. The files are read again.
  const coldCtx = new Context(); contexts.push(coldCtx);
  cold = new JsonlSessionPersistence(coldCtx, {root,compression:'none'});
  const listed = await cold.list();
  assert.deepEqual(listed.map(row => row.header.id).sort(), [...expected.keys()].sort());
  const replayEvidence = [];
  for (const [id, saved] of expected) {
    const reader = await cold.open(id, 'read'); handles.push(reader);
    const read = await reader.read();
    // JSONL v4 serializes the optional delegation depth as its documented zero default.
    assert.deepEqual(reader.header, {...saved.header, delegationDepth:saved.header.delegationDepth ?? 0});
    assert.deepEqual(read.events, saved.events);
    const restored = Session.fromRestore(id, read.events, reader.header, reader.inheritedEventCount, read.eventState);
    // fromRestore appends the official session/end-seed lifecycle marker.
    assert.equal(restored.seq, saved.events.length + 1);
    assert.deepEqual(restored.deriveMessages(), saved.outcomes);
    const results = read.events.filter(event => event.type === 'tool/result');
    assert.equal(results.length, 2);
    assert.equal(results[0].data.meta.kind, 'dsh-a2ui/1');
    assert.equal(results[0].data.meta.messages[0].createSurface.surfaceId, `synthetic-${id.endsWith('A')?'A':'B'}`);
    assert.equal(results[1].data.message.isError, true);
    assert.equal(results[1].data.meta, undefined);
    const diskPath = await cold.resolveCurrentLog(id);
    assert.ok(diskPath?.endsWith('.jsonl'));
    const disk = await readFile(diskPath, 'utf8');
    assert.ok(disk.includes('dsh-a2ui/1'));
    replayEvidence.push({sessionId:id,eventCount:read.events.length,eventState:read.eventState,diskPath,bytes:Buffer.byteLength(disk)});
  }
  checks.push('two sessions remain isolated after all writers close and backend/context are recreated');
  checks.push('actual JSONL cold reads preserve canonical tool metadata and model-facing result messages');
  checks.push('official Session.fromRestore reproduces tool-result model history; failed results contain no success metadata');
  const receipt = {observedAt:new Date().toISOString(),packageVersion:manifest.version,packedPath:resolve(packed),root,checks,replayEvidence,scope:'Actual official JSONL plaintext backend, fresh Context/backend cold reload, official Session restoration, synthetic documents only. No model/provider call, full host boot, browser render, crash recovery, cross-process restart, or Zstd claim.'};
  console.log(JSON.stringify(receipt,null,2));
} finally {
  for (const handle of handles) await handle.close();
  for (const detach of detaches) detach();
  for (const ctx of contexts.reverse()) await ctx.fiber.dispose();
  await rm(root,{recursive:true,force:true});
}
