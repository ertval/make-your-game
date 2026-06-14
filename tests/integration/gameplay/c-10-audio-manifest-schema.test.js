/**
 * Test: c-10-audio-manifest-schema.test.js
 * Purpose: Locks the C-10 audio-manifest contract — proves the real manifest
 *   validates and that each invalid-entry class (missing required field, bad
 *   category, bad format, bad path, non-positive durationMs, duplicate id,
 *   missing asset file) fails closed through `npm run validate:schema`.
 * Public API: N/A (test module).
 * Implementation Notes: Builds temporary fixture repos and runs the real
 *   validator (scripts/validate-schema.mjs) as a subprocess so the test exercises
 *   the same code path CI does, schema + semantic gates together.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const validateScriptPath = path.join(repoRoot, 'scripts/validate-schema.mjs');

function runValidator(cwd) {
  return spawnSync(process.execPath, [validateScriptPath], {
    cwd,
    encoding: 'utf8',
  });
}

function readOutput(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function copyFixtureFile(relativePath, destinationRoot) {
  const source = path.join(repoRoot, relativePath);
  const destination = path.join(destinationRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

/**
 * A schema-valid baseline audio asset. Tests clone this and mutate a single
 * field so each failure case is attributable to exactly one rule.
 */
function baseAudioAsset(overrides = {}) {
  return {
    id: 'sfx-pellet-collect',
    path: 'assets/generated/sfx/pellet-collect.mp3',
    category: 'sfx',
    format: 'mp3',
    durationMs: 339,
    loop: false,
    critical: true,
    channels: 2,
    sampleRateHz: 44100,
    loudnessLufs: -18,
    maxBytes: 98304,
    ...overrides,
  };
}

/**
 * Lay down a minimal but real repo: the three production schemas, one map +
 * the visual manifest (so the validator's other pairs pass), and an audio
 * manifest built from `audioAssets`. Audio files referenced by each asset are
 * created on disk unless `createAudioFiles` is false.
 */
function createFixture({ audioAssets, createAudioFiles = true } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-ghostman-c10-'));

  copyFixtureFile('docs/schemas/map.schema.json', tempRoot);
  copyFixtureFile('docs/schemas/audio-manifest.schema.json', tempRoot);
  copyFixtureFile('docs/schemas/visual-manifest.schema.json', tempRoot);
  copyFixtureFile('assets/maps/level-1.json', tempRoot);

  // A schema-valid visual manifest + its asset file so the visual pair never
  // becomes the reason a fixture fails — only the audio manifest is under test.
  const visualAsset = {
    id: 'player-idle',
    path: 'assets/generated/sprites/player-idle.svg',
    kind: 'sprite',
    format: 'svg',
    width: 64,
    height: 64,
    critical: true,
    tags: ['player', 'idle'],
    maxBytes: 32768,
  };
  writeJson(path.join(tempRoot, 'assets/manifests/visual-manifest.json'), {
    version: 'v1.0',
    assets: [visualAsset],
  });
  writeText(path.join(tempRoot, visualAsset.path), '<svg></svg>');

  writeJson(path.join(tempRoot, 'assets/manifests/audio-manifest.json'), {
    version: 'v1.0',
    assets: audioAssets,
  });

  if (createAudioFiles) {
    for (const asset of audioAssets) {
      if (asset && typeof asset.path === 'string') {
        writeText(path.join(tempRoot, asset.path), 'audio-bytes');
      }
    }
  }

  return tempRoot;
}

function withFixture(options, assertion) {
  const tempRoot = createFixture(options);
  try {
    assertion(runValidator(tempRoot));
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

describe('C-10 audio manifest schema contract', () => {
  it('validates the real shipped audio-manifest.json', () => {
    // The production validator runs against the real repo (cwd), exercising the
    // actual manifest + on-disk asset files, not a fixture.
    const result = runValidator(repoRoot);
    expect(result.status).toBe(0);
    expect(readOutput(result)).toContain(
      'Schema validation passed: assets/manifests/audio-manifest.json',
    );
  });

  it('passes for a schema-valid fixture manifest', () => {
    withFixture({ audioAssets: [baseAudioAsset()] }, (result) => {
      expect(result.status).toBe(0);
    });
  });

  it('fails closed when a required field is missing (durationMs)', () => {
    const asset = baseAudioAsset();
    delete asset.durationMs;
    withFixture({ audioAssets: [asset] }, (result) => {
      expect(result.status).not.toBe(0);
      expect(readOutput(result)).toContain('durationMs');
    });
  });

  it('fails closed for an invalid category', () => {
    withFixture({ audioAssets: [baseAudioAsset({ category: 'voice' })] }, (result) => {
      expect(result.status).not.toBe(0);
      expect(readOutput(result)).toContain('assets/manifests/audio-manifest.json');
    });
  });

  it('fails closed for an unsupported format (non-mp3)', () => {
    withFixture(
      {
        audioAssets: [
          baseAudioAsset({
            format: 'ogg',
            path: 'assets/generated/sfx/pellet-collect.ogg',
          }),
        ],
      },
      (result) => {
        expect(result.status).not.toBe(0);
        expect(readOutput(result)).toContain('assets/manifests/audio-manifest.json');
      },
    );
  });

  it('fails closed for a path outside the approved generated audio directory', () => {
    withFixture(
      { audioAssets: [baseAudioAsset({ path: 'assets/source/audio/pellet-collect.mp3' })] },
      (result) => {
        expect(result.status).not.toBe(0);
        expect(readOutput(result)).toContain('assets/manifests/audio-manifest.json');
      },
    );
  });

  it('fails closed for a non-positive durationMs', () => {
    withFixture({ audioAssets: [baseAudioAsset({ durationMs: 0 })] }, (result) => {
      expect(result.status).not.toBe(0);
      expect(readOutput(result)).toContain('durationMs');
    });
  });

  it('fails closed for a non-boolean critical flag', () => {
    withFixture({ audioAssets: [baseAudioAsset({ critical: 'yes' })] }, (result) => {
      expect(result.status).not.toBe(0);
      expect(readOutput(result)).toContain('assets/manifests/audio-manifest.json');
    });
  });

  it('fails closed for an unknown field (additionalProperties: false)', () => {
    withFixture({ audioAssets: [baseAudioAsset({ bitrateKbps: 192 })] }, (result) => {
      expect(result.status).not.toBe(0);
      expect(readOutput(result)).toContain('assets/manifests/audio-manifest.json');
    });
  });

  it('fails closed for a duplicate asset id', () => {
    withFixture(
      {
        audioAssets: [
          baseAudioAsset({ id: 'sfx-pellet-collect', path: 'assets/generated/sfx/pellet-a.mp3' }),
          baseAudioAsset({ id: 'sfx-pellet-collect', path: 'assets/generated/sfx/pellet-b.mp3' }),
        ],
      },
      (result) => {
        expect(result.status).not.toBe(0);
        expect(readOutput(result)).toContain('DUPLICATE_ID');
        expect(readOutput(result)).toContain('sfx-pellet-collect');
      },
    );
  });

  it('fails closed when a referenced audio file is missing on disk', () => {
    withFixture({ audioAssets: [baseAudioAsset()], createAudioFiles: false }, (result) => {
      expect(result.status).not.toBe(0);
      expect(readOutput(result)).toContain('MISSING_FILE');
      expect(readOutput(result)).toContain('assets/generated/sfx/pellet-collect.mp3');
    });
  });
});
