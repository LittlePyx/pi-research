import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPath = new URL("../app/research-app.tsx", import.meta.url);
const routePath = new URL("../app/api/research-map/route.ts", import.meta.url);
const stylesPath = new URL("../app/globals.css", import.meta.url);

test("citation API and workbench share one fail-closed verification contract", async () => {
  const [app, route] = await Promise.all([readFile(appPath, "utf8"), readFile(routePath, "utf8")]);

  assert.match(route, /cachedEdges\.filter\(\(edge\) => edge\.kind === "similarity" \|\| isDatabaseVerifiedCitationEdge\(edge\)\)/);
  assert.match(route, /edge\.kind !== "citation" \|\| isDatabaseVerifiedCitationEdge\(edge\)/);
  assert.match(route, /paperEdges\.filter\(isDatabaseVerifiedCitationEdge\)\.length/);
  assert.match(app, /map\.paperEdges\.filter\(\(edge\) => isDatabaseVerifiedCitationEdge\(edge\)/);
  assert.match(app, /researchMap\.paperEdges\.filter\(isDatabaseVerifiedCitationEdge\)/);
});

test("citation flow keeps direction, provider, and quality-queue semantics explicit", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /被引工作 → 后续论文/);
  assert.match(app, /citationEvidenceProviderLabel\(edge\.evidenceSource\)/);
  assert.match(app, /只包含数据库确认的直接引用/);
  assert.match(app, /扩展候选会进入共享质量评估/);
  assert.match(app, /只有评审通过才可能出现在今日/);
  assert.match(app, /只有你收录确认后才进入正式路线与引用流/);
  assert.match(app, /到论文发现扩展前后 1-hop/);
});

test("citation focus owns its detail actions without opening the duplicate side drawer", async () => {
  const [app, styles] = await Promise.all([readFile(appPath, "utf8"), readFile(stylesPath, "utf8")]);

  assert.match(app, /showNetworkPaperDrawer = Boolean\(selectedNetworkNode && paperNetworkMode !== "citations"\)/);
  assert.match(app, /onOpenFocus=\{\(node\) => recordMapPaperOpen\(node\.track\.id\)\}/);
  assert.match(app, /onAskFocus=\{askAboutNetworkPaper\}/);
  assert.match(styles, /\.v2-citation-focus-actions\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.v2-citation-lineage-grid[^}]*grid-template-columns:\s*1fr/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.v2-citation-source-summary[^}]*flex-direction:\s*column/);
});
