// Node 24 scripts/preview-citation-fixture.mjs — no production API or credentials.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { citationWorkbenchSource, citationMap } from '../tests/fixtures/citation-workbench.mjs';

const component = await citationWorkbenchSource();
const entry = '/__pi_citation_fixture.tsx';
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, envDir: false,
  server: { host: '127.0.0.1', port: 8113, strictPort: true },
  plugins: [{ name: 'isolated-citation-fixture', enforce: 'pre',
    resolveId(id) { if (id === entry) return id; },
    load(id) { if (id === entry) return `
      import React, {useMemo, useEffect, useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {MathText} from '/app/components/math-text.tsx';
      import {isDatabaseVerifiedCitationEdge} from '/lib/paper-network.ts';
      import '/app/globals.css'; import '/app/interface-theme.css';
      import 'katex/dist/katex.min.css'; import '/app/math.css';
      ${component}
      function Fixture() {
        const [selected, select] = useState('cited');
        const [locale, setLocale] = useState('zh');
        return <main className="v2-app" style={{display:'block', padding:16}}>
          <p>QA ONLY — isolated citation fixture</p>
          <button onClick={()=>setLocale(locale==='zh'?'en':'zh')}>中文 / English</button>
          <button onClick={(event)=>{
            const sizes=Array.from(document.querySelectorAll('.v2-citation-ledger, .v2-citation-ledger *')).map(element=>[element,parseFloat(getComputedStyle(element).fontSize)*2]);
            sizes.forEach(([element,size])=>{element.style.fontSize=size+'px';});
            event.currentTarget.disabled=true;
          }}>200% text (QA)</button>
          <output aria-label="Selected paper">{selected}</output>
          <CitationFlowWorkbench map={${JSON.stringify(citationMap)}} trackFilter="all" locale={locale}
            selectedPaperId={selected} onSelect={select} expanding={false}
            onOpenFocus={()=>{}} onAskFocus={()=>{}} onExpandFocus={()=>{}} />
        </main>;
      }
      createRoot(document.getElementById('root')).render(<Fixture />);`; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' || req.url.startsWith('/api/')) {
          res.writeHead(403); res.end('No API or writes in citation fixture'); return;
        }
        if (req.url === '/') {
          const html = await vite.transformIndexHtml('/', `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA ONLY — Citation UI</title></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`);
          res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "connect-src 'self' ws://127.0.0.1:8113; img-src 'self' data:; form-action 'none'" });
          res.end(html); return;
        }
        next();
      });
    },
  }, react()],
});
await server.listen(); server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
