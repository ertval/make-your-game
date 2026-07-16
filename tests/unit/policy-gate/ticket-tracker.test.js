/**
 * Test: ticket-tracker.test.js
 * Purpose: Verifies consistency of ticket status and counts inside ticket-tracker.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const trackerPath = path.join(repoRoot, 'docs/implementation/ticket-tracker.md');

describe('ticket-tracker.md status consistency', () => {
  it('has consistent ticket status between Phase summaries and main index checklist', () => {
    expect(fs.existsSync(trackerPath)).toBe(true);
    const content = fs.readFileSync(trackerPath, 'utf8');

    // 1. Parse Phase summary remediation status sections
    // e.g., "- **Remediation status:** C-08 ✅, D-10 ✅, A-13 ⏳"
    const remediationRegex = /-\s*\*\*Remediation status:\*\*\s*(.*)/g;
    const summaryStatuses = {}; // ticketId -> 'done' or 'pending'

    const remediationMatches = content.matchAll(remediationRegex);
    for (const match of remediationMatches) {
      const listStr = match[1];
      // Match ticket IDs and their status indicators (e.g., C-08 ✅, A-13 ⏳, A-13 ⏳ etc.)
      const itemRegex = /([A-Z]-\d{2})\s*(✅|⏳)/g;
      const itemMatches = listStr.matchAll(itemRegex);
      for (const itemMatch of itemMatches) {
        const ticketId = itemMatch[1].toUpperCase();
        const statusChar = itemMatch[2];
        const status = statusChar === '✅' ? 'done' : 'pending';
        summaryStatuses[ticketId] = status;
      }
    }

    // 2. Parse main checklist index
    // e.g., "- [x] **A-01** P0..." or "- [ ] **B-02** P1..." or "- [-] **C-05**..."
    const mainIndexRegex = /^-\s*\[(x| |-)\]\s*\*\*([A-Z]-\d{2})\*\*/gm;
    const indexStatuses = {}; // ticketId -> 'done' or 'pending'

    const indexMatches = content.matchAll(mainIndexRegex);
    for (const indexMatch of indexMatches) {
      const checkbox = indexMatch[1];
      const ticketId = indexMatch[2].toUpperCase();
      const status = checkbox === 'x' ? 'done' : 'pending';
      indexStatuses[ticketId] = status;
    }

    // 3. Assert all tickets mentioned in remediation status match the main index status
    const ticketsToCheck = Object.keys(summaryStatuses);
    expect(ticketsToCheck.length).toBeGreaterThan(0);

    for (const ticketId of ticketsToCheck) {
      const summaryStatus = summaryStatuses[ticketId];
      const indexStatus = indexStatuses[ticketId];

      expect(
        indexStatus,
        `Ticket ${ticketId} exists in Phase summaries but is missing from main checklist index`,
      ).toBeDefined();
      expect(
        indexStatus,
        `Ticket ${ticketId} status mismatch: Phase summary reports it as '${summaryStatus}', but main index reports it as '${indexStatus}'`,
      ).toBe(summaryStatus);
    }
  });

  it('has snapshot counts that match the actual main index checklist states', () => {
    const content = fs.readFileSync(trackerPath, 'utf8');

    // 1. Parse the declared snapshot counts
    // e.g.
    // - Total tickets: `44`
    // - Done: `44`
    // - In Progress: `0`
    // - Not Started: `0`
    const totalMatch = content.match(/-\s*Total tickets:\s*`(\d+)`/);
    const doneMatch = content.match(/-\s*Done:\s*`(\d+)`/);
    const inProgressMatch = content.match(/-\s*In Progress:\s*`(\d+)`/);
    const notStartedMatch = content.match(/-\s*Not Started:\s*`(\d+)`/);

    expect(totalMatch).not.toBeNull();
    expect(doneMatch).not.toBeNull();
    expect(inProgressMatch).not.toBeNull();
    expect(notStartedMatch).not.toBeNull();

    const declaredTotal = parseInt(totalMatch[1], 10);
    const declaredDone = parseInt(doneMatch[1], 10);
    const declaredInProgress = parseInt(inProgressMatch[1], 10);
    const declaredNotStarted = parseInt(notStartedMatch[1], 10);

    // 2. Count actual states in the main checklist index
    const mainIndexRegex = /^-\s*\[(x| |-)\]\s*\*\*([A-Z]-\d{2})\*\*/gm;
    let actualDone = 0;
    let actualInProgress = 0;
    let actualNotStarted = 0;

    const countMatches = content.matchAll(mainIndexRegex);
    for (const countMatch of countMatches) {
      const checkbox = countMatch[1];
      if (checkbox === 'x') {
        actualDone++;
      } else if (checkbox === '-') {
        actualInProgress++;
      } else {
        actualNotStarted++;
      }
    }

    const actualTotal = actualDone + actualInProgress + actualNotStarted;

    expect(actualTotal).toBe(declaredTotal);
    expect(actualDone).toBe(declaredDone);
    expect(actualInProgress).toBe(declaredInProgress);
    expect(actualNotStarted).toBe(declaredNotStarted);
  });
});
