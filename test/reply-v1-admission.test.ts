import {afterEach, describe, expect, it, vi} from 'vitest';
import {MessageProcessor} from '@a2ui/web_core/processing';
import {validateReplyV1Document} from '../src/experimental/v1-reply/protocol';
import {replyFixture} from './reply-v1.fixture';

afterEach(() => vi.restoreAllMocks());

const placements = ['initial model', 'model update', 'event context'] as const;
const shapes = [
  {name: 'objects', wrap: (value: unknown) => ({outer: {inner: value}})},
  {name: 'arrays', wrap: (value: unknown) => [[value]]},
  {name: 'mixed containers', wrap: (value: unknown) => ({items: [{details: [value]}]})},
];

function withPayload(placement: typeof placements[number], payload: unknown) {
  const messages: any[] = replyFixture();
  if (placement === 'initial model') messages[0].createSurface.dataModel.extra = payload;
  else if (placement === 'model update') messages.push({
    version: 'v1.0', updateDataModel: {surfaceId: 'reply-surface', path: '/extra', value: payload},
  });
  else messages[0].createSurface.components[1].action.event.context.extra = payload;
  return messages;
}

describe('whole-document reply function admission', () => {
  for (const placement of placements) {
    for (const {name, wrap} of shapes) {
      it(`rejects a nested function in ${placement} / ${name} before runtime processing`, () => {
        const process = vi.spyOn(MessageProcessor.prototype, 'processMessages');
        const messages = withPayload(placement, wrap({'@call': 'syntheticDeniedFunction', args: {}}));
        expect(() => validateReplyV1Document(messages)).toThrow('REPLY_V1_FUNCTION_UNSUPPORTED');
        expect(process).not.toHaveBeenCalled();
      });
      it(`accepts ordinary data in ${placement} / ${name}`, () => {
        const process = vi.spyOn(MessageProcessor.prototype, 'processMessages');
        const messages = withPayload(placement, wrap({note: '@call is literal text', value: 42}));
        expect(validateReplyV1Document(messages)).toEqual(messages);
        expect(process).toHaveBeenCalledTimes(1);
      });
    }
  }
});
