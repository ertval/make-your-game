import process from 'node:process';
import { parseArgs, readJson, toBool } from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const metaPath = args['meta-file'] || '.policy-pr-meta.json';
const requireApproval = toBool(args['require-approval'], true);

if (!requireApproval) {
  console.log('Approval check skipped by configuration.');
  process.exit(0);
}

const meta = readJson(metaPath);
const reviewsUrl = meta.reviewsUrl || '';
const author = meta.author || '';
const token = process.env.CI_TOKEN || process.env.GITHUB_TOKEN || process.env.GITEA_TOKEN || '';

if (!reviewsUrl) {
  console.log('No review endpoint found. Skipping approval API check.');
  process.exit(0);
}

if (!token) {
  console.log(
    'No CI token provided. Skipping approval API check; enforce approvals in branch protection.',
  );
  process.exit(0);
}

const response = await fetch(reviewsUrl, {
  headers: {
    Accept: 'application/json',
    Authorization: `token ${token}`,
  },
});

if (!response.ok) {
  console.log(
    `Review API check skipped (HTTP ${response.status}). Enforce approvals in branch protection.`,
  );
  process.exit(0);
}

const reviews = await response.json();
if (!Array.isArray(reviews)) {
  console.log('Review API response was not an array. Skipping approval API check.');
  process.exit(0);
}

const approvals = reviews.filter((review) => {
  return (
    String(review?.state ?? '').toUpperCase() === 'APPROVED' &&
    review?.user?.login &&
    review.user.login !== author
  );
});

if (approvals.length === 0) {
  throw new Error('At least one independent approval is required before merge.');
}

console.log(`Approval check passed with ${approvals.length} independent approval(s).`);
