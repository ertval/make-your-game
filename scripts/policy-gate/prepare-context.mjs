import fs from 'node:fs';
import process from 'node:process';
import {
  collectChangedFiles,
  getEventPath,
  parseArgs,
  readText,
  writeJson,
  writeLines,
} from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const eventPath = getEventPath(args);
const metaPath = args['meta-file'] || '.policy-pr-meta.json';
const changedPath = args['changed-file'] || 'changed-files.txt';

function parsePullRequestPayload(filePath) {
  const event = JSON.parse(readText(filePath));
  const pr = event.pull_request;

  if (!pr) {
    throw new Error('Expected pull_request payload in event file.');
  }

  return {
    number: pr.number,
    body: pr.body ?? '',
    author: pr.user?.login ?? '',
    baseSha: pr.base?.sha ?? '',
    headSha: pr.head?.sha ?? '',
    reviewsUrl: pr.url ? `${pr.url}/reviews` : (pr.reviews_url ?? ''),
  };
}

function buildManualMetadata() {
  const bodyFromFile = args['pr-body-file'] ? readText(args['pr-body-file']) : '';
  const body = args['pr-body'] || process.env.PR_BODY || bodyFromFile || '';

  return {
    number: Number(args['pr-number'] || process.env.PR_NUMBER || 0),
    body,
    author: args.author || process.env.PR_AUTHOR || '',
    baseSha: args['base-sha'] || process.env.BASE_SHA || '',
    headSha: args['head-sha'] || process.env.HEAD_SHA || '',
    reviewsUrl: args['reviews-url'] || process.env.REVIEWS_URL || '',
  };
}

let metadata;
if (eventPath && fs.existsSync(eventPath)) {
  metadata = parsePullRequestPayload(eventPath);
  console.log(`Loaded PR payload from ${eventPath}`);
} else {
  metadata = buildManualMetadata();
  console.log('No event payload available. Using manual metadata mode.');
}

const changedFiles = collectChangedFiles(metadata.baseSha, metadata.headSha);

writeJson(metaPath, metadata);
writeLines(changedPath, changedFiles);

console.log(`Wrote ${metaPath}`);
console.log(`Wrote ${changedPath} with ${changedFiles.length} file(s).`);
