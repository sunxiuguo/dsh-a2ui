// Real shipped-shell interaction scenario. Only the LLM is scripted. The single
// induced failure aborts one native action HTTP request BEFORE server admission.
import assert from 'node:assert/strict';
import {COMPOSER, A2UI_DOCUMENT, submitComposer, stopGeneration, rejectNextA2uiAction} from './shell-scenario.mjs';

const PREFIX = 'A2UI user interaction (untrusted data):\n';
const firstPrompt = label => `Show me two synthetic workshop forms for session ${label}.`;
const cancelPrompt = 'Show me a cancellable synthetic workshop form.';
// Pinned A2UI renderer has a visual label, not a programmatic textbox name.
const field = (page, slot) => page.locator('a2ui-basic-textfield').filter({hasText: `Workshop topic (${slot})`}).locator('input[type=text]');
const actionButton = (page, slot) => page.getByRole('button', {name: `Preview ${slot} request`, exact: true});
const previewText = (label, slot, topic) => `Synthetic preview for session ${label}, ${slot}: ${topic}`;
const eventText = event => (event.data?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('');
const ownRequests = (host, sessionId, phase) => host.observations().filter(event => event.event === 'request' && event.sessionId === sessionId && (phase === undefined || event.phase === phase));

// Read-only evidence over actual authenticated HTTP. No internal ctx/service
// access, mock response, injected events, or state mutation. The observed
// projection watermark is a valid committed prefix for the native page API.
async function readRpc(page, method, request) {
  assert.ok(['session/modelCatalog', 'session/projections', 'session/page'].includes(method));
  return page.evaluate(async ({method, request}) => {
    const rpcId = crypto.randomUUID();
    const response = await fetch(`/api/${method}`, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({type: 'client-request', rpcId, method, payload: {args: request === undefined ? {} : {request}}}),
    });
    if (!response.ok) throw new Error('Synthetic read-only history RPC transport failed');
    const body = await response.json();
    if (body.rpcId !== rpcId || !body.result?.ok) throw new Error('Synthetic read-only history RPC refused');
    return body.result.value;
  }, {method, request});
}

async function readEvents(page, sessionId) {
  const projection = await readRpc(page, 'session/projections', {sessionId});
  assert.ok(projection && Number.isSafeInteger(projection.asOfSeq));
  const result = await readRpc(page, 'session/page', {address: {kind: 'session', sessionId}, throughSeq: projection.asOfSeq, maxMessages: 200});
  assert.equal(result.hasMore, false, 'The bounded synthetic history must fit one actual page.');
  return result.records.map(record => {
    assert.equal(record.type, 'event');
    return record.event;
  });
}

async function awaitTurn(page, expect, sessionId, number, reason = 'completed') {
  await expect.poll(async () => (await readEvents(page, sessionId)).filter(event => event.type === 'turn/end').length,
    {timeout: 30_000}).toBe(number);
  const events = await readEvents(page, sessionId);
  assert.equal(events.filter(event => event.type === 'turn/end').at(-1).data.reason.kind, reason);
  return events;
}

function syntheticSnapshot(events) {
  return {
    authored: events.filter(event => event.type === 'tool/result' && event.data.meta?.kind === 'dsh-a2ui/1')
      .map(event => ({seq: event.seq, isError: event.data.message.isError === true, meta: event.data.meta})),
    userTurns: events.filter(event => event.type === 'user/message').map(event => ({seq: event.seq, text: eventText(event)}))
      .filter(event => event.text.startsWith(PREFIX) || event.text === cancelPrompt || /^Show me two synthetic workshop forms for session [AB]\.$/u.test(event.text)),
    turns: events.filter(event => event.type === 'turn/end').map(event => ({seq: event.seq, turn: event.data.turn, reason: event.data.reason.kind})),
  };
}

async function reveal(page, expect, target) {
  // Current compact shell can wrap real tool nodes in process disclosures.
  // Click only actual collapsed controls, never force a hidden test element.
  await expect(async () => {
    if (await target.isVisible()) return;
    const controls = page.locator('[data-turn-process], [data-process-activity]');
    for (let index = 0; index < await controls.count(); index++) {
      const control = controls.nth(index);
      if (await control.isVisible() && await control.getAttribute('aria-expanded') === 'false') await control.click();
    }
    await expect(target).toBeVisible({timeout: 700});
  }).toPass({timeout: 20_000, intervals: [200, 400, 800]});
}

async function openSession(page, expect, sessionId) {
  const row = page.locator(`[data-row-key=${JSON.stringify(`session:${sessionId}`)}]`);
  // Normal workspace disclosure if the session list is collapsed after reload.
  if (!await row.isVisible()) {
    const groups = page.locator('[data-row-key^="workspace:"][aria-expanded="false"]');
    for (let index = 0; index < await groups.count(); index++) await groups.nth(index).click();
  }
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await page.locator(COMPOSER).first().waitFor({timeout: 15_000});
}

async function acceptWelcome(page, expect, fresh) {
  await page.locator('[data-slot="root"]').waitFor({state: 'attached', timeout: 30_000});
  const notice = page.getByRole('dialog', {name: 'Preview Notice', exact: true});
  if (fresh) {
    await notice.waitFor({timeout: 15_000});
    await notice.getByRole('button', {name: 'Continue', exact: true}).click();
    await notice.waitFor({state: 'detached', timeout: 15_000});
  }
  await page.locator(COMPOSER).first().waitFor({timeout: 20_000});
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('dialog', {name: 'Add an API key to get started', exact: true})).toHaveCount(0);
}

async function previewAction({page, expect, host, sessionId, label, slot, topic, turn}) {
  await reveal(page, expect, field(page, slot));
  await field(page, slot).fill(topic);
  const prior = ownRequests(host, sessionId, 'action').length;
  await actionButton(page, slot).click();
  const events = await awaitTurn(page, expect, sessionId, turn);
  await expect.poll(() => ownRequests(host, sessionId, 'action').length).toBe(prior + 1);
  const received = ownRequests(host, sessionId, 'action').at(-1);
  assert.equal(received.label, label);
  assert.deepEqual(received.action, {surfaceId: `synthetic-workshop-${slot}`, slot, topic});
  const rendered = page.getByText(previewText(label, slot, topic), {exact: true});
  await reveal(page, expect, rendered);
  const users = syntheticSnapshot(events).userTurns.filter(event => event.text.startsWith(PREFIX));
  assert.equal(JSON.parse(users.at(-1).text.slice(PREFIX.length)).action.context.topic, topic);
  return events;
}

export async function exerciseHost({page, expect, host, checkpoint}) {
  await acceptWelcome(page, expect, true);
  const catalog = await readRpc(page, 'session/modelCatalog');
  const provider = catalog.groups.find(group => group.id === 'a2ui-synthetic');
  assert.ok(provider?.models.some(model => model.id === 'workshop'));
  assert.equal(host.observations().length, 0, 'Shell boot must not invoke the scripted model.');
  checkpoint('Native preview notice and no-key provider catalog accepted without a fake key');

  const a = await submitComposer(page, firstPrompt('A'));
  checkpoint('First synthetic prompt observed on native session/prompt transport');
  await awaitTurn(page, expect, a.sessionId, 1);
  await reveal(page, expect, field(page, 'main'));
  await expect(field(page, 'main')).toHaveValue('A main ceramics');
  await expect(field(page, 'secondary')).toHaveValue('A secondary ceramics');
  await field(page, 'secondary').fill('A unsent secondary draft');
  await previewAction({page, expect, host, sessionId: a.sessionId, label: 'A', slot: 'main', topic: 'A edited hand-built pottery', turn: 2});
  await expect(field(page, 'secondary')).toHaveValue('A unsent secondary draft');
  const aSnapshot = syntheticSnapshot(await readEvents(page, a.sessionId));
  assert.equal(aSnapshot.authored.length, 2);
  assert.ok(JSON.stringify(aSnapshot.authored[0]).includes('A main ceramics'));
  assert.ok(!JSON.stringify(aSnapshot.authored[0]).includes('A edited hand-built pottery'));
  checkpoint('Session A real tool render, two independent surfaces and action-to-next-turn verified');

  await page.getByRole('button', {name: 'New session', exact: true}).first().click();
  await expect(page.locator('[data-row-key^="session:"][aria-selected="true"]'))
    .not.toHaveAttribute('data-row-key', `session:${a.sessionId}`);
  await expect(page.locator(A2UI_DOCUMENT)).toHaveCount(0);
  const b = await submitComposer(page, firstPrompt('B'));
  assert.notEqual(a.sessionId, b.sessionId);
  await awaitTurn(page, expect, b.sessionId, 1);
  await reveal(page, expect, field(page, 'main'));
  await expect(field(page, 'main')).toHaveValue('B main ceramics');
  await expect(field(page, 'secondary')).toHaveValue('B secondary ceramics');
  await expect(page.getByText(previewText('A', 'main', 'A edited hand-built pottery'), {exact: true})).toHaveCount(0);
  await field(page, 'main').fill('B independent main draft');
  await field(page, 'secondary').fill('B edited wheel-thrown pottery');

  const rejection = await rejectNextA2uiAction(page);
  const beforeRejected = ownRequests(host, b.sessionId).length;
  try {
    await actionButton(page, 'secondary').click();
    const alert = page.locator(A2UI_DOCUMENT).getByRole('alert').filter({hasText: 'Action was not confirmed by DSH.'});
    await expect(alert).toBeVisible();
    assert.equal(rejection.rejected, 1);
    await expect(field(page, 'main')).toHaveValue('B independent main draft');
    await expect(field(page, 'secondary')).toHaveValue('B edited wheel-thrown pottery');
    // Explicit short observation window, not an unbounded exactly-once claim.
    await page.waitForTimeout(750);
    assert.equal(ownRequests(host, b.sessionId).length, beforeRejected);
    assert.equal(syntheticSnapshot(await readEvents(page, b.sessionId)).userTurns.length, 1);
  } finally { await rejection.dispose(); }
  checkpoint('One native action HTTP request rejected before admission; edited fields retained and no automatic retry observed');

  await previewAction({page, expect, host, sessionId: b.sessionId, label: 'B', slot: 'secondary', topic: 'B edited wheel-thrown pottery', turn: 2});
  await expect(page.locator(A2UI_DOCUMENT).getByRole('alert')).toHaveCount(0);
  assert.equal(ownRequests(host, b.sessionId, 'action').length, 1);
  assert.deepEqual(syntheticSnapshot(await readEvents(page, a.sessionId)), aSnapshot);
  checkpoint('Deliberate retry admitted once to Session B only; overlapping surface IDs do not leak to Session A');

  await submitComposer(page, cancelPrompt);
  await expect.poll(() => host.observations().filter(event => event.sessionId === b.sessionId && event.event === 'awaiting-cancel').length,
    {timeout: 20_000}).toBe(1);
  await reveal(page, expect, field(page, 'cancellable'));
  const pendingDocument = page.locator(A2UI_DOCUMENT).filter({has: field(page, 'cancellable')});
  await expect(pendingDocument.locator('[inert][aria-disabled="true"]')).toHaveCount(1);
  await expect(pendingDocument.getByText('A2UI preview. Interaction is disabled until final validation.', {exact: true})).toBeVisible();
  await stopGeneration(page);
  const afterCancel = await awaitTurn(page, expect, b.sessionId, 3, 'aborted');
  await expect.poll(() => host.observations().filter(event => event.sessionId === b.sessionId && event.event === 'cancelled').length).toBe(1);
  await expect(field(page, 'cancellable')).toHaveCount(0);
  assert.equal(syntheticSnapshot(afterCancel).authored.length, 2, 'Cancelled stream produced no successful tool document.');
  assert.deepEqual(syntheticSnapshot(await readEvents(page, a.sessionId)), aSnapshot);
  checkpoint('Real streamed preview remained inert; native Stop aborted provider and retired preview without a successful tool result');

  await previewAction({page, expect, host, sessionId: b.sessionId, label: 'B', slot: 'main', topic: 'B recovered after cancel', turn: 4});
  await field(page, 'secondary').fill('B unsent draft before restart');
  const bSnapshot = syntheticSnapshot(await readEvents(page, b.sessionId));
  assert.equal(bSnapshot.authored.length, 3);
  assert.equal(bSnapshot.userTurns.length, 4);
  assert.deepEqual(bSnapshot.turns.map(turn => turn.reason), ['completed', 'completed', 'aborted', 'completed']);
  await openSession(page, expect, a.sessionId);
  await reveal(page, expect, page.getByText(previewText('A', 'main', 'A edited hand-built pottery'), {exact: true}));
  await expect(page.getByText(previewText('B', 'secondary', 'B edited wheel-thrown pottery'), {exact: true})).toHaveCount(0);
  assert.equal(host.egressRejected(), false);
  checkpoint('Normal action recovered after cancellation; exact synthetic canonical histories captured before graceful restart');
  return {a: {...a, snapshot: aSnapshot}, b: {...b, snapshot: bSnapshot}};
}

export async function checkRestoredHost({page, expect, host, beforeRestart, checkpoint}) {
  await acceptWelcome(page, expect, false);
  await openSession(page, expect, beforeRestart.a.sessionId);
  await reveal(page, expect, page.getByText(previewText('A', 'main', 'A edited hand-built pottery'), {exact: true}));
  await expect(field(page, 'main')).toHaveValue('A main ceramics');
  await expect(field(page, 'secondary')).toHaveValue('A secondary ceramics');
  assert.deepEqual(syntheticSnapshot(await readEvents(page, beforeRestart.a.sessionId)), beforeRestart.a.snapshot);
  await openSession(page, expect, beforeRestart.b.sessionId);
  await reveal(page, expect, page.getByText(previewText('B', 'secondary', 'B edited wheel-thrown pottery'), {exact: true}));
  await reveal(page, expect, page.getByText(previewText('B', 'main', 'B recovered after cancel'), {exact: true}));
  await expect(field(page, 'main')).toHaveValue('B main ceramics');
  await expect(field(page, 'secondary')).toHaveValue('B secondary ceramics');
  await expect(field(page, 'cancellable')).toHaveCount(0);
  assert.deepEqual(syntheticSnapshot(await readEvents(page, beforeRestart.b.sessionId)), beforeRestart.b.snapshot);
  assert.equal(host.observations().length, 0, 'Reopening persisted history must not replay model calls or UI actions.');
  assert.equal(host.egressRejected(), false);
  checkpoint('Both sessions restored through native UI and HTTP history after process restart, with exact authored metadata and no replay');
  checkpoint('Unsent field drafts are intentionally not durable; original authored values restored while submitted action previews persist');
}
