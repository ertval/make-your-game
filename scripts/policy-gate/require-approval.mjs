/*
 * Script: require-approval.mjs
 * Purpose: Checks if the Pull Request has the required independent approvals.
 * Implementation Notes: Contacts the remote git hosting API (GitHub/Gitea) via the CI token.
 * Passes immediately if running locally or lacking a valid token (falling back to branch protection).
 */

import process from 'node:process';
import { GATE_PASS, parseArgs, readJson, toBool } from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const metaPath = args['meta-file'] || '.policy-pr-meta.json';
const requireApproval = toBool(args['require-approval'], true);
const ciMode = toBool(args['ci-mode'], toBool(process.env.CI, false));

function failOrSkip(reason, action) {
  if (requireApproval && ciMode) {
    throw new Error(['Approval verification failed closed in CI.', reason, action].join('\n'));
  }

  console.log(reason);
  process.exit(0);
}

if (!requireApproval) {
  console.log('Approval check skipped by configuration.');
  process.exit(0);
}

const meta = readJson(metaPath);
const reviewsUrl = meta.reviewsUrl || '';
const author = meta.author || '';
const token = process.env.CI_TOKEN || process.env.GITHUB_TOKEN || process.env.GITEA_TOKEN || '';

// Do not enforce approval if the review URL is absent (e.g. non-PR workflows)
if (!reviewsUrl) {
  failOrSkip(
    'No review endpoint found. Cannot verify approvals.',
    'Action: ensure policy context includes pull_request metadata with reviewsUrl before running CI approval checks.',
  );
}

if (!token) {
  failOrSkip(
    'No CI token provided. Cannot verify approvals.',
    'Action: provide CI_TOKEN/GITHUB_TOKEN/GITEA_TOKEN so approval checks can query the review API.',
  );
}

let response;
try {
  response = await fetch(reviewsUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: `token ${token}`,
    },
  });
} catch (error) {
  failOrSkip(
    `Review API request failed (${error instanceof Error ? error.message : String(error)}).`,
    'Action: ensure CI can reach the review API and retry.',
  );
}

if (!response.ok) {
  failOrSkip(
    `Review API request returned HTTP ${response.status}.`,
    'Action: verify token permissions and review API availability.',
  );
}

let reviews;
try {
  reviews = await response.json();
} catch (error) {
  failOrSkip(
    `Unable to parse review API response JSON (${error instanceof Error ? error.message : String(error)}).`,
    'Action: verify the review API response format and retry.',
  );
}

if (!Array.isArray(reviews)) {
  failOrSkip(
    'Review API response was not an array.',
    'Action: verify review API endpoint compatibility for this CI provider.',
  );
}

const approvals = reviews.filter((review) => {
  return (
    String(review?.state ?? '').toUpperCase() === 'APPROVED' &&
    review?.user?.login &&
    review.user.login !== author
  );
});

if (approvals.length === 0) {
  throw new Error(
    [
      'Approval policy violation.',
      'At least one independent approval is required before merge.',
      'Action: Request a code review from another team member who did not author the pull request.',
    ].join('\n'),
  );
}

console.log(
  `${GATE_PASS} — Approval check passed with ${approvals.length} independent approval(s).`,
);
