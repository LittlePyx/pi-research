// Canonical identifiers are opaque strings. HTML cleaning corrupts valid DOIs.
export function canonicalResponseId(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function uniqueCanonicalResponses(expectedIds, records) {
  const expected = new Set(expectedIds);
  const seen = new Set();
  const duplicates = new Set();
  const byId = new Map();
  for (const item of Array.isArray(records) ? records : []) {
    const id = canonicalResponseId(item?.canonicalId);
    if (!expected.has(id)) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
    byId.set(id, item);
  }
  for (const id of duplicates) byId.delete(id);
  return byId;
}
