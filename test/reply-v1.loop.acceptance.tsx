// Adapts examples/synthetic-loop.mjs and the pinned follow-stream fixture.
// Only provider responses and the in-process carrier/admission bridge are synthetic.
import React, {act} from 'react';
import * as jsx from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as ReactClient from 'react-dom/client';
import {it, expect, vi} from 'vitest';
import {fireEvent, within} from '@testing-library/dom';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import * as Cordis from '@deepseek-ai/cordis';
import {AgentRegistry, type AgentHandle} from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import {SessionStore} from '@deepseek-ai/dsh-session';
import {SessionProjectionRegistry} from '@deepseek-ai/dsh-session-projection';
import {SessionQueryEngine} from '@deepseek-ai/dsh-session-query';
import {LlmRuntime, LlmAdapter, createUserMessage, type GenerateOptions, type StreamChunk} from '@deepseek-ai/dsh-llm';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as slots from '@deepseek-ai/dsh-client-ui-slots';
import * as store from '@deepseek-ai/dsh-client-store';
import * as legacyTool from '../src/dsh/tool';
import * as replyTool from '../src/experimental/v1-reply/tool';
import {REPLY_V1_META, REPLY_V1_TOOL} from '../src/experimental/v1-reply/protocol';
import {replyFixture} from './reply-v1.fixture';

const require = createRequire(import.meta.url);
const PREFIX = 'A2UI v1 reply interaction (untrusted data):\n';
const initial = (label: string) => `Show synthetic v1 replies for ${label}.`;
const invalid = 'Show invalid synthetic v1 replies for A.';
const sessionId = (label: string) => `synthetic-${label}`;
// Prescribed by the test's rendered clicks, never by fields in the received action.
const expectedReplies = [
  {sessionId: 'synthetic-B', deliveryIndex: 2, action: {
    name: 'reply', surfaceId: 'sameSurface', sourceComponentId: 'dynamic',
    userMessage: 'Resolved reply B', context: {choice: 'choice-B'},
  }},
  {sessionId: 'synthetic-A', deliveryIndex: 5, action: {
    name: 'reply-literal', surfaceId: 'sameSurface', sourceComponentId: 'literal',
    userMessage: 'Literal synthetic reply', context: {choice: 'literal'},
  }},
  {sessionId: 'synthetic-A', deliveryIndex: 6, action: {
    name: 'reply', surfaceId: 'sameSurface', sourceComponentId: 'dynamic',
    userMessage: 'Resolved reply A', context: {choice: 'choice-A'},
  }},
] as const;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function gate() {
  let ready!: () => void, release!: () => void;
  const streamed = new Promise<void>(resolve => { ready = resolve; });
  const finished = new Promise<void>(resolve => { release = resolve; });
  return {ready, release, streamed, finished};
}
function documentFor(label: string) {
  return [...replyFixture('sameSurface', `Initial ${label}`), {
    version: 'v1.0', updateDataModel: {
      surfaceId: 'sameSurface', path: '/reply', value: {text: `Resolved reply ${label}`, id: `choice-${label}`},
    },
  }];
}

// These are the existing shipped client factories, not substitutes for their services.
function loadClient() {
  const factories = new Map<string, (require: (id: string) => any) => any>();
  const primitives = new Proxy({}, {get() { throw Error('Full composer is outside this fixture'); }});
  const modules = new Map<string, any>([
    ['react', React], ['react/jsx-runtime', jsx], ['react-dom', ReactDOM], ['react-dom/client', ReactClient],
    ['@deepseek-ai/cordis', Cordis], ['@deepseek-ai/dsh-client-ui-slots', slots],
    ['@deepseek-ai/dsh-client-store', store], ['@deepseek-ai/dsh-client-ui-primitives', primitives],
  ]);
  (window as any).__ModuleLoader__ = {load: ({id, factory}: any) => factories.set(id, factory)};
  const names = ['dsh-api-gateway', 'dsh-api-session-controller', 'dsh-client-ui-renderer', 'dsh-client-ui-session', 'dsh-client-ui-conversation'];
  for (const name of names) {
    const pkg = require.resolve(`@deepseek-ai/${name}/package.json`);
    window.eval(readFileSync(resolve(dirname(pkg), 'lib/client.js'), 'utf8'));
  }
  window.eval(readFileSync(resolve('experimental-lib/client.js'), 'utf8'));
  const load = (id: string): any => {
    if (id.startsWith('@deepseek-ai/')) id = id.replace(/\/client$/, '');
    if (modules.has(id)) return modules.get(id);
    const factory = factories.get(id);
    if (!factory) throw Error(`Unseeded client dependency: ${id}`);
    const exports = factory(load); modules.set(id, exports); return exports;
  };
  return Object.fromEntries(names.map(name => [name, load('@deepseek-ai/' + name)])
    .concat([['reply', load('dsh-a2ui-reply-v1')]]));
}

it('dispatches opted-in v1 replies through real loops, isolates sessions, withdraws and replays without a provider turn', async () => {
  for (const name of ['dsh-agent-loop', 'dsh-agent', 'dsh-session', 'dsh-llm', 'dsh-tools', 'dsh-session-query', 'dsh-api-session-controller', 'dsh-client-ui-conversation']) {
    expect(require(`@deepseek-ai/${name}/package.json`).version).toBe('0.2.0-rc.2');
  }
  expect(require('@deepseek-ai/cordis/package.json').version).toBe('4.0.5');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const network = vi.fn(async () => { throw Error('No network is allowed in this synthetic loop'); });
  vi.stubGlobal('fetch', network);
  const errors = vi.spyOn(console, 'error');
  const host = new Cordis.Context();
  // Client service types arrive from the shipped classic-script factories below.
  const client: any = new Cordis.Context();
  const handles = new Map<string, AgentHandle>();
  const refs = new Map<string, any>(), targets = new Map<string, any>();
  const observed = new Map<string, any[]>([['synthetic-A', []], ['synthetic-B', []]]);
  const frames = new Map<string, any[]>([['synthetic-A', []], ['synthetic-B', []]]);
  const gates = new Map([['synthetic-A', gate()], ['synthetic-B', gate()]]);
  const deliveries: any[] = [], dispatched: any[] = [], receivedActions: any[] = [];
  const container = document.createElement('div'); document.body.append(container);
  let unmount: undefined | (() => void);
  let detachEvents: undefined | (() => void), detachResults: undefined | (() => void);

  class ReplyModel extends LlmAdapter {
    requests: GenerateOptions[] = [];
    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      options.signal?.throwIfAborted();
      expect(options.provider).toBe('synthetic-reply'); expect(options.model).toBe('choices');
      expect(options.tools?.some(tool => tool.name === REPLY_V1_TOOL)).toBe(true);
      const label = options.sessionId === 'synthetic-A' ? 'A' : options.sessionId === 'synthetic-B' ? 'B' : undefined;
      if (!label) throw Error('Unexpected provider session');
      this.requests.push(options);
      expect(this.requests.length).toBeLessThanOrEqual(10);
      let userIndex = options.messages.length - 1;
      // Runtime context is explicitly disabled in this composition.
      while (userIndex >= 0 && options.messages[userIndex].role !== 'user') userIndex--;
      const text = options.messages[userIndex].content.map(block => block.type === 'text' ? block.text : '').join('');
      const result = options.messages.slice(userIndex + 1).find(message => message.role === 'tool');
      let block: any;
      if (result) {
        expect(result.isError).toBe(text === invalid);
        if (text !== invalid) expect(JSON.stringify(result.content)).toContain('does not confirm display');
        block = {type: 'text', text: 'Synthetic tool receipt complete.'};
      } else if (text.startsWith(PREFIX)) {
        const envelope = JSON.parse(text.slice(PREFIX.length));
        receivedActions.push(structuredClone({sessionId: options.sessionId, envelope, text}));
        block = {type: 'text', text: `Synthetic response to ${envelope.action.userMessage}`};
      } else {
        expect(text).toBe(text === invalid && label === 'A' ? invalid : initial(label));
        const messages: any = documentFor(label);
        if (text === invalid) messages[0].createSurface.components[1].action.event.userMessage = 42;
        block = {type: 'tool-call', id: `reply-${label}-${this.requests.length}`, name: REPLY_V1_TOOL, arguments: JSON.stringify({messages})};
      }
      yield {type: 'block-start', index: 0, blockType: block.type};
      if (block.type === 'tool-call') {
        for (let start = 0; start < block.arguments.length; start += 80) {
          yield {type: 'tool-call-delta', index: 0, id: block.id, ...(start === 0 ? {name: block.name} : {}), argumentsDelta: block.arguments.slice(start, start + 80)};
        }
        if (text !== invalid) {
          const pending = gates.get(options.sessionId!)!;
          pending.ready();
          const signal = options.signal!;
          await new Promise<void>((resolve, reject) => {
            const abort = () => reject(signal.reason);
            signal.addEventListener('abort', abort, {once: true});
            pending.finished.then(() => { signal.removeEventListener('abort', abort); resolve(); });
            if (signal.aborted) abort();
          });
          signal.throwIfAborted();
        }
      } else yield {type: 'text-delta', index: 0, text: block.text};
      yield {type: 'block-end', index: 0, block};
      yield {type: 'finish', reason: {kind: block.type === 'tool-call' ? 'tool-calls' : 'stop'}};
    }
  }

  const model = new ReplyModel();
  async function until(check: () => boolean, description: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      await act(async () => { await delay(10); });
      if (check()) return;
    }
    throw Error('Timed out: ' + description);
  }
  const article = (label: string) => within(container).getByRole('article', {name: sessionId(label)});
  const results = (label: string) => observed.get(sessionId(label))!.filter(event => event.type === 'tool/result');
  const sends = (label: string) => deliveries.filter(input => input.sessionId === sessionId(label));
  const snapshotCount = (label: string) => frames.get(sessionId(label))!.filter(frame => frame.type === 'snapshot').length;
  const replayCounts = (label: string) => ({requests: model.requests.filter(request => request.sessionId === sessionId(label)).length, deliveries: sends(label).length});
  function assertReceivedReply(index: number) {
    const expected = expectedReplies[index], received = receivedActions[index];
    expect(received.sessionId, `prescribed reply ${index} owning session`).toBe(expected.sessionId);
    const timestamp = received.envelope.action.timestamp;
    expect(typeof timestamp).toBe('string');
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isFinite(Date.parse(timestamp))).toBe(true);
    // Assert outside the provider: native loop error containment must not hide this oracle failure.
    expect(received.envelope, `independently prescribed reply envelope ${index}`).toEqual({
      version: 'v1.0', action: {...expected.action, timestamp},
    });
    // These positions come from the ordered scenario's seven sends, not the latest captured object.
    const sent = deliveries[expected.deliveryIndex];
    expect(sent.sessionId, `prescribed reply ${index} delivery owner`).toBe(expected.sessionId);
    expect(sent.mode).toBe('queue');
    expect(sent.content).toEqual([{type: 'text', text: PREFIX + JSON.stringify(received.envelope)}]);
    expect(received.text).toBe(sent.content[0].text); // Actual provider history matches the detached delivery.
  }
  const send = (label: string, text: string) => client.sessions.scope(sessionId(label) as any)!.get('conversation').send(text);
  try {
    new SessionStore(host); new AgentRegistry(host); new SessionProjectionRegistry(host); new LlmRuntime(host);
    // The base's live reads are concrete; its abstract search surface is unused,
    // exactly as in the existing pinned verify-packed-stream.mjs composition.
    Reflect.construct(SessionQueryEngine, [host]);
    // Same exact private SDK file already used by verify-packed-stream.mjs; no patching.
    const historyPath = resolve(dirname(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json')), 'lib/types/history.js');
    const {SessionHistoryController} = await import(pathToFileURL(historyPath).href);
    const history = new SessionHistoryController(host, () => { throw Error('Unexpected cold promotion'); });
    await host.plugin(SystemPrompt, {includeRuntimeContext: false});
    await host.plugin(ToolRuntime); await host.plugin(legacyTool);
    expect(host.tools.schemas().map(tool => tool.name)).toEqual(['render_a2ui']);
    await host.plugin(replyTool); // The sole explicit server opt-in, before creating either agent.
    expect(host.tools.schemas().map(tool => tool.name).sort()).toEqual(['render_a2ui', REPLY_V1_TOOL].sort());
    host.llm.registerAdapter(['synthetic-reply'], model);
    const loop = host.plugin(AgentLoop, {agents: [], maxParallelToolCalls: 1}); await loop;
    expect(loop.state).toBe(2);
    for (const label of ['A', 'B']) {
      const handle = await host.agents.create({sessionId: sessionId(label) as any, meta: {cwd: '/synthetic-reply-loop'}, agentOptions: {provider: 'synthetic-reply', model: 'choices'}});
      handles.set(handle.agent.id, handle);
    }
    detachEvents = host.on('session/event', (session, event) => { observed.get(session.id)!.push(event); });
    detachResults = host.on('tools/result', (exec, result) => {
      dispatched.push({name: exec.name, sessionId: exec.agent?.id, callId: String(exec.callId), isError: result.isError});
    });
    const modules = loadClient(), conversation = modules['dsh-client-ui-conversation'];
    const connection = {generation: {getSnapshot: () => undefined, subscribe: () => () => {}}};
    client.reflect.provide('connection', connection);
    client.reflect.provide('typert', {contexts: {registerClient: () => {}}});
    // The carrier is local; all events, tool dispatch/results and provider requests are real.
    client.reflect.provide('remote', {$on: () => () => {}, $stream: (options: any) => new modules['dsh-api-gateway'].RemoteStream(connection, options), session: {
      follow: async function* (request: any, signal: AbortSignal) {
        expect(request.assistantStream).toBe(true);
        for await (const frame of history.follow(request, signal)) { frames.get(request.address.sessionId)!.push(frame); yield frame; }
      },
      page: async (request: any, signal: AbortSignal) => ({ok: true, value: await history.page(request, signal)}),
      prompt: async (input: any) => {
        const handle = handles.get(input.sessionId); if (!handle) throw Error('Unknown prompt owner');
        expect(input.mode).toBe('queue'); deliveries.push(structuredClone(input));
        handle.agent.followup(createUserMessage({source: {kind: 'user'}, content: input.content}));
        return {ok: true, value: {accepted: true}};
      },
      cancel: async (input: any) => { handles.get(input.sessionId)!.agent.cancel({kind: 'user'}); return {ok: true, value: {accepted: true}}; },
    }});
    modules['dsh-api-session-controller'].apply(client); modules['dsh-client-ui-renderer'].apply(client); modules['dsh-client-ui-session'].apply(client);
    new conversation.UiConversation(client, client.sessions); new conversation.ConversationController(client, {maxConcurrentFileUploads: 1});
    client.uiConversation.views.register({target: 'chat', create() {
      let nodes = new Map<string, any>();
      return {
        replace({nodes: rows}: any) { nodes = new Map(rows.map((node: any) => [node.key, node])); return [...nodes.values()].filter(node => node.visibility === 'visible'); },
        apply({upserts}: any) { for (const node of upserts) nodes.set(node.key, node); return [...nodes.values()].filter(node => node.visibility === 'visible'); },
      };
    }});
    modules.reply.apply(client); // Separate built client, never the default entry.
    for (const label of ['A', 'B']) {
      const id = sessionId(label), ref = client.sessions.retainAgentScope(id as any);
      refs.set(id, ref); await ref.binding.session.open();
      const binding = client.uiConversation.binding(ref.binding); binding.activate('chat'); targets.set(id, binding.target('chat'));
    }
    function Conversation({id, renderSlot}: any) {
      const target = targets.get(id); const rows = React.useSyncExternalStore<any[]>(target.subscribe, target.getSnapshot, target.getSnapshot);
      return <article aria-label={id}>{rows.map(node => <React.Fragment key={node.key}>{renderSlot('conversation.chat.node', {node}, {entryKey: 'a2ui-reply-v1'})}</React.Fragment>)}</article>;
    }
    client.slots.register({name: 'root', children: {'conversation.chat.node': {kind: 'keyed', scope: 'session'}}}, ({SessionProvider, renderSlot}: any) => <>{[...refs].map(([id, ref]) => <SessionProvider key={id} session={ref}><Conversation id={id} renderSlot={renderSlot}/></SessionProvider>)}</>);
    await act(async () => { unmount = client.uiRenderer.mount(container); });
    for (const label of ['A', 'B']) {
      await act(async () => { await send(label, initial(label)); await gates.get(sessionId(label))!.streamed; });
      await until(() => targets.get(sessionId(label)).getSnapshot().some((node: any) => node.data.running), `actual ${label} streaming node`);
      expect(within(article(label)).queryAllByRole('button')).toHaveLength(0);
      expect(results(label)).toHaveLength(0);
      expect(refs.get(sessionId(label)).binding.eventSource.getSnapshot().entries.some((entry: any) => entry.type === 'transient')).toBe(true);
    }
    expect(dispatched).toHaveLength(0); // Complete streamed args are not a dispatch/result.

    await act(async () => { expect((await refs.get('synthetic-A').binding.session.cancel()).ok).toBe(true); await handles.get('synthetic-A')!.agent.whenIdle(); });
    await until(() => targets.get('synthetic-A').getSnapshot().length === 0, 'cancelled A transient withdrawal');
    expect(refs.get('synthetic-A').binding.eventSource.getSnapshot().entries.filter((entry: any) => entry.type === 'transient')).toHaveLength(0);
    expect(results('A')).toHaveLength(0); expect(sends('A')).toHaveLength(1);
    expect(targets.get('synthetic-B').getSnapshot().some((node: any) => node.data.running)).toBe(true);
    expect(within(article('B')).queryAllByRole('button')).toHaveLength(0);

    await act(async () => { gates.get('synthetic-B')!.release(); await handles.get('synthetic-B')!.agent.whenIdle(); });
    await until(() => within(article('B')).queryAllByRole('button').length === 2, 'final B choices');
    expect(results('B')[0].data.meta).toEqual({kind: REPLY_V1_META, callId: String(results('B')[0].data.message.source.callId), messages: documentFor('B')});
    await act(async () => { fireEvent.click(within(article('B')).getByRole('button', {name: 'Choose dynamic'})); await handles.get('synthetic-B')!.agent.whenIdle(); });
    await until(() => receivedActions.length === 1, 'B action in actual next provider call');
    assertReceivedReply(0);
    expect(receivedActions[0].sessionId).toBe('synthetic-B'); expect(sends('A')).toHaveLength(1);

    // An invalid model-authored call really traverses ToolRuntime; no fabricated error event.
    await act(async () => { await send('A', invalid); await handles.get('synthetic-A')!.agent.whenIdle(); });
    await until(() => !!within(article('A')).queryByRole('alert'), 'real failed result withdrawal');
    expect(results('A')[0].data.message.isError).toBe(true);
    expect(within(article('A')).queryAllByRole('button')).toHaveLength(0);
    expect(within(article('B')).getAllByRole('button')).toHaveLength(2);

    gates.set('synthetic-A', gate());
    await act(async () => { await send('A', initial('A')); await gates.get('synthetic-A')!.streamed; });
    expect(within(article('A')).queryAllByRole('button')).toHaveLength(0);
    await act(async () => { gates.get('synthetic-A')!.release(); await handles.get('synthetic-A')!.agent.whenIdle(); });
    await until(() => within(article('A')).queryAllByRole('button').length === 2, 'final recovered A choices');
    expect(results('A')[1].data.meta).toEqual({kind: REPLY_V1_META, callId: String(results('A')[1].data.message.source.callId), messages: documentFor('A')});
    for (const [index, name] of ['Choose literal', 'Choose dynamic'].entries()) {
      await act(async () => { fireEvent.click(within(article('A')).getByRole('button', {name})); await handles.get('synthetic-A')!.agent.whenIdle(); });
      await until(() => receivedActions.length === index + 2, `A reply ${index} in actual next provider call`);
      assertReceivedReply(index + 1);
    }
    await until(() => receivedActions.length === 3, 'both A choices in actual provider calls');
    expect(receivedActions.map(action => action.sessionId)).toEqual(['synthetic-B', 'synthetic-A', 'synthetic-A']);
    expect(sends('B')).toHaveLength(2); expect(sends('A')).toHaveLength(5);
    expect(model.requests).toHaveLength(10);
    expect(dispatched).toHaveLength(3); expect(dispatched.every(call => call.name === REPLY_V1_TOOL)).toBe(true);
    expect(dispatched.filter(call => !call.isError)).toHaveLength(2);
    for (const label of ['A', 'B']) {
      for (const result of results(label)) expect(dispatched.some(call => call.sessionId === sessionId(label) && call.callId === String(result.data.message.source.callId))).toBe(true);
    }
    const before = {A: replayCounts('A'), B: replayCounts('B')};
    const snapshots = {A: snapshotCount('A'), B: snapshotCount('B')};
    await act(async () => { for (const ref of refs.values()) await ref.binding.session.resync(); });
    for (const label of ['A', 'B'] as const) {
      await until(() => snapshotCount(label) === snapshots[label] + 1, `real history resync snapshot for ${label}`);
      expect(snapshotCount(label), `one new snapshot for session ${label}`).toBe(snapshots[label] + 1);
    }
    await act(async () => { await delay(250); for (const handle of handles.values()) await handle.agent.whenIdle(); });
    for (const label of ['A', 'B'] as const) expect(replayCounts(label), `inert replay for ${label}`).toEqual(before[label]);
    expect(within(article('A')).getAllByRole('button')).toHaveLength(2); expect(within(article('B')).getAllByRole('button')).toHaveLength(2);
    const turns = [...observed.values()].flat().filter(event => event.type === 'turn/end');
    expect(turns.filter(event => event.data.reason.kind === 'aborted')).toHaveLength(1);
    expect(turns.filter(event => event.data.reason.kind === 'completed')).toHaveLength(6);
    expect([...frames.values()].every(rows => rows.some(frame => frame.type === 'assistant-stream'))).toBe(true);
    expect(errors).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  } finally {
    for (const pending of gates.values()) pending.release();
    if (unmount) await act(async () => { unmount?.(); });
    detachEvents?.(); detachResults?.();
    for (const ref of refs.values()) ref.release();
    await client.fiber.dispose();
    for (const handle of handles.values()) await handle.dispose();
    await host.fiber.dispose(); container.remove(); delete (window as any).__ModuleLoader__;
    errors.mockRestore(); vi.unstubAllGlobals();
  }
}, 15_000);
