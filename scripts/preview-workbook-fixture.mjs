// Isolated UI content sample: no production data, credentials, or upstream calls.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { fixtureResponse, learningFixture, spaces } from "../tests/fixtures/learning-ui-state.mjs";
import { workbookSample, workbookSources } from "../tests/fixtures/research-workbook.mjs";
import { routeReadingFixture } from "../tests/fixtures/route-reading.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const entry = "/__pi_workbook_fixture.tsx";
const saved = new Map();
const server = await createServer({ root, configFile: false, envDir: false,
  define: { "process.env": JSON.stringify({ NODE_ENV: "development", __VINEXT_IMAGE_UNOPTIMIZED: "true" }) },
  server: { host: "127.0.0.1", port: 8114, strictPort: true },
  resolve: { alias: { "next/image": fileURLToPath(new URL("../node_modules/vinext/dist/shims/image.js", import.meta.url)) } },
  plugins: [{ name: "isolated-workbook-fixture", enforce: "pre",
    resolveId(id) { if (id === entry) return id; },
    load(id) { if (id === entry) return `import React from 'react'; import {createRoot} from 'react-dom/client'; import App from '/app/research-app.tsx'; import '/app/globals.css'; import 'katex/dist/katex.min.css'; import '/app/math.css'; import '/app/interface-theme.css'; createRoot(document.getElementById('root')).render(<><p style={{padding:12,background:'#fff0cf'}}>隔离内容样本：仅含已注明出处的摘要片段；不是生产推荐或模型审核结果。</p><App user={{userId:'fixture',displayName:'QA',email:'',fullName:null}} /></>);`; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, "http://127.0.0.1:8114");
      if (url.pathname.startsWith("/api/")) {
        if (!["GET", "POST"].includes(req.method) || (req.method === "POST" && !["/api/monitor", "/api/feedback", "/api/research-workbook", "/api/research-map", "/api/paper-reading"].includes(url.pathname))) {
          res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Disabled in fixture" })); return;
        }
        let body = ""; for await (const chunk of req) body += chunk;
        let input = {}; try { input = JSON.parse(body || "{}"); } catch { /* No forwarding. */ }
        const spaceId = url.searchParams.get("spaceId") || input.spaceId || spaces[0].id;
        let result = fixtureResponse(req.url, req.method, spaceId);
        const data = learningFixture(spaceId);
        if (url.pathname === "/api/research-synthesis" && req.method === "GET") result = { status: 200, body: { synthesis: { status: "empty", stale: false, statements: [], availablePaperCount: 0, availableClaimCount: 0, canGenerate: false, preparation: workbookSources.map(p => ({ id: p.id, title: p.title, url: p.url, state: "needs_confirmation", hasGroundedEvidence: true })) } } };
        if (url.pathname === "/api/research-synthesis" && req.method === "GET" && process.argv.includes("--synthesis-ready")) {
          const sample = workbookSample();
          result = { status: 200, body: { synthesis: { status: "ready", stale: false, canGenerate: false, availablePaperCount: 2, sourcePaperCount: 2, claimCount: 2, confidence: 70, questionZh: sample.questionZh, questionEn: sample.questionEn, overviewZh: sample.comparison.textZh, overviewEn: sample.comparison.textEn, changeSummaryZh: "隔离排版样本，不是生产研判。", changeSummaryEn: "Isolated layout sample, not a production synthesis.", nextSearchQuery: "", nextSearchSourceStatementId: null, statements: sample.dimensions.slice(0,2).map(d => ({ id: d.id, kind: "qualification", titleZh: d.labelZh, titleEn: d.labelEn, textZh: d.purposeZh, textEn: d.purposeEn, confidence: 70, sourcePaperIds: d.cells.filter(c => c.status === "supported").map(c => c.paperId), sources: d.cells.filter(c => c.status === "supported").map(c => { const p = workbookSources.find(p => p.id === c.paperId); return { claimId: d.id+p.id, paperId:p.id, title:p.title, authors:p.authors, venue:"Isolated excerpt sample", evidenceQuote:c.quote, locator:"Abstract excerpt", sourceUrl:p.url, evidenceLevel:"abstract" }; }) })) } } };
        }
        if (url.pathname === "/api/paper-reading" && req.method === "GET") result = { status: 200, body: { paper: { abstractText: workbookSources.find(p => p.id === url.searchParams.get("paperId"))?.abstractText || "" } } };
        if (url.pathname === "/api/paper-reading" && process.argv.includes("--abstract-missing")) {
          if (req.method === "POST") { await new Promise(resolve => setTimeout(resolve, 1000)); saved.set("abstract-ready", true); }
          result = { status:200, body:{ paper:{abstractText: saved.get("abstract-ready") ? workbookSources[0].abstractText : ""}, recovery: saved.get("abstract-ready") ? {status:"found",source_url:workbookSources[0].url,retry_at:0} : null } };
        }
        if (url.pathname === "/api/research-problem" && req.method === "GET") result = { status: 200, body: { problemState: { problem: null, hypotheses: [], actions: [], assessment: null, evidence: { canDraft: false, canAssess: false } } } };
        if (url.pathname === "/api/research-problem" && process.argv.includes("--problem-active")) {
          const sample = workbookSample();
          result = {status:200,body:{problemState:{problem:{id:"isolated-problem",status:"active",question:sample.questionZh,objective:sample.questionEn,scope:"Isolated scope sample",successCriteria:"Record a comparison with an explicit source",stage:"literature"},hypotheses:[],actions:[],assessment:{id:"isolated-assessment",summaryZh:sample.comparison.textZh,summaryEn:sample.comparison.textEn,changeZh:"",changeEn:"",uncertaintyZh:"此为隔离排版样本，仍需核对各结论的条件。",uncertaintyEn:"Isolated layout sample: check the conditions of each finding.",nextDecisionZh:"比较已引用摘要中的假设。",nextDecisionEn:"Compare assumptions in the cited abstracts.",sourceStatementIds:sample.dimensions.slice(0,2).map(d=>d.id),hypothesisImpacts:[],confidence:70,stale:false,nextSearchQuery:""},evidence:{canAssess:false,canDraft:false}}}};
        }
        if (url.pathname === "/api/research-map" && input.action === "read") result = { status: 200, body: routeReadingFixture() };
        if (url.pathname === "/api/monitor" && req.method === "POST") await new Promise(resolve => setTimeout(resolve, 10000));
        if (url.pathname === "/api/learning-path" && data) { data.learning.path.targetTrackId = "kls"; result = { status: 200, body: data.learning }; }
        if (url.pathname === "/api/monitor" && data) { data.monitor.historyPapers = workbookSources.map((s, i) => ({ ...data.monitor.historyPapers[i], id: s.id, title: s.title, authors: s.authors, url: s.url, ...(process.argv.includes("--paper-reviewed") ? { qualityStage:"reviewed", summaryZh:"", summaryEn:"", screeningReason:"Isolated review-state sample: not selected. This is not a live quality judgment." } : {}) })); if (process.argv.includes("--paper-not-preloaded") && !url.searchParams.get("paperId")) data.monitor.historyPapers = data.monitor.historyPapers.slice(1); result = { status: 200, body: { monitor: data.monitor } }; }
        if (url.pathname === "/api/research-workbook" && data) {
          const artifact = saved.get(spaceId) || null;
          if (req.method === "POST" && input.action === "save-artifact") {
            if ((artifact?.revision || 0) !== input.baseRevision) result = { status: 409, body: { error: "Newer artifact exists" } };
            else { saved.set(spaceId, { revision: (artifact?.revision || 0) + 1, value: input.value }); result = { status: 200 }; }
          } else result = { status: 200 };
          if (result.status === 200) result.body = { workbook: { id: "sample-workbook", revision: "sample-source-revision", status: "ready", stale: false, sources: workbookSources, candidates: workbookSources, content: workbookSample(), artifact: saved.get(spaceId) || null, retryAt: 0 }, versions: [{ id: "sample-workbook", status: "ready", created_at: "2026-09-10" }] };
        }
        res.writeHead(result.status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(result.body)); return;
      }
      if (url.pathname === "/") {
        const html = await vite.transformIndexHtml("/", `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA ONLY — Evidence workbook</title></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`);
        res.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": "connect-src 'self' ws://127.0.0.1:8114; img-src 'self' data:; form-action 'none'" }); res.end(html); return;
      }
      next();
    }); },
  }, react()],
});
await server.listen(); server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await server.close(); process.exit(0); });
