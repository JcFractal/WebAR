import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateExperience, ExperienceLoadError } from '../src/config.ts';

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8'));
const fixture = () => structuredClone(read('experiences/greeting-test.json')) as Record<string, any>;
const invalid = (data: unknown, id: string, pattern: RegExp) =>
  assert.throws(() => validateExperience(data, id), (e: unknown) => e instanceof ExperienceLoadError && pattern.test(e.message));

test('both particle configs still validate unchanged as swarm', () => {
  for (const id of ['neon-garden', 'cosmic-vortex']) {
    const config = validateExperience(read(`experiences/${id}.json`), id);
    assert.equal(config.template, 'swarm');
  }
});

test('manifest keeps the two particle links first and marks the greeting as a test fixture', () => {
  const m = read('manifest.json') as { experiences: { id: string; test?: boolean }[] };
  assert.deepEqual(m.experiences.slice(0, 2).map((e) => e.id), ['neon-garden', 'cosmic-vortex']);
  assert.ok(m.experiences.every((e) => e.id.startsWith('greeting') === (e.test === true)));
});

test('synthetic greeting config validates as video', () => {
  const config = validateExperience(fixture(), 'greeting-test');
  assert.equal(config.template, 'video');
});

test('video config rejects bad source, ranges, keying and unknown keys', () => {
  const cases: [(c: Record<string, any>) => void, RegExp][] = [
    [(c) => (c.settings.source = 'https://example.com/a.mp4'), /settings\.source/],
    [(c) => (c.settings.source = 'media/clip.mov'), /settings\.source/],
    [(c) => (c.settings.source = 'media/../secret.mp4'), /settings\.source/],
    [(c) => (c.settings.displayHeightMeters = 10), /displayHeightMeters/],
    [(c) => (c.settings.bottomOffsetMeters = -1), /bottomOffsetMeters/],
    [(c) => (c.settings.loop = 'yes'), /settings\.loop/],
    [(c) => (c.settings.keying.mode = 'auto'), /keying\.mode/],
    [(c) => (c.settings.keying.color = 'green'), /keying\.color/],
    [(c) => (c.settings.keying.tolerance = 2), /keying\.tolerance/],
    [(c) => (c.settings.particleCount = 100), /not a known video setting/],
    [(c) => (delete c.settings.source, (c.settings.localFile = false)), /required unless/],
  ];
  for (const [mutate, pattern] of cases) {
    const c = fixture();
    mutate(c);
    invalid(c, 'greeting-test', pattern);
  }
});

test('local-only video config needs no source', () => {
  const c = fixture();
  delete c.settings.source;
  assert.equal(validateExperience(c, 'greeting-test').template, 'video');
});

test('swarm settings are not accepted under the video template and vice versa', () => {
  const swarmAsVideo = { ...(read('experiences/neon-garden.json') as object), template: 'video' };
  invalid(swarmAsVideo, 'neon-garden', /not a known video setting/);
  const videoAsSwarm = { ...fixture(), template: 'swarm' };
  invalid(videoAsSwarm, 'greeting-test', /invalid/);
});

test('unknown template is rejected', () => {
  invalid({ ...fixture(), template: 'hologram' }, 'greeting-test', /"template" must be one of: swarm, video/);
});
