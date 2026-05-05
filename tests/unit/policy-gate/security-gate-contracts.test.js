/**
 * Test: security-gate-contracts.test.js
 * Purpose: Locks Track A security gate behavior for fail-closed policy and workflow contracts.
 * Public API: N/A (test module).
 * Implementation Notes: Executes policy scripts in subprocesses and validates workflow command surfaces.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

function runNodeScript(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  return result;
}

function getCombinedOutput(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

describe('security gate contracts', () => {
  it('fails closed when schema validation prerequisites are missing', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-ghostman-schema-failclosed-'));

    try {
      const result = runNodeScript([path.join(repoRoot, 'scripts/validate-schema.mjs')], {
        cwd: tempRoot,
      });

      expect(result.status).not.toBe(0);
      expect(getCombinedOutput(result)).toContain('Schema validation setup failed');
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('scans policy-gate .mjs files in changed-file scope and blocks forbidden sinks', () => {
    const fixtureName = `__tmp_forbidden_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`;
    const relativeFixturePath = path.posix.join('scripts', 'policy-gate', fixtureName);
    const absoluteFixturePath = path.join(repoRoot, relativeFixturePath);
    const changedFilesListPath = path.join(repoRoot, `${fixtureName}.txt`);

    try {
      fs.writeFileSync(
        absoluteFixturePath,
        [
          '/* temporary fixture for policy scanner coverage */',
          'export function fixtureForbiddenPath() {',
          '  return e' + 'val("1 + 1");',
          '}',
          '',
        ].join('\n'),
        'utf8',
      );
      fs.writeFileSync(changedFilesListPath, `${relativeFixturePath}\n`, 'utf8');

      const result = runNodeScript([
        path.join(repoRoot, 'scripts/policy-gate/check-forbidden.mjs'),
        '--scope=changed',
        `--changed-file=${path.basename(changedFilesListPath)}`,
      ]);

      expect(result.status).not.toBe(0);
      const output = getCombinedOutput(result);
      expect(output).toContain(relativeFixturePath);
      expect(output).toContain('eval call');
    } finally {
      fs.rmSync(absoluteFixturePath, { force: true });
      fs.rmSync(changedFilesListPath, { force: true });
    }
  });

  it('blocks WebGL and WebGPU APIs in forbidden scans', () => {
    const fixtureName = `__tmp_forbidden_webgpu_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.mjs`;
    const relativeFixturePath = path.posix.join('scripts', 'policy-gate', fixtureName);
    const absoluteFixturePath = path.join(repoRoot, relativeFixturePath);
    const changedFilesListPath = path.join(repoRoot, `${fixtureName}.txt`);
    const canvasTag = ['can', 'vas'].join('');
    const webglLabel = ['web', 'gl2'].join('');
    const webgpuToken = ['g', 'pu'].join('');
    const gpuDeviceType = ['GPU', 'Device'].join('');

    try {
      fs.writeFileSync(
        absoluteFixturePath,
        [
          '/* temporary fixture for policy scanner coverage */',
          'export function fixtureForbiddenWebgl() {',
          `  const canvas = document.createElement('${canvasTag}');`,
          `  return canvas.getContext('${webglLabel}');`,
          '}',
          'export async function fixtureForbiddenWebgpu() {',
          `  const device = /** @type {${gpuDeviceType} | null} */ (null);`,
          `  return { adapter: await navigator.${webgpuToken}?.requestAdapter?.(), device };`,
          '}',
          '',
        ].join('\n'),
        'utf8',
      );
      fs.writeFileSync(changedFilesListPath, `${relativeFixturePath}\n`, 'utf8');

      const result = runNodeScript([
        path.join(repoRoot, 'scripts/policy-gate/check-forbidden.mjs'),
        '--scope=changed',
        `--changed-file=${path.basename(changedFilesListPath)}`,
      ]);

      expect(result.status).not.toBe(0);
      const output = getCombinedOutput(result);
      expect(output).toContain(relativeFixturePath);
      expect(output).toContain('webgl context');
      expect(output).toContain('webgpu api');
      expect(output).toContain('webgpu interface');
    } finally {
      fs.rmSync(absoluteFixturePath, { force: true });
      fs.rmSync(changedFilesListPath, { force: true });
    }
  });

  it('blocks inline event handler attributes in forbidden scans', () => {
    const fixtureName = `__tmp_forbidden_inline_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.html`;
    const relativeFixturePath = path.posix.join('scripts', 'policy-gate', fixtureName);
    const absoluteFixturePath = path.join(repoRoot, relativeFixturePath);
    const changedFilesListPath = path.join(repoRoot, `${fixtureName}.txt`);
    const handlerAttribute = ['on', 'click'].join('');
    const inlineButtonLine = `<button ${handlerAttribute}="alert('nope')">Do not click</button>`;

    try {
      fs.writeFileSync(
        absoluteFixturePath,
        [
          '<!doctype html>',
          '<html lang="en">',
          '<body>',
          inlineButtonLine,
          '</body>',
          '</html>',
          '',
        ].join('\n'),
        'utf8',
      );
      fs.writeFileSync(changedFilesListPath, `${relativeFixturePath}\n`, 'utf8');

      const result = runNodeScript([
        path.join(repoRoot, 'scripts/policy-gate/check-forbidden.mjs'),
        '--scope=changed',
        `--changed-file=${path.basename(changedFilesListPath)}`,
      ]);

      expect(result.status).not.toBe(0);
      const output = getCombinedOutput(result);
      expect(output).toContain(relativeFixturePath);
      expect(output).toContain('inline event handler attribute');
    } finally {
      fs.rmSync(absoluteFixturePath, { force: true });
      fs.rmSync(changedFilesListPath, { force: true });
    }
  });

  it('fails approval verification closed in CI when review endpoint is missing', () => {
    const tempMetaPath = path.join(repoRoot, `.tmp-approval-meta-${Date.now()}-no-reviews.json`);

    try {
      fs.writeFileSync(
        tempMetaPath,
        JSON.stringify(
          {
            author: 'author-user',
            reviewsUrl: '',
          },
          null,
          2,
        ),
        'utf8',
      );

      const result = runNodeScript(
        [
          path.join(repoRoot, 'scripts/policy-gate/require-approval.mjs'),
          `--meta-file=${path.basename(tempMetaPath)}`,
          '--require-approval=true',
          '--ci-mode=true',
        ],
        {
          env: {
            CI: 'true',
            CI_TOKEN: '',
            GITHUB_TOKEN: '',
            GITEA_TOKEN: '',
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(getCombinedOutput(result)).toContain('Approval verification failed closed in CI.');
      expect(getCombinedOutput(result)).toContain(
        'No review endpoint found. Cannot verify approvals.',
      );
    } finally {
      fs.rmSync(tempMetaPath, { force: true });
    }
  });

  it('fails approval verification closed in CI when review API token is missing', () => {
    const tempMetaPath = path.join(repoRoot, `.tmp-approval-meta-${Date.now()}-no-token.json`);

    try {
      fs.writeFileSync(
        tempMetaPath,
        JSON.stringify(
          {
            author: 'author-user',
            reviewsUrl: 'https://example.test/pull/42/reviews',
          },
          null,
          2,
        ),
        'utf8',
      );

      const result = runNodeScript(
        [
          path.join(repoRoot, 'scripts/policy-gate/require-approval.mjs'),
          `--meta-file=${path.basename(tempMetaPath)}`,
          '--require-approval=true',
          '--ci-mode=true',
        ],
        {
          env: {
            CI: 'true',
            CI_TOKEN: '',
            GITHUB_TOKEN: '',
            GITEA_TOKEN: '',
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(getCombinedOutput(result)).toContain('Approval verification failed closed in CI.');
      expect(getCombinedOutput(result)).toContain('No CI token provided. Cannot verify approvals.');
    } finally {
      fs.rmSync(tempMetaPath, { force: true });
    }
  });

  it('keeps the GitHub policy workflow aligned with local policy contract', () => {
    const githubWorkflowPath = path.join(repoRoot, '.github/workflows/policy-gate.yml');
    const githubWorkflow = fs.readFileSync(githubWorkflowPath, 'utf8');
    const giteaWorkflowPath = path.join(repoRoot, '.gitea/workflows/policy-gate.yml');

    const requiredCommands = [
      'node scripts/policy-gate/check-forbidden.mjs --scope=repo',
      'npm run policy -- --mode=ci --scope=all --require-approval=false',
      'npm run sbom',
      'git diff --exit-code -- sbom.json',
    ];

    for (const command of requiredCommands) {
      expect(githubWorkflow).toContain(command);
    }

    expect(githubWorkflow).toContain('CI_TOKEN: $' + '{{ secrets.GITHUB_TOKEN }}');
    expect(githubWorkflow).toContain('POLICY_HEADER_MODE: fail');
    expect(fs.existsSync(giteaWorkflowPath)).toBe(false);
  });

  it('keeps generated coverage and test-results artifacts out of git tracking', () => {
    const result = spawnSync('git', ['ls-files', '--', 'coverage', 'test-results'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect((result.stdout || '').trim()).toBe('');
  });
});
