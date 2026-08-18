# Pi Research

Pi Research is a bilingual AI research companion for continuous paper discovery, personalized screening, research-map growth, and evidence-grounded learning paths.

## What it does

- Scans three horizons: the latest 14 days, 6 months, and 5 years.
- Discovers papers through priority journals, Crossref, arXiv, OpenAlex, Semantic Scholar, and citation frontiers.
- Uses persistent coverage ledgers so recurring scans explore new queries, venues, pages, and graph branches.
- Uses DeepSeek Pro to reject non-papers, judge user-specific relevance, and write bilingual paper briefs and reading rationales.
- Preserves unseen, snoozed, accepted, saved, and dismissed papers in an isolated anonymous research workspace.
- Incrementally grows direction maps, paper networks, and personalized learning paths from real papers.
- Imports only user-approved public research materials; raw uploaded text is not retained.

## Local development

Requirements: Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

The application needs a D1 binding named `DB`. AI screening requires `DEEPSEEK_API_KEY`; keep it in a local ignored environment file or the hosted secret store and never commit it.

## Validation

```bash
npm run lint
npm test
npm run test:live
```

`npm test` runs the production build and deterministic product tests. `npm run test:live` checks the public contracts of Crossref, OpenAlex, arXiv, and Semantic Scholar; Semantic Scholar is treated as a graceful-degradation source when its public endpoint rate-limits anonymous requests.

## Data model

Pi Research stores structured research state in D1. Scan jobs, source/query coverage, candidate provenance, AI decisions, delivery state, feedback, research tracks, paper edges, learning paths, imports, and share snapshots are durable and scoped to one anonymous workspace and research space.

The scheduled worker checks due research spaces every 10 minutes. Each space normally completes one scan every 24 hours; failed jobs preserve discovered candidates and completed AI review batches so retries do not start from zero.
