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
const checkSet = args['check-set'] || 'pr';
const validCheckSets = new Set(['pr', 'repo', 'all']);
if (!validCheckSets.has(checkSet)) {
  throw new Error(`Invalid --check-set value "${checkSet}". Expected one of: pr, repo, all.`);
}

const meta = fs.existsSync(metaPath) ? readJson(metaPath) : {};
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
    const pattern = new RegExp(`^\\s*- \\[xX\\]\\s+${escapeRegex(label)}\\s*$`, 'im');
    return !pattern.test(body);
  });

  if (missingChecks.length) {
    throw new Error(`Missing required PR checklist items: ${missingChecks.join(', ')}`);
  }
}

function buildIdRange(prefix, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || end < start) {
    throw new Error(`Invalid ID range for ${prefix}: ${start}..${end}`);
  }

  return Array.from({ length: end - start + 1 }, (_, offset) => {
    return `${prefix}-${String(start + offset).padStart(2, '0')}`;
  });
}

function collectUniqueMatches(text, pattern) {
  return [...new Set(text.match(pattern) || [])].sort();
}

function collectExpectedRequirementIds(requirementsText, matrixText) {
  const explicitIds = collectUniqueMatches(requirementsText, /REQ-\d{2}/g);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  const explicitRange = requirementsText.match(/REQ-(\d{2})\s*(?:through|to|-)\s*REQ-(\d{2})/i);
  if (explicitRange) {
    return buildIdRange('REQ', Number(explicitRange[1]), Number(explicitRange[2]));
  }

  const legacyRange = matrixText.match(/REQ-(\d{2})\s+through\s+REQ-(\d{2})/i);
  if (legacyRange) {
    console.warn(
      'docs/requirements.md has no explicit REQ IDs. Falling back to legacy range from traceability matrix summary.',
    );
    return buildIdRange('REQ', Number(legacyRange[1]), Number(legacyRange[2]));
  }

  throw new Error(
    'Unable to derive requirement IDs from docs/requirements.md. Add explicit REQ IDs or a REQ-xx through REQ-yy range.',
  );
}

function collectExpectedAuditIds(auditText) {
  const explicitIds = collectUniqueMatches(auditText, /AUDIT-[FB]-\d{2}/g);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  const lines = auditText.split(/\r?\n/);
  let section = '';
  let functionalCount = 0;
  let bonusCount = 0;

  for (const line of lines) {
    if (/^####\s+Functional\b/i.test(line)) {
      section = 'functional';
      continue;
    }
    if (/^####\s+Bonus\b/i.test(line)) {
      section = 'bonus';
      continue;
    }
    if (!/^######\s+/.test(line)) {
      continue;
    }

    if (section === 'functional') {
      functionalCount += 1;
    } else if (section === 'bonus') {
      bonusCount += 1;
    }
  }

  if (functionalCount === 0 && bonusCount === 0) {
    throw new Error(
      'Unable to derive audit IDs from docs/audit.md. Add explicit AUDIT IDs or keep canonical functional/bonus question headings.',
    );
  }

  return [
    ...buildIdRange('AUDIT-F', 1, functionalCount),
    ...buildIdRange('AUDIT-B', 1, bonusCount),
  ];
}

function collectMatrixTraceabilityIds(matrixText) {
  const requirementIds = new Set();
  const auditIds = new Set();

  for (const line of matrixText.split(/\r?\n/)) {
    const reqMatch = line.match(/^\|\s*(REQ-\d{2})\s*\|/);
    if (reqMatch) {
      requirementIds.add(reqMatch[1]);
    }

    const auditMatch = line.match(/^\|\s*(AUDIT-[FB]-\d{2})\s*\|/);
    if (auditMatch) {
      auditIds.add(auditMatch[1]);
    }
  }

  return {
    requirementIds: [...requirementIds].sort(),
    auditIds: [...auditIds].sort(),
  };
}

function verifyTraceabilityCoverage() {
  const requirementsText = readText('docs/requirements.md');
  const auditText = readText('docs/audit.md');
  const matrixText = readText('docs/implementation/audit-traceability-matrix.md');

  const expectedRequirementIds = collectExpectedRequirementIds(requirementsText, matrixText);
  const expectedAuditIds = collectExpectedAuditIds(auditText);
  const matrixIds = collectMatrixTraceabilityIds(matrixText);

  const matrixRequirementSet = new Set(matrixIds.requirementIds);
  const matrixAuditSet = new Set(matrixIds.auditIds);
  const expectedRequirementSet = new Set(expectedRequirementIds);
  const expectedAuditSet = new Set(expectedAuditIds);

  const missingRequirements = expectedRequirementIds.filter((id) => !matrixRequirementSet.has(id));
  const extraRequirements = matrixIds.requirementIds.filter(
    (id) => !expectedRequirementSet.has(id),
  );
  const missingAuditIds = expectedAuditIds.filter((id) => !matrixAuditSet.has(id));
  const extraAuditIds = matrixIds.auditIds.filter((id) => !expectedAuditSet.has(id));

  const mismatches = [];
  if (missingRequirements.length > 0) {
    mismatches.push(
      `Missing requirement IDs in docs/implementation/audit-traceability-matrix.md: ${missingRequirements.join(', ')}`,
    );
  }
  if (extraRequirements.length > 0) {
    mismatches.push(
      `Unexpected requirement IDs in docs/implementation/audit-traceability-matrix.md: ${extraRequirements.join(', ')}`,
    );
  }
  if (missingAuditIds.length > 0) {
    mismatches.push(
      `Missing audit IDs in docs/implementation/audit-traceability-matrix.md: ${missingAuditIds.join(', ')}`,
    );
  }
  if (extraAuditIds.length > 0) {
    mismatches.push(
      `Unexpected audit IDs in docs/implementation/audit-traceability-matrix.md: ${extraAuditIds.join(', ')}`,
    );
  }

  if (mismatches.length > 0) {
    throw new Error(mismatches.join('\n'));
  }
}

function mapsEqual(left, right) {
  const leftEntries = Object.entries(left || {}).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right || {}).sort(([a], [b]) => a.localeCompare(b));
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (let index = 0; index < leftEntries.length; index += 1) {
    if (leftEntries[index][0] !== rightEntries[index][0]) {
      return false;
    }
    if (leftEntries[index][1] !== rightEntries[index][1]) {
      return false;
    }
  }

  return true;
}

function enforceAuditAndDependencyPairing() {
  const changed = new Set(changedFiles);
  const touchesPrefix = (prefix) => changedFiles.some((file) => file.startsWith(prefix));
  const has = (file) => changed.has(file);

  const packageJsonChanged = has('package.json');
  const packageLockChanged = has('package-lock.json');
  if (!packageJsonChanged && packageLockChanged) {
    throw new Error('package.json and package-lock.json must change together.');
  }

  if (packageJsonChanged && !packageLockChanged) {
    if (!fs.existsSync('package-lock.json')) {
      throw new Error('package-lock.json is required when package.json is present.');
    }

    const packageJson = readJson('package.json');
    const packageLock = readJson('package-lock.json');
    const lockRoot = packageLock.packages?.[''] ?? {};

    const manifestDependencies = packageJson.dependencies ?? {};
    const manifestDevDependencies = packageJson.devDependencies ?? {};
    const lockDependencies = lockRoot.dependencies ?? packageLock.dependencies ?? {};
    const lockDevDependencies = lockRoot.devDependencies ?? {};

    const dependencyMismatch =
      !mapsEqual(manifestDependencies, lockDependencies) ||
      !mapsEqual(manifestDevDependencies, lockDevDependencies);

    if (dependencyMismatch) {
      throw new Error(
        'Dependency manifest changed without synchronized package-lock.json updates.',
      );
    }
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
    /setTimeout\s*\(\s*['"]/,
    /setInterval\s*\(\s*['"]/,
    /<\s*canvas\b/i,
    /createElement\s*\(\s*['"]canvas['"]\s*\)/i,
  ];

  const frameworkImports = [
    /from\s+['"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['"]/,
    /require\s*\(\s*['"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['"]\s*\)/,
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
    const normalizedPath = file.replaceAll('\\', '/');
    if (normalizedPath.startsWith('scripts/policy-gate/')) {
      continue;
    }

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

verifyTraceabilityCoverage();

if (checkSet === 'pr' || checkSet === 'all') {
  assertPrBody();
  enforceAuditAndDependencyPairing();
  scanSecurityAndArchitectureBoundaries();
}

console.log(`Policy checks completed successfully for ${checkSet} checks.`);
