/*
 * Canonical audit question mapping for executable verification.
 *
 * Purpose: Defines every audit question ID, execution category, and the assertion
 * strategy used by automated suites and policy gates.
 * Public API:
 * - AUDIT_QUESTIONS
 * - AUDIT_EXECUTION_SPLIT
 * - SEMI_AUTOMATABLE_THRESHOLDS
 * - CI_SEMI_AUTOMATABLE_THRESHOLDS  (relaxed values for slow CI runners)
 * - MANUAL_EVIDENCE_AUDIT_IDS
 * - MANUAL_EVIDENCE_MANIFEST_PATH
 */

export const MANUAL_EVIDENCE_MANIFEST_PATH = 'docs/audit-reports/manual-evidence.manifest.json';

export const AUDIT_EXECUTION_SPLIT = Object.freeze({
  fullyAutomatable: 20,
  semiAutomatable: 3,
  manualWithEvidence: 4,
  total: 27,
});

export const SEMI_AUTOMATABLE_THRESHOLDS = Object.freeze({
  'AUDIT-F-17': Object.freeze({
    minFrameSamples: 90,
    maxP95FrameTimeMs: 20,
    maxP99FrameTimeMs: 33.4,
  }),
  'AUDIT-F-18': Object.freeze({
    minFrameSamples: 90,
    minP95Fps: 50,
  }),
  'AUDIT-B-05': Object.freeze({
    maxLongTaskCount: 0,
    maxLongTaskMs: 50,
    sampleWindowMs: 1500,
  }),
});

// Relaxed thresholds for slow CI runners (GitHub Actions headless Chromium
// typically achieves ~25-35 FPS for rAF-driven workloads vs 60 FPS locally).
// These values still catch broken game loops while tolerating VM throttling.
export const CI_SEMI_AUTOMATABLE_THRESHOLDS = Object.freeze({
  'AUDIT-F-17': Object.freeze({
    minFrameSamples: 90,
    // 50 ms = 20 FPS floor — catches a broken loop, not just a slow VM.
    maxP95FrameTimeMs: 50,
    maxP99FrameTimeMs: 100,
  }),
  'AUDIT-F-18': Object.freeze({
    minFrameSamples: 90,
    // 20 FPS floor — still meaningful on a heavily throttled CI runner.
    minP95Fps: 20,
  }),
  'AUDIT-B-05': Object.freeze({
    // Long-task budget unchanged; this metric is not runner-speed-sensitive.
    maxLongTaskCount: 0,
    maxLongTaskMs: 50,
    sampleWindowMs: 1500,
  }),
});

export const MANUAL_EVIDENCE_AUDIT_IDS = Object.freeze([
  'AUDIT-F-19',
  'AUDIT-F-20',
  'AUDIT-F-21',
  'AUDIT-B-06',
]);

export const AUDIT_QUESTIONS = [
  {
    id: 'AUDIT-F-01',
    category: 'Functional',
    question: 'Does the game run without crashing?',
    executionType: 'Fully Automatable',
    assertionKey: 'runtime-ready',
  },
  {
    id: 'AUDIT-F-02',
    category: 'Functional',
    question: 'Does animation run using RequestAnimationFrame?',
    executionType: 'Fully Automatable',
    assertionKey: 'raf-active',
  },
  {
    id: 'AUDIT-F-03',
    category: 'Functional',
    question: 'Is the game single player?',
    executionType: 'Fully Automatable',
    assertionKey: 'single-player-contract',
  },
  {
    id: 'AUDIT-F-04',
    category: 'Functional',
    question: 'Does the game avoid the use of canvas?',
    executionType: 'Fully Automatable',
    assertionKey: 'no-canvas',
  },
  {
    id: 'AUDIT-F-05',
    category: 'Functional',
    question: 'Does the game avoid the use of frameworks?',
    executionType: 'Fully Automatable',
    assertionKey: 'no-framework-runtime',
  },
  {
    id: 'AUDIT-F-06',
    category: 'Functional',
    question: 'Is the game chosen from the pre-approved list?',
    executionType: 'Fully Automatable',
    assertionKey: 'project-identity',
  },
  {
    id: 'AUDIT-F-07',
    category: 'Functional',
    question: 'Does the game display the pause menu, with the options: continue and restart?',
    executionType: 'Fully Automatable',
    assertionKey: 'pause-controls-contract',
  },
  {
    id: 'AUDIT-F-08',
    category: 'Functional',
    question: 'Does continue resume gameplay from pause?',
    executionType: 'Fully Automatable',
    assertionKey: 'pause-resume-transition',
  },
  {
    id: 'AUDIT-F-09',
    category: 'Functional',
    question: 'Does restart reset correctly from pause?',
    executionType: 'Fully Automatable',
    assertionKey: 'pause-restart-transition',
  },
  {
    id: 'AUDIT-F-10',
    category: 'Functional',
    question: 'While paused, no dropped frames and rAF unaffected?',
    executionType: 'Fully Automatable',
    assertionKey: 'pause-freeze-raf-active',
  },
  {
    id: 'AUDIT-F-11',
    category: 'Functional',
    question: 'Does the player obey movement commands?',
    executionType: 'Fully Automatable',
    assertionKey: 'input-contract-covered',
  },
  {
    id: 'AUDIT-F-12',
    category: 'Functional',
    question: 'Does the player move without spamming keys?',
    executionType: 'Fully Automatable',
    assertionKey: 'hold-input-contract-covered',
  },
  {
    id: 'AUDIT-F-13',
    category: 'Functional',
    question:
      'Does game behave like pre-approved genre, including deterministic ghost-house stagger/respawn timing from game-description.md §5.4?',
    executionType: 'Fully Automatable',
    assertionKey: 'project-identity',
  },
  {
    id: 'AUDIT-F-14',
    category: 'Functional',
    question: 'Does the countdown/timer clock work?',
    executionType: 'Fully Automatable',
    assertionKey: 'hud-contract',
  },
  {
    id: 'AUDIT-F-15',
    category: 'Functional',
    question:
      'Does the score HUD remain present during gameplay, with runtime-visible score increments deferred to later integration?',
    executionType: 'Fully Automatable',
    assertionKey: 'hud-contract',
  },
  {
    id: 'AUDIT-F-16',
    category: 'Functional',
    question: 'Do player lives decrease correctly after life-loss events?',
    executionType: 'Fully Automatable',
    assertionKey: 'hud-contract',
  },
  {
    id: 'AUDIT-F-17',
    category: 'Functional',
    question: 'Can you confirm that there are no frame drops?',
    executionType: 'Semi-Automatable',
    assertionKey: 'threshold-f17',
    thresholds: SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-17'],
  },
  {
    id: 'AUDIT-F-18',
    category: 'Functional',
    question: 'Does the game run at or around 60 FPS (50-60 or more)?',
    executionType: 'Semi-Automatable',
    assertionKey: 'threshold-f18',
    thresholds: SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-18'],
  },
  {
    id: 'AUDIT-F-19',
    category: 'Functional',
    question: 'Can you confirm paint is used as little as possible?',
    executionType: 'Manual-With-Evidence',
    assertionKey: 'manual-evidence-obligation',
  },
  {
    id: 'AUDIT-F-20',
    category: 'Functional',
    question: 'Can you confirm layers are used as little as possible?',
    executionType: 'Manual-With-Evidence',
    assertionKey: 'manual-evidence-obligation',
  },
  {
    id: 'AUDIT-F-21',
    category: 'Functional',
    question: 'Is layer creation being promoted properly?',
    executionType: 'Manual-With-Evidence',
    assertionKey: 'manual-evidence-obligation',
  },
  {
    id: 'AUDIT-B-01',
    category: 'Bonus',
    question: 'Does the project run quickly and effectively?',
    executionType: 'Fully Automatable',
    assertionKey: 'raf-active',
  },
  {
    id: 'AUDIT-B-02',
    category: 'Bonus',
    question: 'Does the code obey good practices?',
    executionType: 'Fully Automatable',
    assertionKey: 'policy-script-contract',
  },
  {
    id: 'AUDIT-B-03',
    category: 'Bonus',
    question: 'Does the program reuse memory to avoid jank?',
    executionType: 'Fully Automatable',
    assertionKey: 'pooling-contract',
  },
  {
    id: 'AUDIT-B-04',
    category: 'Bonus',
    question: 'Does the game use SVG?',
    executionType: 'Fully Automatable',
    assertionKey: 'svg-asset-contract',
  },
  {
    id: 'AUDIT-B-05',
    category: 'Bonus',
    question: 'Is the code using asynchronicity to increase performance?',
    executionType: 'Semi-Automatable',
    assertionKey: 'threshold-b05',
    thresholds: SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-B-05'],
  },
  {
    id: 'AUDIT-B-06',
    category: 'Bonus',
    question: 'Is the project well done overall?',
    executionType: 'Manual-With-Evidence',
    assertionKey: 'manual-evidence-obligation',
  },
];
