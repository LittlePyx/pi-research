import {
  DISCOVERY_BENCHMARK_GATES,
  DISCOVERY_BENCHMARK_VERSION,
  DISCOVERY_GOLD_SETS,
  benchmarkTitleSimilarity,
  buildBenchmarkReplayRecords,
  discoveryCalibrationSignals,
  evaluateDiscoveryRanking,
  rankBenchmarkRecords,
} from "../lib/discovery/benchmark.mjs";

const live = process.argv.includes("--live");
const headers = {
  Accept: "application/json",
  "User-Agent": "PiResearch/1.0 (internal discovery benchmark; pi-research@qiudao-pika.chatgpt.site)",
};
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let openAlexQueue = Promise.resolve();
let lastOpenAlexRequestAt = 0;
let openAlexBlockedUntil = 0;

function retryDelay(response, attempt) {
  const retryAfter = response.headers.get("retry-after")?.trim() || "";
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, Math.max(1_000, seconds * 1_000));
  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) return Math.min(30_000, Math.max(1_000, retryAt - Date.now()));
  return Math.min(6_000, 1_000 * (2 ** attempt));
}

async function pacedOpenAlexRequest(task) {
  const request = openAlexQueue.then(async () => {
    if (Date.now() < openAlexBlockedUntil) throw new Error("OpenAlex HTTP 429 circuit open");
    await sleep(Math.max(0, lastOpenAlexRequestAt + 450 - Date.now()));
    try {
      return await task();
    } catch (error) {
      if (error instanceof Error && /HTTP 429/.test(error.message)) openAlexBlockedUntil = Date.now() + 60_000;
      throw error;
    } finally {
      lastOpenAlexRequestAt = Date.now();
    }
  });
  openAlexQueue = request.catch(() => undefined);
  return request;
}

async function fetchJson(url, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
      if (response.status === 429 && new URL(url).hostname === "api.openalex.org") {
        openAlexBlockedUntil = Date.now() + retryDelay(response, attempt);
        throw new Error("OpenAlex HTTP 429 circuit open");
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt + 1 < attempts) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /OpenAlex HTTP 429/.test(error.message)) throw error;
      if (attempt + 1 < attempts) await sleep(Math.min(8_000, 750 * (2 ** attempt)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("source request failed");
}

async function openAlexSearch(query, perPage = 10) {
  const endpoint = new URL("https://api.openalex.org/works");
  endpoint.searchParams.set("search", query);
  endpoint.searchParams.set("filter", "is_paratext:false");
  endpoint.searchParams.set("per-page", String(perPage));
  endpoint.searchParams.set("select", "id,doi,display_name,publication_date,cited_by_count,relevance_score,primary_location");
  const data = await pacedOpenAlexRequest(() => fetchJson(endpoint));
  return (data.results || []).map((item, index) => ({
    title: item.display_name || "",
    venue: item.primary_location?.source?.display_name || "",
    url: item.doi || item.id || "",
    sourceScore: Math.max(1, Number(item.relevance_score || 0)) + (perPage - index) * 0.01,
    source: "openalex",
  })).filter((item) => item.title);
}

async function crossrefSearch(query, rows = 5) {
  const endpoint = new URL("https://api.crossref.org/works");
  endpoint.searchParams.set("query.title", query);
  endpoint.searchParams.set("rows", String(rows));
  endpoint.searchParams.set("select", "DOI,title,container-title,type,score");
  endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
  const data = await fetchJson(endpoint);
  return (data.message?.items || []).map((item, index) => ({
    title: item.title?.[0] || "",
    venue: item["container-title"]?.[0] || "",
    url: item.DOI ? `https://doi.org/${item.DOI}` : "",
    sourceScore: Number(item.score || 0) + (rows - index) * 0.01,
    source: "crossref",
  })).filter((item) => item.title);
}

async function mapLimit(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function dedupeTitles(records) {
  const byTitle = new Map();
  for (const record of records) {
    const key = record.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const previous = byTitle.get(key);
    if (!previous || record.sourceScore > previous.sourceScore) byTitle.set(key, record);
  }
  return [...byTitle.values()];
}

async function exactTitleRecall(profileKey, benchmark) {
  const targets = benchmark.positives.filter((item) => item.liveCheck);
  const checks = await mapLimit(targets, 3, async (target) => {
    const providers = await Promise.allSettled([
      openAlexSearch(target.title, 5),
      crossrefSearch(target.title, 5),
    ]);
    const candidates = providers.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const best = candidates.map((candidate) => ({
      ...candidate,
      similarity: Math.max(
        benchmarkTitleSimilarity(target.title, candidate.title),
        ...(target.aliases || []).map((alias) => benchmarkTitleSimilarity(alias, candidate.title)),
      ),
    })).sort((left, right) => right.similarity - left.similarity)[0];
    return {
      title: target.title,
      found: Boolean(best && best.similarity >= 0.9),
      bestTitle: best?.title || "",
      similarity: best?.similarity || 0,
      provider: best?.source || "none",
      providerErrors: providers.filter((result) => result.status === "rejected").length,
    };
  });
  return {
    recall: checks.filter((check) => check.found).length / Math.max(1, checks.length),
    checks,
  };
}

async function broadQueryQuality(profileKey, benchmark) {
  const queries = Object.values(benchmark.baselineQueries).flat();
  const providerErrors = { openalex: 0, crossref: 0 };
  const batches = await mapLimit(queries, 2, async (query) => {
    const providers = await Promise.allSettled([openAlexSearch(query, 10), crossrefSearch(query, 10)]);
    if (providers[0].status === "rejected") providerErrors.openalex += 1;
    if (providers[1].status === "rejected") providerErrors.crossref += 1;
    return providers.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  });
  const ranked = rankBenchmarkRecords(profileKey, dedupeTitles(batches.flat())).slice(0, 10);
  const judged = ranked.map((record) => ({ record, signals: discoveryCalibrationSignals(profileKey, record) }));
  const directFit = judged.filter(({ signals }) => signals.facetIds.length > 0 && !signals.likelyWrongType).length;
  const wrongType = judged.filter(({ signals }) => signals.likelyWrongType).length;
  const facets = new Set(judged.flatMap(({ signals }) => signals.facetIds));
  return {
    precisionAt10: directFit / Math.max(1, judged.length),
    wrongTypeRate: wrongType / Math.max(1, judged.length),
    facetCoverage: facets.size / Math.max(1, benchmark.facets.length),
    providerErrors,
    top10: judged.map(({ record, signals }) => ({
      title: record.title,
      score: Math.round(record.benchmarkScore),
      facets: signals.facetIds,
      wrongType: signals.likelyWrongType,
    })),
  };
}

const offline = Object.keys(DISCOVERY_GOLD_SETS).map((profileKey) =>
  evaluateDiscoveryRanking(profileKey, buildBenchmarkReplayRecords(profileKey), { k: 10 }));

const report = {
  benchmarkVersion: DISCOVERY_BENCHMARK_VERSION,
  mode: live ? "live" : "offline-replay",
  gates: DISCOVERY_BENCHMARK_GATES,
  offline: offline.map((result) => ({
    profileKey: result.profileKey,
    passed: result.passed,
    metrics: result.metrics,
    gates: result.gates,
    top10: result.ranked.slice(0, 10).map((record) => ({ title: record.title, expected: record.expected, score: record.benchmarkScore })),
  })),
};

if (live) {
  report.live = [];
  for (const [profileKey, benchmark] of Object.entries(DISCOVERY_GOLD_SETS)) {
    const [retrieval, broad] = await Promise.all([
      exactTitleRecall(profileKey, benchmark),
      broadQueryQuality(profileKey, benchmark),
    ]);
    const metrics = {
      recallAtK: retrieval.recall,
      precisionAt10: broad.precisionAt10,
      wrongTypeRate: broad.wrongTypeRate,
      facetCoverage: broad.facetCoverage,
    };
    const gates = {
      recallAtK: metrics.recallAtK >= DISCOVERY_BENCHMARK_GATES.recallAtK,
      precisionAt10: metrics.precisionAt10 >= DISCOVERY_BENCHMARK_GATES.precisionAt10,
      wrongTypeRate: metrics.wrongTypeRate <= DISCOVERY_BENCHMARK_GATES.wrongTypeRate,
      facetCoverage: metrics.facetCoverage >= DISCOVERY_BENCHMARK_GATES.facetCoverage,
    };
    report.live.push({ profileKey, passed: Object.values(gates).every(Boolean), metrics, gates, providerErrors: broad.providerErrors, retrieval: retrieval.checks, top10: broad.top10 });
  }
}

const passed = offline.every((result) => result.passed) && (!live || report.live.every((result) => result.passed));
report.passed = passed;
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!passed) process.exitCode = 1;
