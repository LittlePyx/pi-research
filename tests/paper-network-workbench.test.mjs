import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const clientPath = new URL("../app/research-app.tsx", import.meta.url);
const stylesPath = new URL("../app/globals.css", import.meta.url);

test("paper network focus uses the verifiable one-hop evidence contract", async () => {
  const client = await readFile(clientPath, "utf8");

  assert.match(client, /selectVerifiableOneHopEdges\(edges, selectedPaperId\)/);
  assert.match(client, /selectVerifiableOneHopEdges\(selectedNetworkRelations, selectedNetworkNode\.paper\.id\)/);
  assert.match(client, /可核验一跳只显示文献耦合或数据库核验的引用发现关系/);
  assert.match(client, /没有加入推荐发现线索或 Pi 推断关系/);
  assert.match(client, /金环只表示起始论文/);
  assert.match(client, /className="selection-ring"/);
});

test("shared and bridge views reuse independently verifiable similarity relations", async () => {
  const client = await readFile(clientPath, "utf8");
  const uses = client.match(/filter\(isVerifiableSimilarityNeighborEdge\)/g) || [];

  assert.ok(uses.length >= 2);
  assert.match(client, /const similarityEvidenceEdges = \[/);
  assert.match(client, /查看可核验一跳/);
});

test("focus and origin rings remain visually distinct on desktop and narrow screens", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(styles, /\.v2-paper-network-node\.selected \.selection-ring\s*\{[^}]*stroke:\s*#173f32/s);
  assert.match(styles, /\.v2-paper-network-node\.origin \.state-ring\s*\{[^}]*stroke:\s*#b18342/s);
  assert.doesNotMatch(styles, /\.v2-paper-network-node\.selected \.state-ring/);
  assert.match(styles, /\.v2-paper-drawer-state\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(styles, /@media \(max-width: 840px\)[\s\S]*?\.v2-paper-network-stage\.discovery-mode[^}]*grid-template-columns:\s*1fr/);
});

test("suggested reading order uses the persisted learning path on desktop and narrow screens", async () => {
  const [client, styles] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(client, /function ReadingOrderWorkbench/);
  assert.match(client, /learningState: LearningPathState/);
  assert.match(client, /const path = learningState\.path/);
  assert.match(client, /activeLearningState\.path\?\.steps\.length \|\| 0/);
  assert.match(client, /paperNetworkMode === "citations" \? <CitationFlowWorkbench[\s\S]*: <ReadingOrderWorkbench/);
  assert.doesNotMatch(client, /<PaperNetworkGraph[^>]*mode="path"/);
  assert.match(client, /不表示严格先后，也不会把 Pi 图谱边冒充可执行计划/);
  assert.match(client, /每个阶段内的多篇论文是并行材料，不再被强行编号/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.v2-reading-progress[^}]*grid-template-columns:\s*1fr/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.v2-reading-fallback-groups[^}]*grid-template-columns:\s*1fr/);
});
