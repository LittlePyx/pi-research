import { arxivIdFromUrl, normalizeWorkTitle } from "./arxiv.ts";

export type DataCiteArxivRecord = {
  arxivId: string;
  dataCiteDoi: string;
  publishedDoi: string | null;
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  url: string;
  primaryCategory: string;
  citationCount: number;
};

type DataCitePayload = {
  data?: Array<{
    id?: string;
    attributes?: {
      doi?: string;
      url?: string;
      titles?: Array<{ title?: string }>;
      creators?: Array<{ name?: string; givenName?: string; familyName?: string }>;
      descriptions?: Array<{ description?: string; descriptionType?: string }>;
      dates?: Array<{ date?: string; dateType?: string }>;
      published?: string;
      updated?: string;
      publicationYear?: number;
      subjects?: Array<{ subject?: string; subjectScheme?: string }>;
      relatedIdentifiers?: Array<{
        relationType?: string;
        relatedIdentifier?: string;
        relatedIdentifierType?: string;
      }>;
      citationCount?: number;
    };
  }>;
};

const QUERY_STOP_WORDS = new Set([
  "about", "after", "against", "and", "are", "based", "current", "for", "from", "into", "modern", "new", "paper", "research", "study", "the", "through", "toward", "towards", "under", "using", "via", "with", "work",
]);

function isoDay(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function arxivIdFromDataCiteDoi(value: string) {
  const match = value.match(/^10\.48550\/arxiv\.(.+)$/i);
  return match?.[1]?.replace(/v\d+$/i, "") || "";
}

function cleanMetadataText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function buildDataCiteArxivQuery(focus: string, from: Date, until: Date) {
  const terms = normalizeWorkTitle(focus)
    .split(" ")
    .filter((term) => term.length >= 3 && /^[a-z0-9-]+$/i.test(term) && !QUERY_STOP_WORDS.has(term))
    .slice(0, 6);
  const firstYear = Math.min(from.getUTCFullYear(), until.getUTCFullYear());
  const lastYear = Math.max(from.getUTCFullYear(), until.getUTCFullYear());
  const yearWindow = `publicationYear:[${firstYear} TO ${lastYear}]`;
  if (!terms.length) return yearWindow;
  const conceptGroups = Array.from({ length: Math.ceil(terms.length / 2) }, (_, index) => terms.slice(index * 2, index * 2 + 2))
    .filter((group) => group.length === 2 || terms.length === 1)
    .map((group) => `(${group.map((term) => `"${term}"`).join(" AND ")})`)
    .join(" OR ");
  return `(titles.title:(${conceptGroups}) OR descriptions.description:(${conceptGroups})) AND ${yearWindow}`;
}

export function parseDataCiteArxivRecords(payload: unknown): DataCiteArxivRecord[] {
  const data = (payload && typeof payload === "object" ? payload : {}) as DataCitePayload;
  return (data.data || []).map((entry) => {
    const attributes = entry.attributes || {};
    const dataCiteDoi = String(attributes.doi || entry.id || "").trim().toLocaleLowerCase();
    const url = String(attributes.url || "").trim();
    const arxivId = arxivIdFromDataCiteDoi(dataCiteDoi) || arxivIdFromUrl(url);
    const submitted = attributes.dates?.find((date) => date.dateType?.toLocaleLowerCase() === "submitted")?.date;
    const issued = attributes.dates?.find((date) => date.dateType?.toLocaleLowerCase() === "issued")?.date;
    const available = attributes.dates?.find((date) => date.dateType?.toLocaleLowerCase() === "available")?.date;
    const abstract = attributes.descriptions?.find((description) => description.descriptionType?.toLocaleLowerCase() === "abstract")?.description
      || attributes.descriptions?.[0]?.description || "";
    const category = attributes.subjects?.find((subject) => subject.subjectScheme?.toLocaleLowerCase() === "arxiv")?.subject || "";
    const categoryMatch = category.match(/\(([^()]+)\)\s*$/);
    const publishedDoi = attributes.relatedIdentifiers?.find((related) => related.relationType === "IsVersionOf"
      && related.relatedIdentifierType?.toLocaleUpperCase() === "DOI")?.relatedIdentifier?.trim().toLocaleLowerCase() || null;
    return {
      arxivId,
      dataCiteDoi,
      publishedDoi,
      title: cleanMetadataText(attributes.titles?.[0]?.title || ""),
      abstract: cleanMetadataText(abstract),
      authors: (attributes.creators || []).map((creator) => cleanMetadataText(
        creator.name || [creator.givenName, creator.familyName].filter(Boolean).join(" "),
      )).filter(Boolean),
      publishedAt: isoDay(submitted || attributes.published || issued || available || attributes.publicationYear),
      updatedAt: isoDay(attributes.updated),
      url: url || (arxivId ? `https://arxiv.org/abs/${arxivId}` : dataCiteDoi ? `https://doi.org/${dataCiteDoi}` : ""),
      primaryCategory: categoryMatch?.[1] || category,
      citationCount: Math.max(0, Math.round(Number(attributes.citationCount) || 0)),
    };
  }).filter((record) => Boolean(record.arxivId && record.title && record.abstract));
}
