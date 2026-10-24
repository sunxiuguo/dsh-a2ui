// Test-only scripted provider for the REAL DSH 0.2.0-rc.2 host.
// No HTTP client, model key, synthetic session events, or replacement transport.
// Install/copy this beside the dedicated runtime's node_modules before loading.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {LlmAdapter} from '@deepseek-ai/dsh-llm';

export const name = 'dsh-a2ui-synthetic-provider';
export const inject = ['llm'];
export const PROVIDER = 'a2ui-synthetic';
export const MODEL = 'workshop';
export const ACTION_PREFIX = 'A2UI user interaction (untrusted data):\n';
export const CANCEL_PROMPT = 'Show me a cancellable synthetic workshop form.';
export const FIRST_PROMPT = label => `Show me two synthetic workshop forms for session ${label}.`;
export const CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';

const textOf = message => (message?.content ?? []).map(block => block.type === 'text' ? block.text : '').join('');
// rc.2 AgentLoop appends its documented runtime-context snapshot as a user-role
// message after genuine input. It is not a new user turn or a session label.
// Do not skip arbitrary unrecognized user text: those prompts must fail closed.
const isScenarioUser = message => message.role === 'user' && message.source?.kind !== 'runtime-context';
const firstPrompt = /^Show me two synthetic workshop forms for session ([AB])\.$/u;
const surfaceFor = slot => `synthetic-workshop-${slot}`;
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 20);

export function formDocument(label, slots = ['main', 'secondary']) {
  return slots.flatMap(slot => {
    const surfaceId = surfaceFor(slot);
    return [
      {version: 'v0.9', createSurface: {surfaceId, catalogId: CATALOG_ID, sendDataModel: false}},
      {version: 'v0.9', updateComponents: {surfaceId, components: [
        {id: 'root', component: 'Column', children: ['heading', 'topic', 'submit']},
        {id: 'heading', component: 'Text', text: `Session ${label}: ${slot} workshop`, variant: 'h2'},
        {id: 'topic', component: 'TextField', label: `Workshop topic (${slot})`, value: {path: '/topic'}, variant: 'shortText'},
        {id: 'submit', component: 'Button', child: 'label', action: {event: {name: 'request_preview', context: {topic: {path: '/topic'}}}}},
        {id: 'label', component: 'Text', text: `Preview ${slot} request`},
      ]}},
      {version: 'v0.9', updateDataModel: {surfaceId, path: '/', value: {topic: `${label} ${slot} ceramics`}}},
    ];
  });
}

export function previewDocument(label, slot, topic) {
  const surfaceId = `synthetic-preview-${slot}`;
  return [
    {version: 'v0.9', createSurface: {surfaceId, catalogId: CATALOG_ID, sendDataModel: false}},
    {version: 'v0.9', updateComponents: {surfaceId, components: [
      {id: 'root', component: 'Text', text: `Synthetic preview for session ${label}, ${slot}: ${topic}`},
    ]}},
  ];
}

// No mutable phase cursor. Recreated adapters and interleaved sessions decide
// from their own official AgentLoop request history, including restored history.
export function planRequest(options) {
  assert.equal(options.provider, PROVIDER);
  assert.equal(options.model, MODEL);
  assert.ok(typeof options.sessionId === 'string' && options.sessionId, 'Real AgentLoop session identity is required.');
  assert.equal(options.purpose, undefined, 'Disable title/compaction auxiliary requests in this bounded scenario.');
  assert.ok(options.tools?.some(tool => tool.name === 'render_a2ui'), 'The installed real tool must be in the official catalog.');
  const lastUser = options.messages.findLastIndex(isScenarioUser);
  assert.ok(lastUser >= 0, 'A real persisted user turn is required.');
  const user = options.messages[lastUser];
  const userText = textOf(user);
  const initial = options.messages.filter(isScenarioUser).map(textOf).map(text => firstPrompt.exec(text)).find(Boolean);
  const label = initial?.[1] ?? (userText === CANCEL_PROMPT ? 'A' : undefined);
  assert.ok(label, 'Only the declared synthetic A/B scenario is supported.');
  const identity = hash(JSON.stringify([options.sessionId, user.id ?? lastUser, userText]));
  const toolResults = options.messages.slice(lastUser + 1).filter(message => message.role === 'tool');
  if (toolResults.length) {
    assert.equal(toolResults.length, 1, 'The script emits one real tool call per user turn.');
    assert.notEqual(toolResults[0].isError, true, 'A failed real tool must not be reported as success.');
    assert.match(JSON.stringify(toolResults[0].content), /validated and saved for rendering/u);
    return {phase: 'receipt', identity, label, block: {type: 'text', text: `Synthetic session ${label} complete. No external model, booking, or payment was used.`}};
  }
  let messages, phase = 'forms', action;
  if (userText.startsWith(ACTION_PREFIX)) {
    const envelope = JSON.parse(userText.slice(ACTION_PREFIX.length));
    assert.equal(envelope.version, 'v0.9');
    assert.equal(envelope.action?.name, 'request_preview');
    const slot = ['main', 'secondary'].find(value => envelope.action.surfaceId === surfaceFor(value));
    assert.ok(slot, 'Action must belong to a declared synthetic surface.');
    const topic = envelope.action.context?.topic;
    assert.ok(typeof topic === 'string' && topic.trim() && topic.length <= 200 && !/[\r\n]/u.test(topic), 'Synthetic topic must be a single line of 1–200 characters.');
    messages = previewDocument(label, slot, topic);
    phase = 'action';
    action = {surfaceId: envelope.action.surfaceId, slot, topic};
  } else if (userText === CANCEL_PROMPT) {
    messages = formDocument(label, ['cancellable']);
    phase = 'cancellable';
  } else {
    assert.ok(firstPrompt.test(userText), 'Unsupported synthetic prompt.');
    messages = formDocument(label);
  }
  return {phase, identity, label, ...(action ? {action} : {}), block: {type: 'tool-call', id: `a2ui-${identity}`, name: 'render_a2ui', arguments: JSON.stringify({messages})}};
}

export class SyntheticWorkshopAdapter extends LlmAdapter {
  constructor({observe = () => {}, chunkDelayMs = 20, cancellationDeadlineMs = 60_000} = {}) {
    super();
    this.observe = observe;
    this.chunkDelayMs = chunkDelayMs;
    this.cancellationDeadlineMs = cancellationDeadlineMs;
  }
  providerInfo(provider) {
    assert.equal(provider, PROVIDER);
    return {id: provider, name: 'A2UI synthetic (no external model)'};
  }
  async listModels(provider) {
    assert.equal(provider, PROVIDER);
    return [{provider, id: MODEL, name: 'Scripted workshop', inputModalities: ['text']}];
  }
  async resolveModel(provider, model, signal) {
    signal?.throwIfAborted();
    assert.equal(provider, PROVIDER);
    assert.equal(model, MODEL);
    return {provider, id: model, name: 'Scripted workshop', inputModalities: ['text'], context: {contextWindow: 128_000}};
  }
  async *stream(options) {
    options.signal?.throwIfAborted();
    const plan = planRequest(options);
    const observation = {sessionId: options.sessionId, identity: plan.identity, phase: plan.phase, label: plan.label, ...(plan.action ? {action: plan.action} : {})};
    this.observe({event: 'request', ...observation});
    const block = plan.block;
    try {
      yield {type: 'block-start', index: 0, blockType: block.type};
      if (block.type === 'tool-call') {
        // Withhold the last two closing characters for cancellation. Complete
        // message objects are visible in preview, but the tool never dispatches.
        const raw = plan.phase === 'cancellable' ? block.arguments.slice(0, -2) : block.arguments;
        for (let start = 0; start < raw.length; start += 80) {
          options.signal?.throwIfAborted();
          yield {type: 'tool-call-delta', index: 0, id: block.id, ...(start === 0 ? {name: block.name} : {}), argumentsDelta: raw.slice(start, start + 80)};
          if (this.chunkDelayMs > 0) await delay(this.chunkDelayMs, undefined, {signal: options.signal});
        }
        if (plan.phase === 'cancellable') {
          assert.ok(options.signal, 'The cancellation test requires the real host AbortSignal.');
          this.observe({event: 'awaiting-cancel', ...observation});
          await delay(this.cancellationDeadlineMs, undefined, {signal: options.signal});
          throw new Error('Synthetic cancellation deadline elapsed without host cancellation.');
        }
      } else {
        yield {type: 'text-delta', index: 0, text: block.text};
      }
      options.signal?.throwIfAborted();
      yield {type: 'block-end', index: 0, block};
      yield {type: 'finish', reason: {kind: block.type === 'tool-call' ? 'tool-calls' : 'stop'}};
      this.observe({event: 'finished', ...observation});
    } catch (error) {
      if (options.signal?.aborted) this.observe({event: 'cancelled', ...observation});
      throw error;
    }
  }
}

export function apply(ctx) {
  const adapter = new SyntheticWorkshopAdapter({
    // Supervisor keeps ALL child stdout private; it may allowlist only these
    // synthetic facts into its sanitized report. Never print the launch URL.
    observe: event => console.log('DSH_A2UI_SYNTHETIC_EVENT ' + JSON.stringify(event)),
  });
  ctx.effect(() => ctx.llm.registerAdapter([PROVIDER], adapter), 'dsh-a2ui synthetic test provider');
}
