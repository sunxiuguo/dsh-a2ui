// Run from the repository after `npm ci --ignore-scripts && npm run build:plugin`:
// node examples/synthetic-loop.mjs "Hand-built pottery"
// Real DSH agent loop and client services; deterministic local model and transport.
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
import ToolRuntime from '@deepseek-ai/dsh-tools';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = resolve(process.env.DSH_A2UI_PACKED_PATH ?? root);
const require = createRequire(import.meta.url);
const topic = process.argv[2] ?? 'Hand-built pottery';
assert.ok(topic.trim() && topic.length <= 200 && !/[\r\n]/.test(topic), 'Use a single-line synthetic workshop topic of 1–200 characters.');
for (const name of ['dsh-agent-loop', 'dsh-agent', 'dsh-llm', 'dsh-session', 'dsh-tools', 'dsh-api-session-controller', 'dsh-client-ui-conversation', 'dsh-client-ui-renderer']) {
  assert.equal(JSON.parse(readFileSync(require.resolve(`@deepseek-ai/${name}/package.json`), 'utf8')).version, '0.2.0-rc.2', `Uncertified SDK: ${name}`);
}
assert.equal(JSON.parse(readFileSync(require.resolve('@deepseek-ai/cordis/package.json'), 'utf8')).version, '4.0.5');
console.log('DSH A2UI: no-key synthetic agent-loop example');
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
    assert.ok(this.requests.length <= 4, 'Unexpected model call: refuse an unbounded loop.');
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
      const callId = submittedTopic === undefined ? 'synthetic-form' : 'synthetic-preview';
      block = {type:'tool-call', id:callId, name:'render_a2ui', arguments:JSON.stringify({messages:documentFor(submittedTopic)})};
    }
    yield {type:'block-start', index:0, blockType:block.type};
    if (block.type === 'tool-call') {
      for (let start = 0; start < block.arguments.length; start += 80) {
        options.signal?.throwIfAborted();
        yield {type:'tool-call-delta', index:0, id:block.id, ...(start === 0 ? {name:block.name} : {}), argumentsDelta:block.arguments.slice(start, start + 80)};
      }
    } else yield {type:'text-delta', index:0, text:block.text};
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
const deliveries = [], events = [];
try {
  new SessionStore(host); new AgentRegistry(host); new SessionProjectionRegistry(host); new LlmRuntime(host);
  await host.plugin(SystemPrompt, {includeRuntimeContext:false});
  await host.plugin(ToolRuntime); await host.plugin(serverPlugin);
  const model = new WorkshopModel(); host.llm.registerAdapter(['synthetic'], model);
  const loop = host.plugin(AgentLoop, {agents:[], maxParallelToolCalls:1}); await loop;
  assert.equal(loop.state, 2, 'The official loop must be active.');
  handle = await host.agents.create({sessionId:'synthetic-loop', agentOptions:{provider:'synthetic', model:'workshop'}});

  const modules = loadClient();
  const gateway = modules['dsh-api-gateway'];
  const conversation = modules['dsh-client-ui-conversation'];
  const connection = {generation:{getSnapshot:() => undefined, subscribe:() => () => {}}};
  client.reflect.provide('connection', connection);
  client.reflect.provide('typert', {contexts:{registerClient:() => {}}});
  // Explicit in-process bridge, NOT the full server SessionController or HTTP.
  client.reflect.provide('remote', {$on:() => () => {}, $stream:options => new gateway.RemoteStream(connection, options), session:{prompt:async input => {
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
  client.uiConversation.views.register({target:'chat', create() {
    let nodes = new Map();
    return {
      replace({nodes:rows}) { nodes = new Map(rows.map(node => [node.key, node])); return [...nodes.values()]; },
      apply({upserts}) { for (const node of upserts) nodes.set(node.key, node); return [...nodes.values()]; },
    };
  }});
  modules.plugin.apply(client);
  ref.binding.eventSource.replace(handle.agent.session.snapshotEvents().map(event => ({type:'event', event})), false);
  detachEvents = host.on('session/event', (session, event) => {
    assert.equal(session.id, handle.agent.id);
    events.push(event);
    // All forwarded tool calls/results originate in the official loop, never hand-authored events.
    ref.binding.eventSource.append({type:'event', event});
  });
  const binding = client.uiConversation.binding(ref.binding); binding.activate('chat');
  const target = binding.target('chat');
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
    await handle.agent.whenIdle();
  });
  assert.equal(model.requests.length, 2);
  const form = within(container).getByRole('textbox');
  assert.equal(form.value, 'Ceramics for beginners');
  console.log('2. Real tool-result events → official conversation assembler, slot, and A2UI form.');
  await React.act(async () => { fireEvent.input(form, {target:{value:topic}}); });
  assert.equal(form.value, topic);
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
  console.log('Boundary: scripted synthetic model; jsdom/no visual layout; minimal root/target and in-process transport. Not a full DSH shell, live model, HTTP, streaming-preview, reload, or deployment claim.');
} finally {
  if (unmount) await React.act(async () => { unmount(); });
  detachEvents?.();
  ref?.release();
  await client.fiber.dispose();
  await handle?.dispose();
  await host.fiber.dispose();
  globalThis.fetch = originalFetch;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  dom.window.close();
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
