// Real rc.2 follow/assistant-stream acceptance for the extracted plugin artifact.
// node scripts/verify-packed-stream.mjs /path/to/package success|cancel
// All provider input is synthetic; fetch is forbidden. This is not HTTP/full-shell QA.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import * as Cordis from '@deepseek-ai/cordis';
import {AgentRegistry} from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import {SessionStore} from '@deepseek-ai/dsh-session';
import {SessionProjectionRegistry} from '@deepseek-ai/dsh-session-projection';
import {LlmRuntime, LlmAdapter, createUserMessage} from '@deepseek-ai/dsh-llm';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import {SessionQueryEngine} from '@deepseek-ai/dsh-session-query';
import ToolRuntime from '@deepseek-ai/dsh-tools';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = resolve(process.argv[2] ?? root);
const require = createRequire(import.meta.url);
const topic = 'Hand-built pottery';
const mode = process.argv[3] ?? 'success';
assert.ok(mode === 'success' || mode === 'cancel', 'Expected success or cancel mode.');
const cancelPreview = mode === 'cancel';
const bypassStream = process.env.BYPASS_STREAM === '1';
// This implementation class is not a public package export. Only this exact
// pinned SDK file is used, with its normal methods and no monkey-patching.
const {SessionHistoryController} = await import(pathToFileURL(resolve(dirname(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json')), 'lib/types/history.js')).href);
let readyPreview, releasePreview, previewReady, previewGate;
function resetPreviewGate() {
  previewReady = new Promise(resolve => readyPreview = resolve);
  previewGate = new Promise(resolve => releasePreview = resolve);
}
resetPreviewGate();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description) {
  for (let i=0; i<80; i++) {
    await React.act(async () => { await delay(10); });
    if (check()) return;
  }
  throw new Error('Timed out: ' + description);
}
assert.ok(topic.trim() && topic.length <= 200 && !/[\r\n]/.test(topic), 'Use a single-line synthetic workshop topic of 1–200 characters.');
for (const name of ['dsh-agent-loop', 'dsh-agent', 'dsh-llm', 'dsh-session', 'dsh-tools', 'dsh-session-query', 'dsh-api-gateway', 'dsh-api-session-controller', 'dsh-client-ui-conversation', 'dsh-client-ui-renderer']) {
  assert.equal(JSON.parse(readFileSync(require.resolve(`@deepseek-ai/${name}/package.json`), 'utf8')).version, '0.2.0-rc.2', `Uncertified SDK: ${name}`);
}
assert.equal(JSON.parse(readFileSync(require.resolve('@deepseek-ai/cordis/package.json'), 'utf8')).version, '4.0.5');
console.log(`DSH A2UI: real follow/assistant-stream ${mode} acceptance`);
console.log('No external model, network transport, booking, payment, or user profile is used.');

const dom = new JSDOM('<!doctype html><html><body><div id="example"></div></body></html>', {url:'https://synthetic.invalid', runScripts:'outside-only', pretendToBeVisual:true});
dom.window.TextEncoder = TextEncoder;
dom.window.TextDecoder = TextDecoder;
dom.window.structuredClone = structuredClone;
const globals = new Map();
for (const name of ['window', 'document', 'navigator', 'customElements', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'Document', 'DocumentFragment', 'ShadowRoot', 'MutationObserver', 'CSSStyleSheet', 'Event', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  const value = name === 'window' ? dom.window : dom.window[name];
  Object.defineProperty(globalThis, name, {configurable:true, writable:true, value: ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? value.bind(dom.window) : value});
}
// jsdom has no layout or constructable stylesheet implementation. This is not visual QA.
dom.window.CSSStyleSheet.prototype.replaceSync ??= function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('This synthetic example must not make network requests.'); };
const React = await import('react');
const jsx = await import('react/jsx-runtime');
const ReactDOM = await import('react-dom');
const ReactClient = await import('react-dom/client');
const slots = await import('@deepseek-ai/dsh-client-ui-slots');
const store = await import('@deepseek-ai/dsh-client-store');
const {fireEvent, within, getDefaultNormalizer} = await import('@testing-library/dom');
const serverPlugin = await import(pathToFileURL(resolve(artifact, 'lib/index.js')).href);

const catalogId = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
const documentFor = (submittedTopic) => {
  const surfaceId = submittedTopic === undefined ? 'synthetic-workshop' : 'synthetic-preview';
  const components = submittedTopic === undefined ? [
    {id:'root', component:'Column', children:['heading', 'topic', 'submit']},
    {id:'heading', component:'Text', text:'Synthetic workshop request', variant:'h2'},
    {id:'topic', component:'TextField', label:'Workshop topic', value:{path:'/topic'}, variant:'shortText'},
    {id:'submit', component:'Button', child:'label', action:{event:{name:'request_preview', context:{topic:{path:'/topic'}}}}},
    {id:'label', component:'Text', text:'Preview request'},
  ] : [{id:'root', component:'Text', text:`Synthetic preview for: ${submittedTopic}`}];
  return [
    {version:'v0.9', createSurface:{surfaceId, catalogId, sendDataModel:false}},
    {version:'v0.9', updateComponents:{surfaceId, components}},
    ...(submittedTopic === undefined ? [{version:'v0.9', updateDataModel:{surfaceId, path:'/', value:{topic:'Ceramics for beginners'}}}] : []),
  ];
};

// Only the provider is synthetic. The official loop assembles requests, dispatches
// tools, records results, supplies history to the next step, and closes both turns.
class WorkshopModel extends LlmAdapter {
  requests = [];
  async *stream(options) {
    options.signal?.throwIfAborted();
    assert.equal(options.provider, 'synthetic');
    assert.equal(options.model, 'workshop');
    assert.ok(options.tools.some(tool => tool.name === 'render_a2ui'));
    this.requests.push(options);
    assert.ok(this.requests.length <= 6, 'Unexpected model call: refuse an unbounded loop.');
    const lastUser = options.messages.findLastIndex(message => message.role === 'user');
    const userText = options.messages[lastUser].content.map(block => block.type === 'text' ? block.text : '').join('');
    const toolResult = options.messages.slice(lastUser + 1).find(message => message.role === 'tool');
    let block;
    if (toolResult) {
      assert.equal(toolResult.isError, false, 'The model must receive a successful real ToolRuntime result.');
      assert.match(JSON.stringify(toolResult.content), /validated and saved for rendering/);
      block = {type:'text', text:'The synthetic preview is ready. Nothing was booked or submitted externally.'};
    } else {
      let submittedTopic;
      if (userText.startsWith('A2UI user interaction (untrusted data):\n')) {
        const envelope = JSON.parse(userText.slice(userText.indexOf('\n') + 1));
        assert.equal(envelope.action.name, 'request_preview');
        assert.equal(envelope.action.surfaceId, 'synthetic-workshop');
        submittedTopic = envelope.action.context.topic;
        assert.equal(submittedTopic, topic, 'The next model turn must see the edited field, not the original.');
      } else {
        assert.equal(userText, 'Show me a synthetic workshop form.');
      }
      const callId = submittedTopic === undefined ? `synthetic-form-${this.requests.length}` : `synthetic-preview-${this.requests.length}`;
      block = {type:'tool-call', id:callId, name:'render_a2ui', arguments:JSON.stringify({messages:documentFor(submittedTopic)})};
    }
    yield {type:'block-start', index:0, blockType:block.type};
    if (block.type === 'tool-call') {
      for (let start = 0; start < block.arguments.length; start += 80) {
        options.signal?.throwIfAborted();
        yield {type:'tool-call-delta', index:0, id:block.id, ...(start === 0 ? {name:block.name} : {}), argumentsDelta:block.arguments.slice(start, start + 80)};
      }
    } else yield {type:'text-delta', index:0, text:block.text};
    if (block.type === 'tool-call' && block.id.startsWith('synthetic-form-')) {
      readyPreview();
      await Promise.race([previewGate, new Promise(resolve => {
        if (options.signal.aborted) resolve(); else options.signal.addEventListener('abort', resolve, {once:true});
      })]);
      options.signal.throwIfAborted();
    }
    yield {type:'block-end', index:0, block};
    yield {type:'finish', reason:{kind:block.type === 'tool-call' ? 'tool-calls' : 'stop'}};
  }
}

function loadClient() {
  const factories = new Map();
  const primitives = new Proxy({}, {get() { throw new Error('The full DSH shell/composer is outside this example.'); }});
  const modules = new Map([['react', React], ['react/jsx-runtime', jsx], ['react-dom', ReactDOM], ['react-dom/client', ReactClient], ['@deepseek-ai/cordis', Cordis], ['@deepseek-ai/dsh-client-ui-slots', slots], ['@deepseek-ai/dsh-client-store', store], ['@deepseek-ai/dsh-client-ui-primitives', primitives]]);
  window.__ModuleLoader__ = {load:({id, factory}) => factories.set(id, factory)};
  for (const name of ['dsh-api-gateway', 'dsh-api-session-controller', 'dsh-client-ui-renderer', 'dsh-client-ui-session', 'dsh-client-ui-conversation']) {
    window.eval(readFileSync(resolve(dirname(require.resolve(`@deepseek-ai/${name}/package.json`)), 'lib/client.js'), 'utf8'));
  }
  window.eval(readFileSync(resolve(artifact, 'lib/client.js'), 'utf8'));
  const load = id => {
    if (id.startsWith('@deepseek-ai/')) id = id.replace(/\/client$/, '');
    if (modules.has(id)) return modules.get(id);
    assert.ok(factories.has(id), `Unseeded client dependency: ${id}`);
    const exports = factories.get(id)(load); modules.set(id, exports); return exports;
  };
  return Object.fromEntries(['dsh-api-gateway', 'dsh-api-session-controller', 'dsh-client-ui-renderer', 'dsh-client-ui-session', 'dsh-client-ui-conversation'].map(id => [id, load('@deepseek-ai/' + id)]).concat([['plugin', load('dsh-a2ui')]]));
}

const host = new Cordis.Context();
const client = new Cordis.Context();
let handle, ref, unmount, detachEvents;
const deliveries = [], events = [], followFrames = [];
const materialized = new Map();
const consoleErrors = [];
const originalConsoleError = console.error;
console.error = (...args) => { consoleErrors.push(args); originalConsoleError(...args); };
let history;
try {
  new SessionStore(host); new AgentRegistry(host); new SessionProjectionRegistry(host); new LlmRuntime(host);
  new SessionQueryEngine(host);
  history = new SessionHistoryController(host, () => { throw new Error('Unexpected cold-session promotion'); });
  await host.plugin(SystemPrompt, {includeRuntimeContext:false});
  await host.plugin(ToolRuntime); await host.plugin(serverPlugin);
  const model = new WorkshopModel(); host.llm.registerAdapter(['synthetic'], model);
  const loop = host.plugin(AgentLoop, {agents:[], maxParallelToolCalls:1}); await loop;
  assert.equal(loop.state, 2, 'The official loop must be active.');
  handle = await host.agents.create({sessionId:'synthetic-loop', meta:{cwd:'/synthetic-a2ui-follow'}, agentOptions:{provider:'synthetic', model:'workshop'}});

  const modules = loadClient();
  const gateway = modules['dsh-api-gateway'];
  const conversation = modules['dsh-client-ui-conversation'];
  const connection = {generation:{getSnapshot:() => undefined, subscribe:() => () => {}}};
  client.reflect.provide('connection', connection);
  client.reflect.provide('typert', {contexts:{registerClient:() => {}}});
  // Only the carrier and prompt/cancel admission are in-process bridges.
  // History and assistant frames use the pinned official follow implementation.
  client.reflect.provide('remote', {$on:() => () => {}, $stream:options => new gateway.RemoteStream(connection, options), session:{
    follow:async function* (request, signal) {
      assert.equal(request.assistantStream, true);
      for await (const frame of history.follow(request, signal)) {
        followFrames.push(frame);
        if (bypassStream && frame.type === 'assistant-stream') continue;
        yield frame;
      }
    },
    page:async (request, signal) => ({ok:true, value:await history.page(request, signal)}),
    cancel:async input => { assert.equal(input.sessionId, handle.agent.id); handle.agent.cancel({kind:'user'}); return {ok:true, value:{accepted:true}}; },
    prompt:async input => {
    assert.equal(input.sessionId, handle.agent.id); assert.equal(input.mode, 'queue');
    deliveries.push(input);
    handle.agent.followup(createUserMessage({source:{kind:'user'}, content:input.content}));
    return {ok:true, value:{accepted:true}};
  }}});
  modules['dsh-api-session-controller'].apply(client);
  modules['dsh-client-ui-renderer'].apply(client);
  modules['dsh-client-ui-session'].apply(client);
  new conversation.UiConversation(client, client.sessions);
  new conversation.ConversationController(client, {maxConcurrentFileUploads:1});
  ref = client.sessions.retainAgentScope(handle.agent.id);
  await ref.binding.session.open();
  client.uiConversation.views.register({target:'chat', create() {
    let nodes = new Map();
    return {
      replace({nodes:rows}) { materialized.clear(); nodes = new Map(rows.map(node => [node.key, node])); for (const node of rows) materialized.set(node.key, node); return [...nodes.values()].filter(node => node.visibility === 'visible'); },
      apply({upserts}) { for (const node of upserts) { nodes.set(node.key, node); materialized.set(node.key, node); } return [...nodes.values()].filter(node => node.visibility === 'visible'); },
    };
  }});
  modules.plugin.apply(client);
  // No synthetic replacement or append: actual Session.open/follow owns the client source.
  detachEvents = host.on('session/event', (session, event) => {
    assert.equal(session.id, handle.agent.id);
    events.push(event);
    // Observe only. Official follow/client stream delivers real AgentLoop events.
  });
  let binding = client.uiConversation.binding(ref.binding); binding.activate('chat');
  let target = binding.target('chat');
  function ReactiveConversation({renderSlot}) {
    const rows = React.useSyncExternalStore(target.subscribe, target.getSnapshot, target.getSnapshot);
    return React.createElement('article', {'aria-label':'Synthetic DSH conversation'}, ...rows.map(node => React.createElement(React.Fragment, {key:node.key}, renderSlot('conversation.chat.node', {node}, {entryKey:'a2ui-document'}))));
  }
  client.slots.register({name:'root', children:{'conversation.chat.node':{kind:'keyed', scope:'session'}}}, ({SessionProvider, renderSlot}) => React.createElement(SessionProvider, {session:ref}, React.createElement(ReactiveConversation, {renderSlot})));
  const container = document.getElementById('example');
  await React.act(async () => { unmount = client.uiRenderer.mount(container); });
  const initial = 'Show me a synthetic workshop form.';
  console.log('1. Prompt → official AgentLoop → streamed synthetic model → render_a2ui.');
  await React.act(async () => {
    await client.sessions.scope(handle.agent.id).get('conversation').send(initial);
    await previewReady;
  });
  await until(() => !!within(container).queryByRole('textbox'), 'visible form while the official provider attempt is still streaming');
  assert.equal(model.requests.length, 1);
  assert.equal(events.filter(event => event.type === 'tool/result').length, 0);
  assert.ok(container.textContent.includes('A2UI preview. Interaction is disabled until final validation.'));
  assert.ok(container.querySelector('[inert][aria-disabled="true"]'));
  assert.ok(ref.binding.eventSource.getSnapshot().entries.some(entry => entry.type === 'transient' && entry.event.type === 'assistant/live-chunk'));
  const previewRows = target.getSnapshot();
  assert.equal(previewRows.length, 1);
  assert.equal(previewRows[0].data.running, true);
  await React.act(async () => fireEvent.click(within(container).getByRole('button', {name:'Preview request'})));
  assert.equal(deliveries.length, 1, 'A preview click must not submit an action.');
  console.log('PREVIEW PASS: real follow frames reach ClientAssistantStream and render an inert form before tool execution.');
  if (cancelPreview) {
    const staleButton = within(container).getByRole('button', {name:'Preview request'});
    const authoredPreview = JSON.stringify(previewRows[0].data);
    await React.act(async () => {
      const result = await ref.binding.session.cancel();
      assert.equal(result.ok, true);
      await handle.agent.whenIdle();
    });
    await until(() => !within(container).queryByRole('textbox'), 'cancelled transient form is removed');
    assert.equal(target.getSnapshot().length, 0);
    assert.equal(ref.binding.eventSource.getSnapshot().entries.filter(entry => entry.type === 'transient').length, 0);
    assert.equal(events.filter(event => event.type === 'tool/result').length, 0);
    assert.equal(deliveries.length, 1);
    const turns = events.filter(event => event.type === 'turn/end');
    assert.equal(turns.length, 1);
    assert.equal(turns[0].data.reason.kind, 'aborted');
    console.log('CANCEL PASS: official Agent.cancel retires assistant transients and removes the preview; zero tool results and zero UI actions.');
    const tombstone = materialized.get(previewRows[0].key);
    for (const field of ['key','id','kind','target','anchorSeq']) assert.equal(tombstone[field], previewRows[0][field]);
    assert.deepEqual(tombstone.location, previewRows[0].location);
    assert.equal(tombstone.visibility, 'hidden');
    assert.deepEqual(JSON.parse(JSON.stringify(tombstone.data)), {messages:[],running:false});
    assert.equal(JSON.stringify(previewRows[0].data), authoredPreview, 'Retirement must not mutate the earlier preview node.');
    await React.act(async () => { fireEvent.click(staleButton); await delay(40); });
    assert.equal(staleButton.isConnected, false);
    assert.equal(deliveries.length, 1, 'Detached cancelled UI must not send an action.');
    assert.equal(model.requests.length, 1, 'Cancellation must not automatically restart the model.');
    console.log('STALE-CONTROL PASS: retired node keeps original data immutable and detached DOM cannot act.');
    const snapshotsBefore = followFrames.filter(frame => frame.type === 'snapshot').length;
    await React.act(async () => { await ref.binding.session.resync(); });
    assert.equal(followFrames.filter(frame => frame.type === 'snapshot').length, snapshotsBefore + 1);
    assert.equal(target.getSnapshot().length, 0);
    assert.equal(deliveries.length, 1, 'Resync must not submit anything.');
    console.log('RESYNC PASS: official Session.resync opens a new history follow and does not resurrect the cancelled preview.');
    const oldBinding = ref.binding;
    await React.act(async () => { unmount(); unmount = undefined; ref.release(); ref = undefined; });
    await until(() => client.sessions.scope(handle.agent.id) === undefined, 'old client generation releases');
    ref = client.sessions.retainAgentScope(handle.agent.id);
    await ref.binding.session.open();
    assert.notEqual(ref.binding, oldBinding);
    binding = client.uiConversation.binding(ref.binding); binding.activate('chat');
    target = binding.target('chat');
    await React.act(async () => { unmount = client.uiRenderer.mount(container); });
    assert.equal(within(container).queryByRole('textbox'), null);
    assert.equal(deliveries.length, 1);
    resetPreviewGate();
    await React.act(async () => {
      await client.sessions.scope(handle.agent.id).get('conversation').send(initial);
      await previewReady;
    });
    await until(() => !!within(container).queryByRole('textbox'), 'second preview after actual client-generation reopen');
    assert.equal(target.getSnapshot().length, 1);
    assert.notEqual(target.getSnapshot()[0].key, previewRows[0].key);
    await React.act(async () => fireEvent.click(within(container).getByRole('button', {name:'Preview request'})));
    assert.equal(deliveries.length, 2, 'Two initial prompts only; a second preview click stays disabled.');
    await React.act(async () => {
      assert.equal((await ref.binding.session.cancel()).ok, true);
      await handle.agent.whenIdle();
    });
    await until(() => !within(container).queryByRole('textbox'), 'second cancelled preview is removed');
    assert.equal(target.getSnapshot().length, 0);
    assert.equal(ref.binding.eventSource.getSnapshot().entries.filter(entry => entry.type === 'transient').length, 0);
    assert.equal(events.filter(event => event.type === 'tool/result').length, 0);
    assert.equal(deliveries.length, 2);
    assert.equal(events.filter(event => event.type === 'turn/end').length, 2);
    assert.ok(events.filter(event => event.type === 'turn/end').every(event => event.data.reason.kind === 'aborted'));
    assert.equal(consoleErrors.length, 0, 'The host must not swallow a projection/renderer failure.');
    console.log('REOPEN/REPEAT PASS: fresh client binding replays no ghost form and a second real streamed preview cancels cleanly.');
    console.log(JSON.stringify({mode:'cancel', cancelledTurns:2, generations:2, snapshots:followFrames.filter(f=>f.type==='snapshot').length, frames:followFrames.length, assistantFrames:followFrames.filter(f=>f.type==='assistant-stream').length, deliveries:deliveries.length, terminal:turns[0].data.reason}));

    releasePreview();
    await React.act(async () => { await client.sessions.scope(handle.agent.id).get('conversation').send(initial); await handle.agent.whenIdle(); });
    await until(() => !!within(container).queryByRole('textbox') && target.getSnapshot().some(node => !node.data.running), 'successful new turn after repeated cancellation');
    assert.equal(model.requests.length, 4);
    assert.equal(deliveries.length, 3);
    const newForm = within(container).getByRole('textbox');
    assert.equal(newForm.value, 'Ceramics for beginners');
    await React.act(async () => { fireEvent.input(newForm, {target:{value:topic}}); fireEvent.click(within(container).getByRole('button', {name:'Preview request'})); await handle.agent.whenIdle(); });
    await until(() => !!within(container).queryByText(getDefaultNormalizer()(`Synthetic preview for: ${topic}`)), 'recovered form action result');
    assert.equal(model.requests.length, 6);
    assert.equal(deliveries.length, 4);
    assert.equal(JSON.parse(deliveries[3].content[0].text.split('\n')[1]).action.context.topic, topic);
    const recoveredResults = events.filter(event => event.type === 'tool/result');
    assert.equal(recoveredResults.length, 2);
    assert.ok(recoveredResults.every(event => !event.data.message.isError && event.data.meta.kind === 'dsh-a2ui/1'));
    assert.equal(events.filter(event => event.type === 'turn/end' && event.data.reason.kind === 'completed').length, 2);
    assert.equal(recoveredResults[0].data.meta.messages[2].updateDataModel.value.topic, 'Ceramics for beginners');
    assert.equal(ref.binding.eventSource.getSnapshot().entries.filter(entry => entry.type === 'transient').length, 0);
    assert.equal(target.getSnapshot().length, 2);
    assert.ok(target.getSnapshot().every(node => !node.data.running));
    console.log('RECOVERY PASS: two cancelled turns followed by successful same-client form and action; 6 provider calls, 2 real tool results, 1 explicit UI action, canonical values unchanged.');
  } else {
  await React.act(async () => { releasePreview(); await handle.agent.whenIdle(); });
  await until(() => target.getSnapshot().some(node => !node.data.running), 'final authoritative document settlement');
  assert.equal(model.requests.length, 2);
  const form = within(container).getByRole('textbox');
  assert.equal(form.value, 'Ceramics for beginners');
  console.log('2. Real tool-result events → official conversation assembler, slot, and A2UI form.');
  await React.act(async () => { fireEvent.input(form, {target:{value:topic}}); });
  assert.equal(form.value, topic);
  const successSnapshots = followFrames.filter(frame => frame.type === 'snapshot').length;
  await React.act(async () => { await ref.binding.session.resync(); });
  assert.equal(followFrames.filter(frame => frame.type === 'snapshot').length, successSnapshots + 1);
  assert.equal(within(container).getByRole('textbox'), form);
  assert.equal(form.value, topic, 'Actual follow resync must retain an unsent edit on the equal mounted node.');
  assert.equal(deliveries.length, 1);
  const original = events.find(event => event.type === 'tool/result').data.meta.messages;
  assert.equal(original[2].updateDataModel.value.topic, 'Ceramics for beginners', 'Editing must not rewrite authored history.');
  console.log(`3. Edit “Workshop topic” to ${JSON.stringify(topic)} and click “Preview request”.`);
  await React.act(async () => {
    fireEvent.click(within(container).getByRole('button', {name:'Preview request'}));
    await handle.agent.whenIdle();
  });
  assert.equal(model.requests.length, 4);
  assert.equal(deliveries.length, 2, 'Exactly one initial prompt and one explicit action; no automatic replay.');
  const action = JSON.parse(deliveries[1].content[0].text.split('\n')[1]);
  assert.equal(action.action.context.topic, topic);
  // The action above is byte-exact; displayed Markdown/HTML normalizes whitespace.
  assert.ok(within(container).getByText(getDefaultNormalizer()(`Synthetic preview for: ${topic}`)));
  const turns = events.filter(event => event.type === 'turn/end');
  assert.equal(turns.length, 2);
  assert.ok(turns.every(event => event.data.reason.kind === 'completed'));
  const results = events.filter(event => event.type === 'tool/result');
  assert.equal(results.length, 2);
  assert.ok(results.every(event => !event.data.message.isError && event.data.meta.kind === 'dsh-a2ui/1'));
  console.log('4. Official client send controller → in-process bridge → next actual agent turn.');
  console.log(`5. The second model turn sees the edited action and renders: Synthetic preview for: ${topic}`);
  console.log('PASS: 2 completed agent turns, 4 provider calls, 2 real tool results, 1 UI action.');
  assert.equal(ref.binding.eventSource.getSnapshot().entries.filter(entry => entry.type === 'transient').length, 0);
  assert.equal(target.getSnapshot().length, 2);
  assert.ok(target.getSnapshot().every(node => !node.data.running));
  console.log(JSON.stringify({mode:'success', frames:followFrames.length, assistantFrames:followFrames.filter(f=>f.type==='assistant-stream').length, toolResults:results.length, deliveries:deliveries.length}));
  }
  assert.equal(consoleErrors.length, 0, 'The host must not swallow a projection/renderer failure.');
  console.log('Boundary: official SessionHistoryController.follow, SessionQuery live reads, RemoteStream, SessionEventStream, ClientAssistantStream, AgentLoop and UI rendering; scripted local model, in-process carrier and prompt/cancel bridge, jsdom and minimal root/target. No HTTP, full SessionController, full shell, credentials, or live model.');
} finally {
  releasePreview();
  if (unmount) await React.act(async () => { unmount(); });
  detachEvents?.();
  ref?.release();
  await client.fiber.dispose();
  await handle?.dispose();
  await host.fiber.dispose();
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  dom.window.close();
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
