// Model output cannot assign identity to an unknown paper or resolve a duplicate.
// Keep unambiguous, complete records; all other supplied papers stay pending.
export function matchScreeningRecords(canonicalIds, records) {
  const expected = new Set(canonicalIds);
  const counts = new Map();
  const byId = new Map();
  let unexpectedCount = 0;
  for (const item of records) {
    const id = typeof item?.canonicalId === 'string' ? item.canonicalId.trim().replace(/\s+/g, ' ') : '';
    if (!expected.has(id)) { unexpectedCount++; continue; }
    counts.set(id, (counts.get(id) || 0) + 1);
    const score = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
      && Number.isFinite(Number(value));
    if (typeof item.isPaper === 'boolean' && score(item.relevanceScore) && score(item.qualityScore)
      && typeof item.screeningReason === 'string' && item.screeningReason.trim()) byId.set(id, item);
  }
  const duplicateIds = canonicalIds.filter(id => (counts.get(id) || 0) > 1);
  for (const id of duplicateIds) byId.delete(id);
  return {
    byId,
    diagnostics: {
      returnedCount: records.length, matchedCount: byId.size, unexpectedCount,
      missingIds: canonicalIds.filter(id => !counts.has(id)), duplicateIds,
      invalidIds: canonicalIds.filter(id => counts.get(id) === 1 && !byId.has(id)),
    },
  };
}
