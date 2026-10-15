"use client";

import type { LearningPathStep, LearningResource } from "../../lib/learning-path";
import { learningResourceHref, learningResourcePaperId } from "../../lib/learning-path";
import { learningNextTask } from "../../lib/learning-next-task";
import { MathText } from "./math-text";

/** A shortcut to existing, admitted reading; never advances learning progress. */
export function LearningSessionEntry({ step, locale, openingId, onOpen }: {
  step: LearningPathStep; locale: "zh" | "en"; openingId: string | null;
  onOpen: (resource: LearningResource) => void;
}) {
  const task = learningNextTask(step);
  if (!task) return null;
  const zh = locale === "zh";
  const focus = (step.guidanceStatus === "grounded" && !task.supplementary
    ? (zh ? step.readFocusZh : step.readFocusEn) : "")
    || (zh ? task.resource.readingFocusZh : task.resource.readingFocusEn);
  const label = task.revisit ? (zh ? "回顾阅读与笔记" : "Revisit reading & notes")
    : task.resource.readingStatus === "reading" ? (zh ? "继续阅读与笔记" : "Continue reading & notes")
      : (zh ? "开始阅读" : "Start reading");
  return <section className="pi-learning-session-entry" aria-label={zh ? "本次学习" : "This study session"}>
    <p className="pi-session-stage">{zh ? step.titleZh : step.titleEn} · {zh ? "下一篇阅读" : "Next reading"}</p>
    <h2><MathText inline>{task.resource.title}</MathText></h2>
    {focus && <p className="pi-session-focus"><strong>{zh ? "阅读重点：" : "Reading focus: "}</strong><MathText inline>{focus}</MathText></p>}
    {task.supplementary && <p>{zh ? "补充阅读；本阶段原始材料仍待补齐，不计入阶段完成。" : "Supplementary reading; original stage material is still missing. This does not complete the stage."}</p>}
    {learningResourcePaperId(task.resource)
      ? <button type="button" disabled={openingId !== null} onClick={() => onOpen(task.resource)}>{openingId === task.resource.id ? (zh ? "正在打开…" : "Opening…") : label} →</button>
      : <a href={learningResourceHref(task.resource)!} target="_blank" rel="noreferrer">{zh ? "打开原文" : "Open original"} ↗</a>}
  </section>;
}
