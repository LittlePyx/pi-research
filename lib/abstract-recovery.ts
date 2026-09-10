import { parseDataCiteArxivRecords } from "./discovery/datacite";
import { arxivIdFromUrl, normalizeWorkTitle, parseArxivAtom } from "./discovery/arxiv";
import { ExternalSourceCooldownError, fetchExternalSource } from "./external-source-throttle";

export const ABSTRACT_BLOCK_REASON = "Abstract evidence unavailable after bounded enrichment";
export type AbstractIdentity = { doi: string | null; title: string; authors: string; url: string };
type Hit = { abstractText: string; sourceUrl: string };
type RelatedAbstract = Hit & { doi: string };
export type Recovery = { status: string; source_url: string; retry_at: number; attempted_json: string; result_json?: string; related?: RelatedAbstract | null };
const clean = (text: string) => text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000);
const doiKey = (value: string) => value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLowerCase();

export function matchesAbstractIdentity(paper: AbstractIdentity, record: { doi?: string | null; title: string; authors: string[] }) {
  if (paper.doi && record.doi) return doiKey(paper.doi) === doiKey(record.doi);
  if (normalizeWorkTitle(paper.title) !== normalizeWorkTitle(record.title)) return false;
  const known = normalizeWorkTitle(paper.authors);
  return record.authors.some(author => { const name = normalizeWorkTitle(author); return name.length >= 5 && known.includes(name); });
}

export async function lookupAbstract(paper: AbstractIdentity, request: (url: string, source: string) => Promise<Response>, preprintOnly = false): Promise<{ hit: Hit | null; failed: boolean; attempted: string[]; retryMs: number; related: RelatedAbstract | null }> {
  let related: RelatedAbstract | null = null;
  const attempted: string[] = []; let failed = false; let retryMs = 0;
  const attempt = async (source: string, url: string, read: (response: Response) => Promise<Hit | null>) => {
    attempted.push(source);
    try { const response = await request(url, source); if (response.status === 404) return null; if (!response.ok) throw new Error("source unavailable"); return await read(response); }
    catch (error) { failed = true; if (error instanceof ExternalSourceCooldownError) retryMs = Math.max(retryMs, error.retryAfterSeconds * 1000); return null; }
  };
  let shortHit: Hit | null = null;
  const valid = (abstractText: string, sourceUrl: string): Hit | null => {
    const candidate = { abstractText: clean(abstractText), sourceUrl };
    if (candidate.abstractText.length >= 400) return candidate;
    if (candidate.abstractText.length >= 120 && candidate.abstractText.length > (shortHit?.abstractText.length || 0)) shortHit = candidate;
    return null;
  };
  let hit: Hit | null = null;
  if (paper.doi && !preprintOnly) {
    const endpoint = `https://api.crossref.org/works/${encodeURIComponent(doiKey(paper.doi))}`;
    hit = await attempt("crossref", endpoint, async response => {
      const { message: row } = await response.json() as { message: { DOI: string; abstract?: string } };
      return row?.DOI && doiKey(row.DOI) === doiKey(paper.doi!) ? valid(row.abstract || "", endpoint) : null;
    });
    if (!hit) {
      const endpoint = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doiKey(paper.doi))}`;
      hit = await attempt("openalex", endpoint, async response => {
        const row = await response.json() as { doi?: string; abstract_inverted_index?: Record<string, number[]> };
        if (!row.doi || doiKey(row.doi) !== doiKey(paper.doi!)) return null;
        const words: string[] = [];
        for (const [word, positions] of Object.entries(row.abstract_inverted_index || {})) for (const position of positions) if (Number.isInteger(position) && position >= 0 && position < 10000) words[position] = word;
        return valid(words.join(" "), endpoint);
      });
    }
  }
  if (!hit && !preprintOnly) {
    const endpoint = new URL("https://api.crossref.org/works");
    endpoint.searchParams.set("query.title", paper.title); endpoint.searchParams.set("rows", "3");
    await attempt("crossref", endpoint.href, async response => {
      const payload = await response.json() as { message?: { items?: Array<{ DOI: string; title?: string[]; author?: Array<{ given?: string; family?: string }>; abstract?: string }> } };
      const matches = (payload.message?.items || []).filter(row => row.DOI && doiKey(row.DOI) !== doiKey(paper.doi || "") && normalizeWorkTitle(row.title?.[0] || "") === normalizeWorkTitle(paper.title) && (row.author?.length || 0) >= 2 && row.author!.every(author => {
        const full = normalizeWorkTitle(`${author.given || ""} ${author.family || ""}`); return full.length >= 5 && normalizeWorkTitle(paper.authors).includes(full);
      })).filter(row => clean(row.abstract || "").length >= 400);
      if (matches.length === 1) related = { abstractText: clean(matches[0].abstract!), sourceUrl: `https://api.crossref.org/works/${encodeURIComponent(matches[0].DOI)}`, doi: matches[0].DOI };
      return null;
    });
  }
  if (related) return { hit: null, failed, attempted, retryMs, related };
  if (!hit) {
    const endpoint = new URL("https://api.datacite.org/dois");
    endpoint.searchParams.set("query", `prefix:10.48550 AND titles.title:"${normalizeWorkTitle(paper.title)}"`);
    endpoint.searchParams.set("page[size]", "3");
    hit = await attempt("datacite", endpoint.href, async response => {
      const payload = await response.json() as { data?: Array<{ attributes?: { descriptions?: Array<{ description?: string; descriptionType?: string }> } }> };
      for (const row of payload.data || []) if (row.attributes) row.attributes.descriptions = row.attributes.descriptions?.filter(item => item.descriptionType?.toLowerCase() === "abstract");
      const rows = parseDataCiteArxivRecords(payload).filter(row => matchesAbstractIdentity(paper, { doi: row.publishedDoi, title: row.title, authors: row.authors }));
      return rows.length === 1 ? valid(rows[0].abstract, `https://api.datacite.org/dois/${encodeURIComponent(rows[0].dataCiteDoi)}`) : null;
    });
  }
  if (!hit) {
    const arxivId = arxivIdFromUrl(paper.url);
    const endpoint = new URL("https://export.arxiv.org/api/query");
    if (arxivId) endpoint.searchParams.set("id_list", arxivId);
    else endpoint.searchParams.set("search_query", `ti:"${normalizeWorkTitle(paper.title)}"`);
    endpoint.searchParams.set("max_results", "3");
    hit = await attempt("arxiv", endpoint.href, async response => {
      const rows = parseArxivAtom(await response.text()).filter(row => matchesAbstractIdentity(paper, row));
      if (rows.length !== 1) return null;
      return valid(rows[0].abstract, rows[0].url.replace(/^http:/, "https:"));
    });
  }
  return { hit: hit || shortHit, failed, attempted, retryMs, related };
}

export async function readAbstractRecovery(db: D1Database, spaceId: string, paperId: string) {
  const record = await db.prepare("SELECT status, source_url, retry_at, attempted_json, result_json FROM paper_abstract_recovery WHERE space_id = ? AND paper_id = ?").bind(spaceId, paperId).first<Recovery>();
  if (!record) return null;
  return { ...record, related: record.result_json ? JSON.parse(record.result_json) as RelatedAbstract : null };
}

// A per-paper lease complements the existing shared provider cooldowns.
export async function recoverPaperAbstract(db: D1Database, spaceId: string, paperId: string, preprintOnly = false) {
  const paper = await db.prepare(`SELECT p.doi,p.title,p.authors,p.url,i.abstract_text FROM monitored_papers p JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id WHERE p.id=? AND p.space_id=?`).bind(paperId, spaceId).first<AbstractIdentity & { abstract_text: string }>();
  if (!paper || paper.abstract_text.trim().length >= 400) return readAbstractRecovery(db, spaceId, paperId);
  const existing = await readAbstractRecovery(db, spaceId, paperId);
  if (existing?.status === "found" && paper.abstract_text.trim().length >= 120) return existing;
  const token = crypto.randomUUID(); const now = Date.now();
  await db.prepare("INSERT OR IGNORE INTO paper_abstract_recovery (paper_id,space_id) VALUES (?,?)").bind(paperId, spaceId).run();
  const lock = await db.prepare(`UPDATE paper_abstract_recovery SET status='searching',lock_token=?,lease_until=?,updated_at=CURRENT_TIMESTAMP WHERE paper_id=? AND space_id=? AND lease_until<=? AND retry_at<=?`).bind(token, now + 90000, paperId, spaceId, now, now).run();
  if (!lock.meta.changes) return readAbstractRecovery(db, spaceId, paperId);
  const deadline = AbortSignal.timeout(24000);
  const result = await lookupAbstract(paper, (url, sourceKey) => fetchExternalSource(url, { headers: { Accept: sourceKey === "arxiv" ? "application/atom+xml" : "application/json" }, signal: AbortSignal.any([deadline, AbortSignal.timeout(7000)]) }, { database: db, sourceKey, maxRetries: 0, maxInlineWaitMs: 500 }), preprintOnly);
  const retryAt = result.hit ? 0 : Date.now() + Math.max(result.retryMs, result.related ? 24 * 3600000 : result.failed ? 5 * 60000 : 6 * 3600000);
  const status = result.hit ? "found" : result.related ? "related_version" : result.failed ? "source_error" : "not_found";
  const statements = [];
  if (result.hit) statements.push(db.prepare(`UPDATE paper_insights SET abstract_text=?,
    analysis_model=CASE WHEN analysis_source='deepseek_rejected' AND ever_recommended=0 THEN '' ELSE analysis_model END,
    analysis_source=CASE WHEN analysis_source='deepseek_rejected' AND ever_recommended=0 THEN 'deepseek_screened' ELSE analysis_source END,
    updated_at=CURRENT_TIMESTAMP WHERE paper_id=? AND space_id=? AND length(trim(abstract_text)) < length(?)
    AND EXISTS(SELECT 1 FROM paper_abstract_recovery WHERE paper_id=? AND lock_token=?)`)
    .bind(result.hit.abstractText, paperId, spaceId, result.hit.abstractText, paperId, token));
  statements.push(db.prepare("UPDATE paper_abstract_recovery SET status=?,source_url=?,retry_at=?,attempted_json=?,result_json=?,lock_token=NULL,lease_until=0,updated_at=CURRENT_TIMESTAMP WHERE paper_id=? AND space_id=? AND lock_token=?")
    .bind(status, result.hit?.sourceUrl || "", retryAt, JSON.stringify(result.attempted), result.related ? JSON.stringify(result.related) : "", paperId, spaceId, token));
  await db.batch(statements);
  return readAbstractRecovery(db, spaceId, paperId);
}
