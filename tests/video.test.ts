import test from 'node:test';
import assert from 'node:assert/strict';
import { videoConfigSchema, type VideoConfig } from '../packages/domain/index.js';
import { sceneTimeline, videoDurationFrames, audioEnvelope } from '../packages/domain/video.js';

const ids = Array.from({ length: 20 }, () => crypto.randomUUID());
const base: VideoConfig = {
  seconds: 15,
  pageIds: ids.slice(0, 2),
  opening: 'Mở',
  closing: 'Kết',
  musicId: 'none',
};
test('preset scene frames partition the full timeline without gaps for any supported page count', () => {
  for (const seconds of [15, 30, 60] as const)
    for (let n = 1; n <= 20; n++) {
      const config = { ...base, seconds, pageIds: ids.slice(0, n) };
      const timeline = sceneTimeline(config);
      assert.equal(videoDurationFrames(config), seconds * 30);
      assert.equal(timeline[0].from, 60);
      timeline.forEach((scene, i) => {
        assert.ok(scene.durationInFrames > 0);
        if (i) assert.equal(scene.from, timeline[i - 1].from + timeline[i - 1].durationInFrames);
      });
      const last = timeline.at(-1)!;
      assert.equal(last.from + last.durationInFrames, seconds * 30 - 90);
    }
});
test('custom durations follow page IDs when reordered and preserve exact total frames', () => {
  const config = { ...base, sceneDurations: { [ids[0]]: 3.1, [ids[1]]: 4.2 } };
  assert.ok(videoConfigSchema.safeParse(config).success);
  assert.equal(videoDurationFrames(config), 369);
  assert.deepEqual(sceneTimeline({ ...config, pageIds: [ids[1], ids[0]] }), [
    { pageId: ids[1], from: 60, durationInFrames: 126 },
    { pageId: ids[0], from: 186, durationInFrames: 93 },
  ]);
  for (const durations of [
    { [ids[0]]: 3 },
    { [ids[0]]: 3, [ids[1]]: 0.1 },
    { [ids[0]]: 3, [ids[1]]: 3.11 },
    { [ids[0]]: 3, [ids[1]]: 4, [ids[2]]: 4 },
  ])
    assert.ok(!videoConfigSchema.safeParse({ ...base, sceneDurations: durations }).success);
  assert.ok(
    !videoConfigSchema.safeParse({
      ...base,
      pageIds: ids,
      sceneDurations: Object.fromEntries(ids.map((id) => [id, 60])),
    }).success,
  );
});
test('custom audio requires a valid source and nonempty cut, with bounded volume and fades', () => {
  const audio = {
    ...base,
    musicId: 'custom',
    audioId: crypto.randomUUID(),
    audioStart: 2,
    audioEnd: 4,
    audioVolume: 0.5,
    audioLoop: true,
  };
  assert.ok(videoConfigSchema.safeParse(audio).success);
  for (const patch of [
    { audioId: undefined },
    { audioEnd: 2 },
    { audioEnd: 1 },
    { audioStart: -1 },
    { audioVolume: 1.1 },
    { audioEnd: 601 },
  ])
    assert.ok(!videoConfigSchema.safeParse({ ...audio, ...patch }).success);
  assert.ok(!videoConfigSchema.safeParse({ ...base, pageIds: [ids[0], ids[0]] }).success);
  assert.equal(audioEnvelope(0, 360, 30, 0.5), 0);
  assert.equal(audioEnvelope(90, 360, 30, 0.5), 0.5);
  assert.equal(audioEnvelope(359, 360, 30, 0.5), 0);
  assert.equal(audioEnvelope(400, 360, 30, 0.5), 0);
});
