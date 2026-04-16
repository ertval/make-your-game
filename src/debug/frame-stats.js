/*
 * Frame statistics helpers.
 *
 * Purpose: Provides reusable pure helpers for sorting frame deltas and
 * percentile selection used by runtime frame probes and tests.
 * Public API:
 * - toSortedNumericArray(values, count)
 * - percentileFromSorted(sortedValues, percentileValue)
 *
 * Implementation notes: Helpers are allocation-conscious and deterministic.
 */

export function toSortedNumericArray(values, count = values?.length ?? 0) {
  const source = values || [];
  const maxLength = source.length ?? 0;
  const normalizedCount = Number.isFinite(count)
    ? Math.max(0, Math.min(Math.floor(count), maxLength))
    : 0;
  const sortedValues = new Array(normalizedCount);

  for (let index = 0; index < normalizedCount; index += 1) {
    sortedValues[index] = Number(source[index]);
  }

  sortedValues.sort((left, right) => left - right);
  return sortedValues;
}

export function percentileFromSorted(sortedValues, percentileValue) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return 0;
  }

  const normalizedPercentile = Math.max(0, Math.min(Number(percentileValue) || 0, 100));
  const rawIndex = Math.floor((normalizedPercentile / 100) * (sortedValues.length - 1));
  const index = Math.max(0, Math.min(rawIndex, sortedValues.length - 1));
  return sortedValues[index];
}
