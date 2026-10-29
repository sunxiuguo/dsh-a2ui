import React from 'react';
import {afterEach, expect, it} from 'vitest';
import {act, cleanup, render, waitFor, within} from '@testing-library/react';
import {SurfaceSession, SurfaceView} from '../src/surface';
import {importRecording} from '../src/replay';
import {demoMessages} from '../demo/fixture';
import type {Message} from '../src/protocol';

afterEach(cleanup);
const id = 'synthetic-workshop';
const authored = (): Message[] => structuredClone(demoMessages);
const surface = (session: SurfaceSession) => session.processor.model.surfacesMap.get(id)!;
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

it('restores an explicit snapshot including an unsubmitted field, with zero sends', async () => {
  let originalSends = 0, restoreSends = 0;
  const original = new SurfaceSession(async () => { originalSends++; });
  const restored = new SurfaceSession(async () => { restoreSends++; });
  try {
    const input = authored(), before = structuredClone(input);
    original.append(input, true);
    surface(original).dataModel.set('/topic', 'Synthetic unsent topic');
    surface(original).dataModel.set('/notInActionContext', 'Synthetic private draft');
    const saved = importRecording(JSON.stringify(original.export()));
    expect(saved.messages).toEqual(before);
    expect(input).toEqual(before);
    expect(saved.snapshots[0].updateDataModel.value.notInActionContext).toBe('Synthetic private draft');
    expect(saved.actions).toEqual([]);
    restored.restore(saved);
    const view = render(<SurfaceView session={restored}/>);
    await waitFor(() => expect((within(view.container).getByRole('textbox') as HTMLInputElement).value).toBe('Synthetic unsent topic'));
    await act(settle);
    expect(surface(restored).dataModel.get('/notInActionContext')).toBe('Synthetic private draft');
    expect(originalSends).toBe(0);
    expect(restoreSends).toBe(0);
  } finally { original.dispose(); restored.dispose(); }
});

it('does not export a rejected-delivery error or manufacture an approval on restoration', async () => {
  let attempts = 0, restoreSends = 0;
  const original = new SurfaceSession(async () => { attempts++; throw new Error('Synthetic admission rejection'); });
  const restored = new SurfaceSession(async () => { restoreSends++; });
  try {
    original.append(authored(), true);
    surface(original).dataModel.set('/topic', 'Retained synthetic draft');
    await surface(original).dispatchAction({name: 'request_preview', context: {topic: 'Retained synthetic draft'}}, 'submit');
    expect(attempts).toBe(1);
    expect(original.lastError).toBe('Synthetic admission rejection');
    const saved = importRecording(JSON.stringify(original.export()));
    expect(saved.actions).toEqual([]);
    expect(Object.keys(saved).sort()).toEqual(['actions', 'format', 'messages', 'snapshots']);
    restored.restore(saved);
    const view = render(<SurfaceView session={restored}/>);
    await waitFor(() => expect((within(view.container).getByRole('textbox') as HTMLInputElement).value).toBe('Retained synthetic draft'));
    await act(settle);
    expect(restored.lastError).toBeNull();
    expect(within(view.container).queryByRole('alert')).toBeNull();
    expect(within(view.container).getByRole('button', {name: 'Preview request'}).hasAttribute('disabled')).toBe(false);
    expect(restored.actions).toEqual([]);
    expect(restoreSends).toBe(0);
    // Absence of a delivery alert is loss of transient status, not semantic acceptance.
  } finally { original.dispose(); restored.dispose(); }
});

it('keeps resolved-send evidence separate from a later authored semantic rejection', async () => {
  let sends = 0, restoreSends = 0;
  const original = new SurfaceSession(async () => { sends++; });
  const restored = new SurfaceSession(async () => { restoreSends++; });
  try {
    const input = authored();
    input[1].updateComponents!.components[0].children.push('decision');
    input[1].updateComponents!.components.push({id: 'decision', component: 'Text', text: {path: '/decision'}});
    input[2].updateDataModel!.value.decision = 'Awaiting agent decision';
    original.append(input, true);
    await surface(original).dispatchAction({name: 'request_preview', context: {topic: 'Ceramics for beginners'}}, 'submit');
    expect(sends).toBe(1);
    expect(original.actions).toHaveLength(1);
    expect(original.lastError).toBeNull();
    expect(surface(original).dataModel.get('/decision')).toBe('Awaiting agent decision');
    // A synthetic agent-authored protocol update; no real AgentLoop/model runs here.
    original.append([{version: 'v0.9', updateDataModel: {surfaceId: id, path: '/decision', value: 'Rejected by synthetic agent'}}], true);
    const saved = importRecording(JSON.stringify(original.export()));
    expect(saved.actions).toHaveLength(1);
    expect(saved.actions[0].action.name).toBe('request_preview');
    restored.restore(saved);
    const view = render(<SurfaceView session={restored}/>);
    await waitFor(() => expect(within(view.container).getByText('Rejected by synthetic agent')).toBeTruthy());
    await act(settle);
    expect(restored.actions).toEqual(saved.actions);
    expect(restored.lastError).toBeNull();
    expect(within(view.container).queryByText(/approved|accepted/i)).toBeNull();
    expect(within(view.container).getByRole('button', {name: 'Preview request'}).hasAttribute('disabled')).toBe(false);
    expect(restoreSends).toBe(0);
    expect(sends).toBe(1);
  } finally { original.dispose(); restored.dispose(); }
});
