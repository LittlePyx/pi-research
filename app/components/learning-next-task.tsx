"use client";

import type { ReactNode } from "react";
import type { LearningPathStep, LearningResource } from "../../lib/learning-path";
import { learningNextTask } from "../../lib/learning-next-task";
import { MathText } from "./math-text";

export function LearningNextTask({ step, locale, renderResource }: {
  step: LearningPathStep;
  locale: "zh" | "en";
  renderResource: (resource: LearningResource) => ReactNode;
}) {
  const task = learningNextTask(step);
  if (!task) return null;
  const zh = locale === "zh";
  const focus = (zh ? task.resource.readingFocusZh : task.resource.readingFocusEn)?.trim();
  const checkpoint = step.guidanceStatus === "grounded" ? (zh ? step.checkpointZh : step.checkpointEn)?.trim() : "";
  return <section className="v2-learning-next-task" aria-label={zh ? "下一步学习任务" : "Next learning task"}>
    <h4>{task.revisit ? (zh ? "下一步：回顾阅读笔记" : "Next: revisit your notes")
      : task.supplementary ? (zh ? "下一步：先读补充材料" : "Next: start with supplementary reading")
        : (zh ? "下一步：阅读本阶段材料" : "Next: read this stage’s paper")}</h4>
    {task.supplementary && <p>{zh ? "这篇可帮助熟悉主题；本阶段原始材料仍待补齐，补充阅读不计入阶段完成。" : "Use this paper to become familiar with the subject. The original material is still missing; supplementary reading does not complete the stage."}</p>}
    {renderResource(task.resource)}
    <ol>
      <li><strong>{zh ? "本次阅读重点：" : "Reading focus: "}</strong><MathText>{focus || (zh ? "核对论文研究的问题、使用的假设和摘要明确支持的结论。" : "Check the paper’s question, assumptions and claims explicitly supported by its abstract.")}</MathText></li>
      <li><strong>{zh ? "检查学习结果：" : "Check your result: "}</strong><MathText>{checkpoint || (zh ? "在论文笔记中记录一条有出处的结论、它的适用条件，以及一个仍需查证的问题；读后返回本阶段。" : "In the paper note, record one sourced claim, its conditions, and one question still to verify; then return to this stage.")}</MathText></li>
    </ol>
  </section>;
}
