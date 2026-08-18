export type ArxivRecord = {
  arxivId: string;
  doi: string | null;
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  url: string;
  primaryCategory: string;
};

export function normalizeWorkTitle(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\b(?:preprint|accepted manuscript|author version)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function arxivIdFromUrl(value: string) {
  const match = value.match(/arxiv\.org\/(?:abs|pdf)\/([^?#/]+?)(?:\.pdf)?(?:[?#].*)?$/i);
  return match?.[1]?.replace(/v\d+$/i, "") || "";
}

function decodeXml(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x?[0-9a-f]+);/gi, (_match, entity: string) => {
      const numeric = entity.toLocaleLowerCase().startsWith("x")
        ? Number.parseInt(entity.slice(1), 16)
        : Number.parseInt(entity, 10);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : "";
    })
    .replace(/&([a-z]+);/gi, (_match, entity: string) => named[entity.toLocaleLowerCase()] || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagText(fragment: string, tag: string) {
  const match = fragment.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function isoDay(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

export function parseArxivAtom(xml: string): ArxivRecord[] {
  const entries = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [];
  return entries.map((entry) => {
    const idUrl = tagText(entry, "id");
    const arxivId = arxivIdFromUrl(idUrl);
    const authorBlocks = entry.match(/<author(?:\s[^>]*)?>[\s\S]*?<\/author>/gi) || [];
    const doi = tagText(entry, "arxiv:doi").toLocaleLowerCase() || null;
    const categoryMatch = entry.match(/<arxiv:primary_category[^>]*term=["']([^"']+)["'][^>]*\/?\s*>/i);
    return {
      arxivId,
      doi,
      title: tagText(entry, "title"),
      abstract: tagText(entry, "summary"),
      authors: authorBlocks.map((author) => tagText(author, "name")).filter(Boolean),
      publishedAt: isoDay(tagText(entry, "published")),
      updatedAt: isoDay(tagText(entry, "updated")),
      url: idUrl,
      primaryCategory: categoryMatch?.[1] || "",
    };
  }).filter((record) => Boolean(record.arxivId && record.title));
}

function arxivTimestamp(date: Date, endOfDay = false) {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}${endOfDay ? "2359" : "0000"}`;
}

export function buildArxivSearchQuery(focus: string, from: Date, until: Date) {
  const terms = normalizeWorkTitle(focus)
    .split(" ")
    .filter((term) => term.length >= 3 && /^[a-z0-9-]+$/i.test(term))
    .slice(0, 8);
  const topic = terms.length ? `all:"${terms.join(" ")}"` : "all:research";
  return `${topic} AND submittedDate:[${arxivTimestamp(from)} TO ${arxivTimestamp(until, true)}]`;
}
