import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPath = new URL("../app/research-app.tsx", import.meta.url);
const workbenchPath = new URL("../app/components/citation-flow-workbench.tsx", import.meta.url);
const routePath = new URL("../app/api/research-map/route.ts", import.meta.url);
const stylesPath = new URL("../app/components/route-citation-explorer.css", import.meta.url);

test("citation API and workbench share one fail-closed verification contract", async () => {
  const [app, route, workbench] = await Promise.all([readFile(appPath, "utf8"), readFile(routePath, "utf8"), readFile(workbenchPath, "utf8")]);

  assert.match(route, /cachedEdges\.filter\(\(edge\) => edge\.kind === "similarity" \|\| isDatabaseVerifiedCitationEdge\(edge\)\)/);
  assert.match(route, /edge\.kind !== "citation" \|\| isDatabaseVerifiedCitationEdge\(edge\)/);
  assert.match(route, /paperEdges\.filter\(isDatabaseVerifiedCitationEdge\)\.length/);
  assert.match(workbench, /map\.paperEdges\.filter\(isDatabaseVerifiedCitationEdge\)/);
  assert.match(app, /researchMap\.paperEdges\.filter\(isDatabaseVerifiedCitationEdge\)/);
});

test("citation flow keeps direction and provider provenance and reads external links in place", async () => {
  const [app, workbench] = await Promise.all([readFile(appPath, "utf8"), readFile(workbenchPath, "utf8")]);
  assert.match(workbench, /kind:outward\?'reference':'citation'/);
  assert.match(workbench, /citationEvidenceProviderLabel\(edge\.evidenceSource\)/);
  assert.match(workbench, /routePaperId:paper\.id/);
  assert.match(workbench, /查询上下游/);
  assert.match(workbench, /mergeRouteCitations/);
  assert.match(app, /showNetworkPaperDrawer = Boolean\(selectedNetworkNode && paperNetworkMode === "similarity"\)/);
});

test("citation flow has a single column on narrow screens", async () => {
  const styles = await readFile(stylesPath,"utf8");
  assert.match(styles,/\.pi-route-citation-columns \{[^}]*repeat\(2,minmax\(0,1fr\)\)/s);
  assert.match(styles,/@media\(max-width:670px\)[\s\S]*?\.pi-route-citation-columns[^}]*grid-template-columns:minmax\(0,1fr\)/);
});
