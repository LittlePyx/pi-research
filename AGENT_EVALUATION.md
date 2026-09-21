# Agent 决策与评估

这份说明区分工程回归、历史运行和推荐效果。三个层次不能互相替代。

## 第二版验证（2026-09-21）

新协议见 benchmarks/personalization/PROTOCOL_V2.md：两个新编写问题、相同公开语料、三种记忆条件、两次重复。共12次真实调用，9通过、3次阅读分区数量超限失败；引用按编号从冻结原文回填。有效配对4组中2组排序一致、2组变化，2组缺有效配对。记录在public/agent-personalization-v2.json，第一版未覆盖。不同问题与协议不能直接做前后收益比较。

已读分区是显式记忆驱动的确定规则，不能冒称模型学习效果。本轮通过的explicit/all没有选入已知论文，所以尚无实际参考分流样本；测试覆盖已读误入推荐时的正确分流。正式今日页与Demo按read/mastered/cited提供已读参考，保存/浏览不算掌握。生产核心证据核验此前已有编号证据，本轮新编号实现用于独立排序实验。用户仍暂不独立评审，qualityMetrics=null。

## 固定候选实验进展（2026-09-21）

已准备18篇来源摘要、4个研究问题和12次真实排序请求，见 [实验协议](benchmarks/personalization/README.md)。模型输入与盲审材料分开，单独保存实际排序、引文、耗时和token；独立标注未完成时不输出相关性提升。

线上模型Key已配置且未改动。正常浏览器路径恢复后，使用独立执行页分两批完成12次调用：9次通过输出校验，3次失败，0次未运行。第二批只执行4个空缺项，原成功/失败记录未重试替换。原联合错误无法追溯；新两次失败分别为首项引用字段不合法、第4项引用不在原摘要。公开记录见 public/agent-personalization.json；原模型响应正文未保留。

数学两组有完整三条件排序，sampling的explicit/all相同；信息论两组各缺有效配对结果，all仍列已掌握论文。用户暂不独立评审，qualityMetrics=null。两批输入/门槛一致，执行源码版本分别记录；当前只支持单轮行为观察，不代表推荐质量提升。执行完成后关闭临时入口，未更改环境Key或网络安全配置。

## 本轮实现

- 正式查询规划使用 lib/feedback-policy.mjs 的同一套输入分流。
- 兴趣、明确范围、证据质量、阅读深度、掌握、文献类型、单篇判断分别传入；行为推断不能成为硬性范围排除。
- 历史 paper_feedback 信号按原 reasonCode 读取为新语义，不修改原始用户反馈。只有 topic_drift 作为主题范围负例；质量/深度等作为选择约束。收藏为待判断兴趣，不等于掌握或已确认相关。
- 查询计划缓存身份包含策略版本。已在运行的冻结计划、最终质量门槛、路线确认与历史记录不回写；没有新增模型调用或调度任务。
- 这次只拆分了偏好输入策略，不声称已经拆完大型 monitor 模块，也不声称改变了所有来源/路线预算的历史统计口径。

## 可复现的输入策略对照

运行 npm run test:agent，或：

    node scripts/run-agent-evaluation.mjs --out outputs/agent-evaluation.json

两领域各 11 条开发者编写信号，使用同一生产函数，分别运行 none、explicit、all。核对预期保留、正确分流、错误纳入、序列化输入字节数。字节数不是模型 token 数或成本。固定时点为 2026-09-20 UTC；包含过期、停用、推断排除和历史 kind=exclusion 的兼容案例。

本轮结果：每个领域 none 保留 0，explicit 正确分流 7，all 正确分流 8，三种条件错误纳入均为 0。这证明这些案例符合输入策略，不证明检索召回或推荐质量提升，也不是独立人工标注集。两领域共享同一组边界规则，不能把它们当作两个独立质量实验。

## 推荐质量对照：已取得运行记录，独立判断尚缺

评价程序只消费真实记录的排序，不生成排序、不使用 gold 标签参与排序。需要先冻结候选、原始摘要、研究目标、反馈截止时间、模型版本和提示版本；分别执行无记忆、明确反馈、全部记忆，其他输入及预算相同。三个分支不可共享包含记忆的缓存，也不可通过路线摘要、历史正负例、引用种子等旁路泄漏被移除的记忆。

先用固定候选集观察排序，再独立做端到端检索实验；前者不能代替后者。领域研究者在不知道实验分支的条件下标注 relevance gain 0–3、是否已知、所属研究方面。发生分歧要保留原判断与裁决记录。当前用户暂不评审，不由模型假冒独立判断；运行状态为completed_with_failures，质量指标仍为空。

输入分为两个文件。以下是格式示例，不是实测排名：

    [
      {
        "id": "case-1",
        "contextId": "frozen-context-digest",
        "candidates": [
          {"id":"paper-a","title":"Public title","abstract":"Frozen source abstract","gain":3,"known":false,"facets":["method"]}
        ]
      }
    ]

每个案例提供 none、explicit、all 各一条运行记录。poolHash 由 lib/personalization-evaluation.mjs 的 candidatePoolHash(candidates) 从不含标签的 id/title/abstract 计算。三个分支必须同 model、promptVersion、sourceCommit、contextId 和 poolHash。

    {
      "caseId":"case-1",
      "variant":"none",
      "contextId":"frozen-context-digest",
      "poolHash":"sha256-of-candidate-metadata",
      "model":"actual-model-version",
      "promptVersion":"actual-prompt-version",
      "sourceCommit":"actual-source-revision",
      "observedAt":"actual-timestamp",
      "ranking":["paper-a"],
      "inputTokens":null,
      "outputTokens":null,
      "durationMs":null
    }

    node scripts/run-agent-evaluation.mjs --judgments path/to/judgments.json --runs path/to/runs.json --out outputs/agent-evaluation.json

输出逐案例 Precision@5、nDCG@5、已知材料比例、研究方面覆盖，以及实际记录的 token/耗时。空缺席位按 Precision@5 的分母 5 处理；零相关标注时 nDCG 为 null。未记录成本为 null，不当作 0。拒绝缺分支、未知/重复论文、不同候选集、不同模型和不完整标注。报告是描述性配对结果，没有样本量或统计检验支持时不声称显著提升。

## 历史回放与失败机制

public/agent-evidence.json 来自两份留存快照的明确字段白名单，含原文件 SHA-256；不包含用户、空间、任务或论文内部 ID，不含原始提示、笔记、凭据或完整队列。原始文件保留在本地 outputs/，没有公开。可在拥有原始证据的环境执行：

    node scripts/export-agent-evidence.mjs

2026-09-10：v209 的恢复批次 14/14 正确匹配，筛选完成 59/59，8 篇进入下一阶段，快照正式推荐为 0。另一个 v217 快照跟踪其中 4 份待核对稿：2 入选、2 未通过最终门槛、0 待核对。这是跨恢复任务的局部片段，不是完整初始检索轨迹，不是 8 篇全部结论，也不代表当前模型效果。

run-agent-evaluation 另外用一个合成有效响应，复现 DOI 尖括号被清理后不能匹配、保留原标识后可以匹配；调用实际 matchScreeningRecords。它只重现身份错误机制，不能冒充历史模型输出或新线上成功。更完整的生产函数隔离回归见 tests/monitor-screening-degradation.test.mjs。

## 核验器下一步评估协议

建立与提示开发隔离的错误集：身份错误、引用不存在、条件遗漏、结论扩大、相关性不足、正确但保守的摘要表述。由领域审阅者标注错误类型、严重性和可接受修订；分别测确定性检查、模型首判、二次核对、组合方案的误杀/漏判、修订成功和成本。

同模型的重复调用不是统计独立审查。当前历史案例证明流程可以修订与拒绝，尚不能估算总体误差率。不得为了演示补造错误率、成功率或推荐收益。
