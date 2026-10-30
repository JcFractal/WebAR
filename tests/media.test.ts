import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cbcr, checkLocalFile, durationNote, hexToRgb, mediaErrorMessage, planeSize, rgbToHex } from '../src/video/media.ts';

test('local file checks accept MP4 and reject other or oversized files', () => {
  assert.equal(checkLocalFile({ name: 'hi.mp4', type: 'video/mp4', size: 5e6 }), null);
  assert.equal(checkLocalFile({ name: 'HI.MP4', type: '', size: 5e6 }), null);
  assert.match(checkLocalFile({ name: 'hi.mov', type: 'video/quicktime', size: 5e6 }) ?? '', /not an MP4/);
  assert.match(checkLocalFile({ name: 'hi.mp4', type: 'video/mp4', size: 0 }) ?? '', /empty/);
  assert.match(checkLocalFile({ name: 'hi.mp4', type: 'video/mp4', size: 200 * 1048576 }) ?? '', /limit is 100 MiB/);
});

test('duration note is advisory outside 3–30 s', () => {
  assert.equal(durationNote(12), '');
  assert.match(durationNote(45), /planned for 3–30 s/);
  assert.equal(durationNote(Number.NaN), '');
});

test('media errors map to recoverable wording', () => {
  assert.match(mediaErrorMessage(4, true), /HEVC/);
  assert.match(mediaErrorMessage(2, true), /Choose it again/);
  assert.match(mediaErrorMessage(2, false), /Retry/);
  assert.match(mediaErrorMessage(undefined, false), /Retry/);
});

test('plane size keeps aspect and falls back to portrait', () => {
  assert.deepEqual(planeSize(1.6, 9 / 16), { width: 0.9, height: 1.6 });
  assert.deepEqual(planeSize(1.6, 0), { width: 0.9, height: 1.6 });
});

test('color helpers round-trip and green sits far from neutral chroma', () => {
  assert.equal(rgbToHex(...(hexToRgb('#00b140').map((v) => v * 255) as [number, number, number])), '#00b140');
  const [cb, cr] = cbcr(hexToRgb('#00b140'));
  assert.ok(cb < -0.05 && cr < -0.25);
  const [gcb, gcr] = cbcr([0.5, 0.5, 0.5]);
  assert.ok(Math.abs(gcb) < 1e-6 && Math.abs(gcr) < 1e-6);
});
