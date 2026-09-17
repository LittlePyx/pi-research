# Pi Research

Pi Research is a bilingual AI research companion for continuous paper discovery, personalized screening, research-map growth, and evidence-grounded learning paths.

## What it does

- Scans three horizons: the latest 14 days, 6 months, and 5 years.
- Discovers papers through priority journals, Crossref, arXiv, DataCite's arXiv DOI metadata, OpenAlex, Semantic Scholar, and citation frontiers.
- Uses persistent coverage ledgers so recurring scans explore new queries, venues, pages, and graph branches.
- Uses DeepSeek Pro to reject non-papers, judge user-specific relevance, and write bilingual paper briefs and reading rationales.
- Uses one cached DeepSeek Pro query plan per research space and day, with focused, balanced, and open exploration modes.
- Separates explicit user preferences from evidence-based Pi inferences, applies time decay, and lets users disable inferred signals.
- Records concrete accept/reject reasons so later screening can learn methods, questions, scope boundaries, and known-work duplication.
- Preserves unseen, snoozed, accepted, saved, and dismissed papers in an isolated anonymous research workspace.
- Incrementally grows direction maps, records daily route changes from newly accepted evidence, and builds paper networks and personalized learning paths from real papers.
- Reports seven-day discovery yield, user acceptance, review volume, and AI token usage inside the scan details.
- Imports only user-approved public research materials; raw uploaded text is not retained.

## Local development

Requirements: Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

The application needs a D1 binding named `DB`. For interactive use, open the AI model status in the webpage and paste a DeepSeek API key there. Pi verifies the key and stores it only in a protected, `HttpOnly` browser cookie; it is never written to D1 or exposed back to page JavaScript. The cookie is limited to `/api`, uses `SameSite=Strict`, and expires after 30 days. A hosted `DEEPSEEK_API_KEY` secret remains optional for unattended scheduled scans that run without a user's browser session. Never commit API keys.

During active product development, set `PI_DEVELOPMENT_UNBOUNDED=1` to remove total route, evidence-gap, model-analysis, and local Semantic Scholar usage caps. Transient work continues from durable checkpoints without a maximum attempt count. Provider backoff, request timeouts, single-flight leases, per-pass batch sizes, and final recommendation quality gates remain active.

## Route collections, library graph, and email subscriptions

Route backbones remain small, curated sets. The related-literature panel reads the entire current-space library with pagination: current audited abstract relevance is used when available, conservative unreviewed title/abstract keyword matches are labelled as such, and users can add method, background, related-work, or evidence-to-examine categories. These memberships never accept a recommendation or promote formal route evidence. User exclusions and deactivated route nodes do not reappear as automatic matches.

The graph's primary explorer accepts any owned library paper as its starting point, including unreviewed papers. Queries store provider-backed references/citations separately from route membership. DOI, arXiv, and Semantic Scholar identifiers are supported; missing identifiers, pending queries, partial pages, empty source responses, and source errors are distinct states. Each query reads at most 50 references and 50 citations, retains progress, and stops at 400 relationships. This is a bounded source lookup, not proof of complete academic coverage. Existing route graph tools remain under a labelled secondary disclosure; direct, intermediate, and unrelated citation scopes are separate.

Background research maintenance now runs on existing non-visit scheduler ticks. Eligible spaces rotate by their last attempt, alternating citation lookup and route relevance review. A pass queries one paper or reviews up to four library papers against one route; route selection rotates too. Paused spaces and those outside the existing seven-day activity window are excluded. Successful citation lookups become eligible for refresh after seven days; partial pages continue sooner, with provider cooldowns preserved. No browser visit is needed, and the eligibility timestamp is not a completion guarantee.

Route review reuses the two-call abstract relevance audit, saves exact quotes and limitations, and examines the whole library over successive batches instead of requiring keyword overlap. Manual memberships and exclusions remain separate. Changed paper identity, title, abstract, or route title invalidates the saved projection; the atomic save checks sources, exclusions, pause state and lease ownership again. These relevance judgments never promote formal evidence or alter reading progress. Today, route overview/materials and the graph report actual coverage and recent work; current content remains visible while refreshing. Existing intelligence, evolution and route repair lanes now rotate instead of always preferring intelligence. Full semantic claim graphs, adaptive prerequisite DAGs and browser end-to-end acceptance remain separate outstanding work.

Daily mail is opt-in per research space. The Today page collects a recipient address, sends a six-digit verification code, and requires confirmation before enabling. Default delivery is **10:00 Asia/Shanghai**; users can edit the time or pause. The existing website scheduler checks due subscriptions, so sending may occur after the chosen minute. No Codex automation is created or resumed.

Before enabling production mail, a site administrator must set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a verified domain), and optionally `EMAIL_SITE_URL`. Keys belong only in server runtime secrets, never user forms. The UI reports an unconfigured service and disables verification/subscription rather than claiming success. See [Resend sender requirements](https://www.resend.com/docs/api-reference/errors) and [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

Mail contains that date's saved brief papers only when their recommendation evidence is verified; otherwise it honestly reports that the digest is not ready. It does not generate model content or substitute old daily papers. Durable daily delivery rows, leases, an immutable payload and provider idempotency keys protect concurrent/retry delivery. Retries stop before the provider's 24-hour idempotency expiry. “Sent” means accepted by the mail service, not proof of inbox delivery. Unsubscribe GET shows a confirmation page; POST (including one-click mail-client requests) disables sending.

## Validation

```bash
npm run lint
npm test
npm run test:live
```

`npm test` runs the production build and deterministic product tests. `npm run test:live` checks the public contracts of Crossref, OpenAlex, DataCite, arXiv, and Semantic Scholar; the shared quality pipeline keeps healthy-source evidence when any optional public endpoint rate-limits anonymous requests.

GitHub Actions separates code regressions from production operations:

- **Pi code checks** runs on pushes to `main`, pull requests and manual dispatch. It uses Node 24, `npm ci`, lint, the build/product tests and the offline discovery benchmark, in sequence. It needs no application secrets and does not deploy or scan production papers.
- **Pi background research scheduler** wakes production and checks persistent incidents. A failed run here is an operational signal, not necessarily a build or test failure. Public-provider probes (`test:live`, `test:discovery:live`) remain separate from deterministic code checks.

## Data model

Pi Research stores structured research state in D1. Scan jobs, source/query coverage, candidate provenance, AI decisions, delivery state, feedback, research tracks, paper edges, learning paths, imports, and share snapshots are durable and scoped to one anonymous workspace and research space.

The scheduled worker is configured to check due research spaces every 10 minutes; actual wake intervals must be verified from runtime records. Each space normally completes one scan every 24 hours; failed jobs preserve discovered candidates and completed AI review batches so retries do not start from zero.
