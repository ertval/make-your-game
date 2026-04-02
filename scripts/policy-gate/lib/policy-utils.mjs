import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
  'I verified my branch commits reference at least one ticket ID from docs/implementation/ticket-tracker.md',
  'I confirmed changed files stay within the declared ticket track ownership scope',
  'I ran the applicable local checks',
  'I listed the audit IDs affected by this change',
  'I checked security sinks and trust boundaries',
  'I checked architecture boundaries',
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

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);

export const TICKET_ID_PATTERN = /\b([ABCD]-\d{2})\b/gi;

export const SHARED_OWNERSHIP_PATTERNS = [
  'AGENTS.md',
  'README.md',
  '.github/**',
  '.gitea/**',
  'docs/**',
  'package-lock.json',
  '**/.gitkeep',
];

export const TRACK_OWNERSHIP_RULES = {
  A: {
    name: 'Track A (Engine/CI/Testing)',
    patterns: [
      'package.json',
      'index.html',
      'vite.config.js',
      'vitest.config.js',
      'playwright.config.js',
      'biome.json',
      'scripts/**',
      'src/main.ecs.js',
      'src/game/**',
      'src/debug/**',
      'src/ecs/world/**',
      'tests/**',
    ],
  },
  B: {
    name: 'Track B (Simulation Gameplay Systems)',
    patterns: [
      'src/ecs/components/**',
      'src/adapters/io/input-adapter.js',
      'src/ecs/systems/input-system.js',
      'src/ecs/systems/player-move-system.js',
      'src/ecs/systems/collision-system.js',
      'src/ecs/systems/bomb-tick-system.js',
      'src/ecs/systems/explosion-system.js',
      'src/ecs/systems/power-up-system.js',
      'src/ecs/systems/ghost-ai-system.js',
    ],
  },
  C: {
    name: 'Track C (Gameplay Feedback + Audio)',
    patterns: [
      'src/ecs/systems/scoring-system.js',
      'src/ecs/systems/timer-system.js',
      'src/ecs/systems/life-system.js',
      'src/ecs/systems/spawn-system.js',
      'src/ecs/systems/pause-system.js',
      'src/ecs/systems/level-progress-system.js',
      'src/adapters/dom/hud-adapter.js',
      'src/adapters/dom/screens-adapter.js',
      'src/adapters/io/storage-adapter.js',
      'src/adapters/io/audio-adapter.js',
      'assets/generated/sfx/**',
      'assets/generated/music/**',
      'assets/source/audio/**',
      'assets/manifests/audio-manifest.json',
      'docs/schemas/audio-manifest.schema.json',
    ],
  },
  D: {
    name: 'Track D (Resources/Rendering/Visual)',
    patterns: [
      'src/ecs/resources/**',
      'src/ecs/components/visual.js',
      'src/ecs/systems/render-collect-system.js',
      'src/ecs/systems/render-dom-system.js',
      'src/adapters/dom/renderer-adapter.js',
      'src/adapters/dom/sprite-pool-adapter.js',
      'styles/**',
      'assets/maps/**',
      'assets/generated/sprites/**',
      'assets/generated/ui/**',
      'assets/source/visual/**',
      'assets/manifests/visual-manifest.json',
      'docs/schemas/map.schema.json',
      'docs/schemas/visual-manifest.schema.json',
    ],
  },
};

export function parseArgs(argv) {
  const args = {};
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
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function writeLines(filePath, lines) {
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

export function extractTicketIds(text) {
  const found = [];
  if (!text) {
    return found;
  }

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
  const normalized = normalizePolicyPath(pattern);
  const escaped = escapeRegex(normalized)
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

export function pathMatchesPattern(filePath, pattern) {
  return globToRegExp(pattern).test(normalizePolicyPath(filePath));
}

export function matchesOwnership(filePath, patterns) {
  return patterns.some((pattern) => pathMatchesPattern(filePath, pattern));
}

export function findOwnershipViolations(trackCode, files) {
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

  const allowedPatterns = [...SHARED_OWNERSHIP_PATTERNS, ...rule.patterns];
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
    const detail = spawnError || stderr || stdout;
    throw new Error(`${command} ${commandArgs.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }

  return result.stdout || '';
}

export function commandSucceeded(command, commandArgs) {
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
    return runCommand('git', ['log', '--format=%s%n%b', `${mergeBase}..${headRef}`]).trim();
  }

  return runCommand('git', ['log', '--format=%s%n%b', '-n', '30', headRef]).trim();
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
