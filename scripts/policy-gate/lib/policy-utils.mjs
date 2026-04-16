/*
 * Module: policy-utils.mjs
 * Purpose: Provides shared utilities and policy metadata for policy-gate scripts.
 * Public API: Exports ticket parsing helpers, ownership rules, filesystem helpers, and process-mode resolution used by all gate scripts.
 * Implementation Notes: Utilities are synchronous and deterministic to keep local and CI policy outcomes consistent.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Checklist sections must stay in sync with docs/implementation/pr-template.md contract enforcement.
export const REQUIRED_SECTIONS = [
  'Layer boundary confirmation',
  'What changed',
  'Why',
  'Tests',
  'Audit questions affected',
  'Security notes',
  'Architecture / dependency notes',
  'Risks',
];

export const REQUIRED_CHECKBOXES = [
  'I read AGENTS.md and the agentic workflow guide',
  'I ran `npm run policy` locally',
  'I verified my branch name follows <owner-or-scope>/<TRACK>-<NN>[-<COMMENT>] (for example ekaramet/A-03 or asmyrogl/B-03-runtime-integration), or I marked the PR body with process for a GENERAL_DOCS_PROCESS branch',
  'I confirmed changed files stay within the declared ticket track ownership scope',
  'I ran the applicable local checks',
  'I listed the audit IDs affected by this change',
  'I checked security sinks and trust boundaries',
  'I checked dependency and lockfile impact',
  'I requested human review',
];

export const REQUIRED_LAYER_CHECKBOXES = [
  '`src/ecs/systems/` has no DOM references except `render-dom-system.js`',
  'Simulation systems access adapters only through World resources (no direct adapter imports)',
  '`src/adapters/` owns DOM and browser I/O side effects',
  'Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection',
  'No framework imports or canvas APIs were introduced in this change',
];

// Generated changed-file context is written under a policy runtime folder to avoid repo-root artifact drift.
export const DEFAULT_CHANGED_FILES_PATH = '.policy-runtime/changed-files.txt';

// Security policy scanning uses a shared source-file extension set to keep changed/repo checks aligned.
export const SECURITY_SOURCE_PATTERN = /\.(js|mjs|cjs|ts|tsx|jsx|html)$/;

// Framework dependencies are forbidden because the project is constrained to Vanilla DOM + ECS.
export const BANNED_FRAMEWORK_DEPENDENCIES = Object.freeze([
  'react',
  'vue',
  'angular',
  'svelte',
  'phaser',
  'pixi.js',
  'three',
  'jquery',
]);

// Canonical forbidden-technology rules reused by changed-file and repo-wide scans.
export const FORBIDDEN_TECH_RULES = Object.freeze([
  { name: 'canvas element', pattern: /<\s*canvas\b/i },
  { name: 'canvas createElement', pattern: /createElement\s*\(\s*['"]canvas['"]\s*\)/i },
  {
    name: 'framework import',
    pattern: /from\s+['"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['"]/,
  },
  {
    name: 'framework require',
    pattern:
      /require\s*\(\s*['"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['"]\s*\)/,
  },
]);

// Unsafe sinks and dynamic execution APIs are banned for secure DOM boundaries.
export const SECURITY_SINK_RULES = Object.freeze([
  { name: 'innerHTML sink', pattern: /\.\s*innerHTML\s*=/ },
  { name: 'outerHTML sink', pattern: /\.\s*outerHTML\s*=/ },
  { name: 'insertAdjacentHTML sink', pattern: /\.\s*insertAdjacentHTML\s*\(/ },
  { name: 'document.write sink', pattern: /\bdocument\.write\s*\(/ },
  { name: 'eval call', pattern: /\beval\s*\(/ },
  { name: 'Function constructor', pattern: /\bnew\s+Function\s*\(/ },
  { name: 'CommonJS require', pattern: /\brequire\s*\(/ },
  { name: 'var declaration', pattern: /^\s*var\s+[A-Za-z_$][\w$]*/m },
  { name: 'XMLHttpRequest API', pattern: /\bnew\s+XMLHttpRequest\s*\(/ },
  { name: 'string setTimeout', pattern: /setTimeout\s*\(\s*['"]/ },
  { name: 'string setInterval', pattern: /setInterval\s*\(\s*['"]/ },
]);

// DOM APIs are blocked in simulation systems; only the render DOM system can use them.
export const ECS_DOM_API_RULES = Object.freeze([
  /\bdocument\./,
  /\bwindow\./,
  /\bquerySelector(All)?\b/,
  /\bcreateElement(NS)?\b/,
  /\bappendChild\b/,
  /\binsertBefore\b/,
  /\baddEventListener\b/,
  /\binnerHTML\b/,
  /\bouterHTML\b/,
  /\binsertAdjacentHTML\b/,
]);

// Policy scans ignore generated and dependency folders to keep repository checks deterministic and fast.
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);

export const TICKET_ID_PATTERN = /\b([ABCD]-\d{2})\b/gi;
export const EXPLICIT_TICKET_BRANCH_PATTERN =
  /^[A-Za-z0-9._-]+\/([ABCD]-\d{2})(?:-[A-Za-z0-9._-]+)?$/;

// Owner-to-track mapping enforces that each developer only modifies files in their assigned track.
// This prevents cross-track edits when a branch owner's ticket belongs to a different track.
export const OWNER_TRACK_MAPPING = {
  ekaramet: 'A',
  asmyrogl: 'B',
  chbaikas: 'C',
  medvall: 'D',
};

/**
 * Extract the owner (username) from a branch name.
 * Branch format: <owner>/<TRACK>-<NN>[-<COMMENT>], e.g. "ekaramet/A-03" or "asmyrogl/B-03-runtime-integration"
 * @param {string} branchName — The full branch name.
 * @returns {string} The owner string, or empty string if not parseable.
 */
export function extractOwnerFromBranch(branchName) {
  const normalized = String(branchName || '').trim();
  const slashIndex = normalized.indexOf('/');
  if (slashIndex <= 0) {
    return '';
  }
  return normalized.slice(0, slashIndex);
}

/**
 * Resolve the mapped track for a branch owner, if one exists.
 *
 * @param {string} branchName — The full branch name (e.g. "ekaramet/A-03").
 * @returns {string} The mapped track code (A/B/C/D) or empty string when not mapped.
 */
export function resolveOwnerTrackFromBranch(branchName) {
  const owner = extractOwnerFromBranch(branchName);
  if (!owner) {
    return '';
  }

  return OWNER_TRACK_MAPPING[owner.toLowerCase()] || '';
}

/**
 * Return all owners registered for a track code.
 *
 * @param {string} trackCode — Target track code.
 * @returns {string[]} Sorted owner usernames.
 */
export function getOwnersForTrack(trackCode) {
  const normalizedTrackCode = String(trackCode || '')
    .trim()
    .toUpperCase();
  if (!normalizedTrackCode) {
    return [];
  }

  return Object.entries(OWNER_TRACK_MAPPING)
    .filter(([, mappedTrack]) => mappedTrack === normalizedTrackCode)
    .map(([owner]) => owner)
    .sort();
}

/**
 * Validate that the branch owner's assigned track matches the ticket's track.
 * Throws if the owner is mapped to a different track than the ticket specifies.
 *
 * @param {string} trackCode — The resolved track code from ticket IDs (e.g. 'A', 'B', 'C', 'D').
 * @param {string} branchName — The full branch name (e.g. "ekaramet/A-03").
 * @throws {Error} If owner-track mismatch detected.
 */
export function assertOwnerTrackMatch(trackCode, branchName) {
  const owner = extractOwnerFromBranch(branchName);
  if (!owner) {
    // Cannot extract owner — skip validation (may be a shared or CI branch).
    return;
  }

  const ownerTrack = OWNER_TRACK_MAPPING[owner.toLowerCase()];
  if (!ownerTrack) {
    // Owner not in mapping — skip validation (new dev or unregistered owner).
    return;
  }

  const normalizedTrackCode = String(trackCode || '')
    .trim()
    .toUpperCase();
  if (ownerTrack !== normalizedTrackCode) {
    throw new Error(
      [
        `Owner-track mismatch: branch owner "${owner}" is assigned to Track ${ownerTrack},`,
        `but the ticket resolves to Track ${normalizedTrackCode}.`,
        `Action: Use a ticket from Track ${ownerTrack} on this branch, or use a branch owned by Track ${normalizedTrackCode}'s assigned owner.`,
      ].join('\n'),
    );
  }
}

// Shared ownership paths are allowed across tracks to avoid false positives on governance/docs changes.
export const SHARED_OWNERSHIP_PATTERNS = [
  '.gitignore',
  '.qwen/**',
  'AGENTS.md',
  'README.md',
  'LICENSE',
  '.github/**',
  'docs/**',
  'styles/base.css',
  'package-lock.json',
  '**/.gitkeep',
];

// Track ownership is dual-layer for tests:
// - Track A has global QA ownership over tests/**.
// - Tracks B/C/D own scoped tests that validate their owned implementation files.
export const TRACK_OWNERSHIP_RULES = {
  A: {
    name: 'Track A (Engine/CI/Testing)',
    patterns: [
      'package.json',
      'LICENSE',
      'assets/generated/alternatives/**',
      'assets/generated/sprites/**',
      'assets/generated/ui/**',
      'assets/generated/visuals/**',
      'assets/source/visual/**',
      'assets/maps/**',
      'assets/manifests/visual-manifest.json',
      'docs/schemas/map.schema.json',
      'docs/schemas/visual-manifest.schema.json',
      'index.html',
      'vite.config.js',
      'vitest.config.js',
      'playwright.config.js',
      'biome.json',
      'scripts/**',
      'src/main.js',
      'src/main.ecs.js',
      'src/shared/**',
      'src/game/**',
      'src/debug/**',
      'src/ecs/resources/**',
      'src/ecs/world/**',
      'src/ecs/systems/input-system.js',
      'src/ecs/components/registry.js',
      'tests/**',
    ],
  },
  B: {
    name: 'Track B (Simulation Gameplay Systems)',
    patterns: [
      'src/ecs/components/registry.js',
      'src/ecs/components/spatial.js',
      'src/ecs/components/actors.js',
      'src/ecs/components/props.js',
      'src/ecs/components/stats.js',
      'src/ecs/components/visual.js',
      'src/adapters/io/input-adapter.js',
      'src/ecs/systems/input-system.js',
      'src/ecs/systems/player-move-*.js',
      'src/ecs/systems/collision-*.js',
      'src/ecs/systems/bomb-*.js',
      'src/ecs/systems/explosion-*.js',
      'src/ecs/systems/power-up-*.js',
      'src/ecs/systems/ghost-ai-*.js',
    ],
    testPatterns: [
      'tests/unit/components/registry.test.js',
      'tests/unit/components/spatial.test.js',
      'tests/unit/components/actors.test.js',
      'tests/unit/components/props.test.js',
      'tests/unit/components/stats.test.js',
      'tests/unit/components/visual.test.js',
      'tests/unit/systems/input-system.test.js',
      'tests/unit/systems/player-*.test.js',
      'tests/unit/systems/collision-*.test.js',
      'tests/unit/systems/bomb-*.test.js',
      'tests/unit/systems/explosion-*.test.js',
      'tests/unit/systems/power-up-*.test.js',
      'tests/unit/systems/ghost-ai-*.test.js',
      'tests/integration/adapters/input-adapter.test.js',
      'tests/integration/gameplay/b-*.test.js',
    ],
  },
  C: {
    name: 'Track C (Gameplay Feedback + Audio)',
    patterns: [
      'src/ecs/systems/scoring-*.js',
      'src/ecs/systems/timer-*.js',
      'src/ecs/systems/life-*.js',
      'src/ecs/systems/spawn-*.js',
      'src/ecs/systems/pause-*.js',
      'src/ecs/systems/level-progress-*.js',
      'src/adapters/dom/hud-*.js',
      'src/adapters/dom/screens-*.js',
      'src/adapters/io/storage-*.js',
      'src/adapters/io/audio-*.js',
      'src/adapters/dom/index.js',
      'assets/generated/sfx/**',
      'assets/generated/music/**',
      'assets/source/audio/**',
      'assets/manifests/audio-manifest.json',
      'docs/schemas/audio-manifest.schema.json',
    ],
    testPatterns: [
      'tests/unit/systems/scoring-*.test.js',
      'tests/unit/systems/timer-*.test.js',
      'tests/unit/systems/life-*.test.js',
      'tests/unit/systems/spawn-*.test.js',
      'tests/unit/systems/pause-*.test.js',
      'tests/unit/systems/level-progress-*.test.js',
      'tests/integration/adapters/hud-*.test.js',
      'tests/integration/adapters/screens-*.test.js',
      'tests/integration/adapters/storage-*.test.js',
      'tests/integration/adapters/audio-*.test.js',
      'tests/integration/gameplay/c-*.test.js',
      'tests/e2e/c-*.spec.js',
    ],
  },
  D: {
    name: 'Track D (Resources/Rendering/Visual)',
    patterns: [
      'src/ecs/resources/**',
      'src/ecs/components/visual.js',
      'src/ecs/render-intent.js',
      'src/ecs/systems/render-*.js',
      'src/adapters/dom/renderer-*.js',
      'src/adapters/dom/sprite-pool-*.js',
      'styles/**',
      'assets/maps/**',
      'assets/generated/sprites/**',
      'assets/generated/ui/**',
      'assets/generated/visuals/**',
      'assets/source/visual/**',
      'assets/manifests/visual-manifest.json',
      'docs/schemas/map.schema.json',
      'docs/schemas/visual-manifest.schema.json',
    ],
    testPatterns: [
      'tests/unit/resources/**',
      'tests/unit/schema/map-schema.test.js',
      'tests/unit/components/visual.test.js',
      'tests/unit/render-intent/render-intent.test.js',
      'tests/unit/systems/render-*.test.js',
      'tests/integration/adapters/renderer-*.test.js',
      'tests/integration/adapters/sprite-pool-*.test.js',
      'tests/integration/gameplay/d-*.test.js',
    ],
  },
};

// Argument parsing intentionally supports both --key=value and --key value forms for CI shell portability.
export function parseArgs(argv) {
  const args = {};
  // Walk tokens sequentially so both --key=value and --key value formats are supported.
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const eqIndex = token.indexOf('=');
    if (eqIndex > 0) {
      args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

export function toBool(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  // Normalize string inputs to a canonical lowercase form before comparison.
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, data) {
  const dirPath = path.dirname(filePath);
  if (dirPath && dirPath !== '.') {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function writeLines(filePath, lines) {
  const dirPath = path.dirname(filePath);
  if (dirPath && dirPath !== '.') {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

export function readLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getEventPath(args) {
  return args['event-path'] || process.env.EVENT_PATH || process.env.GITHUB_EVENT_PATH || '';
}

export function normalizePolicyPath(filePath) {
  return String(filePath || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
}

export function sortTicketIds(ticketIds) {
  return [...new Set(ticketIds)]
    .map((id) => String(id).toUpperCase())
    .sort((left, right) => {
      const leftTrack = left[0] || '';
      const rightTrack = right[0] || '';
      if (leftTrack !== rightTrack) {
        return leftTrack.localeCompare(rightTrack);
      }

      const leftNumber = Number(left.split('-')[1] || 0);
      const rightNumber = Number(right.split('-')[1] || 0);
      return leftNumber - rightNumber;
    });
}

// Ticket extraction is case-insensitive, then canonicalized to uppercase for stable comparisons.
export function extractTicketIds(text) {
  const found = [];
  if (!text) {
    return found;
  }

  // Use a global regex match to capture every ticket ID occurrence in the text.
  for (const match of String(text).matchAll(TICKET_ID_PATTERN)) {
    found.push(String(match[1]).toUpperCase());
  }

  return sortTicketIds(found);
}

export function inferTicketIdsFromSources(...sources) {
  const all = [];
  for (const source of sources) {
    all.push(...extractTicketIds(source));
  }
  return sortTicketIds(all);
}

export function extractTicketIdFromBranchName(branchName) {
  const match = String(branchName || '')
    .trim()
    .match(EXPLICIT_TICKET_BRANCH_PATTERN);
  return match ? String(match[1]).toUpperCase() : '';
}

export function inferTracksFromTicketIds(ticketIds) {
  const tracks = new Set();
  for (const ticketId of ticketIds || []) {
    const normalized = String(ticketId || '')
      .trim()
      .toUpperCase();
    if (!normalized) {
      continue;
    }
    const [trackCode] = normalized.split('-');
    if (TRACK_OWNERSHIP_RULES[trackCode]) {
      tracks.add(trackCode);
    }
  }
  return [...tracks].sort();
}

// Process mode is an explicit fallback and should only activate when a clear "process" marker exists.
export function inferProcessModeFromSources(...sources) {
  return sources.some((source) => /\bprocess\b/i.test(String(source || '')));
}

/**
 * Resolve whether PR-local checks should run, or if we must fallback to repo-wide checks.
 *
 * Rationale:
 * - Process-marker branches still require `policy:checks` so process-scope violations are caught.
 * - Repo fallback is only valid when there is neither ticket metadata nor process marker context.
 *
 * @param {object} options
 * @param {string[]} [options.branchTicketIds=[]] — Ticket IDs inferred from branch name.
 * @param {string[]} [options.commitTicketIds=[]] — Ticket IDs inferred from branch commits.
 * @param {boolean} [options.hasProcessMode=false] — Whether process marker context is active.
 * @returns {{hasPrMetadata: boolean, shouldRunPrChecks: boolean, auditMode: string, selectedPath: string}}
 */
export function resolvePrPolicyPath({
  branchTicketIds = [],
  commitTicketIds = [],
  hasProcessMode = false,
} = {}) {
  const hasPrMetadata = branchTicketIds.length > 0 || commitTicketIds.length > 0;
  const shouldRunPrChecks = hasPrMetadata || hasProcessMode;

  if (shouldRunPrChecks) {
    return {
      hasPrMetadata,
      shouldRunPrChecks,
      auditMode: hasProcessMode ? 'GENERAL_DOCS_PROCESS' : 'TICKET',
      selectedPath: hasProcessMode ? 'owner-scoped process checks' : 'PR ticket checks',
    };
  }

  return {
    hasPrMetadata,
    shouldRunPrChecks,
    auditMode: 'REPO_FALLBACK',
    selectedPath: 'repo-wide fallback from missing ticket metadata',
  };
}

// Visual markers make gate outcomes typographically scannable in CI and local logs.
export const GATE_PASS = '✅ PASS';
export const GATE_FAIL = '❌ FAIL';
export const GATE_WARN = '⚠️  WARN';

export function describePolicyResolution({
  auditMode,
  branchTicketIds = [],
  commitTicketIds = [],
  owner = '',
  ownerTrack = '',
  processMarkerDetected = false,
  selectedPath = '',
  ticketIds = [],
  trackCode = 'GENERAL',
} = {}) {
  const normalizedTicketIds = sortTicketIds(ticketIds);
  const normalizedBranchTicketIds = sortTicketIds(branchTicketIds);
  const normalizedCommitTicketIds = sortTicketIds(commitTicketIds);

  return [
    'Policy checks resolved',
    `mode=${auditMode || (normalizedTicketIds.length > 0 ? 'TICKET' : 'GENERAL_DOCS_PROCESS')}`,
    `path=${selectedPath || (normalizedTicketIds.length > 0 ? 'ticketed checks' : 'fallback checks')}`,
    `track=${trackCode || 'GENERAL'}`,
    `tickets=${normalizedTicketIds.length > 0 ? normalizedTicketIds.join(', ') : '(none)'}`,
    `branchTickets=${normalizedBranchTicketIds.length > 0 ? normalizedBranchTicketIds.join(', ') : '(none)'}`,
    `commitTickets=${normalizedCommitTicketIds.length > 0 ? normalizedCommitTicketIds.join(', ') : '(none)'}`,
    `branchOwner=${owner || '(none)'}`,
    `ownerTrack=${ownerTrack || '(none)'}`,
    `processMarker=${processMarkerDetected ? 'true' : 'false'}`,
  ].join('; ');
}

export function readTicketIdsFromTracker(trackerPath = 'docs/implementation/ticket-tracker.md') {
  if (!fs.existsSync(trackerPath)) {
    return [];
  }

  const content = readText(trackerPath);
  const ids = [];
  for (const match of content.matchAll(/\*\*([ABCD]-\d{2})\*\*/g)) {
    ids.push(String(match[1]).toUpperCase());
  }

  if (ids.length > 0) {
    return sortTicketIds(ids);
  }

  return extractTicketIds(content);
}

function globToRegExp(pattern) {
  // Normalize path separators so glob matching works on Windows and Unix.
  const normalized = normalizePolicyPath(pattern);
  const escaped = escapeRegex(normalized)
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

export function pathMatchesPattern(filePath, pattern) {
  // Test a single file path against a glob-style pattern.
  return globToRegExp(pattern).test(normalizePolicyPath(filePath));
}

export function matchesOwnership(filePath, patterns) {
  // A file matches ownership if it satisfies any single ownership pattern.
  return patterns.some((pattern) => pathMatchesPattern(filePath, pattern));
}

export function findOwnershipViolations(trackCode, files) {
  // Resolve the track rules, then collect every file that falls outside the allowed patterns.
  const normalizedTrack = String(trackCode || '')
    .trim()
    .toUpperCase();
  const rule = TRACK_OWNERSHIP_RULES[normalizedTrack];
  if (!rule) {
    return {
      trackCode: normalizedTrack,
      trackName: '',
      allowedPatterns: [],
      violations: [...files],
    };
  }

  const allowedPatterns = [
    ...SHARED_OWNERSHIP_PATTERNS,
    ...(rule.patterns || []),
    ...(rule.testPatterns || []),
  ];
  const violations = (files || [])
    .map((file) => normalizePolicyPath(file))
    .filter(Boolean)
    .filter((file) => !matchesOwnership(file, allowedPatterns));

  return {
    trackCode: normalizedTrack,
    trackName: rule.name,
    allowedPatterns,
    violations,
  };
}

export function runCommand(command, commandArgs, options = {}) {
  // Use spawnSync for deterministic local command execution with captured output.
  const isWindowsNpm = process.platform === 'win32' && command === 'npm';

  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || process.cwd(),
    stdio: options.stdio || 'pipe',
    encoding: 'utf8',
    env: options.env || process.env,
    shell: isWindowsNpm,
  });

  if (result.status !== 0) {
    const spawnError = result.error ? String(result.error.message || result.error) : '';
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    const exitStatus = Number.isInteger(result.status) ? String(result.status) : '';
    const inheritedOutputHint =
      options.stdio === 'inherit' ? 'Command output was streamed above (stdio=inherit).' : '';
    const detail = spawnError || stderr || stdout || inheritedOutputHint || 'No output';
    throw new Error(
      [
        `Command execution failed: ${command} ${commandArgs.join(' ')}`,
        `Details: ${detail}`,
        `Exit status: ${exitStatus || 'unknown'}`,
        'Action: Review the command details above to determine the cause of the failure.',
      ].join('\n'),
    );
  }

  return result.stdout || '';
}

export function commandSucceeded(command, commandArgs) {
  // Run a command with output suppressed to test exit status only.
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: false,
  });

  return result.status === 0;
}

export function getCurrentBranchName() {
  const fromEnv = process.env.GITHUB_HEAD_REF || process.env.HEAD_REF || '';
  if (fromEnv) {
    return String(fromEnv).trim();
  }

  if (!commandSucceeded('git', ['rev-parse', '--verify', 'HEAD'])) {
    return '';
  }

  return runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
}

function expandBaseRefCandidate(candidate) {
  const normalized = String(candidate || '')
    .trim()
    .replace(/^refs\/heads\//, '');
  if (!normalized) {
    return [];
  }
  if (normalized.startsWith('origin/')) {
    return [normalized];
  }
  return [`origin/${normalized}`, normalized];
}

export function resolveBaseRef(preferredBaseRef = '') {
  const candidates = [];
  const seen = new Set();

  const addCandidates = (value) => {
    for (const candidate of expandBaseRefCandidate(value)) {
      if (seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      candidates.push(candidate);
    }
  };

  addCandidates(preferredBaseRef);
  addCandidates(process.env.BASE_REF || process.env.GITHUB_BASE_REF || '');

  if (commandSucceeded('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'])) {
    const symbolic = runCommand('git', ['symbolic-ref', 'refs/remotes/origin/HEAD']).trim();
    addCandidates(symbolic.replace('refs/remotes/', ''));
  }

  addCandidates('origin/main');
  addCandidates('main');
  addCandidates('origin/master');
  addCandidates('master');

  for (const candidate of candidates) {
    if (commandSucceeded('git', ['rev-parse', '--verify', `${candidate}^{commit}`])) {
      return candidate;
    }
  }

  return '';
}

export function getMergeBase(baseRef, headRef = 'HEAD') {
  if (!baseRef) {
    return '';
  }
  if (!commandSucceeded('git', ['rev-parse', '--verify', `${headRef}^{commit}`])) {
    return '';
  }
  if (!commandSucceeded('git', ['merge-base', baseRef, headRef])) {
    return '';
  }
  return runCommand('git', ['merge-base', baseRef, headRef]).trim();
}

export function collectBranchCommitMessages(options = {}) {
  const headRef = options.headRef || 'HEAD';
  const baseRef = options.baseRef || '';
  const mergeBase = options.mergeBase || getMergeBase(baseRef, headRef);

  if (!commandSucceeded('git', ['rev-parse', '--verify', `${headRef}^{commit}`])) {
    return '';
  }

  if (mergeBase) {
    return runCommand('git', [
      'log',
      '--first-parent',
      '--format=%s%n%b',
      `${mergeBase}..${headRef}`,
    ]).trim();
  }

  return runCommand('git', [
    'log',
    '--first-parent',
    '--format=%s%n%b',
    '-n',
    '30',
    headRef,
  ]).trim();
}

export function collectChangedFiles(baseSha, headSha, options = {}) {
  let output = '';
  const headRef = options.headRef || 'HEAD';
  const resolvedBaseRef = resolveBaseRef(options.baseRef || '');
  const mergeBase = getMergeBase(resolvedBaseRef, headRef);

  if (baseSha && headSha) {
    output = runCommand('git', ['diff', '--name-only', baseSha, headSha]);
  } else if (mergeBase) {
    output = runCommand('git', ['diff', '--name-only', mergeBase, headRef]);
  } else if (commandSucceeded('git', ['rev-parse', '--verify', `${headRef}^{commit}`])) {
    if (commandSucceeded('git', ['rev-parse', '--verify', `${headRef}~1`])) {
      output = runCommand('git', ['diff', '--name-only', `${headRef}~1`, headRef]);
    } else {
      output = runCommand('git', ['show', '--pretty=format:', '--name-only', headRef]);
    }
  } else {
    output = runCommand('git', ['ls-files']);
  }

  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ].sort();
}

export function walkFiles(rootDir, predicate) {
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(rootDir, absolute).replaceAll('\\', '/');

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(absolute);
        }
        continue;
      }

      if (!predicate || predicate(relative)) {
        files.push(relative);
      }
    }
  }

  walk(rootDir);
  return files.sort();
}
