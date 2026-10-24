import assert from 'node:assert/strict';
import test from 'node:test';
import {ACTION_PREFIX, CANCEL_PROMPT, FIRST_PROMPT, MODEL, PROVIDER, SyntheticWorkshopAdapter, planRequest, formDocument} from './provider.mjs';

const user = (text, id = 'user-1') => ({role: 'user', id, content: [{type: 'text', text}]});
const options = (label = 'A', extra = []) => ({provider: PROVIDER, model: MODEL, sessionId: `session-${label}`, tools: [{name: 'render_a2ui'}], messages: [user(FIRST_PROMPT(label)), ...extra]});
const collect = async stream => {const result = []; for await (const event of stream) result.push(event); return result;};

test('exact official adapter catalog has a selectable no-key route', async () => {
  const adapter = new SyntheticWorkshopAdapter();
  assert.equal(adapter.providerInfo(PROVIDER).id, PROVIDER);
  assert.deepEqual(await adapter.listModels(PROVIDER), [{provider: PROVIDER, id: MODEL, name: 'Scripted workshop', inputModalities: ['text']}]);
  assert.equal((await adapter.resolveModel(PROVIDER, MODEL)).context.contextWindow, 128_000);
});

test('two sessions share surface IDs but not authored values or call IDs', () => {
  const a = planRequest(options('A')), b = planRequest(options('B'));
  assert.notEqual(a.block.id, b.block.id);
  assert.equal(JSON.parse(a.block.arguments).messages.length, 6);
  assert.equal(formDocument('A')[0].createSurface.surfaceId, formDocument('B')[0].createSurface.surfaceId);
  assert.match(a.block.arguments, /A main ceramics/u);
  assert.doesNotMatch(a.block.arguments, /B main ceramics/u);
  assert.deepEqual(planRequest(options('A')), a, 'No global invocation cursor affects replay.');
});

test('real tool receipt closes rather than issuing another tool call', async () => {
  const tool = {role: 'tool', isError: false, content: [{type: 'text', text: 'A2UI document validated and saved for rendering.'}]};
  const request = options('A', [tool]);
  const events = await collect(new SyntheticWorkshopAdapter({chunkDelayMs: 0}).stream(request));
  assert.equal(events.at(-1).reason.kind, 'stop');
  assert.equal(events[0].blockType, 'text');
});

test('edited action reads its own latest persisted turn after adapter recreation', () => {
  const action = {version: 'v0.9', action: {name: 'request_preview', surfaceId: 'synthetic-workshop-secondary', context: {topic: 'B edited pottery'}}};
  const request = options('B', [user(ACTION_PREFIX + JSON.stringify(action), 'action-1')]);
  const first = planRequest(request), restored = planRequest(structuredClone(request));
  assert.equal(first.phase, 'action');
  assert.equal(first.label, 'B');
  assert.equal(first.action.topic, 'B edited pottery');
  assert.deepEqual(restored, first);
  assert.match(first.block.arguments, /Synthetic preview for session B, secondary: B edited pottery/u);
});

test('unknown prompt and failed tool receipt fail closed', () => {
  assert.throws(() => planRequest({...options(), messages: [user('Fetch external data')]}));
  assert.throws(() => planRequest(options('A', [{role: 'tool', isError: true, content: []}])));
});

test('normal stream keeps official chunk vocabulary and complete tool arguments', async () => {
  const events = await collect(new SyntheticWorkshopAdapter({chunkDelayMs: 0}).stream(options()));
  const end = events.find(event => event.type === 'block-end');
  assert.equal(events.filter(event => event.type === 'tool-call-delta').map(event => event.argumentsDelta).join(''), end.block.arguments);
  assert.equal(events.at(-1).reason.kind, 'tool-calls');
});

test('cancellation observes AbortSignal and never completes or dispatches the partial tool', async () => {
  const controller = new AbortController(), seen = [], events = [];
  const adapter = new SyntheticWorkshopAdapter({chunkDelayMs: 0, cancellationDeadlineMs: 1000, observe(event) {
    seen.push(event);
    if (event.event === 'awaiting-cancel') controller.abort();
  }});
  const request = {...options('A', [user(CANCEL_PROMPT, 'cancel-1')]), signal: controller.signal};
  await assert.rejects(async () => {for await (const event of adapter.stream(request)) events.push(event);}, {name: 'AbortError'});
  assert.ok(events.some(event => event.type === 'tool-call-delta'));
  assert.ok(!events.some(event => ['block-end', 'finish'].includes(event.type)));
  assert.ok(seen.some(event => event.event === 'cancelled'));
});

test('already aborted requests have no provider admission observation', async () => {
  const controller = new AbortController(); controller.abort();
  const seen = [], adapter = new SyntheticWorkshopAdapter({observe: event => seen.push(event)});
  await assert.rejects(collect(adapter.stream({...options(), signal: controller.signal})), {name: 'AbortError'});
  assert.equal(seen.length, 0);
});
