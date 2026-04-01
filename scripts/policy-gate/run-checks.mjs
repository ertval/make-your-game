import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  REQUIRED_CHECKBOXES,
  REQUIRED_SECTIONS,
  escapeRegex,
  parseArgs,
  readJson,
  readLines,
  readText,
} from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const metaPath = args['meta-file'] || '.policy-pr-meta.json';
const changedPath = args['changed-file'] || 'changed-files.txt';
const allowMissingPrBody = args['allow-missing-pr-body'] === 'true';

const meta = readJson(metaPath);
const changedFiles = readLines(changedPath);

function assertPrBody() {
  const body = String(meta.body ?? '').trim();
  if (!body) {
    if (allowMissingPrBody) {
      console.warn(
        'Skipping PR body validation because body is missing and allow-missing-pr-body is true.',
      );
      return;
    }

    throw new Error(
      'Missing PR body text. Pass --pr-body-file or set PR_BODY for local validation.',
    );
  }

  const missingSections = REQUIRED_SECTIONS.filter((section) => {
    const pattern = new RegExp(`^##\\s+${escapeRegex(section)}`, 'im');
    return !pattern.test(body);
  });

  if (missingSections.length) {
    throw new Error(`Missing required PR sections: ${missingSections.join(', ')}`);
  }

  const missingChecks = REQUIRED_CHECKBOXES.filter((label) => {
    const pattern = new RegExp(`^\\s*- \\[[xX]\\]\\s+${escapeRegex(label)}\\s*$`, 'im');
    return !pattern.test(body);
  });

  if (missingChecks.length) {
    throw new Error(`Missing required PR checklist items: ${missingChecks.join(', ')}`);
  }
}

function enforceAuditAndDependencyPairing() {
  const changed = new Set(changedFiles);
  const touchesPrefix = (prefix) => changedFiles.some((file) => file.startsWith(prefix));
  const has = (file) => changed.has(file);

  const packageJsonChanged = has('package.json');
  const packageLockChanged = has('package-lock.json');
  if (packageJsonChanged !== packageLockChanged) {
    throw new Error('package.json and package-lock.json must change together.');
  }

  const touchesAuditDocs = has('docs/audit.md');
  const touchesRequirements = has('docs/requirements.md');
  const touchesGameDescription = has('docs/game-description.md');
  const touchesTraceability = has('docs/implementation/audit-traceability-matrix.md');
  const touchesAuditTests = touchesPrefix('tests/e2e/audit/');

  if (touchesAuditDocs || touchesRequirements || touchesGameDescription || touchesAuditTests) {
    const required = [];
    if (!touchesTraceability) required.push('docs/implementation/audit-traceability-matrix.md');
    if (!touchesAuditTests) required.push('tests/e2e/audit/');
    if (
      (touchesAuditDocs || touchesRequirements || touchesGameDescription) &&
      !has('docs/audit.md')
    ) {
      required.push('docs/audit.md');
    }
    if (required.length) {
      throw new Error(
        `Audit-related changes must update the following paths in the same PR: ${required.join(', ')}`,
      );
    }
  }

  const auditDoc = readText('docs/audit.md');
  const auditMap = readText('tests/e2e/audit/audit-question-map.js');

  const auditCount = (auditDoc.match(/^######\s+/gm) || []).length;
  const idMatches = auditMap.match(/id:\s*'AUDIT-[A-Z]-\d{2}'/g) || [];
  const auditIds = idMatches.length;
  const uniqueAuditIds = new Set(idMatches).size;

  if (auditCount !== auditIds || auditIds !== uniqueAuditIds) {
    throw new Error(
      `Audit inventory mismatch: docs/audit.md has ${auditCount} questions, audit map has ${auditIds} IDs, unique IDs ${uniqueAuditIds}.`,
    );
  }
}

function scanSecurityAndArchitectureBoundaries() {
  const sourcePattern = /\.(js|mjs|cjs|ts|tsx|jsx|html)$/;
  const unsafeSinks = [
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /\binsertAdjacentHTML\b/,
    /\bdocument\.write\b/,
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\brequire\s*\(/,
    /\bvar\b/,
    /\bXMLHttpRequest\b/,
    /setTimeout\s*\(\s*['\"]/,
    /setInterval\s*\(\s*['\"]/,
    /<\s*canvas\b/i,
    /createElement\s*\(\s*['\"]canvas['\"]\s*\)/i,
  ];

  const frameworkImports = [
    /from\s+['\"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['\"]/,
    /require\s*\(\s*['\"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['\"]\s*\)/,
  ];

  const domAPIs = [
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
  ];

  for (const file of changedFiles) {
    if (!sourcePattern.test(file)) {
      continue;
    }

    if (!fs.existsSync(file)) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const normalizedPath = file.replaceAll('\\\\', '/');
    const isSystemFile = normalizedPath.startsWith('src/ecs/systems/');
    const isRenderSystem = normalizedPath === 'src/ecs/systems/render-dom-system.js';

    for (const pattern of unsafeSinks) {
      if (pattern.test(content)) {
        throw new Error(`Unsafe sink or forbidden API found in ${file}: ${pattern}`);
      }
    }

    for (const pattern of frameworkImports) {
      if (pattern.test(content)) {
        throw new Error(`Framework or CommonJS import found in ${file}: ${pattern}`);
      }
    }

    if (isSystemFile && !isRenderSystem) {
      for (const pattern of domAPIs) {
        if (pattern.test(content)) {
          throw new Error(`DOM boundary violation in ECS system file ${file}: ${pattern}`);
        }
      }
    }

    if (path.basename(file) === 'package.json') {
      const packageJson = JSON.parse(content);
      const deps = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
      };
      for (const banned of [
        'react',
        'vue',
        'angular',
        'svelte',
        'phaser',
        'pixi.js',
        'three',
        'jquery',
      ]) {
        if (deps[banned]) {
          throw new Error(`Banned framework dependency detected in package.json: ${banned}`);
        }
      }
    }
  }
}

assertPrBody();
enforceAuditAndDependencyPairing();
scanSecurityAndArchitectureBoundaries();

console.log('Policy checks completed successfully.');
