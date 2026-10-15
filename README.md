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

## Workspace access and recovery

New visitors create their own research space; sample spaces live in Demo. Existing spaces keep their original IDs and ownership namespace. Loading spaces never seeds or deletes research data.

Under **Manage workspaces → Access & recovery**, sign in through the site's existing ChatGPT sign-in service and confirm connecting the current browser workspace. The account connection points to the existing workspace; it does not copy or merge spaces, papers, notes, routes or memories. A new device signed in with the same connected account can recover that workspace. A browser with different saved spaces requires an explicit switch, and its original workspace remains accessible through the return option while its browser identity is retained.

Browser-only use and legacy browser identities remain compatible; connecting an account does not revoke other pre-existing browser access. Connected browser sessions use protected cookies and require the matching platform account after sign-out. Model keys and unsaved drafts do not transfer across devices. Library exports remain separate paper/note backups. If the original browser identity was already cleared before an account connection was made, a space link alone cannot recover access.

Local identity tests use isolated Worker/D1 databases and fixture platform headers. The hosted sign-in redirect is owned by Sites; local previews do not provide that authentication service.

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

## Comparison workflow pilot

Paper comparison offers an opt-in, one-correction workflow using LangGraph.js. Existing comparisons keep their original identities and remain in history. New compact-evidence baselines append `:evidence-v2`; field-correction trials append `:revision-v2`. Selection lookup prefers these versions, then falls back to the original `:revision-v1` trial and baseline. No prior rejection or correction count is reset in place. Rejected comparisons show field-specific review reasons and links to the relevant source papers.

The graph routes through draft, batched independent review, optional correction and a final publication gate. It collects a complete review before deciding whether a correction is justified. Only explicitly repairable issues enter the correction branch; an evidence gap stops it. One successful correction is allowed, followed by a new review of **every** field. A second rejection stops the run. Corrections are field patches: server-generated target IDs permit changes only to failed bilingual field groups. Approved fields, dimension/paper identities and step order are preserved exactly. Extra targets, full rewrites, missing/duplicate patches and dangling dependent references are rejected atomically without consuming the committed correction allowance.

New drafts use `anchors-v1`: the server slices exact abstract spans into a stable quote catalog and supplies short paper keys. The model selects quote IDs and short cell references instead of copying quotations and UUIDs. The server resolves them back to canonical source IDs and original text, then applies the existing quote-location, coverage, bilingual and instruction-reference validators. A quote ID belonging to another paper is invalid. Catalogs are reconstructed from the current source snapshot under the existing revision/lease guards. Quote existence still does not establish entailment: independent review checks all factual qualifications in both languages.

Each HTTP advance performs at most one model call. The existing D1 workbook row is the authoritative domain checkpoint; a new graph invocation rehydrates its draft, checks and correction count. Saves retain the existing owner, source revision and lease-token guards. This pilot does **not** use a native LangGraph checkpointer, a background graph server or an in-memory saver for durability. A crashed invocation can require its unfinished model call again after lease expiry; previously committed batches are not repeated. Successful-response token usage remains recorded by the existing application accounting.

Only `@langchain/langgraph` and its required `@langchain/core` dependency are added. Model calls continue through the existing direct DeepSeek adapter; the LangChain agent framework, generic ReAct tool loop, and external tracing services are not enabled. Monitoring and learning-path orchestration keep their existing implementations.

Comparison protocol failures distinguish malformed JSON, empty content, abnormal completion and invalid provider envelopes using fixed diagnostic codes, never raw model responses. A complete outer JSON code fence can be removed; malformed escapes and arbitrary surrounding prose are rejected. Protocol retries request correct JSON escaping while preserving decoded evidence verbatim.

Generated fields exceeding their declared character limits are rejected with targeted rewrite feedback. Validation never clips a generated sentence or quote to fit, since clipping can remove a mathematical qualification or make bilingual content incomplete. Historical saved text is not reconstructed from missing original model output.

`tests/workbook-graph.test.mjs` compares call budgets on identical deterministic content and covers evidence gaps, correction limits, invalid evidence and retry recovery. The built Worker API test also restarts Miniflare with persisted D1 between review batches. These checks establish runtime/recovery behavior, **not** improved academic content quality. Broader adoption requires paired real-model results on the same sources, independently assessed quality, token/latency measurements and an acceptable deployment-size cost.

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
