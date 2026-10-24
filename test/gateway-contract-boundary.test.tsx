import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { validateDocument, validateAction, CATALOG_ID } from '../src/protocol';
import { SurfaceSession, SurfaceView } from '../src/surface';
import { definition } from '../src/dsh/node';
import { completeMessages } from '../src/dsh/partial';

// Synthetic contract fixture, not gateway execution or host acceptance.
// Gateway observation pinned to 86d7c5fc7bc524c01bacfa560e311d0868de58f8.
const compact = { surfaceId: 'interop-fixture', components: [
  { id: 'root', component: 'Column', children: ['button'] },
  { id: 'button', component: 'Button', child: 'label', action: { event: { name: 'preview', context: { choice: 'synthetic' } } } },
  { id: 'label', component: 'Text', text: 'Preview synthetic result' },
], data: { choice: 'synthetic' } };
const document = (version = 'v0.9.1') => [
  { version, createSurface: { surfaceId: compact.surfaceId, catalogId: CATALOG_ID } },
  { version, updateComponents: { surfaceId: compact.surfaceId, components: structuredClone(compact.components) } },
  { version, updateDataModel: { surfaceId: compact.surfaceId, path: '/', value: structuredClone(compact.data) } },
];
const action = { version: 'v0.9.1', action: { name: 'preview', surfaceId: compact.surfaceId, sourceComponentId: 'button', timestamp: '2026-10-24T20:00:00Z', context: { choice: 'synthetic' } } };
function begin(args: unknown) {
  const event = { type: 'tool/call', seq: 1, data: { name: 'render_a2ui', callId: 'synthetic-render', arguments: JSON.stringify(args) } };
  const match = { event, location: { kind: 'unresolved' } };
  const state = definition.start!({} as any, match as any, {} as any);
  return { state, match };
}
function view(state: any, match: any) {
  return definition.buildViewNode!({ state, key: 'synthetic-node', id: 'synthetic-render', start: match, matches: [match] } as any) as any;
}
function findDeep(root: ParentNode, selector: string): Element | null {
  const direct = root.querySelector(selector); if (direct) return direct;
  for (const element of root.querySelectorAll('*')) if (element.shadowRoot) { const found = findDeep(element.shadowRoot, selector); if (found) return found; }
  return null;
}
afterEach(cleanup);
describe('immutable alpha13 boundary against gateway middleware-shaped fixtures', () => {
  it.each(['v0.9', 'v0.9.1'])('accepts explicit standard %s without rewrite', version => {
    expect(validateDocument(document(version))).toEqual(document(version));
  });
  it('rejects compact middleware arguments as a standard A2UI document', () => {
    expect(() => validateDocument(compact)).toThrow('DOCUMENT');
    expect(() => validateDocument([compact])).toThrow('SCHEMA');
    expect(completeMessages(JSON.stringify(compact))).toEqual([]);
  });
  it('accepts compatible operations inside an activity only after explicit extraction', () => {
    const activity = { type: 'ACTIVITY_SNAPSHOT', messageId: 'a2ui-surface-synthetic-render', activityType: 'a2ui-surface', replace: true, content: { a2ui_operations: document('v0.9') } };
    expect(() => validateDocument(activity)).toThrow('DOCUMENT');
    expect(validateDocument(activity.content.a2ui_operations)).toEqual(document('v0.9'));
    expect(definition.match!(activity as any)).toBeNull();
  });
  it('rejects blindly appending cumulative snapshots and an unsupported catalog ID', () => {
    expect(() => validateDocument([...document('v0.9'), ...document('v0.9')])).toThrow('LIFECYCLE: duplicate surface');
    const unsupported = document('v0.9'); unsupported[0].createSurface!.catalogId = 'https://a2ui.org/specification/v0_9/basic_catalog.json';
    expect(() => validateDocument(unsupported)).toThrow('CATALOG');
  });
  it('requires the versioned action envelope rather than the middleware forwardedProps shape', () => {
    expect(() => validateAction(action)).not.toThrow();
    expect(() => validateAction(action.action)).toThrow('ACTION');
    expect(() => validateAction({ userAction: action.action })).toThrow('ACTION');
    expect(() => validateAction({ a2uiAction: { userAction: action.action } })).toThrow('ACTION');
  });
  it('does not treat AG-UI wire events or a custom tool name as native DSH render events', () => {
    expect(definition.match!({ type: 'TOOL_CALL_START', toolCallId: 'synthetic-render', toolCallName: 'render_a2ui' } as any)).toBeNull();
    expect(definition.match!({ type: 'ACTIVITY_SNAPSHOT', messageId: 'synthetic', activityType: 'a2ui-surface', content: compact } as any)).toBeNull();
    expect(definition.match!({ type: 'tool/call', data: { name: 'draw_surface', callId: 'synthetic-render', arguments: JSON.stringify({ messages: document() }) } } as any)).toBeNull();
  });
  it('withdraws a valid preview when settlement contains only a rendered receipt', () => {
    const { state, match } = begin({ messages: document() });
    expect(view(state, match).data).toMatchObject({ running: true, messages: document() });
    const settled = definition.update!({ state } as any, { event: { type: 'tool/result', surfaceOp: 'append', data: { message: { isError: false, content: [{ type: 'text', text: '{"status":"rendered"}' }] } } } } as any);
    expect(view(settled, match).data).toMatchObject({ running: false, messages: [], error: expect.stringContaining('without a validated document') });
  });
  it('settles only a validated native recording, not a status flag', () => {
    const { state, match } = begin({ messages: document() });
    const settled = definition.update!({ state } as any, { event: { type: 'tool/result', data: { message: { isError: false }, meta: { kind: 'dsh-a2ui/1', messages: document() } } } } as any);
    expect(view(settled, match).data).toEqual({ running: false, messages: document() });
  });
  it('retains media/navigation policy after explicitly authoring versioned operations', () => {
    const media = document(); media[1].updateComponents!.components.push({ id: 'media', component: 'Image', url: 'https://example.invalid/synthetic.png' } as any);
    expect(() => validateDocument(media)).toThrow('POLICY_RESOURCE');
    const navigation = document(); navigation[1].updateComponents!.components[1].action = { functionCall: { call: 'openUrl', args: { url: 'https://example.invalid/' } } } as any;
    expect(() => validateDocument(navigation)).toThrow('POLICY_NAVIGATION');
  });
  it('renders a standard document, emits a versioned action, and restores without replaying it', async () => {
    const sent: unknown[] = []; const session = new SurfaceSession(async value => { sent.push(value); });
    session.append(document(), true);
    const { container } = render(React.createElement(SurfaceView, { session }));
    await waitFor(() => expect(findDeep(container, 'button')).not.toBeNull());
    fireEvent.click(findDeep(container, 'button')!);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ version: 'v0.9.1', action: { name: 'preview', surfaceId: 'interop-fixture', sourceComponentId: 'button', context: { choice: 'synthetic' } } });
    expect(() => validateAction(sent[0])).not.toThrow();
    const recorded = session.export(); let replaySends = 0;
    const restored = new SurfaceSession(async () => { replaySends++; }); restored.restore(recorded);
    expect(replaySends).toBe(0); expect(restored.actions).toEqual(sent);
    expect(restored.processor.model.surfacesMap.get('interop-fixture')?.dataModel.get('/choice')).toBe('synthetic');
    restored.dispose(); session.dispose();
  });
});
