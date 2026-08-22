import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";
import {
  boundedEvidenceConfidence,
  evidenceCoverageScore,
  evidenceQuoteIsGrounded,
  extractArxivId,
  fullTextEvidenceQualifiesForMustRead,
  normalizeEvidenceText,
  safeEvidenceSourceUrl,
  type PaperEvidenceClaimInput,
  type PaperEvidenceClaimKind,
  type PaperEvidenceLevel,
} from "../../../lib/paper-evidence";

type PaperRow = {
  id: string;
  canonical_id: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  abstract_text: string;
  summary_zh: string;
  summary_en: string;
  proposed_recommendation_tier: "must_read" | "browse" | "reserve";
  recommendation_tier: "must_read" | "browse" | "reserve";
};

type EvidenceDocumentRow = {
  id: string;
  status: string;
  evidence_level: PaperEvidenceLevel;
  source_kind: string;
  source_url: string;
  license: string;
  extracted_chars: number;
  section_count: number;
  claim_count: number;
  grounded_claim_count: number;
  unsupported_claim_count: number;
  coverage_score: number;
  model: string;
  error: string | null;
  fetched_at: string | null;
  analyzed_at: string | null;
  updated_at: string;
};

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

type EvidenceAnalysis = {
  problemZh?: string;
  problemEn?: string;
  methodZh?: string;
  methodEn?: string;
  contributionZh?: string;
  contributionEn?: string;
  limitationsZh?: string;
  limitationsEn?: string;
  readingFocusZh?: string;
  readingFocusEn?: string;
  researchQuestionsZh?: string[];
  researchQuestionsEn?: string[];
  claims?: Array<Partial<PaperEvidenceClaimInput>>;
  abstractConflict?: boolean;
};

type StructuredSection = { label: string; text: string };
type ResolvedEvidence = {
  level: PaperEvidenceLevel;
  sourceKind: string;
  sourceUrl: string;
  license: string;
  text: string;
  sections: StructuredSection[];
  note: string;
};

const CLAIM_KINDS = new Set<PaperEvidenceClaimKind>(["problem", "method", "result", "contribution", "limitation"]);
const MAX_SOURCE_CHARS = 46_000;
const EVIDENCE_DAILY_GLOBAL_LIMIT = 120;
const EVIDENCE_DAILY_WORKSPACE_LIMIT = 18;

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLocaleLowerCase()] ?? match);
}

function stripMarkup(value: string) {
  return normalizeEvidenceText(decodeEntities(value
    .replace(/<(script|style|math|svg|table)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|title|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")));
}

function structuredSections(markup: string) {
  const sections: StructuredSection[] = [];
  const pattern = /<(sec|section)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of markup.matchAll(pattern)) {
    const body = match[2] || "";
    const heading = body.match(/<(?:title|h[1-6])\b[^>]*>([\s\S]*?)<\/(?:title|h[1-6])>/i)?.[1] || "";
    const label = stripMarkup(heading).slice(0, 140) || `Section ${sections.length + 1}`;
    if (/references|bibliography|acknowledg|参考文献|致谢/i.test(label)) continue;
    const text = stripMarkup(body).slice(0, 11_000);
    if (text.length >= 180) sections.push({ label, text });
    if (sections.length >= 12) break;
  }
  if (!sections.length) {
    const text = stripMarkup(markup).slice(0, MAX_SOURCE_CHARS);
    if (text.length >= 180) sections.push({ label: "Full text", text });
  }
  let remaining = MAX_SOURCE_CHARS;
  return sections.flatMap((section) => {
    if (remaining <= 0) return [];
    const text = section.text.slice(0, remaining);
    remaining -= text.length;
    return text.length >= 180 ? [{ ...section, text }] : [];
  });
}

async function fetchMarkup(url: string, accept: string) {
  const safeUrl = safeEvidenceSourceUrl(url);
  if (!safeUrl) return "";
  const response = await fetch(safeUrl, {
    headers: { Accept: accept, "User-Agent": "Pi-Research/1.0 (evidence-grounding; contact via application owner)" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return "";
  const contentType = response.headers.get("content-type") || "";
  if (!/html|xml|text/i.test(contentType)) return "";
  return (await response.text()).slice(0, 1_500_000);
}

function httpsUrl(value: unknown) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

async function resolveEuropePmc(doi: string) {
  if (!doi) return null;
  const endpoint = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  endpoint.searchParams.set("query", `DOI:"${doi.replace(/["\\]/g, "")}"`);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("resultType", "core");
  endpoint.searchParams.set("pageSize", "3");
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  const data = await response.json() as { resultList?: { result?: Array<{ pmcid?: string; isOpenAccess?: string }> } };
  const record = data.resultList?.result?.find((item) => item.pmcid && item.isOpenAccess === "Y")
    || data.resultList?.result?.find((item) => item.pmcid);
  if (!record?.pmcid) return null;
  const sourceUrl = `https://europepmc.org/articles/${record.pmcid}`;
  const xmlUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/${record.pmcid}/fullTextXML`;
  const markup = await fetchMarkup(xmlUrl, "application/xml,text/xml;q=0.9");
  if (!markup) return null;
  return { sourceUrl, sourceKind: "europe_pmc_xml", license: "Europe PMC Open Access", markup };
}

async function resolveOpenAccessLocation(doi: string) {
  if (!doi) return { url: "", license: "" };
  try {
    const endpoint = new URL(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
    endpoint.searchParams.set("select", "best_oa_location,open_access");
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(9_000) });
    if (!response.ok) return { url: "", license: "" };
    const data = await response.json() as {
      best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null; license?: string | null } | null;
      open_access?: { oa_url?: string | null; oa_status?: string | null } | null;
    };
    return {
      url: httpsUrl(data.best_oa_location?.pdf_url || data.best_oa_location?.landing_page_url || data.open_access?.oa_url),
      license: cleanText(data.best_oa_location?.license || data.open_access?.oa_status || ""),
    };
  } catch {
    return { url: "", license: "" };
  }
}

async function resolveEvidenceSource(paper: PaperRow): Promise<ResolvedEvidence> {
  const doi = paper.doi?.trim().toLocaleLowerCase() || "";
  try {
    const pmc = await resolveEuropePmc(doi);
    if (pmc) {
      const sections = structuredSections(pmc.markup);
      const text = sections.map((section) => section.text).join("\n");
      if (text.length >= 1_200) return { level: "fulltext", ...pmc, text, sections, note: "" };
    }
  } catch {
    // Continue to another legal open source.
  }

  const arxivId = extractArxivId(paper.canonical_id, paper.url);
  if (arxivId) {
    const sourceUrl = `https://arxiv.org/html/${encodeURIComponent(arxivId)}`;
    try {
      const markup = await fetchMarkup(sourceUrl, "text/html,application/xhtml+xml;q=0.9");
      if (markup) {
        const sections = structuredSections(markup);
        const text = sections.map((section) => section.text).join("\n");
        if (text.length >= 1_200) return { level: "fulltext", sourceKind: "arxiv_html", sourceUrl, license: "arXiv public full text", text, sections, note: "" };
      }
    } catch {
      // The abstract remains a safe fallback when HTML conversion is absent.
    }
  }

  const openAccess = await resolveOpenAccessLocation(doi);
  const abstractText = cleanText(paper.abstract_text);
  if (abstractText) {
    return {
      level: "abstract",
      sourceKind: openAccess.url ? "abstract_with_oa_link" : "abstract",
      sourceUrl: openAccess.url || paper.url || (doi ? `https://doi.org/${doi}` : ""),
      license: openAccess.license,
      text: abstractText,
      sections: [{ label: "Abstract", text: abstractText }],
      note: openAccess.url ? "Open full text was located, but this source is not available as structured HTML or XML." : "Structured open full text was not found.",
    };
  }
  return {
    level: "metadata", sourceKind: openAccess.url ? "metadata_with_oa_link" : "metadata",
    sourceUrl: openAccess.url || paper.url || (doi ? `https://doi.org/${doi}` : ""), license: openAccess.license,
    text: "", sections: [], note: "No abstract or structured open full text was available.",
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseJsonObject(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned) as EvidenceAnalysis; } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The evidence analysis returned malformed JSON");
    return JSON.parse(cleaned.slice(start, end + 1)) as EvidenceAnalysis;
  }
}

async function usageCount(database: D1Database, scope: string, usageDate: string) {
  return (await database.prepare("SELECT request_count FROM ai_usage_daily WHERE scope = ? AND usage_date = ? LIMIT 1")
    .bind(scope, usageDate).first<{ request_count: number }>())?.request_count || 0;
}

async function recordUsage(database: D1Database, scope: string, usageDate: string, inputTokens: number, outputTokens: number) {
  await database.prepare(
    `INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(scope, usage_date) DO UPDATE SET request_count = request_count + 1,
      input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens,
      updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), scope, usageDate, inputTokens, outputTokens).run();
}

async function readEvidence(database: D1Database, spaceId: string, paperId: string) {
  const document = await database.prepare(
    `SELECT id, status, evidence_level, source_kind, source_url, license, extracted_chars, section_count,
     claim_count, grounded_claim_count, unsupported_claim_count, coverage_score, model, error,
     fetched_at, analyzed_at, updated_at FROM paper_evidence_documents WHERE space_id = ? AND paper_id = ? LIMIT 1`,
  ).bind(spaceId, paperId).first<EvidenceDocumentRow>();
  if (!document) return null;
  const claims = await database.prepare(
    `SELECT id, kind, claim_zh, claim_en, evidence_quote, section_label, locator, source_url,
     confidence, grounded, position FROM paper_evidence_claims WHERE document_id = ? ORDER BY position`,
  ).bind(document.id).all<{
    id: string; kind: PaperEvidenceClaimKind; claim_zh: string; claim_en: string; evidence_quote: string;
    section_label: string; locator: string; source_url: string; confidence: number; grounded: number; position: number;
  }>();
  return {
    status: document.status,
    evidenceLevel: document.evidence_level,
    sourceKind: document.source_kind,
    sourceUrl: document.source_url,
    license: document.license,
    extractedChars: document.extracted_chars,
    sectionCount: document.section_count,
    claimCount: document.claim_count,
    groundedClaimCount: document.grounded_claim_count,
    unsupportedClaimCount: document.unsupported_claim_count,
    coverageScore: document.coverage_score,
    model: document.model,
    error: document.error,
    fetchedAt: document.fetched_at,
    analyzedAt: document.analyzed_at,
    updatedAt: document.updated_at,
    claims: claims.results.map((claim) => ({
      id: claim.id, kind: claim.kind, claimZh: claim.claim_zh, claimEn: claim.claim_en,
      evidenceQuote: claim.evidence_quote, sectionLabel: claim.section_label, locator: claim.locator,
      sourceUrl: claim.source_url, confidence: claim.confidence, grounded: Boolean(claim.grounded), position: claim.position,
    })),
  };
}

async function ownedPaper(database: D1Database, userId: string, spaceId: string, paperId: string) {
  return database.prepare(
    `SELECT p.id, p.canonical_id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at,
     COALESCE(i.abstract_text, '') AS abstract_text, COALESCE(i.summary_zh, '') AS summary_zh,
     COALESCE(i.summary_en, '') AS summary_en,
     COALESCE(i.proposed_recommendation_tier, i.recommendation_tier, 'browse') AS proposed_recommendation_tier,
     COALESCE(i.recommendation_tier, 'browse') AS recommendation_tier
     FROM monitored_papers p JOIN research_spaces s ON s.id = p.space_id
     LEFT JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
     WHERE p.id = ? AND p.space_id = ? AND s.owner_user_id = ? LIMIT 1`,
  ).bind(paperId, spaceId, userId).first<PaperRow>();
}

async function applyEvidenceBoundedRecommendationTier(
  database: D1Database,
  spaceId: string,
  paperId: string,
  qualifiesForMustRead: boolean,
) {
  await database.prepare(
    `UPDATE paper_insights SET recommendation_tier = CASE
      WHEN proposed_recommendation_tier = 'must_read' THEN ?
      ELSE proposed_recommendation_tier END,
     updated_at = CURRENT_TIMESTAMP WHERE paper_id = ? AND space_id = ?`,
  ).bind(qualifiesForMustRead ? "must_read" : "browse", paperId, spaceId).run();
}

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId")?.trim() || "";
  const paperId = url.searchParams.get("paperId")?.trim() || "";
  if (!spaceId || !paperId) return Response.json({ error: "spaceId and paperId are required" }, { status: 400 });
  const database = getDatabase();
  await ensureSchema(database);
  if (!await ownedPaper(database, user.userId, spaceId, paperId)) return Response.json({ error: "Paper not found" }, { status: 404 });
  return Response.json({ evidence: await readEvidence(database, spaceId, paperId) });
}

export async function POST(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  const payload = await request.json() as { spaceId?: string; paperId?: string; force?: boolean };
  const spaceId = payload.spaceId?.trim() || "";
  const paperId = payload.paperId?.trim() || "";
  if (!spaceId || !paperId) return Response.json({ error: "spaceId and paperId are required" }, { status: 400 });
  const database = getDatabase();
  await ensureSchema(database);
  const paper = await ownedPaper(database, user.userId, spaceId, paperId);
  if (!paper) return Response.json({ error: "Paper not found" }, { status: 404 });

  const documentId = crypto.randomUUID();
  await database.prepare(
    `INSERT INTO paper_evidence_documents (id, space_id, paper_id, status)
     VALUES (?, ?, ?, 'queued') ON CONFLICT(space_id, paper_id) DO NOTHING`,
  ).bind(documentId, spaceId, paperId).run();
  const current = await readEvidence(database, spaceId, paperId);
  if (current?.status === "ready" && !payload.force) {
    await applyEvidenceBoundedRecommendationTier(database, spaceId, paperId, fullTextEvidenceQualifiesForMustRead({
      level: current.evidenceLevel,
      status: current.status,
      groundedClaims: current.groundedClaimCount,
      coverageScore: current.coverageScore,
      unsupportedClaims: current.unsupportedClaimCount,
    }));
    return Response.json({ evidence: await readEvidence(database, spaceId, paperId), cached: true });
  }

  const lockToken = crypto.randomUUID();
  const lock = await database.prepare(
    `UPDATE paper_evidence_documents SET status = 'fetching', lock_token = ?,
     lock_expires_at = datetime('now', '+3 minutes'), error = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE space_id = ? AND paper_id = ?
      AND (? = 1 OR lock_expires_at IS NULL OR lock_expires_at < CURRENT_TIMESTAMP OR status <> 'fetching')`,
  ).bind(lockToken, spaceId, paperId, payload.force ? 1 : 0).run();
  if (!lock.meta?.changes) return Response.json({ evidence: current, busy: true }, { status: 202 });

  try {
    const source = await resolveEvidenceSource(paper);
    const sourceText = source.sections.map((section) => section.text).join("\n").slice(0, MAX_SOURCE_CHARS);
    const textHash = sourceText ? await sha256(sourceText) : "";
    await database.prepare(
      `UPDATE paper_evidence_documents SET evidence_level = ?, source_kind = ?, source_url = ?, license = ?,
       text_hash = ?, extracted_chars = ?, section_count = ?, fetched_at = CURRENT_TIMESTAMP,
       error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ? AND lock_token = ?`,
    ).bind(source.level, source.sourceKind, source.sourceUrl, source.license, textHash, sourceText.length,
      source.sections.length, source.note || null, spaceId, paperId, lockToken).run();

    if (source.level === "metadata" || !sourceText) {
      await applyEvidenceBoundedRecommendationTier(database, spaceId, paperId, false);
      await database.prepare(
        `UPDATE paper_evidence_documents SET status = 'partial', lock_token = NULL, lock_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ? AND lock_token = ?`,
      ).bind(spaceId, paperId, lockToken).run();
      return Response.json({ evidence: await readEvidence(database, spaceId, paperId) });
    }

    const credential = resolveDeepSeekCredential(request);
    if (!credential.apiKey) {
      await applyEvidenceBoundedRecommendationTier(database, spaceId, paperId, false);
      await database.prepare(
        `UPDATE paper_evidence_documents SET status = 'partial', error = ?, lock_token = NULL,
         lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ? AND lock_token = ?`,
      ).bind("Full-text evidence was located; configure DeepSeek Pro to produce grounded claims.", spaceId, paperId, lockToken).run();
      return Response.json({ evidence: await readEvidence(database, spaceId, paperId), modelRequired: true });
    }

    const usageDate = new Date().toISOString().slice(0, 10);
    const workspaceScope = "paper-evidence-workspace:" + user.userId.replace(/^anonymous:/, "");
    const [globalCount, workspaceCount] = await Promise.all([
      usageCount(database, "paper-evidence:global", usageDate),
      usageCount(database, workspaceScope, usageDate),
    ]);
    if (globalCount >= EVIDENCE_DAILY_GLOBAL_LIMIT || workspaceCount >= EVIDENCE_DAILY_WORKSPACE_LIMIT) {
      await applyEvidenceBoundedRecommendationTier(database, spaceId, paperId, false);
      await database.prepare(
        `UPDATE paper_evidence_documents SET status = 'partial', error = ?, lock_token = NULL,
         lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ? AND lock_token = ?`,
      ).bind("Today's evidence-deepening allowance is complete; the located source is preserved for the next active session.", spaceId, paperId, lockToken).run();
      return Response.json({ evidence: await readEvidence(database, spaceId, paperId), budgetReached: true }, { status: 202 });
    }

    const sourcePayload = source.sections.map((section) => `[SECTION: ${section.label}]\n${section.text}`).join("\n\n");
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + credential.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: credential.model,
        messages: [
          { role: "system", content: "You are Pi Research's evidence-grounding editor. Return strict JSON. Every evidence quote must be copied verbatim from the supplied source." },
          { role: "user", content: [
            `Ground this paper analysis in the supplied ${source.level === "fulltext" ? "open full text" : "abstract"}.`,
            "Return {problemZh,problemEn,methodZh,methodEn,contributionZh,contributionEn,limitationsZh,limitationsEn,readingFocusZh,readingFocusEn,researchQuestionsZh,researchQuestionsEn,abstractConflict,claims}.",
            "claims must contain 4-8 items. Each item is {kind,claimZh,claimEn,evidenceQuote,sectionLabel,locator,confidence}; kind is problem|method|result|contribution|limitation.",
            "Copy a short evidenceQuote exactly from the supplied source, keep it under 240 characters, and use the exact supplied section label as both sectionLabel and locator. Never invent page, figure, theorem, or section numbers.",
            "Do not claim novelty, optimality, complete characterization, proof, experimental confirmation, convergence, causality, or limitation unless the source explicitly states it. If a limitation is not stated, say the supplied evidence does not establish one instead of guessing.",
            "Keep the bilingual analysis concise. researchQuestions must be grounded follow-up questions, not asserted findings. abstractConflict is true only when the supplied full text materially qualifies or contradicts the abstract.",
            `Paper metadata: ${JSON.stringify({ title: paper.title, authors: paper.authors, venue: paper.venue, publishedAt: paper.published_at, abstract: paper.abstract_text.slice(0, 3000), priorSummaryZh: paper.summary_zh, priorSummaryEn: paper.summary_en })}`,
            `Source URL: ${source.sourceUrl}`,
            `Source text:\n${sourcePayload}`,
          ].join("\n") },
        ],
        thinking: { type: "enabled" },
        reasoning_effort: source.level === "fulltext" ? "high" : "medium",
        response_format: { type: "json_object" },
        max_tokens: 5200,
        stream: false,
      }),
      signal: AbortSignal.timeout(55_000),
    });
    const data = await response.json() as DeepSeekResponse;
    if (!response.ok) throw new Error(data.error?.message || "Evidence-grounded analysis failed");
    const content = data.choices?.[0]?.message?.content || "";
    if (!content.trim()) throw new Error("Evidence-grounded analysis was empty");
    const analysis = parseJsonObject(content);
    const claims = (Array.isArray(analysis.claims) ? analysis.claims : []).slice(0, 8).flatMap((claim, position) => {
      const kind = CLAIM_KINDS.has(claim.kind as PaperEvidenceClaimKind) ? claim.kind as PaperEvidenceClaimKind : null;
      const claimZh = cleanText(claim.claimZh).slice(0, 700);
      const claimEn = cleanText(claim.claimEn).slice(0, 900);
      const evidenceQuote = cleanText(claim.evidenceQuote).slice(0, 280);
      if (!kind || !claimZh || !claimEn || !evidenceQuote) return [];
      const grounded = evidenceQuoteIsGrounded(sourceText, evidenceQuote);
      const sectionLabel = cleanText(claim.sectionLabel).slice(0, 180);
      const suppliedSection = source.sections.find((section) => normalizeEvidenceText(section.label).toLocaleLowerCase()
        === normalizeEvidenceText(sectionLabel).toLocaleLowerCase());
      const locator = suppliedSection ? suppliedSection.label : source.level === "abstract" ? "Abstract" : "";
      return [{ kind, claimZh, claimEn, evidenceQuote, sectionLabel: locator, locator,
        confidence: boundedEvidenceConfidence(source.level, claim.confidence, grounded), grounded, position }];
    });
    const groundedCount = claims.filter((claim) => claim.grounded).length;
    const unsupportedCount = claims.length - groundedCount;
    const coverageScore = evidenceCoverageScore(claims);
    const locatorCoverage = claims.length ? Math.round(claims.filter((claim) => claim.grounded && claim.locator).length / claims.length * 100) : 0;
    const groundingRate = claims.length ? Math.round(groundedCount / claims.length * 100) : 0;
    const groundedClaims = claims.filter((claim) => claim.grounded);
    const kindText = (kinds: PaperEvidenceClaimKind[], locale: "zh" | "en", limit: number) => groundedClaims
      .filter((claim) => kinds.includes(claim.kind))
      .map((claim) => locale === "zh" ? claim.claimZh : claim.claimEn)
      .filter(Boolean).slice(0, limit).join(locale === "zh" ? "；" : "; ");
    const strongestGrounded = [...groundedClaims].sort((left, right) => {
      const rank: Record<PaperEvidenceClaimKind, number> = { contribution: 0, result: 1, method: 2, problem: 3, limitation: 4 };
      return rank[left.kind] - rank[right.kind] || right.confidence - left.confidence;
    }).slice(0, 3);
    const groundedSummaryZh = strongestGrounded.map((claim) => claim.claimZh).join("；").slice(0, 1100);
    const groundedSummaryEn = strongestGrounded.map((claim) => claim.claimEn).join("; ").slice(0, 1500);
    const focusClaim = strongestGrounded[0];
    const groundedReadingFocusZh = focusClaim
      ? `重点核对${focusClaim.locator ? `“${focusClaim.locator}”中的证据` : "原文证据"}：${focusClaim.claimZh}`.slice(0, 1100) : "";
    const groundedReadingFocusEn = focusClaim
      ? `Check the evidence in ${focusClaim.locator || "the source text"}: ${focusClaim.claimEn}`.slice(0, 1500) : "";
    const qualifiesForMustRead = fullTextEvidenceQualifiesForMustRead({
      level: source.level, status: "ready", groundedClaims: groundedCount, coverageScore, unsupportedClaims: unsupportedCount,
    });
    const document = await database.prepare("SELECT id FROM paper_evidence_documents WHERE space_id = ? AND paper_id = ? AND lock_token = ?")
      .bind(spaceId, paperId, lockToken).first<{ id: string }>();
    if (!document) throw new Error("Evidence job ownership expired");

    const statements = [
      database.prepare("DELETE FROM paper_evidence_claims WHERE document_id = ?").bind(document.id),
      database.prepare("DELETE FROM paper_evidence_audits WHERE document_id = ?").bind(document.id),
      ...claims.map((claim) => database.prepare(
        `INSERT INTO paper_evidence_claims
         (id, document_id, space_id, paper_id, kind, claim_zh, claim_en, evidence_quote,
          section_label, locator, source_url, confidence, grounded, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), document.id, spaceId, paperId, claim.kind, claim.claimZh, claim.claimEn,
        claim.evidenceQuote, claim.sectionLabel, claim.locator, source.sourceUrl, claim.confidence, claim.grounded ? 1 : 0, claim.position)),
      database.prepare(
        `INSERT INTO paper_evidence_audits
         (id, document_id, space_id, paper_id, evidence_level, grounding_rate, locator_coverage,
          unsupported_claims, abstract_conflict_count, model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(document_id) DO UPDATE SET evidence_level = excluded.evidence_level,
          grounding_rate = excluded.grounding_rate, locator_coverage = excluded.locator_coverage,
          unsupported_claims = excluded.unsupported_claims, abstract_conflict_count = excluded.abstract_conflict_count,
          model = excluded.model, created_at = CURRENT_TIMESTAMP`,
      ).bind(crypto.randomUUID(), document.id, spaceId, paperId, source.level, groundingRate, locatorCoverage,
        unsupportedCount, analysis.abstractConflict ? 1 : 0, credential.model),
      database.prepare(
        `UPDATE paper_insights SET summary_zh = COALESCE(NULLIF(?, ''), summary_zh),
         summary_en = COALESCE(NULLIF(?, ''), summary_en),
         problem_zh = COALESCE(NULLIF(?, ''), problem_zh),
         problem_en = COALESCE(NULLIF(?, ''), problem_en), method_zh = COALESCE(NULLIF(?, ''), method_zh),
         method_en = COALESCE(NULLIF(?, ''), method_en), contribution_zh = COALESCE(NULLIF(?, ''), contribution_zh),
         contribution_en = COALESCE(NULLIF(?, ''), contribution_en), limitations_zh = COALESCE(NULLIF(?, ''), limitations_zh),
         limitations_en = COALESCE(NULLIF(?, ''), limitations_en), reading_focus_zh = COALESCE(NULLIF(?, ''), reading_focus_zh),
         reading_focus_en = COALESCE(NULLIF(?, ''), reading_focus_en),
         research_questions_zh = COALESCE(NULLIF(?, '[]'), research_questions_zh),
         research_questions_en = COALESCE(NULLIF(?, '[]'), research_questions_en),
         recommendation_tier = CASE WHEN proposed_recommendation_tier = 'must_read' THEN ? ELSE proposed_recommendation_tier END,
         updated_at = CURRENT_TIMESTAMP WHERE paper_id = ? AND space_id = ?`,
      ).bind(groundedSummaryZh, groundedSummaryEn,
        kindText(["problem"], "zh", 2).slice(0, 1100), kindText(["problem"], "en", 2).slice(0, 1500),
        kindText(["method"], "zh", 2).slice(0, 1100), kindText(["method"], "en", 2).slice(0, 1500),
        kindText(["contribution", "result"], "zh", 3).slice(0, 1100), kindText(["contribution", "result"], "en", 3).slice(0, 1500),
        kindText(["limitation"], "zh", 2).slice(0, 1100), kindText(["limitation"], "en", 2).slice(0, 1500),
        groundedReadingFocusZh, groundedReadingFocusEn,
        JSON.stringify((analysis.researchQuestionsZh || []).map(cleanText).filter(Boolean).slice(0, 6)),
        JSON.stringify((analysis.researchQuestionsEn || []).map(cleanText).filter(Boolean).slice(0, 6)),
        qualifiesForMustRead ? "must_read" : "browse", paperId, spaceId),
      database.prepare(
        `UPDATE paper_evidence_documents SET status = 'ready', claim_count = ?, grounded_claim_count = ?,
         unsupported_claim_count = ?, coverage_score = ?, model = ?, error = ?, analyzed_at = CURRENT_TIMESTAMP,
         lock_token = NULL, lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND lock_token = ?`,
      ).bind(claims.length, groundedCount, unsupportedCount, coverageScore, credential.model,
        unsupportedCount ? `${unsupportedCount} model claim(s) were retained as unverified inference.` : null, document.id, lockToken),
    ];
    await database.batch(statements);
    if (source.level === "fulltext" && groundedCount >= 3 && coverageScore >= 70 && unsupportedCount <= 1) {
      const routes = await database.prepare(
        `SELECT proposal.track_id FROM research_map_evidence_proposals proposal
         WHERE proposal.space_id = ? AND proposal.paper_id = ? AND proposal.status = 'confirmed'
         ORDER BY proposal.confidence DESC LIMIT 3`,
      ).bind(spaceId, paperId).all<{ track_id: string }>();
      const strongest = strongestGrounded;
      const summaryZh = strongest.map((claim) => claim.claimZh).join("；").slice(0, 900);
      const summaryEn = strongest.map((claim) => claim.claimEn).join("; ").slice(0, 1200);
      for (const route of routes.results) {
        await database.batch([
          database.prepare(
            `INSERT INTO research_map_changes
             (id, space_id, track_id, paper_id, kind, title_zh, title_en, summary_zh, summary_en, confidence)
             VALUES (?, ?, ?, ?, 'evidence_refined', ?, ?, ?, ?, ?)
             ON CONFLICT(paper_id, track_id, kind) DO UPDATE SET summary_zh = excluded.summary_zh,
              summary_en = excluded.summary_en, confidence = excluded.confidence, created_at = CURRENT_TIMESTAMP`,
          ).bind(crypto.randomUUID(), spaceId, route.track_id, paperId, `全文证据已补强：${paper.title}`.slice(0, 300),
            `Full-text evidence refined: ${paper.title}`.slice(0, 360), summaryZh, summaryEn,
            Math.min(94, Math.max(...strongest.map((claim) => claim.confidence)))),
          database.prepare(
            `UPDATE research_tracks SET intelligence_updated_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND space_id = ?`,
          ).bind(route.track_id, spaceId),
        ]);
      }
    }
    await Promise.all([
      recordUsage(database, "paper-evidence:global", usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      recordUsage(database, workspaceScope, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      recordUsage(database, "monitor-space:" + spaceId, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
    ]);
    return Response.json({ evidence: await readEvidence(database, spaceId, paperId) });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Evidence deepening failed";
    await applyEvidenceBoundedRecommendationTier(database, spaceId, paperId, false);
    await database.prepare(
      `UPDATE paper_evidence_documents SET status = CASE WHEN extracted_chars > 0 THEN 'partial' ELSE 'error' END,
       error = ?, lock_token = NULL, lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE space_id = ? AND paper_id = ? AND lock_token = ?`,
    ).bind(message, spaceId, paperId, lockToken).run();
    return Response.json({ error: message, evidence: await readEvidence(database, spaceId, paperId) }, { status: 500 });
  }
}
