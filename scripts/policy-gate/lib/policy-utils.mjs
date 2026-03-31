import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const REQUIRED_SECTIONS = [
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
  'I ran the applicable local checks',
  'I listed the audit IDs affected by this change',
  'I checked security sinks and trust boundaries',
  'I checked architecture boundaries',
  'I checked dependency and lockfile impact',
  'I ran `npm run pr:gate -- --pr-body-file <path-to-pr-message>`',
  'I requested human review',
];

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);

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

export function collectChangedFiles(baseSha, headSha) {
  let output = '';

  if (baseSha && headSha) {
    output = runCommand('git', ['diff', '--name-only', baseSha, headSha]);
  } else if (commandSucceeded('git', ['rev-parse', '--verify', 'HEAD'])) {
    output = runCommand('git', ['diff', '--name-only', 'HEAD']);
    if (!output.trim() && commandSucceeded('git', ['rev-parse', '--verify', 'HEAD~1'])) {
      output = runCommand('git', ['diff', '--name-only', 'HEAD~1', 'HEAD']);
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
      const relative = path.relative(rootDir, absolute).replaceAll('\\\\', '/');

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
