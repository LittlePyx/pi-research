/** Read-only bridge from the shared recommendation audit to research evidence.
 * It neither recommends papers nor confirms their use in a research route.
 */
export type VerifiedAbstractRow = {
  id: string; canonical_id: string; title: string; authors: string; venue: string;
  published_at: string | null; url: string; abstract_text: string;
  ever_recommended: number; verification_status: string; verification_coverage_score: number;
  verification_json: string;
};

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const fields = new Set(["summary", "problem", "method", "contribution", "limitations"]);
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, "0")).join("");
}

export async function verifiedAbstractClaims(row: VerifiedAbstractRow) {
  if (!row.ever_recommended || !["verified", "revised"].includes(row.verification_status)
    || row.verification_coverage_score < 70 || normalize(row.abstract_text).length < 120) return [];
  let audit: Record<string, unknown>;
  try { audit = JSON.parse(row.verification_json); } catch { return []; }
  if (!audit || !Array.isArray(audit.claimChecks)) return [];
  const abstract = normalize(row.abstract_text);
  const seen = new Set<string>();
  const checks = audit.claimChecks.flatMap((check: unknown) => {
    if (!check || typeof check !== "object") return [];
    const c = check as Record<string, unknown>;
    const quote = typeof c.evidenceQuote === "string" ? normalize(c.evidenceQuote) : "";
    if (c.grounded !== true || !["supported", "qualified"].includes(String(c.verdict))
      || !fields.has(String(c.field)) || quote.length < 20 || !abstract.includes(quote) || seen.has(quote)) return [];
    seen.add(quote);
    // Use the exact source passage, not the potentially shortened audit paraphrase.
    return [{ quote, field: String(c.field) }];
  }).slice(0, 8);
  const revision = await hash(JSON.stringify([row.canonical_id, row.title, row.authors, row.url, abstract, checks, row.verification_status, row.verification_coverage_score]));
  return Promise.all(checks.map(async c => ({
    claim_id: `abstract:${row.id}:${(await hash(`${c.field}:${c.quote}`)).slice(0, 24)}`,
    paper_id: row.id, canonical_id: row.canonical_id, title: row.title, authors: row.authors,
    venue: row.venue, published_at: row.published_at, claim_kind: c.field,
    claim_zh: c.quote, claim_en: c.quote, evidence_quote: c.quote, section_label: "Abstract",
    locator: "Abstract", source_url: /^https?:\/\//i.test(row.url) ? row.url : "",
    confidence: Math.min(64, row.verification_coverage_score), evidence_level: "abstract" as const, text_hash: revision,
  })));
}

/** Owner authorization is performed by the caller. All rows stay space/route scoped. */
export async function routeVerifiedAbstractClaims(database: D1Database, spaceId: string, trackId: string, selectedOnly = true) {
  const rows = await database.prepare(`SELECT DISTINCT p.id, p.canonical_id, p.title, p.authors, p.venue,
    p.published_at, p.url, i.abstract_text, i.ever_recommended, i.verification_status,
    i.verification_coverage_score, i.verification_json
    FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
    WHERE p.space_id = ? AND i.ever_recommended = 1 AND i.verification_status IN ('verified','revised')
      AND i.verification_coverage_score >= 70
      AND NOT EXISTS (SELECT 1 FROM paper_feedback f WHERE f.space_id = p.space_id AND f.paper_id = p.id AND f.feedback = 'not_relevant')
      AND (EXISTS (SELECT 1 FROM research_map_evidence_proposals e WHERE e.space_id = p.space_id
        AND e.paper_id = p.id AND e.track_id = ? AND e.status ${selectedOnly ? "= 'confirmed'" : "IN ('pending','confirmed')"})
      OR (EXISTS (SELECT 1 FROM research_track_papers r WHERE r.space_id = p.space_id AND r.track_id = ?
        AND r.curation_status = 'active' AND (r.canonical_id = p.canonical_id
          OR (COALESCE(r.doi,'') != '' AND lower(r.doi) = lower(COALESCE(p.doi,'')))))
        ${selectedOnly ? `AND (EXISTS (SELECT 1 FROM paper_feedback f WHERE f.space_id = p.space_id AND f.paper_id = p.id AND (f.saved = 1 OR f.feedback = 'relevant'))
          OR EXISTS (SELECT 1 FROM paper_reading_progress progress WHERE progress.space_id = p.space_id AND progress.paper_id = p.id AND progress.status IN ('reading','read','mastered','cited')))` : ""}))
    ORDER BY p.published_at DESC, p.id LIMIT 40`).bind(spaceId, trackId, trackId).all<VerifiedAbstractRow>();
  const claims = (await Promise.all(rows.results.map(verifiedAbstractClaims))).flat();
  if (!selectedOnly) return claims;
  // Identical title/author versions cannot masquerade as independent corroboration.
  const identities = new Map<string, string>();
  return claims.filter(c => {
    const identity = normalize(c.title).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") + "|" + normalize(c.authors).toLowerCase();
    const key = c.authors.trim() ? identity : c.canonical_id || c.paper_id;
    const first = identities.get(key);
    if (!first) identities.set(key, c.paper_id);
    return !first || first === c.paper_id;
  });
}
