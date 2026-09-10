# Pi Research 新任务交接（2026-09-10）

## 最新：阶段材料到下一步阅读任务（本轮发布验收中）

- 用户按项目功能优先级授权继续学习闭环。承接 main@691c6ef / 线上 v217，原四篇推荐验收已关闭，不重开。旧 Codex 自动任务保持暂停，用户 docs/ 保留。
- 已实现两个学习入口共用“下一步学习任务”：只选本阶段现有质量通过材料，优先正在读、再未读；原始材料为空时可选合格补充阅读，清楚保留缺口与完成限制。直接复用论文详情/笔记入口，给出前置知识检查、当前论文阅读重点、需要留下的阅读结果。全部材料仍可展开，不改变正式材料计数、阅读/完成状态。
- 阅读重点来自现有共享质量审核字段（readingFocus 已在独立证据核对范围内）；历史路径每次读取时从当前 paper_insights 重新注入，不复活未经审核的阶段讲解。没有增加模型调用、数据库迁移、扫描或重试额度。
- 补充匹配增加七组明确名词单复数等价词，修复 isolated KLS constant/constants 漏配；保留原主题重合比例，只用于补充阅读，不改正式阶段证据准入。尚不能把该隔离复现认作所有生产缺口的根因。
- 线上确切缺口：主数学 KLS job 6786d1bf-1dec-42df-95c6-0414a41b4b7b 于07:13:58 UTC自然执行到attempt8、累计queued7，下一次19:13:58 UTC；Crossref仍找到经典DOI，OpenAlex退避。指定信息论 Costa job bd4bab8b-a9e5-4f69-a5d8-be70c0718173 仍attempt6/queued6、下一次09:13:32 UTC；两个基础 resources_json=[]。累计queued不等于质量通过，原文材料总验收仍未关闭。
- 新确认的生产交互边界：指定60bfce13空间名Information Theory/成员Yilin，但owner_user_id与主数学01fbe995不同；当前浏览器同名Yilin不是这个验收空间。不可伪造owner cookie或以同名空间替代验收。D1取证可继续，指定空间浏览器实测尚未完成。
- 本轮生产正常页面访问可能触发网站现有visit补偿，不称为纯Cron。v217主数学实见24可用、2篇路径材料、0/5；基础无补充材料。已打开既有KLS方法论文10.4007/annals.2024.199.3.2并返回原方法阶段，未加入阅读。浏览器连接曾失败，后通过已有browser 1/tab 5恢复；不要再反复调用失败的通用inventory。
- 最终业务构建与587项完整测试通过；双领域真实Worker+D1覆盖正式/补充任务、最新指导刷新、打开返回及无阅读/路线写入。隔离浏览器1280/390任务可读，修正了列表居中和编号隐藏，窄屏clientWidth=scrollWidth=375。当前生产发布及最终验证待下方补记。


本文件是当前接续入口。旧 `docs/PROJECT_HANDOFF.md` / `docs/NEXT_SESSION_PROMPT.md` 的 55a600e 基线和冷启动任务属于历史，不要据此从头重做。详细实施证据仍以 `FRONTEND_OPTIMIZATION_PLAN.md` 最新段落为准。

## 当前接续状态（2026-09-10，优先于历史快照）

### 2026-09-10 修订完整性与原4篇交付（已完成）

- **验收环境已清理**：本轮临时生产标签4已成功关闭，未设置viewport、无本轮预览服务遗留；原有docs/保留。旧Codex pi-research自动任务始终未恢复。v217业务源码CI34449385108和此前交接提交CI34449971593均成功，最后只补页面收口记录。

- **最终页面验收已通过（07:28 UTC）**：今日DOM显示累计7篇正式推荐，主列表同时出现Mirror Langevin与Optimal mean width；较早4篇保留，本轮增加3篇。e1a99572已结束，原4篇2正式/2未通过/0待核对，后端与页面结果一致。原8篇已全部完成深评，其中2正式，另外6未入选；Space-Time最终未入选由生产论文库DOM确认，具体末次审核字段不臆测。原4篇恢复工作包已完成，后续优先回到交接中的双领域学习材料真实交付及阶段归属验收；不要再以“等原4篇核对”作为下一步，也不把其他新候选的队列当原4篇未完成。

- **原4篇后端核对已全部收口**：07:24:44 e1a99572保存mean width（f87edfd1-dc98-49c4-9280-b4c89ac9095e）verified/nonretryable/published=true，coverage90，四核心字段缺失0/unsupported0/问题0。单篇初核stop、1061输出token、2890字符，原稿复用，无重新深评。加上Mirror Langevin，共2正式入选；Hamilton–Jacobi与Sandwich Slice共2最终证据门槛未通过；待核对0。outputs/original-four-closure-20260910.json记录逐篇身份、job、结果和响应证据；原8篇账本同步。当前e1a99572仍在评估另外7篇，不能把这一轮未结束等同于原4篇仍未完成。最后等待当轮简报更新后核验mean width进入今日。

- **v217已发布并通过检查**：07:21:03 UTC，源码1a54f332b5e1ed8d1f21cf4d70124e87ecaf284e，版本appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_e7cb76151f908191801aeae6164b7bef，部署appgdep_6aa25a43a80c8191b1caee29072d186c；public/环境修订6/无迁移。583项、lint、构建、离线基准、CI34449385108全通过。生产论文库此前会被任意历史verification_pending误标为reviewing；现按最新reviewed_at和同秒rowid顺序取最后审计，保留全部历史。07:22–07:24 DOM确认Sandwich Slice与Hamilton–Jacobi cylindrical test functions已显示评审未入选/未加入阅读，mean width仍正在核对；Space-Time Log-Sobolev也明确未入选。
- **最后一篇正在验收**：07:21:55正常新版页面reload访问补偿启动e1a99572-3b09-4225-a5e0-4c1c19d23dce，quality_queue/attempt1、没有重扫；新批次56篇，复用8条既有筛选，07:23:26确认mean width原稿deepCompleted=true、verificationQueued=true、attempt0，优先续核名额实际生效。不同于前轮被挤出，当前没有重新深评该原稿。旧Codex自动任务仍未恢复。

- **v216已发布并通过检查**：07:10:39 UTC，源码6ace574cbac4692b311c50a798e419e038be6f1e，版本appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_3e754449400881919ef5c0d1a7a99348，部署appgdep_6aa257b891208191b3822a2736cc8de4；public/环境修订6/无迁移。582项、lint、构建、离线基准、CI34448542369均成功；v215 CI34447749808也成功。原Mirror Langevin于07:02:28有直接生产根因证据：初核finish_reason=length，1700输出token、6349字符，随后invalid_model_output。v216要求短英文审计/短claim excerpt和理由，完整覆盖四个核心字段，并把初核上限从1700–2600改为2400–4200（批次1–3），保持24秒、单轮调用次数和全部证据门槛；显式拒绝任何length响应，即使JSON恰好完整。补充最终核对的字段覆盖/分数/问题数量白名单诊断，不输出原始claims。
- **原4篇已收口3篇**：07:02:04 Hamilton–Jacobi及Sandwich Slice保守修订完整返回（2篇合计1127token、stop），均因最终确定性证据检查未通过而degraded/nonretryable/未发布；保存原因分别涉及whyRead中的证据支持表述，完整末次字段明细尚未独立取得，不能进一步臆测失败字段。Mirror Langevin在既有后续尝试后于07:04:28 revised/coverage85/published=true，移除摘要不支持的χ²收敛、熵最优传输和强数据处理不等式表述，保留可支持内容。此成功发生于v215，不倒算成v216输出上限修复的成功。mean width仍在共享队列待续接。
- **真实页面交付**：eb3ede58于07:08:40完成，今日DOM确认累计4篇且显示Mirror Langevin，早先2篇保留；本轮另1正式为Navier-Stokes Fokker-Planck的Logarithmic Sobolev论文。14篇深评/本轮2正式/4证据未过，是该任务统计，不是原4篇计数。原Space-Time Log-Sobolev于07:05已保存完整深评（35a0c21a-d5d5-41df-bce0-f993dea16b85，摘要1255、相关88/质量85），最终逐篇判定尚未独立取得。主数学monitor_run下次质量处理时间07:18:40.676 UTC。最新安全证据存outputs/verification-delivery-v216.json；临时生产标签仍用于最后一篇验收，结束时须关闭。

- **v215恢复修复已发布**：07:00:37 UTC，源码983e490c8df3f91d76d6ea9c5f292e5375a6322f已推送GitHub/Sites；版本appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_e648d3416a3081919982136a95f3311d，部署appgdep_6aa25578b1f48191a22786d7daab0c91。public/环境修订6/无迁移；580测试、lint、构建及离线基准通过，CI34447749808待完成。v213 CI34446501241与v214 CI34447286098均成功。07:01新版页面正常reload后，同一eb3ede58从深评中断点转入verifying_recommendations；没有新任务/重扫，实际触发visit已披露。

- **v214已发布**：06:54:51 UTC，源码30d0fee7e4cd9d73918073e93b5b7c63f7a30b67，版本appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_cebd9e9aeb288191a5c81de80624e885，部署appgdep_6aa2541a9a908191abbaa9bc95c56f77。577项、lint、构建与离线基准通过。解决新队列重排会挤出已保存待核对稿的问题：D1消费者显式带verificationPending，每个时间范围保留一批3篇续核名额，保留原路线2个名额及12/16/28总量；0空位不额外塞摘要缺口候选。旧真实函数隔离回归得到0/3续核，修复后3/3且不超总量。
- **06:47新任务实际变化**：eb3ede58筛选59/59，9篇深评队列，Hamilton–Jacobi、Sandwich Slice、Mirror Langevin3篇旧稿直接复用进入待核对；mean width虽然在360池中，却被本轮重排挤出，不能说4篇都已续核。已完成另1篇Sobolev–Poincaré有限元论文（doi:10.1137/25m1748470）相关15/质量70不入选。06:47:34推进请求的Worker实际outcome=canceled，租约后来清除，未产生模型判定；这是请求中断，不是证据不足。
- **正在补全恢复流程**：原页面advance的网络或响应体中断会退出并保留旧“处理中”画面，现转入已有只读follower/到期租约恢复，取消页面仍停止、明确服务端错误仍显示；同时deep_reviewing先核对已保存完整稿，不再等新候选全部深评。实际函数回归覆盖headers/body断开、取消、服务端拒绝、已核对/已延后不重入，完整检查与发布待完成。

- 原9e4bab7f于06:25:40完成：360候选、59已筛选、13深评完成、1深评timeout延后、2正式推荐、4草稿核对延后。原8篇单独仍是7深评完成/1延后/4待核对/0正式；2篇入选来自后追加的6篇，分别为Wolff Dynamics的Log-Sobolev不等式（983661e8-e057-4c4a-a710-11eb081d5454，覆盖95）与ultra log-concave distributions集中不等式（210fc857-5abb-4511-9a80-fa306fe3df5d，覆盖100）。生产今日DOM已确认两篇实际显示；后者初核finish_reason=stop、704输出token、2580字符。
- 原drag006现在取得确切paperId e4f1a3ef-154b-4d1d-8402-3d00522402d4，相关10/质量70，因非协调有限元离散Sobolev与本空间KLS/对数凹测度研究缺乏直接联系未入选。Hamilton–Jacobi详情已打开，完整中文稿仍在、未加入阅读；两篇需修订稿及mean width/Mirror Langevin均未冒充正式推荐。原两篇具体失败响应仍未取得，不把“可能截断”写成已证实根因。
- 新质量队列eb3ede58-7e35-4014-965f-ea30021a7131于06:36:29由正常页面visit启动，attempt1、quality_queue、无resume_of_job_id；队列前部明确包含原4篇。06:45:45已完成去重、复用9篇筛选，进入enriching_screening_abstracts。本轮生产访问06:21:44、06:36:28，以及新版发布核验06:45，均可能触发网站已有访问补偿，不能称为纯Cron。未点扫描/重扫/阅读/接受，未恢复旧Codex自动任务。
- 本地真实函数回归发现修订清空method等字段后，旧代码可能把空字段排除在证据门槛外。现改为合并后调用已有完整性检查；不完整响应留待重试，真实insufficient仍拒绝。修订请求只返回必要的双语字段变化，服务端保留未变字段，并核对完整合并稿；不再要求每次重复20个字段全文。未改模型、超时、批量、尝试次数、质量标准或调度。
- v213已于06:44:39 UTC发布成功，源码5d2345ab059dd4faac317df071c3f328b2b47229已推送GitHub与Sites；版本appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_eb1b211c88448191b64ac6da22301dd4，部署appgdep_6aa251bc8204819196e96cdb19be35a4。public/环境修订6/无迁移；本地576测试、lint、构建与离线基准通过。CI34446501241尚在运行。原4篇最终核对验收继续。

- **最新接续：v212于06:14:23 UTC发布成功**。源码6b7e886dce5f17f9802ac50429d82bcff4a8eaf9已推送GitHub和Sites；版本appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_6eeca8cd7b8081918e7c0f43eaf750c0，部署appgdep_6aa24a8a2bb8819185e1d61aef9a292f；public/环境修订6/无迁移。完整575项、lint、构建、离线基准与CI34444168719均通过。
- **本轮确定性修复完成，论文验收仍开着**：真实生产分支回归复现“前两次技术失败、第三次有效初核要求修订却被清空草稿并终态降级”的代码错误；改为保存完整初核与草稿、只把未执行的修订延后给现有carryover，保持每轮3次调用及两次内容流程。新增响应finish_reason/token/字符数诊断，无原文或密钥。这不是已证明原两篇失败根因，不说原论文已恢复。
- **06:13:50原9e4bab7f最新状态**：原8篇已有7篇深评完成、Space-Time Log-Sobolev因timeout延后；4篇草稿verificationDeferred、0正式推荐。Hessian-free（paperId b424a31d-6aef-43c0-8c1b-b5f3437e6210）摘要1471、相关35/质量0、not_required，因非凸势采样算法与KLS/等周函数不等式研究方向不符而未入选。Mirror Langevin于06:04初核错误码invalid_model_output，因既有熔断延期；具体是截断还是完整无效输出尚待新响应元数据。原任务另追加2篇（doi:10.1112/jlms.70616、title:67f51192…）进入enriching_abstracts，必须与原8篇分开。outputs/review-9e4bab7f-ledger.json已更新；本轮未访问生产页面、人工推进或恢复旧自动任务。

- **05:55此前快照**：原9e4bab7f、attempt14、59/59不变；已深评6/8，1篇深评超时延后、1篇未处理，正式推荐0。Hamilton–Jacobi与Sandwich Slice仍保留修订草稿，verificationAttempt=3、verificationDeferred=true，未取得两篇旧修订失败的确切错误码，不能断言质量不通过。mean width草稿也延后（attempt1）；Mirror Langevin已保存相关88/质量85、摘要1334字符，进入独立核对。Space-Time Log-Sobolev深评延后，与同轮已保存deep_reviewing/timeout事件对应；Hessian-free尚待深评。逐篇快照outputs/review-9e4bab7f-ledger.json已更新。8篇交付验收仍未完成，优先继续解决深评/修订的技术失败并核实最终结果。
- **线上v211**：05:49:03 UTC发布成功，源码e224a582bbfa9b0ae4715f9336d7a1505053d74c，版本appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_98e4ffe3ca308191be497e10cbec2016，部署appgdep_6aa2448a6fec819180066c297a839cb2；public/环境修订6/无迁移。只补已保存核对原因、修订状态、尝试次数及白名单错误码日志；未改业务规则。Node24完整572项、lint、构建、离线基准及CI34442457032通过，源已推送GitHub和Sites main。
- **本轮生产页面确实访问**：05:40:44触发网站已有visit补偿，后续不能说纯Cron。稍后DOM读取成功：今日仍展示09-09旧简报且注明“不计入今日数量”，原两篇在论文库显示“正在核对并修正/未加入阅读”；drag006显示“评审未入选/未加入阅读”，具体分数与详细原因尚未取得。详情点击/浏览器连接反复超时，不能说详情验收完成。未点扫描/重扫/阅读/接受/路线确认，未复制Key/Cookie；旧Codex自动任务未恢复。

### 以下为此前轮次快照（不覆盖上方最新状态）

本轮临时生产标签已成功关闭；未设置viewport，无临时预览服务遗留。

- **05:24接续点**：v210下两篇已自然完成独立初核并保存覆盖分：Hamilton–Jacobi90、Sandwich Slice92；仍pending/retryable、published=false，按现行分支需继续保守修订。原9e4bab7f的D1 updated05:24:03，checkpoint=verifying_recommendations，最终核对0/2、正式推荐0。总体3/8已深评、5未深评、0延后。

- **05:14最新生产进展**：原9e4bab7f、attempt14在v210下自然推进至3/8篇已深评、0延后、2篇独立核对pending、5篇尚未深评、0正式推荐；D1 checkpoint=verifying_recommendations。8个确切身份和逐篇表已写入原计划顶部，outputs/review-9e4bab7f-ledger.json有快照。两篇待核对为Hamilton–Jacobi受控梯度流（doi:10.1016/j.jfa.2026.111388）和Sandwich Slice（title:44ac7934…），摘要854/1176字符，相关分均78、质量75/85。第三篇drag006在v210前已深评未推荐，原因暂未独立取得。5篇尚待消费不算失败；整体8篇验收未完成。

- **本轮后续核对（进行中）**：独立初核/修订核对/路线归属的同类DOI身份清理已修复，缺失/重复身份保留草稿待重试，不假算质量拒绝；增加已保存逐篇进度日志。Node24 lint、构建571项与离线基准通过。**v210于05:07:10 UTC发布成功**，源码9b94224a7d068896b116659b5d126e40d3ed6a40；版本appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_9d4371ce999081918b02c2a9c0b9743c，部署appgdep_6aa23af2d47c81918d8c9d979627b248，public/环境修订6不变。CI34439733019已成功。05:04:16原9e4bab7f显示已处理1/8篇、0正式推荐，processed可能含延后，实际逐篇结果仍待核对；未人工推进、未恢复旧自动任务。以下v209为上一轮基线，详见原计划顶部新段。

- 用户已接续开发并明确优先解决原数学45/59断点。旧Codex自动任务继续PAUSED、不恢复、不新建；网站原有外部调度保持运行。本轮没有打开生产页面、人工扫描、重扫、清退避或代用户确认阅读。
- 当前工作在main；业务源码00c2bc8a695e06330ad0f9565046470a2ed15888已推送GitHub与Sites独立绑定仓库，后续6b98b5b只补测试/记录。用户原有未跟踪docs/保留。引用UI仍在独立草稿PR#1，本轮未合入发布。
- **线上v209**：04:12:15 UTC发布成功，public、环境修订6、D1绑定DB不变，无数据库迁移。版本appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_bdf15a8a12508191977dc4f7b33b67e3，部署appgdep_6aa22e1465a08191a7ea1e2550a22bfa。v208仅为先行请求诊断，完整出处见原计划。
- **确定性身份错误已定位并修复**：原14篇最后一篇canonicalId为`doi:10.1130/0091-7613(1990)018<0812:lbotao>2.3.co;2`。旧quickScreenBatch把身份送入HTML正文清理cleanText，删除合法的`<0812:lbotao>`；即使模型照抄也不能匹配，并导致整批丢弃。真实v208函数与v209函数接收同一份完美模拟响应：旧代码2次调用、0结果；新代码1次调用、14结果并保留原DOI。只属隔离复现，不冒充生产评审。
- v208生产取证：原任务9e4bab7f于04:03自然接续，首请求14.583秒返回HTTP200/stop、1333输出token，却在validate因身份不匹配失败；第二次仍14篇重发，才在12秒headers超时。v207只对首次timeout缩批，未解决此前的身份错误。14篇实际书目与输入摘要已完整复原于outputs/screening-9e4bab7f-exact-inputs.json；不再说该批身份未知。原模型输出未记录，具体返回内容不臆断。
- v209身份匹配只整理空白、不清理HTML；fast只保留唯一已知身份、完整字段并通过原校验的结果，其他身份留原队列，不猜配、不标拒稿；有效部分直接保存，下一轮只处理剩余。rescue仍要求完整覆盖。模型、24/12秒边界、质量门槛、来源退避不变。诊断记录真实job/trace及阶段耗时、HTTP状态和身份匹配计数，不记录Key、请求头、用户记忆或模型原始内容。
- 发布前完整lint、构建及566项测试通过；后续仅补实际DOI回归，未变业务构建的完整567项通过。CI34436191627（业务源码）和34436649151（DOI回归）均成功。
- **原45/59断点生产验收已通过**：主数学空间01fbe995-9f58-4039-906e-da25514993c7；同一任务9e4bab7f-285d-4327-a975-e4e15b24289c、attempt14、父96767cfd。它03:35由上轮页面visit启动，本次04:33由external_watchdog自然接续。v209第一次请求15.184秒完成14/14，身份全部匹配、缺失/重复/无效均空；04:34:26只读D1确认59/59、360候选/50拒绝/0正式推荐，checkpoint=enriching_abstracts/status=deep_reviewing，8篇高潜力论文进入摘要补全与深评准备。不是新任务或清零后重扫，旧45条保留。本次根因修复及原断点验证完成；后续8篇尚未完成深评，不能计作推荐。精确trace与快照见outputs/screening-9e4bab7f-recovery.json及原计划。
- 引用清单草稿PR：https://github.com/LittlePyx/pi-research/pull/1 。完整标题/来源独立行/明确引用方向已实现，本地桌面、390px、200%字体及中英文选择验收通过，相关CI全绿；尚未部署。预览8113已停止，临时viewport已清除，本轮创建的QA/生产标签已关闭，原浏览器选回主数学空间。
- 上轮生产交互子项通过：主数学KLS方法材料doi:10.4007/annals.2024.199.3.2打开返回后，桌面/390px同为17可用、3评估、路径2篇、0/5完成；现有Yilin信息论方法材料doi:10.1109/tit.2022.3194725同为18/21、4篇、0/5。均未加入阅读、未接受/完成。Yilin路径不是指定60bfce13路径，不替代双领域基础交付验收。生产KaTeX只读到DOM，未补完整公式目视验收。
- 双领域交付仍开着：数学0c91daae的已附材料review/资源一致且unread；指定信息论60bfce13基础和主数学KLS基础仍空。此前只读确认信息论2b830bbf步骤关联Costa任务bd4bab8b（doi:10.1109/tit.1985.1057105，next09:13 UTC），KLS任务6786d1bf next07:03 UTC；旧Shannon任务e9934cd0属于04948d10空间，不得混用。到期后重新读取，不把历史queued次数当质量通过。
- 工具边界仍遵守：paper_insights连接器offset最高10000，数学附件feafc02f超出可达范围；未绕过、未扫整张论文表，未复试旧受阻诊断入口。该附件当前完整摘要/深评字段仍未独立取得，与本次已取得的14篇输入是不同问题。后续独立核对/路线归属的canonicalId仍有同类HTML清理风险，已在原计划记下，不混作本批已修复范围。
## 先读与先检查

1. 完整阅读本文件、README.md，以及 FRONTEND_OPTIMIZATION_PLAN.md 的当前周期和最新落实。
2. 旧 docs/PROJECT_HANDOFF.md 用于补充产品背景；冲突时遵循最新用户要求和本文件，不运行旧 Prompt 中的全新空间重建流程。
3. 检查 git status、当前分支、最近提交、实际线上版本，再执行；不要仅根据交接文字猜测实时状态。

工作目录：`F:\research-papers\2026\August\Pi_Research`（不是 Pi\_Research）。
线上：https://pi-research-agent.qiudao-pika.chatgpt.site/
GitHub：https://github.com/LittlePyx/pi-research
旧暂停交接前 main HEAD：`7ecb954c83bd94e66829f9d657a78a35dd04e67b`（v207发布记录）；本轮随后只增加交接文档。
原工作树只有 `?? docs/`；该目录是用户原有未跟踪文件，未覆盖、未批量提交。

## 暂停范围

用户明确要求“整理交接并暂停”。旧 Codex 自动推进任务 `pi-research`（Pi Research 完整周期推进）已通过工具设为 PAUSED，并读取持久化配置核实。
旧任务ID：`01a03c21-2577-75d1-8958-9cbcf0dadc64`。不要在旧任务重新启动自动开发，也不要无授权创建新的自动任务。
只暂停 Codex 自动开发：没有暂停网站 Cloudflare 定时器、独立 Worker 或 GitHub schedule，没有暂停任何用户研究空间。线上数据因此仍可能自然变化。
上述为旧暂停轮范围；用户现已明确接手，当前执行状态以文件顶部为准。

## 历史发布内容与证据（v207）

- v207：2026-09-10 02:38:19 UTC 发布成功，原 public 受众不变。
- 发布源码：`5016a4d937bc05350f5cdf7687dc598fa3ee90a9`。
- Sites project：`appgprj_6a83f86ecca081919f3094b285bc2b1d`。
- version：`appgprj_6a83f86ecca081919f3094b285bc2b1d~appgver_7b306016940481919783797797f3956d`。
- deployment：`appgdep_6aa2180e26b88191814130d0ac20ffa3`；环境修订6；D1绑定DB。
- v207快速筛选首次超时后，用原第二次请求处理前半批；仅返回真实评完的ID，后半仍留原队列下一轮继续。正常请求、非超时错误和rescue复审不缩批；24/12秒超时边界、单轮请求次数与最终质量门槛不变。没有数据库迁移。
- 最后业务验证：Node24完整构建及559项测试通过，完整lint通过，test:live和test:discovery:live通过（包含离线双领域基准）。本轮交接不把这些历史结果说成刚重跑。
- v206已上线LaTeX显示与独立学习阶段续评，新增0057 learning_stage_dispatches迁移；v205有0056 learning_stage_reviews。已应用迁移不可重写。
- 数学标题主要展示面使用app/components/math-text.tsx、lib/math-text.ts、app/math.css；原始题名/身份/检索不变。KaTeX0.18.1，trust=false，错误回退原文。不是把任意文本当TeX；SVG原生图标签不在本次覆盖内。
- 本地1280/390宽窄公式验收通过；上线后浏览器连接曾失败，线上公式目视验收未完成。127.0.0.1:8112是已停止的隔离夹具，不是生产工作区，不把旧QA快照当生产证据。

## 未完成：不要继续“只重试、只记状态”

### 原45/59断点已通过；P1转入后续深评结果

主数学空间 `01fbe995-9f58-4039-906e-da25514993c7`，当前任务 `9e4bab7f-285d-4327-a975-e4e15b24289c`（attempt14，父96767）。根因、确切输入、修复源码和上线信息见文件顶部；历史b5d3c070/42abba85/d2c8a1ee/96767等失败链完整保存在原计划，不作为当前任务。

已修复canonicalId被HTML清理破坏及整批结果丢弃；原任务于04:34自然推进至59/59，8篇进入深评准备。此断点验收通过，下一步追踪实际深评、独立核对及正式推荐结果。不得为了验收人工触发、重扫或清空退避，不把候选量/部署/领取名额当恢复成功。

原14篇输入现已完整取得，不能再以D1 work_queue_json截断为由等待它们。模型原始输出未记录，生产证据与旧函数确定性复现分别说明。其他论文的D1读取仍守原边界，不伪造Cookie或绕过受阻诊断入口。
### P1：双领域学习材料真实交付

- 数学验收空间：`0c91daae-3a8c-4c76-89e0-dda1cb521ea1`；路径 `d9f5fed2-617b-4a1c-bd2f-35a4a331aa23`。
  步骤 `66352ace-9d0d-4f37-8286-03322c1d2a71` 已保存 On stochastic forms of functional isoperimetric inequalities（doi:10.1007/s13163-026-00575-7，monitor:feafc02f-537b-4f71-9aeb-2a8c9402b859）。质量分80、来源daily-scan；review与资源的ID/stageKey/摘要quote一致。仍unread、未完成。是阶段归属成功，不是新推荐，也不是KLS原始经典。
- 信息论验收空间：`60bfce13-8286-4672-9d06-96f8f932d7ef`；路径 `817f3aa1-3e25-456b-8a63-5e1cae14b21b`；基础步骤 `2b830bbf-3240-4f07-8f3d-0504296d4489`。
  2026-09-09 13:34:03 UTC阶段评审两篇均unsuitable（包括doi:10.1109/tit.2025.3548961）；是阶段不匹配，不是共享质量拒稿。基础resources=[]，路径waiting_evidence，整体双领域交付尚未通过。
- 主数学KLS基础步骤 `43f0f0ae-33c8-4b5f-9aa2-0edcd0e1c8aa`，路径 `5eb3b683-7c2f-41ef-b823-94d439f1c314`，最后仍为空。
- 既有经典身份：KLS doi:10.1007/bf02574061；Shannon doi:10.1002/j.1538-7305.1948.tb01338.x 与 doi:10.1002/j.1538-7305.1948.tb00917.x。独立Crossref实查KLS及Shannon首条摘要为0，不等于所有来源/D1摘要都为空，也不等于质量通过。
- 五条学习路径都已自然获得调度名额，此子项已通过。当前dispatch.empty可能表示无新增，不否认历史已附材料。不要重复造调度器或等首轮领取。

### 后续顺序

1. 原45/59断点已关闭；追踪同任务8篇深评准备的实际结果及双领域逐篇交付，分别记录候选/筛选/已深评/正式推荐，不能把排队当完成。
2. 生产今日→论文→返回原学习阶段，桌面/窄屏同快照计数；不代用户标已读/接受/确认。
3. 引用清单与跨页面可用性，随后隔离反馈对下一轮发现的影响、跨重扫保留和性能。
4. P2：KaTeX增加客户端分块大小，按需加载优化待做；不要为了消警告改变业务语义。

原7–10工作日周期仍未完成；阶段1跨24小时自然观察已于09-09 08:53 UTC收口，不重启等待。详细证据在计划。不要用部署、零失败心跳、候选量或夹具测试宣布论文交付闭环完成。

## 工作约束与运行提示

- 只用摘要与结构化证据；不重引全文核验，不降低最终质量门槛，不伪造推荐。
- 路线、缺口、引用网络、研究综合、学习发现共用今日质量队列；确认后才更新正式路线证据。
- 历史论文、接受/忽略/稍后/阅读记录必须保留；活跃用户积压12篇以上仍服务，只限制长期不活跃的无人消费自动费用。
- 用户网页配Key，不读取、打印、保存、提交Key/Cookie/Secret；服务器现有机制自行使用凭据，不复制浏览器身份。
- 开发期无累计模型费用/尝试总上限，但技术超时、租约、每次批量、来源Retry-After必须保留；429诚实降级。
- UI优先顺手、少歧义；用户不喜欢圆角标签、杂乱颜色、口号和过量说明。问题按优先级记回原计划，不另造计划树。
- 用户已有同站点自动发布授权，现已明确接续并确认优先修复45/59；遵守工具审批，不扩大受众，不恢复旧Codex自动任务。
- 每次load_workspace_dependencies，Node>=22.13，优先Node24，不改业务适配系统Node20的glob错误。
  最近Node：C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe。
  最近npm CLI：C:\nvm4w\nodejs\node_modules\npm\bin\npm-cli.js。Node目录无npm.cmd；显式Node调用CLI，并把Node目录前置到当前进程PATH。
- Sites打包脚本旧路径已不存在，不反复运行；本次系统tar归档根.openai/hosting.json和完整已验证dist，保留dist/server/index.js入口及dist/.openai/drizzle迁移，工具保存371文件。不可把dist的内容直接平铺到归档根，否则入口校验失败。未知上传结果先查版本，不重复部署。
- GitHub origin与Sites绑定仓库是两份仓库，发布源码必须都同步；Sites凭据仅在单次Git命令内使用，不保存或输出。源码与后续测试提交的已通过CI见顶部；文档/测试提交可领先线上业务源码。
- 不需要重复创建研究空间、泛化检索或重做前端。按完整工作包实现→回归→事实验收→更新原计划，不要求每几分钟用户说继续。

## 可复制到新任务

> 继续 Pi Research，目录 F:\research-papers\2026\August\Pi_Research。先完整阅读 SESSION_HANDOFF.md、README.md 和 FRONTEND_OPTIMIZATION_PLAN.md 当前周期及最新落实，再检查git与实际线上状态。旧Codex自动推进已暂停，不要自动恢复或另建。接续v207之后的原数学筛选恢复及双领域论文交付验收；不重做项目、不重建验收空间、不降低门槛、不代我确认阅读。按完整工作包推进并更新计划。先核实当前状态，不把交接中的旧任务ID当实时状态。
