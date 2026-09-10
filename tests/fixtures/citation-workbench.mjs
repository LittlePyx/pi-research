// Isolated UI data only; these links are not claims about real papers.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export async function citationWorkbenchSource() {
  const source = await readFile(new URL('../../app/research-app.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('research-app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ['researchPaperYear', 'researchRoleLabel', 'buildNetworkPaperNodes', 'citationEvidenceProviderLabel', 'CitationFlowWorkbench'].map(name => {
    const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
    if (!node) throw new Error(`Missing real component dependency: ${name}`);
    return node.getText(ast);
  }).join('\n');
}

const paper = (id, title, year) => ({ id, canonicalId: `fixture:${id}`, title, publishedAt: `${year}-01-01`,
  authors: 'QA fixture', venue: 'Isolated acceptance', doi: null, url: '#', citationCount: 0,
  role: 'foundation', rationaleZh: '仅用于引用界面验收', rationaleEn: 'Citation UI fixture only' });
export const citationMap = {
  tracks: [{ id: 'qa-track', papers: [
    paper('cited', 'QA — 相同开头的长论文标题：高维概率中的随机局部化、等周不等式与谱隙估计的严格条件', 2023),
    paper('citing', 'QA — 相同开头的长论文标题：高维概率中的随机局部化、等周不等式与谱隙估计的后续讨论', 2022),
    paper('other', 'QA — An unusually long title about Gaussian extremality, entropy power inequalities and the precise assumptions behind information-theoretic converse bounds', 2026),
  ] }],
  paperEdges: [
    { id: 'qa-citation-1', sourcePaperId: 'citing', targetPaperId: 'cited', kind: 'citation', relationKind: 'cites', evidenceSource: 'semantic-scholar', confidence: 100 },
    { id: 'qa-citation-2', sourcePaperId: 'other', targetPaperId: 'cited', kind: 'citation', relationKind: 'cites', evidenceSource: 'openalex', confidence: 100 },
    { id: 'qa-inferred', sourcePaperId: 'cited', targetPaperId: 'other', kind: 'path', evidenceSource: 'pi', confidence: 100 },
  ],
};
