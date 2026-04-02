import { describe, expect, it } from 'vitest';

import {
  describePolicyResolution,
  inferProcessModeFromSources,
  inferTicketIdsFromSources,
} from '../../../scripts/policy-gate/lib/policy-utils.mjs';

describe('policy-utils ticket and process detection', () => {
  it('detects ticket ids from branch names and commit messages', () => {
    expect(inferTicketIdsFromSources('ekaramet/A-02', '')).toEqual(['A-02']);
    expect(inferTicketIdsFromSources('', 'feat: add A-02 ticket gate')).toEqual(['A-02']);
  });

  it('detects a process marker from branch or commit text', () => {
    expect(inferProcessModeFromSources('docs/process branch', '')).toBe(true);
    expect(inferProcessModeFromSources('', 'feat: update process docs')).toBe(true);
    expect(inferProcessModeFromSources('feat: improve docs', '')).toBe(false);
  });

  it('describes the selected policy path and metadata', () => {
    const ticketSummary = describePolicyResolution({
      auditMode: 'TICKET',
      branchTicketIds: ['A-02'],
      commitTicketIds: ['A-01', 'A-02'],
      processMarkerDetected: false,
      selectedPath: 'ticketed ownership checks',
      ticketIds: ['A-01', 'A-02'],
      trackCode: 'A',
    });

    expect(ticketSummary).toContain('mode=TICKET');
    expect(ticketSummary).toContain('path=ticketed ownership checks');
    expect(ticketSummary).toContain('tickets=A-01, A-02');
    expect(ticketSummary).toContain('branchTickets=A-02');
    expect(ticketSummary).toContain('commitTickets=A-01, A-02');

    const processSummary = describePolicyResolution({
      auditMode: 'GENERAL_DOCS_PROCESS',
      branchTicketIds: [],
      commitTicketIds: [],
      processMarkerDetected: true,
      selectedPath: 'process-marker fallback',
      ticketIds: [],
      trackCode: 'GENERAL',
    });

    expect(processSummary).toContain('mode=GENERAL_DOCS_PROCESS');
    expect(processSummary).toContain('path=process-marker fallback');
    expect(processSummary).toContain('tickets=(none)');
    expect(processSummary).toContain('processMarker=true');
  });
});
