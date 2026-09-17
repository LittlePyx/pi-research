// Manual browser acceptance: Node 24 scripts/preview-learning-fixture.mjs
// No env files, Worker, database, credentials, or upstream API are loaded.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { fixtureResponse, spaces } from '../tests/fixtures/learning-ui-state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = '/__pi_reading_fixture.tsx';
const server = await createServer({
  root, configFile: false, envDir: false,
  define: { 'process.env': JSON.stringify({ NODE_ENV: 'development', __VINEXT_IMAGE_UNOPTIMIZED: 'true' }) },
  server: { host: '127.0.0.1', port: 8116, strictPort: true },
  resolve: { alias: { 'next/image': fileURLToPath(new URL('../node_modules/vinext/dist/shims/image.js', import.meta.url)) } },
  plugins: [{ name: 'isolated-learning-fixture', enforce: 'pre',
    resolveId(id) { if (id === entry) return id; },
    load(id) { if (id === entry) return `import React from 'react'; import {createRoot} from 'react-dom/client'; import App from '/app/research-app.tsx'; import '/app/globals.css'; import 'katex/dist/katex.min.css'; import '/app/math.css'; import '/app/interface-theme.css'; import '/app/workspace-design.css'; import '/app/reading-workspace.css'; createRoot(document.getElementById('root')).render(<App user={{userId:'fixture',displayName:'QA',email:'',fullName:null}} />);`; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1:8116');
        if (url.pathname.startsWith('/api/')) {
          if (req.method !== 'GET' && !(req.method === 'POST' && ['/api/monitor', '/api/feedback'].includes(url.pathname))) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Writes disabled in isolated UI fixture' }));
            return; // Never consume settings, credentials, notes, or generation bodies.
          }
          let body = '';
          for await (const chunk of req) body += chunk;
          let input = {};
          try { input = body ? JSON.parse(body) : {}; } catch { /* Return a fixture error, never forward. */ }
          const result = fixtureResponse(req.url, req.method, url.searchParams.get('spaceId') || input.spaceId || spaces[0].id);
          if (url.pathname === '/api/monitor' && result.body.monitor) {
            const sample = result.body.monitor.historyPapers[0];
            const titles = [String.raw`Sharp inequalities between Zolotarev and Wasserstein distances in $$\mathcal{P}_2(\mathbb{R}^d)$$`, 'Quantum Clock Synchronization for Future NASA Deep Space Quantum Links and Fundamental Science', 'Extending the dynamic range in quantum frequency estimation with sequential weak measurements', 'Quantum Protocols for Time Synchronisation and Distribution: A Critical Assessment', 'On the Rate–Distortion–Perception Function for Gaussian Processes', '量子网络中的时间传递与同步：方法、误差界及实验条件'];
            result.body.monitor.historyPapers = titles.map((title,i)=>({...sample,id:'reading-fixture-'+i,title,authors:'QA 示例作者 · 仅用于布局验收',venue:'Preview fixture',whyReadZh:'这是一段用于检查排版的示例文字。阅读时关注模型假设、误差来源与适用条件，比较它与当前研究问题之间的联系。',recommendedAt:'2026-09-16T08:00:00Z',publishedAt:'2026-06-10',userState:'unseen',verificationStatus:'verified'}));
            const lead = result.body.monitor.historyPapers[0];
            result.body.monitor.papers = [lead];
            result.body.monitor.dailyBrief = {date:'2026-09-17',isCurrent:true,status:'ready',headlineZh:'今天 1 篇已确认',headlineEn:'One paper confirmed',overviewZh:'QA 排版样例：从候选论文中进行筛选与评审。统计过程仅作为简报说明，不能取代研究内容。',overviewEn:'QA layout sample only.',signalsZh:['比较两类概率距离之间的不等式。阅读时核对适用的概率测度、矩条件与常数依赖。此段为排版样例，不是真实评审。'],signalsEn:['QA standfirst only.'],readingPlanZh:['核对原文假设与适用边界。'],readingPlanEn:['Check the assumptions.'],watchlistZh:[],watchlistEn:[],paperIds:[lead.id],metrics:{},model:'evidence-summary',error:null,updatedAt:'2026-09-17T00:00:00Z'};
            result.body.monitor.historyCounts={inbox:6,accepted:0,dismissed:0};
          }
          // A deliberate read delay makes the actual loading branch observable.
          if (url.pathname === '/api/learning-path' && req.method === 'GET') await new Promise((resolve) => setTimeout(resolve, 1000));
          res.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(result.body));
          return;
        }
        if (url.pathname === '/') {
          const html = await vite.transformIndexHtml('/', `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA ONLY — Reading workspace</title></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`);
          res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "connect-src 'self' ws://127.0.0.1:8116; img-src 'self' data:; form-action 'none'" });
          res.end(html);
          return;
        }
        next();
      });
    },
  }, react()],
});
await server.listen();
server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
