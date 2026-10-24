// Reviewed Playwright helpers for the shipped rc.2 browser shell. They do not
// launch a host/browser, inject a replacement shell, preseed settings or auth,
// select a fake key, or emulate session events. Run only in the approved attempt.
import assert from 'node:assert/strict';

export const COMPOSER = '[data-composer-input][contenteditable="true"]';
export const A2UI_DOCUMENT = 'section[aria-label="A2UI document"]';
export const PROMPT_PATH = '/api/session/prompt';
export const MUX_PATH = '/api/remote.mux';

// Recovery only when the actual shell presents the no-workspace state. The
// caller creates this empty synthetic directory before boot. Do not call this
// unconditionally on a fresh profile that already initialized its default.
export async function connectFreshWorkspace(page, workspacePath) {
  await page.getByRole('textbox', {name: 'Choose workspace', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Select Workspace Directory', exact: true});
  await dialog.waitFor({timeout: 10_000});
  await dialog.getByRole('button', {name: 'Edit path', exact: true}).click();
  const input = dialog.getByRole('textbox', {name: 'Edit path', exact: true});
  await input.fill(workspacePath);
  await input.press('Enter');
  await dialog.getByRole('button', {name: 'Open', exact: true}).click();
  await page.locator(COMPOSER).first().waitFor({timeout: 15_000});
}

export async function submitComposer(page, text) {
  assert.ok(typeof text === 'string' && text.length > 0 && !/[\r\n]/u.test(text));
  const composer = page.locator(COMPOSER).first();
  await composer.waitFor({timeout: 15_000});
  await composer.click();
  // Official test helper uses real keys, not Lexical DOM assignment or fill().
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
  const sent = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === PROMPT_PATH);
  await composer.press('Enter');
  const request = await sent;
  const envelope = request.postDataJSON();
  assert.equal(envelope.method, 'session/prompt');
  assert.equal(envelope.type, 'client-request');
  const prompt = envelope.payload?.args?.request;
  assert.ok(prompt && typeof prompt.sessionId === 'string');
  return {sessionId: prompt.sessionId, requestId: prompt.requestId};
}

export async function newSessionInWorkspace(page, title) {
  const row = page.getByText(title, {exact: true}).first().locator('xpath=ancestor::*[@role="treeitem"][1]');
  await row.waitFor({timeout: 15_000});
  if (await row.getAttribute('aria-expanded') !== 'true') await row.click();
  await row.hover();
  await page.getByRole('button', {name: `New session in ${title}`, exact: true}).click();
  await page.getByRole('tree', {name: 'Sessions', exact: true}).getByText('New Session', {exact: true}).waitFor({timeout: 15_000});
  await page.locator(COMPOSER).first().waitFor({timeout: 15_000});
}

// Shipped compact presentation can hide tool content inside real disclosures.
// This clicks those controls instead of changing CSS, forcing visibility or
// altering ui-chat configuration to make a synthetic page look successful.
export async function revealOwningTurnProcess(page, target) {
  await target.waitFor({state: 'attached', timeout: 15_000});
  if (await target.isVisible()) return;
  const turn = await target.evaluate(element => element.closest('[data-chat-turn]')?.dataset.chatTurn);
  if (turn !== undefined) {
    const disclosure = page.locator(`[data-turn-process=${JSON.stringify(turn)}]`);
    if (await disclosure.count() && await disclosure.getAttribute('aria-expanded') === 'false') await disclosure.click();
  }
  const group = target.locator('xpath=ancestor::*[@data-chat-group-key][1]');
  const disclosure = group.locator('[data-process-activity]').first();
  if (await disclosure.isVisible() && await disclosure.getAttribute('aria-expanded') === 'false') await disclosure.click();
  await target.waitFor({state: 'visible', timeout: 10_000});
}

export async function stopGeneration(page) {
  await page.getByRole('button', {name: 'Stop generating', exact: true}).first().click();
}

// Controlled pre-delivery failure, never response-ACK ambiguity. This blocks one
// actual UI action at the native HTTP boundary and then removes only its route.
export async function rejectNextA2uiAction(page) {
  let rejected = 0;
  const matcher = url => url.pathname === PROMPT_PATH;
  const handler = async route => {
    const body = route.request().postDataJSON();
    const request = body?.payload?.args?.request;
    const text = request?.content?.filter(block => block.type === 'text').map(block => block.text).join('');
    if (!rejected && text?.startsWith('A2UI user interaction (untrusted data):\n')) {
      rejected++;
      await route.abort('failed');
      await page.unroute(matcher, handler);
    } else await route.fallback();
  };
  await page.route(matcher, handler);
  return {get rejected() {return rejected;}, dispose: () => page.unroute(matcher, handler)};
}
