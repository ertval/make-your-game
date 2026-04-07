import fs from 'node:fs';
import process from 'node:process';
import {
  collectBranchCommitMessages,
  collectChangedFiles,
  getCurrentBranchName,
  getEventPath,
  getMergeBase,
  inferProcessModeFromSources,
  inferTicketIdsFromSources,
  inferTracksFromTicketIds,
  parseArgs,
  readText,
  resolveBaseRef,
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
  return {
    number: Number(args['pr-number'] || process.env.PR_NUMBER || 0),
    author: args.author || process.env.PR_AUTHOR || '',
    body: args.body || process.env.PR_BODY || '',
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

const preferredBaseRef =
  args['base-ref'] || process.env.BASE_REF || process.env.GITHUB_BASE_REF || '';
const baseRef = resolveBaseRef(preferredBaseRef);
const headRef = metadata.headSha || args['head-ref'] || 'HEAD';
const mergeBase = getMergeBase(baseRef, headRef);
const branchName = args['branch-name'] || process.env.BRANCH_NAME || getCurrentBranchName();
const commitMessages = collectBranchCommitMessages({ baseRef, mergeBase, headRef });
const ticketIds = inferTicketIdsFromSources(
  args['ticket-id'] || '',
  args['ticket-ids'] || '',
  branchName,
  commitMessages,
);
const processMode = inferProcessModeFromSources(branchName, commitMessages, metadata.body || '');
const trackCodes = inferTracksFromTicketIds(ticketIds);

metadata.baseRef = baseRef;
metadata.headRef = headRef;
metadata.mergeBase = mergeBase;
metadata.branchName = branchName;
metadata.body = metadata.body || '';
metadata.commitMessages = commitMessages;
metadata.ticketIds = ticketIds;
metadata.processMode = processMode;
metadata.trackCodes = trackCodes;
metadata.trackCode = trackCodes.length === 1 ? trackCodes[0] : '';

const hasEventPayload = Boolean(eventPath && fs.existsSync(eventPath));
const changedFiles = hasEventPayload
  ? collectChangedFiles(metadata.baseSha, metadata.headSha, {
      baseRef,
      headRef,
    })
  : collectChangedFiles(undefined, undefined, {
      baseRef,
      headRef,
    });

writeJson(metaPath, metadata);
writeLines(changedPath, changedFiles);

console.log(`Wrote ${metaPath}`);
console.log(`Detected ticket IDs: ${ticketIds.join(', ') || '(none)'}`);
console.log(`Wrote ${changedPath} with ${changedFiles.length} file(s).`);
