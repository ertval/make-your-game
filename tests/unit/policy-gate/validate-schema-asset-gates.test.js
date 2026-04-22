/**
 * Test: validate-schema-asset-gates.test.js
 * Purpose: Locks A-07 fail-closed behavior for manifest path existence plus generated-asset naming/size budgets.
 * Public API: N/A (test module).
 * Implementation Notes: Uses temporary fixture repositories and executes the schema validator as a subprocess.
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

function createFixture(options = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-ghostman-a07-'));

  copyFixtureFile('docs/schemas/map.schema.json', tempRoot);
  copyFixtureFile('docs/schemas/audio-manifest.schema.json', tempRoot);
  copyFixtureFile('docs/schemas/visual-manifest.schema.json', tempRoot);
  copyFixtureFile('assets/maps/level-1.json', tempRoot);

  const visualAsset = {
    id: 'player-idle',
    path: options.visualPath || 'assets/generated/sprites/player-idle.svg',
    kind: 'sprite',
    format: 'svg',
    width: 64,
    height: 64,
    critical: true,
    tags: ['player', 'idle'],
    maxBytes: options.visualMaxBytes || 32768,
  };

  const audioAsset = {
    id: 'ui-confirm',
    path: options.audioPath || 'assets/generated/ui/ui-confirm.mp3',
    category: 'ui',
    format: 'mp3',
    durationMs: 180,
    loop: false,
    critical: true,
    channels: 2,
    sampleRateHz: 44100,
    loudnessLufs: -18,
    maxBytes: options.audioMaxBytes || 32768,
  };

  writeJson(path.join(tempRoot, 'assets/manifests/visual-manifest.json'), {
    version: 'v1.0',
    assets: [visualAsset],
  });

  writeJson(path.join(tempRoot, 'assets/manifests/audio-manifest.json'), {
    version: 'v1.0',
    assets: [audioAsset],
  });

  if (options.createVisualFile !== false) {
    writeText(path.join(tempRoot, visualAsset.path), options.visualFileContents || '<svg></svg>');
  }

  if (options.createAudioFile !== false) {
    writeText(path.join(tempRoot, audioAsset.path), options.audioFileContents || 'audio-bytes');
  }

  return tempRoot;
}

function readOutput(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

describe('validate-schema asset gates', () => {
  it('passes when schema, manifest paths, naming, and maxBytes are all valid', () => {
    const tempRoot = createFixture();

    try {
      const result = runValidator(tempRoot);
      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('fails closed when a manifest asset path does not exist on disk', () => {
    const tempRoot = createFixture({ createVisualFile: false });

    try {
      const result = runValidator(tempRoot);
      expect(result.status).not.toBe(0);
      expect(readOutput(result)).toContain('MISSING_FILE');
      expect(readOutput(result)).toContain('assets/generated/sprites/player-idle.svg');
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('fails closed when a generated asset filename violates strict kebab-case naming', () => {
    const tempRoot = createFixture({
      visualPath: 'assets/generated/sprites/player--idle.svg',
    });

    try {
      const result = runValidator(tempRoot);
      expect(result.status).not.toBe(0);
      expect(readOutput(result)).toContain('NAMING_RULE');
      expect(readOutput(result)).toContain('assets/generated/sprites/player--idle.svg');
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('fails closed when a generated asset exceeds manifest maxBytes', () => {
    const tempRoot = createFixture({
      audioMaxBytes: 4,
      audioFileContents: 'this-file-is-larger-than-four-bytes',
    });

    try {
      const result = runValidator(tempRoot);
      expect(result.status).not.toBe(0);
      expect(readOutput(result)).toContain('SIZE_BUDGET');
      expect(readOutput(result)).toContain('assets/generated/ui/ui-confirm.mp3');
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
