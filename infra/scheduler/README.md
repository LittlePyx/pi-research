# 独立定时唤醒器

单独部署到用户授权的 Cloudflare 账户，不是 Sites 应用的部署配置。
使用 Cloudflare Cron 调用既有 scheduler 入口，不经过 GitHub Actions。
不访问数据库、不调用模型、不提供公开 HTTP 触发接口；并发由网站既有持久化租约去重。

部署和 dry-run 都必须显式指定本目录的 `--config wrangler.jsonc`，避免误用仓库根目录由 Sites 生成的 `.wrangler/deploy/config.json`。已通过独立配置的 dry-run（无需登录、不上传）。

## 启用前置条件

1. 确认已连接的 Cloudflare 账户及目标 Worker，检查名称是否冲突；不得覆盖已有无关 Worker。
2. 保留网站和 GitHub 的现有调度凭据。不要读取它们或为了接入而轮换；若不能安全配置同一凭据，应先实现独立凭据支持并完成回归，再签发新的专用调度凭据。
3. 只通过服务的 Secret 配置通道配置 `MONITOR_SCHEDULER_SECRET`。不得写入源码、配置文件、命令参数、聊天或日志。它不是模型 API Key。
4. 2026-09-08 已完成真实鉴权与一次受控调用：startedCount=3、advancedCount=3、completedCount=0。配置已改为每十分钟自然触发；实际部署及自然样本见根目录实施计划。回退时恢复空 crons。

## 验收及回退

- 先检查独立 Worker 的自然 Cron 执行时间，再匹配网站 D1 tick；现有网站将其归类为 external_watchdog，不能仅凭这个字段与 GitHub 区分。
- 保留 GitHub 作为备用；至少覆盖 24 小时及三次独立自然触发，分别验证领取、同一任务计数推进、六个目标空间的恢复结果及历史保留。
- 唤醒成功不是论文质量通过，advancedCount 不是新增论文数量。租约未取得是合法去重结果，不是完成业务验收。
- 请求只尝试一次，240 秒超时，无快速自动重试；下一次自然触发继续走原幂等入口。失败只报告固定错误码，不输出响应正文。
- 回退时将 crons 恢复为空并部署，保留 GitHub、网站和所有研究数据。不要把独立 Worker 的上线等同于严格十分钟 SLA。

官方依据：https://developers.cloudflare.com/workers/configuration/cron-triggers/
