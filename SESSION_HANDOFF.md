# Pi Research 新任务交接（2026-09-10）

本文件是当前接续入口。旧 `docs/PROJECT_HANDOFF.md` / `docs/NEXT_SESSION_PROMPT.md` 的 55a600e 基线和冷启动任务属于历史，不要据此从头重做。详细实施证据仍以 `FRONTEND_OPTIMIZATION_PLAN.md` 最新段落为准。

## 新会话接续补充（2026-09-10，本节优先于下方旧快照）

- 用户已明确接续开发，旧Codex自动任务仍不恢复、不新建。线上仍v207/public/环境修订6，本次没有部署或人工触发生产扫描。
- GitHub此前落后32个提交，已快进同步main到b7b6471，其CI34431072569通过。当前工作分支为codex/citation-ledger-readability，业务提交bad7c6626a3d7c54e5596dbe6b15a22d54f335b0，草稿PR：https://github.com/LittlePyx/pi-research/pull/1 。该业务提交CI34431959257及交接提交1a8634e的CI34432216737通过；后续只改文字放大夹具与验收记录。不覆盖未跟踪docs/。
- 17C引用清单独立批次已实现来源独立行、完整换行标题、明确两端角色、保留数据库引用方向与原onSelect。Node24完整lint/构建/562项测试通过，1440/390真实隔离组件截图、鼠标与键盘选择、同快照2条引用均通过。浏览器恢复后补完200%实际字体压力验收：390px页面有效宽375/scrollWidth375，标题24px、来源30px，完整换行且无横向溢出；700px英文同为2条、有效宽685/scrollWidth685，选择端点正确。夹具放大需使用font-size的important以覆盖现有主题，不涉及产品代码。引用新代码尚未部署，PR保持草稿。
- 正常所有者会话实际加载原有空间，未新建验收空间或复制身份。主数学KLS路径的方法材料doi:10.4007/annals.2024.199.3.2已打开详情并返回原方法阶段；桌面/390px均17可用、3评估、路径2篇、完成0/5。现有信息论Yilin的高斯极值路径方法材料doi:10.1109/tit.2022.3194725同样通过，均18可用、21评估、路径4篇、完成0/5。两篇仍“未加入阅读”，未点击接受/阅读/完成。这个信息论路径不是指定60bfce13验收路径，不能替代其交付验收；两个基础阶段仍无材料。生产标题的KaTeX DOM存在，但未补生产公式截图，完整公式目视验收不冒称通过。
- 已清除所有临时viewport覆盖、恢复最初主数学空间、关闭本轮创建的生产及QA标签，隔离预览8113已停止。正常页面访问会触发visit_backstop（信息论页面观察到准备扫描），因此不能把访问后的推进都归于纯Cron；没有点击扫描、重扫或清空退避。
- 主数学最新恢复任务96767cfd-4d78-4ec7-804e-c9de1fa26c6c，attempt13，父d2c8a1ee-35de-4464-b885-b3deb57436c4，03:13:46 UTC自然领取。03:14:16在打开生产页前已完成一次推进但仍45/59；03:30:07只读取得终态：03:16:38.924再次timeout、retry_pending、failure_source仍“DeepSeek Pro 已快速筛选 45 / 59”，360候选/45筛选/41拒绝/0正式推荐，next04:16:38.924 UTC。v207本次未突破断点；不能把自然领取说成恢复成功，也不能把后续正常访问后的终态全归于Cron。work_queue_json继续被截断，深评数及最后14篇身份未知；下一步需要确切输入与每次模型请求耗时，不能盲目继续缩批/延时或只记重试。
- 当前信息论验收步骤2b830bbf实际关联bd4bab8b，确切经典为Costa doi:10.1109/tit.1985.1057105；attempt6/queued6，next09:13 UTC。旧Shannon任务e9934cd0属于04948d10空间，attempt8/queued5，next03:13 UTC，二者不得混用。主数学KLS任务6786d1bf为attempt7/queued6，next07:03 UTC。数学已附材料review/资源仍一致且unread，当前信息论基础与KLS基础仍空，双领域交付未关闭。
- 新确证读取限制：paper_insights按paper_id排序，连接器offset受工作区上限10000限制；边界主键85832907，数学附件feafc02f超出可达范围。未绕过限制、未扫整张论文表；其当前完整摘要/质量字段仍未独立取得。正常所有者浏览器读取仍是待恢复途径，不复试旧受阻诊断入口。

## 先读与先检查

1. 完整阅读本文件、README.md，以及 FRONTEND_OPTIMIZATION_PLAN.md 的当前周期和最新落实。
2. 旧 docs/PROJECT_HANDOFF.md 用于补充产品背景；冲突时遵循最新用户要求和本文件，不运行旧 Prompt 中的全新空间重建流程。
3. 检查 git status、当前分支、最近提交、实际线上版本，再执行；不要仅根据交接文字猜测实时状态。

工作目录：`F:\research-papers\2026\August\Pi_Research`（不是 Pi\_Research）。
线上：https://pi-research-agent.qiudao-pika.chatgpt.site/
GitHub：https://github.com/LittlePyx/pi-research
交接前 main HEAD：`7ecb954c83bd94e66829f9d657a78a35dd04e67b`（v207发布记录）；本轮随后只增加交接文档。
原工作树只有 `?? docs/`；该目录是用户原有未跟踪文件，未覆盖、未批量提交。

## 暂停范围

用户明确要求“整理交接并暂停”。旧 Codex 自动推进任务 `pi-research`（Pi Research 完整周期推进）已通过工具设为 PAUSED，并读取持久化配置核实。
旧任务ID：`01a03c21-2577-75d1-8958-9cbcf0dadc64`。不要在旧任务重新启动自动开发，也不要无授权创建新的自动任务。
只暂停 Codex 自动开发：没有暂停网站 Cloudflare 定时器、独立 Worker 或 GitHub schedule，没有暂停任何用户研究空间。线上数据因此仍可能自然变化。
本轮不新增业务、不部署、不执行生产扫描。新任务明确接手后再继续。

## 最新已发布内容与证据

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

### P1：v207实际恢复效果

主数学空间 `01fbe995-9f58-4039-906e-da25514993c7`。
旧失败链：`b5d3c070-24ab-44f7-9927-201c88ca0ccc` → `42abba85-00b1-4fde-92aa-fa3e1a710bd7`，都停留45/59快速筛选，360候选；不是经典来源检索的零结果。
最后一次发布前run快照：2026-09-10 02:04:18 UTC超时、active_job_id=null，next_run_at=03:04:18 UTC。后继任务须重新取证，不能一直把42abba85当“当前任务”。
**尚未证实v207已突破45/59**。先只读核对自然恢复、resume链、筛选/深评/正式推荐与今日投影。不得为了验收人工触发、重扫或清空退避。
现有D1读取工具会截断work_queue_json；没有取得完整最后14篇输入。不得把未读到当空值，不扫整张论文表替代确切身份，不伪造Cookie或绕过受阻诊断入口。缩批是有界恢复改进，不是网络/模型底层原因已确诊。

### P1：双领域学习材料真实交付

- 数学验收空间：`0c91daae-3a8c-4c76-89e0-dda1cb521ea1`；路径 `d9f5fed2-617b-4a1c-bd2f-35a4a331aa23`。
  步骤 `66352ace-9d0d-4f37-8286-03322c1d2a71` 已保存 On stochastic forms of functional isoperimetric inequalities（doi:10.1007/s13163-026-00575-7，monitor:feafc02f-537b-4f71-9aeb-2a8c9402b859）。质量分80、来源daily-scan；review与资源的ID/stageKey/摘要quote一致。仍unread、未完成。是阶段归属成功，不是新推荐，也不是KLS原始经典。
- 信息论验收空间：`60bfce13-8286-4672-9d06-96f8f932d7ef`；路径 `817f3aa1-3e25-456b-8a63-5e1cae14b21b`；基础步骤 `2b830bbf-3240-4f07-8f3d-0504296d4489`。
  2026-09-09 13:34:03 UTC阶段评审两篇均unsuitable（包括doi:10.1109/tit.2025.3548961）；是阶段不匹配，不是共享质量拒稿。基础resources=[]，路径waiting_evidence，整体双领域交付尚未通过。
- 主数学KLS基础步骤 `43f0f0ae-33c8-4b5f-9aa2-0edcd0e1c8aa`，路径 `5eb3b683-7c2f-41ef-b823-94d439f1c314`，最后仍为空。
- 既有经典身份：KLS doi:10.1007/bf02574061；Shannon doi:10.1002/j.1538-7305.1948.tb01338.x 与 doi:10.1002/j.1538-7305.1948.tb00917.x。独立Crossref实查KLS及Shannon首条摘要为0，不等于所有来源/D1摘要都为空，也不等于质量通过。
- 五条学习路径都已自然获得调度名额，此子项已通过。当前dispatch.empty可能表示无新增，不否认历史已附材料。不要重复造调度器或等首轮领取。

### 后续顺序

1. 收口上述原任务恢复和双领域逐篇交付，记录候选/筛选/深评/正式推荐的同批漏斗。
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
- 用户已有同站点自动发布授权；遵守当时工具审批，不扩大受众。此次“暂停”不授权继续开发/发布。
- 每次load_workspace_dependencies，Node>=22.13，优先Node24，不改业务适配系统Node20的glob错误。
  最近Node：C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe。
  最近npm CLI：C:\nvm4w\nodejs\node_modules\npm\bin\npm-cli.js。Node目录无npm.cmd；显式Node调用CLI，并把Node目录前置到当前进程PATH。
- Sites打包脚本旧路径已不存在，不反复运行；v207用系统tar只归档已验证dist（server/index.js、.openai/hosting.json及迁移），370文件。首次上传超时后先查版本再重试；不可重复保存/部署未知结果。
- 发布源码已推到Sites绑定仓库；没有核对最近GitHub同步/CI，不声称GitHub已全绿。当前本地文档提交可领先线上源码。
- 不需要重复创建研究空间、泛化检索或重做前端。按完整工作包实现→回归→事实验收→更新原计划，不要求每几分钟用户说继续。

## 可复制到新任务

> 继续 Pi Research，目录 F:\research-papers\2026\August\Pi_Research。先完整阅读 SESSION_HANDOFF.md、README.md 和 FRONTEND_OPTIMIZATION_PLAN.md 当前周期及最新落实，再检查git与实际线上状态。旧Codex自动推进已暂停，不要自动恢复或另建。接续v207之后的原数学筛选恢复及双领域论文交付验收；不重做项目、不重建验收空间、不降低门槛、不代我确认阅读。按完整工作包推进并更新计划。先核实当前状态，不把交接中的旧任务ID当实时状态。
