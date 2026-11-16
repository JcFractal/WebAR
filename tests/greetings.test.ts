import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingUrl, isValidSlug, mimeFor, playerConfig, suggestedFormat, uploadProblems } from '../src/greetings/format.ts';

const mp4 = { name: 'juan-take1-packed.mp4', type: 'video/mp4', size: 4_199_363 };

test('greeting link ids are 12 lowercase hex characters', () => {
  assert.ok(isValidSlug('a1b2c3d4e5f6'));
  assert.ok(!isValidSlug('A1B2C3D4E5F6'));
  assert.ok(!isValidSlug('a1b2c3'));
  assert.ok(!isValidSlug('../etc/passwd'));
});

test('upload checks accept a packed MP4 and explain bad files', () => {
  assert.deepEqual(uploadProblems(mp4, 'packed', { width: 1440, height: 1280, duration: 8.57 }), []);
  assert.match(uploadProblems({ ...mp4, name: 'a.mov', type: 'video/quicktime' }, 'packed').join(), /not an MP4 or WebM/);
  assert.match(uploadProblems({ ...mp4, size: 60 * 1048576 }, 'packed').join(), /limit is 50 MiB/);
  assert.match(uploadProblems(mp4, 'alpha').join(), /must be WebM/);
  assert.match(uploadProblems(mp4, 'packed', { width: 720, height: 1280, duration: 8 }).join(), /twice as wide/);
  assert.match(uploadProblems(mp4, 'opaque', { width: 0, height: 0, duration: 0 }).join(), /could not be decoded/);
  assert.deepEqual(uploadProblems(mp4, 'opaque', { width: 720, height: 1280, duration: 8 }), []);
});

test('format comes from the stored value, not the file name', () => {
  assert.equal(mimeFor({ name: 'x.webm', type: '', size: 1 }), 'video/webm');
  assert.equal(suggestedFormat({ name: 'renamed (1).mp4', type: 'video/mp4', size: 1 }), 'packed');
  const cfg = playerConfig({ slug: 'a1b2c3d4e5f6', title: 'Hi', video_format: 'packed' }, 'https://x.supabase.co/storage/v1/object/sign/v/opaque-name.mp4?token=t');
  assert.equal(cfg.settings.keying?.mode, 'packed');
  assert.equal(cfg.settings.localFile, false);
  assert.equal(playerConfig({ slug: 'a1b2c3d4e5f6', title: 'Hi', video_format: 'bogus' }, 'https://x').settings.keying?.mode, 'opaque');
});

test('greeting link is stable and carries only the link id', () => {
  assert.equal(greetingUrl('https://web-ar-gold.vercel.app/?create#x', 'a1b2c3d4e5f6'), 'https://web-ar-gold.vercel.app/?g=a1b2c3d4e5f6');
});
