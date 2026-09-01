import assert from "node:assert/strict";
import test from "node:test";

import { buildDataCiteArxivQuery, parseDataCiteArxivRecords } from "../lib/discovery/datacite.ts";

test("DataCite arXiv fallback builds a bounded fielded year-window query", () => {
  const query = buildDataCiteArxivQuery(
    "information theory research using modern coding methods",
    new Date("2025-01-01T00:00:00.000Z"),
    new Date("2026-09-01T00:00:00.000Z"),
  );

  assert.match(query, /titles\.title:\(\("information" AND "theory"\) OR \("coding" AND "methods"\)\)/);
  assert.match(query, /descriptions\.description:/);
  assert.match(query, /publicationYear:\[2025 TO 2026\]/);
  assert.doesNotMatch(query, /"research"|"using"|"modern"/);
});

test("DataCite arXiv fallback keeps abstract evidence and stable arXiv identity", () => {
  const records = parseDataCiteArxivRecords({
    data: [
      {
        id: "10.48550/arxiv.2608.12345v2",
        attributes: {
          doi: "10.48550/arXiv.2608.12345v2",
          url: "https://arxiv.org/abs/2608.12345v2",
          titles: [{ title: "A &amp; B <em>Information</em> Result" }],
          creators: [{ givenName: "Ada", familyName: "Lovelace" }],
          descriptions: [{ descriptionType: "Abstract", description: "A structured abstract with usable evidence." }],
          dates: [{ dateType: "Submitted", date: "2026-08-20T08:30:00Z" }],
          updated: "2026-08-21T09:00:00Z",
          subjects: [{ subjectScheme: "arXiv", subject: "Information Theory (cs.IT)" }],
          relatedIdentifiers: [{ relationType: "IsVersionOf", relatedIdentifierType: "DOI", relatedIdentifier: "10.1000/PUBLISHED.1" }],
          citationCount: 7,
        },
      },
      {
        id: "10.48550/arxiv.2608.00000",
        attributes: { titles: [{ title: "Metadata only" }], descriptions: [] },
      },
    ],
  });

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    arxivId: "2608.12345",
    dataCiteDoi: "10.48550/arxiv.2608.12345v2",
    publishedDoi: "10.1000/published.1",
    title: "A &amp; B Information Result",
    abstract: "A structured abstract with usable evidence.",
    authors: ["Ada Lovelace"],
    publishedAt: "2026-08-20",
    updatedAt: "2026-08-21",
    url: "https://arxiv.org/abs/2608.12345v2",
    primaryCategory: "cs.IT",
    citationCount: 7,
  });
});
