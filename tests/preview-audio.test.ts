import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationSchema } from '../packages/domain/index.js';
import { previewAudioClip } from '../packages/domain/preview-audio.js';
test('preview soundtrack keeps old albums valid and rejects invalid cuts', () => {
  assert.ok(presentationSchema.safeParse({}).success);
  assert.ok(
    presentationSchema.safeParse({
      musicId: 'gentle',
      audioStart: 2,
      audioEnd: 4,
      audioLabel: 'Ngày của chúng mình',
    }).success,
  );
  for (const clip of [
    { audioStart: -1 },
    { audioStart: 2, audioEnd: 2 },
    { audioStart: 4, audioEnd: 2 },
    { audioEnd: 601 },
    { audioLabel: ' ' },
  ])
    assert.equal(presentationSchema.safeParse(clip).success, false);
  assert.deepEqual(previewAudioClip({ audioStart: 2, audioEnd: 4 }, 8), { start: 2, end: 4 });
  assert.deepEqual(previewAudioClip({}, 8), { start: 0, end: 8 });
  assert.deepEqual(previewAudioClip({ audioStart: 10, audioEnd: 12 }, 8), { start: 7.9, end: 8 });
  assert.deepEqual(previewAudioClip({}, NaN), { start: 0, end: 0 });
});
