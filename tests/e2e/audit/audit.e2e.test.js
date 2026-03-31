import { describe, expect, it } from 'vitest';

import { AUDIT_QUESTIONS } from './audit-question-map.js';

describe('Audit coverage inventory (source: docs/audit.md)', () => {
  it('contains explicit coverage entries for every audit question', () => {
    let fullyAutomatableCount = 0;
    let semiAutomatableCount = 0;
    let manualWithEvidenceCount = 0;

    for (const question of AUDIT_QUESTIONS) {
      if (question.executionType === 'Fully Automatable') {
        fullyAutomatableCount += 1;
      } else if (question.executionType === 'Semi-Automatable') {
        semiAutomatableCount += 1;
      } else if (question.executionType === 'Manual-With-Evidence') {
        manualWithEvidenceCount += 1;
      }
    }

    expect(AUDIT_QUESTIONS).toHaveLength(27);
    expect(fullyAutomatableCount).toBe(20);
    expect(semiAutomatableCount).toBe(3);
    expect(manualWithEvidenceCount).toBe(4);
  });
});
