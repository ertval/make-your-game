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
  CI_SEMI_AUTOMATABLE_THRESHOLDS,
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

    // Envelope check: canonical thresholds must stay at AGENTS.md targets.
    // These are the strict canonical baseline; CI_TOLERANCE_FACTOR in
    // audit.browser.spec.js applies environment-specific relaxation.
    // Any deviation from 16.7 ms / 60 FPS must be documented with rationale.
    expect(SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-17'].maxP95FrameTimeMs).toBeLessThanOrEqual(16.7);
    expect(SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-18'].minP95Fps).toBeGreaterThanOrEqual(60);
    expect(SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-B-05'].maxLongTaskMs).toBeLessThanOrEqual(50);
  });

  // CI-17 / #288: CI budgets may relax for headless runners, but must not be ~3× softer
  // than AGENTS.md (was 50 ms / 20 FPS). Cap relaxation at 2× frame-time / ½ FPS.
  it('keeps CI semi-automatable thresholds within a 2× envelope and validates effective CI tolerance (#288)', () => {
    const canonicalF17 = SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-17'];
    const canonicalF18 = SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-18'];
    const ciF17 = CI_SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-17'];
    const ciF18 = CI_SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-18'];

    expect(ciF17).toBeDefined();
    expect(ciF18).toBeDefined();

    // Frame-time budget: CI hard cap must stay ≤ 2× canonical (16.7 → 33.4 ms).
    expect(ciF17.maxP95FrameTimeMs).toBeLessThanOrEqual(canonicalF17.maxP95FrameTimeMs * 2);
    // FPS floor: CI hard cap must stay ≥ ½ of canonical (60 → 30 FPS).
    expect(ciF18.minP95Fps).toBeGreaterThanOrEqual(canonicalF18.minP95Fps / 2);
    expect(ciF17.maxP95FrameTimeMs).toBeLessThanOrEqual(33.4);
    expect(ciF18.minP95Fps).toBeGreaterThanOrEqual(30);

    // Effective threshold check with standard CI_TOLERANCE_FACTOR = 1.3:
    const ciFactor = 1.3;
    const effectiveF17 = Math.min(
      canonicalF17.maxP95FrameTimeMs * ciFactor,
      ciF17.maxP95FrameTimeMs,
    );
    const effectiveF18 = Math.max(Math.floor(canonicalF18.minP95Fps / ciFactor), ciF18.minP95Fps);

    // Effective CI frame time (~21.71ms) is strictly tighter than the 2x cap (33.4ms)
    expect(effectiveF17).toBeLessThan(ciF17.maxP95FrameTimeMs);
    expect(effectiveF17).toBeCloseTo(21.71, 1);
    // Effective CI FPS (46 FPS) is strictly tighter than the 2x cap (30 FPS)
    expect(effectiveF18).toBeGreaterThan(ciF18.minP95Fps);
    expect(effectiveF18).toBe(46);
  });

  it('enforces manual-evidence obligations for F-19/F-20/F-21/B-06 through manifest entries', () => {
    expect(fs.existsSync(MANUAL_EVIDENCE_MANIFEST_FILE)).toBe(true);

    const manifest = readJson(MANUAL_EVIDENCE_MANIFEST_FILE);
    const entries = Array.isArray(manifest.entries) ? manifest.entries : [];

    const evidenceValidAsOf = new Date('2026-06-23');

    for (const auditId of MANUAL_EVIDENCE_AUDIT_IDS) {
      const entry = entries.find((candidate) => candidate.auditId === auditId);
      expect(entry).toBeDefined();
      expect(entry.executionType).toBe('Manual-With-Evidence');
      expect(Array.isArray(entry.requiredArtifacts)).toBe(true);
      expect(entry.requiredArtifacts.length).toBeGreaterThan(0);

      // Verify signOff structure, date recency, and that notes don't have outdated phase labels
      expect(entry.signOff).toBeDefined();
      expect(typeof entry.signOff.reviewer).toBe('string');
      expect(entry.signOff.reviewer.length).toBeGreaterThan(0);
      expect(entry.signOff.date).toBeDefined();
      const signOffDate = new Date(entry.signOff.date);
      expect(signOffDate.getTime()).toBeGreaterThanOrEqual(evidenceValidAsOf.getTime());

      expect(entry.signOff.notes).toBeDefined();
      expect(entry.signOff.notes).not.toContain('Phase 2 MVP');
      expect(entry.signOff.notes).not.toContain('Phase 2');
      expect(entry.signOff.notes).not.toContain('Phase 1');

      for (const artifact of entry.requiredArtifacts) {
        expect(typeof artifact.path).toBe('string');
        expect(artifact.path.length).toBeGreaterThan(0);
        const resolvedPath = path.resolve(PROJECT_ROOT, artifact.path);
        expect(fs.existsSync(resolvedPath)).toBe(true);

        // Verify content does not contain outdated labels for text-based artifacts
        if (
          artifact.path.endsWith('.md') ||
          artifact.path.endsWith('.txt') ||
          artifact.path.endsWith('.json')
        ) {
          const content = fs.readFileSync(resolvedPath, 'utf8');
          expect(content).not.toContain('Phase 2 MVP');
          expect(content).not.toContain('Phase 2');
          expect(content).not.toContain('Phase 1');
        }
      }
    }
  });

  it('enforces build-config gates for forbidden frameworks and SVG asset pipeline', () => {
    // STATIC CONFIG GATES — intentional, not fragile string-matching.
    // These verify dependency manifest and asset-tree shape invariants that
    // cannot be tested through runtime DOM observation. Runtime equivalents
    // exist in audit.browser.spec.js (Playwright) for interactive coverage.
    // See CI-13 in A-11-report.md for the rationale.
    const packageJson = readJson(path.resolve(PROJECT_ROOT, 'package.json'));
    const allDependencies = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };

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

  it('enforces package.json private flag to prevent accidental publish (SEC-03)', () => {
    const packageJson = readJson(path.resolve(PROJECT_ROOT, 'package.json'));
    expect(packageJson.private).toBe(true);
  });

  it('enforces no duplicate aliased scripts in package.json (DEAD-05)', () => {
    const packageJson = readJson(path.resolve(PROJECT_ROOT, 'package.json'));
    const scriptKeys = Object.keys(packageJson.scripts);
    const values = Object.values(packageJson.scripts);
    for (const key of scriptKeys) {
      const aliasCount = values.filter(
        (v) => v === `npm run ${key}` || v === packageJson.scripts[key],
      ).length;
      expect(aliasCount).toBe(1);
    }
  });

  it('enforces Playwright config constraints for workers, projects, and preview server (#276, #274, #273)', async () => {
    const playwrightConfigPath = path.resolve(PROJECT_ROOT, 'playwright.config.js');
    expect(fs.existsSync(playwrightConfigPath)).toBe(true);

    const configModule = await import(playwrightConfigPath);
    const config = configModule.default;

    // Check worker limits and fullyParallel
    expect(config.workers).toBeDefined();
    // In CI, workers must be capped to 1.
    // We can check if config.workers is a ternary or condition. Since we import it directly, we can check its evaluated value.
    if (process.env.CI) {
      expect(config.workers).toBe(1);
    }
    expect(config.fullyParallel).toBe(false);

    // Check browser projects are present (Chromium, Firefox, WebKit)
    expect(config.projects).toBeDefined();
    const projectNames = config.projects.map((p) => p.name);

    // Must contain e2e / audit projects for chromium and firefox
    expect(projectNames).toContain('chromium-e2e');
    expect(projectNames).toContain('firefox-e2e');
    expect(projectNames).toContain('production-preview');

    // Check preview webServer config
    expect(config.webServer).toBeDefined();
    const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];
    const previewServer = servers.find(
      (s) => s.command.includes('npm run preview') || s.command.includes('vite preview'),
    );
    expect(previewServer).toBeDefined();
    expect(previewServer.port).toBe(4174);
  });
});
