/**
 * Executable audit assertions for docs/audit.md coverage.
 *
 * Purpose: Enforces non-browser audit obligations (inventory parity, category split,
 * threshold definitions, and manual evidence contracts) using deterministic assertions.
 * Public API: N/A (test module).
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_EXECUTION_SPLIT,
  AUDIT_QUESTIONS,
  MANUAL_EVIDENCE_AUDIT_IDS,
  MANUAL_EVIDENCE_MANIFEST_PATH,
  SEMI_AUTOMATABLE_THRESHOLDS,
} from './audit-question-map.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');
const MANUAL_EVIDENCE_MANIFEST_FILE = path.resolve(PROJECT_ROOT, MANUAL_EVIDENCE_MANIFEST_PATH);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const nextPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(nextPath));
      continue;
    }

    files.push(nextPath);
  }

  return files;
}

describe('Audit executable verification contract (non-browser checks)', () => {
  it('keeps canonical inventory and execution category split aligned with docs/audit.md', () => {
    let fullyAutomatableCount = 0;
    let semiAutomatableCount = 0;
    let manualWithEvidenceCount = 0;

    for (const question of AUDIT_QUESTIONS) {
      if (question.executionType === 'Fully Automatable') {
        fullyAutomatableCount += 1;
      } else if (question.executionType === 'Semi-Automatable') {
        semiAutomatableCount += 1;
      } else if (question.executionType === 'Manual-With-Evidence') {
        manualWithEvidenceCount += 1;
      }
    }

    expect(AUDIT_QUESTIONS).toHaveLength(AUDIT_EXECUTION_SPLIT.total);
    expect(fullyAutomatableCount).toBe(AUDIT_EXECUTION_SPLIT.fullyAutomatable);
    expect(semiAutomatableCount).toBe(AUDIT_EXECUTION_SPLIT.semiAutomatable);
    expect(manualWithEvidenceCount).toBe(AUDIT_EXECUTION_SPLIT.manualWithEvidence);
  });

  it('assigns an executable assertion strategy to every audit ID', () => {
    for (const question of AUDIT_QUESTIONS) {
      expect(typeof question.assertionKey).toBe('string');
      expect(question.assertionKey.length).toBeGreaterThan(0);
    }
  });

  it('defines explicit semi-automatable thresholds for F-17, F-18, and B-05', () => {
    const requiredThresholdIds = ['AUDIT-F-17', 'AUDIT-F-18', 'AUDIT-B-05'];

    for (const auditId of requiredThresholdIds) {
      const question = AUDIT_QUESTIONS.find((candidate) => candidate.id === auditId);
      expect(question).toBeDefined();
      expect(question.executionType).toBe('Semi-Automatable');
      expect(question.thresholds).toEqual(SEMI_AUTOMATABLE_THRESHOLDS[auditId]);
    }

    expect(SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-17'].maxP95FrameTimeMs).toBeLessThanOrEqual(20);
    expect(SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-18'].minP95Fps).toBeGreaterThanOrEqual(50);
    expect(SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-B-05'].maxLongTaskMs).toBeLessThanOrEqual(50);
  });

  it('enforces manual-evidence obligations for F-19/F-20/F-21/B-06 through manifest entries', () => {
    expect(fs.existsSync(MANUAL_EVIDENCE_MANIFEST_FILE)).toBe(true);

    const manifest = readJson(MANUAL_EVIDENCE_MANIFEST_FILE);
    const entries = Array.isArray(manifest.entries) ? manifest.entries : [];

    for (const auditId of MANUAL_EVIDENCE_AUDIT_IDS) {
      const entry = entries.find((candidate) => candidate.auditId === auditId);
      expect(entry).toBeDefined();
      expect(entry.executionType).toBe('Manual-With-Evidence');
      expect(Array.isArray(entry.requiredArtifacts)).toBe(true);
      expect(entry.requiredArtifacts.length).toBeGreaterThan(0);

      for (const artifact of entry.requiredArtifacts) {
        expect(typeof artifact.path).toBe('string');
        expect(artifact.path.length).toBeGreaterThan(0);
        expect(fs.existsSync(path.resolve(PROJECT_ROOT, artifact.path))).toBe(true);
      }
    }
  });

  it('keeps static platform constraints executable (no canvas/frameworks, SVG asset pipeline, HUD contract)', () => {
    const rootHtml = fs.readFileSync(path.resolve(PROJECT_ROOT, 'index.html'), 'utf8');
    const packageJson = readJson(path.resolve(PROJECT_ROOT, 'package.json'));
    const allDependencies = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };

    expect(/<\s*canvas\b/i.test(rootHtml)).toBe(false);
    expect(rootHtml.includes('data-hud="timer"')).toBe(true);
    expect(rootHtml.includes('data-hud="score"')).toBe(true);
    expect(rootHtml.includes('data-hud="lives"')).toBe(true);

    for (const forbiddenDependency of ['react', 'vue', 'angular', 'svelte', 'phaser', 'pixi.js']) {
      expect(Object.hasOwn(allDependencies, forbiddenDependency)).toBe(false);
    }

    const generatedAssetsRoot = path.resolve(PROJECT_ROOT, 'assets/generated');
    const generatedAssetFiles = walkFiles(generatedAssetsRoot).map((filePath) =>
      filePath.toLowerCase(),
    );
    const hasSvgAssets = generatedAssetFiles.some((filePath) => filePath.endsWith('.svg'));

    expect(hasSvgAssets).toBe(true);
  });

  it('anchors movement and hold-input audits to executable adapter integration coverage', () => {
    const adapterIntegrationPath = path.resolve(
      PROJECT_ROOT,
      'tests/integration/adapters/input-adapter.test.js',
    );
    const adapterIntegrationText = fs.readFileSync(adapterIntegrationPath, 'utf8');

    expect(adapterIntegrationText.includes('tracks simultaneous held keys independently')).toBe(
      true,
    );
    expect(
      adapterIntegrationText.includes(
        'buffers one press edge regardless of repeated keydown events',
      ),
    ).toBe(true);
  });
});
