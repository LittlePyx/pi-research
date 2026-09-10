// Content-design sample, NOT a live recommendation, model review, or full abstract.
// Short source excerpts retrieved 2026-09-10. Missing means missing in these excerpts.
const metricQuote = String.raw`We analyze the Poincaré and Log-Sobolev constants of logconcave densities in $\mathbb{R}^{n}$.`;
const methodQuote = "Our proof technique is a development of stochastic localization";
const lichnerowiczQuote = "A new ingredient used in the proof is an improved log-concave Lichnerowicz inequality.";
export const workbookSources = [
  { id: "sample-lee-vempala", canonicalId: "doi:10.4007/annals.2024.199.3.2", title: "Eldan’s stochastic localization and the KLS conjecture: Isoperimetry, concentration and mixing", authors: "Yin Tat Lee; Santosh S. Vempala", url: "https://annals.math.princeton.edu/2024/199-3/p02", abstractText: `${metricQuote}\n${methodQuote}`, readingFocusZh: "", readingFocusEn: "", routeMember: true },
  { id: "sample-klartag", canonicalId: "arxiv:2303.14938", title: "Logarithmic bounds for isoperimetry and slices of convex sets", authors: "Bo’az Klartag", url: "https://arxiv.org/abs/2303.14938", abstractText: lichnerowiczQuote, readingFocusZh: "", readingFocusEn: "", routeMember: true },
];
const missing = paperId => ({ paperId, status: "missing", quote: "", textZh: "", textEn: "" });
const cell = (paperId, textZh, textEn, quote) => ({ paperId, status: "supported", textZh, textEn, quote });
export function workbookSample() {
  return {
    questionZh: "随机局部化与改进的 Lichnerowicz 不等式，在这些片段中承担什么作用？是否足以比较结果？",
    questionEn: "What roles do stochastic localization and the improved Lichnerowicz inequality play in these excerpts, and are they enough to compare results?",
    dimensions: [
      { id: "metric", labelZh: "研究的函数不等式指标", labelEn: "Functional-inequality quantities", purposeZh: "先识别指标，避免把名称不同的常数直接放在同一尺度。", purposeEn: "Identify the quantities before placing differently named constants on one scale.", cells: [cell(workbookSources[0].id, "片段明确研究 Poincaré 与 Log-Sobolev 常数。", "The excerpt explicitly studies Poincaré and Log-Sobolev constants.", metricQuote), missing(workbookSources[1].id)] },
      { id: "method", labelZh: "片段明确提及的证明工具", labelEn: "Proof tools named in the excerpts", purposeZh: "区分所用工具与最终结论；工具名称不能证明结果间的推广关系。", purposeEn: "Separate a tool from a result; a tool name does not establish generalization.", cells: [cell(workbookSources[0].id, "作者将其证明技术描述为随机局部化的发展。", "The authors describe their proof technique as a development of stochastic localization.", methodQuote), cell(workbookSources[1].id, "改进的对数凹 Lichnerowicz 不等式被列为证明的新要素。", "An improved log-concave Lichnerowicz inequality is identified as a new proof ingredient.", lichnerowiczQuote)] },
      { id: "conditions", labelZh: "常数定义、归一化与工具适用条件", labelEn: "Constant definitions, normalization and tool assumptions", purposeZh: "这些信息决定结果能否直接比较；本样本片段没有给出。", purposeEn: "These determine comparability and are not provided in the sample excerpts.", cells: workbookSources.map(s => missing(s.id)) },
    ],
    comparison: { status: "insufficient", textZh: "片段可以辨认指标和证明工具，但没有足够的常数定义与适用条件，不能据此断言两项结果之间的强弱或推广关系。", textEn: "The excerpts identify quantities and tools, but lack definitions and assumptions needed to establish relative strength or generalization.", evidenceIds: ["metric:sample-lee-vempala", "method:sample-klartag"] },
    task: { titleZh: "完成指标—工具—缺失条件对照表", titleEn: "Complete a quantities–tools–missing conditions table", steps: [
      { textZh: "在 Lee–Vempala 的片段中分别标出研究指标与证明工具，说明为什么二者不能互相替代。", textEn: "Identify the quantities and proof tool in the Lee–Vempala excerpts and explain why they are not interchangeable.", evidenceIds: ["metric:sample-lee-vempala", "method:sample-lee-vempala"] },
      { textZh: "核对 Klartag 片段中的 Lichnerowicz 不等式角色，在缺失条件栏写出比较前还需要查明的定义和假设。", textEn: "Check the role of the Lichnerowicz inequality in Klartag’s excerpt and list the definitions and assumptions still needed for comparison.", evidenceIds: ["method:sample-klartag"] },
    ], criterionZh: "每项已知内容附片段依据；缺失项保留待查；最终判断明确是否具备直接比较的条件。", criterionEn: "Attach excerpt evidence to observations, retain missing items, and explicitly decide whether direct comparison is justified." },
    learning: { goalZh: "区分函数不等式的研究指标、证明工具与适用条件。", goalEn: "Distinguish quantities, proof tools and assumptions in functional inequalities.", prerequisiteZh: "先能从一段摘要中辨认研究对象与方法；此练习不要求复现证明。", prerequisiteEn: "First identify the object and method in an abstract; reproducing a proof is not required here.", exerciseZh: "把 Poincaré、Log-Sobolev、随机局部化和 Lichnerowicz 分别放入指标或工具栏，并为每项引用对应片段。", exerciseEn: "Place Poincaré, Log-Sobolev, stochastic localization and Lichnerowicz in the quantity or tool column and cite the relevant excerpt.", checkpointZh: "能够指出两个片段提供的信息不同，并列出尚缺的定义与条件，不从工具名称推导结果强弱。", checkpointEn: "Identify the different information supplied by the excerpts and the missing definitions and assumptions without inferring result strength from tool names." },
  };
}
