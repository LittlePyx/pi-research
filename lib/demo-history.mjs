// Fixed example records, never real user history or model output.
export const DEMO_NOTES = {
  'kls-localization': {status:'read',date:'2026-09-12',note:'【示例笔记】已梳理问题定义。原文摘要用到凸体与重心平均距离；比较前先核对等周系数的定义，不能只比较常数符号。下一步：阅读 Eldan 的归一化条件。'},
  'eldan-thin-shell': {status:'reading',date:'2026-09-18',note:'【示例笔记】读到随机局部化的动机。摘要连接薄壳与 KLS，但允许对数损失。问题：过程中的协方差控制具体在哪一步进入谱隙估计？先记问题，暂不宣称掌握证明。'},
  'kls-survey': {status:'read',date:'2026-09-14',note:'【示例笔记】用综述整理术语表：Cheeger 常数、Poincaré 常数、薄壳。注意这是 2018 年的进展综述，近期结果须另读原文。'},
  'chen-kls': {status:'reading',date:'2026-09-19',note:'【示例笔记】目前只核对摘要：高维下的维数依赖得到改进。待查：与后续多对数界比较时是否采用同一常数定义？'},
  'shannon-fidelity': {status:'read',date:'2026-09-12',note:'【示例笔记】已整理率失真问题的基本对象。下一步区分平均失真限制与超额失真概率，不能直接用同一种误差口径比较。'},
  'finite-blocklength': {status:'reading',date:'2026-09-18',note:'【示例笔记】关注固定码长和错误概率这两个约束。下一步把容量项与有限长度损失分开记录，对照有损源编码中的失真约束。'},
  'lossy-finite': {status:'reading',date:'2026-09-19',note:'【示例笔记】这里限制的是超过给定失真水平的概率，不是译码错误概率。待核对：二阶展开的源色散与信道色散分别依赖什么？'},
  'wyner-ziv': {status:'read',date:'2026-09-15',note:'【示例笔记】边信息仅在解码端可用。读条件率失真的二阶结果时，应先确认编码端是否也拥有边信息。'},
};
// Short verbatim source excerpts; full abstracts are not fabricated.
export const DEMO_EXCERPTS = {
  'kls-localization':'Our main tool is a general "Localization Lemma"',
  'eldan-thin-shell':'We consider the isoperimetric inequality on the class of high-dimensional isotropic convex bodies.',
  'finite-blocklength':'This paper investigates the maximal channel coding rate achievable at a given blocklength and error probability.',
  'lossy-finite':'probability $\\epsilon$ that the distortion exceeds a given level $d$',
};
export function demoArtifact(sources) {
  const math=sources[0].id==='kls-localization';
  return {observations:Object.fromEntries(sources.map(p=>['assumptions:'+p.id,math ? '【示例核查】已摘录摘要线索。下一步到正文核对归一化条件及定义页码。' : '【示例核查】先保留本文的概率约束，不把另一篇的约束直接代入。'])),decision:math ? '【示例比较记录】KLS 以局部化引理研究凸体等周问题；Eldan 用随机局部化连接薄壳与谱隙。两篇提供不同的工具入口，尚不能仅凭摘要认定结果包含关系。来源：各论文摘要，见上方比较项及阅读页。' : '【示例比较记录】信道编码与有损源编码都需要考虑有限长度损失，但它们的对象和失败事件不同。先分别记录码长、概率约束及基准量，再讨论二阶项。来源：两篇论文摘要，见上方比较项及阅读页。',unresolved:math ? '待核对：等周常数定义是否一致？从凸体均匀测度到一般对数凹测度需要哪些条件？把对应定义和定理页码补进核查笔记。' : '待核对：超额失真与平均失真如何区别？各自的二阶近似需要哪些正则条件？请补上定理位置，避免直接比较数值。'};
}
