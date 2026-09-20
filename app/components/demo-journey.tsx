"use client";
import { workspaceHash, type WorkspaceView } from "../../lib/workspace-navigation";

export function DemoJourney({ view, locale }: { view: WorkspaceView; locale: "zh" | "en" }) {
  const zh = locale === "zh";
  const space = "demo-mathematics";
  const steps = [
    { label: zh ? "读一篇论文" : "Read a paper", view: "paper-detail", id: "kls-localization", from: "today" },
    { label: zh ? "查看路线" : "Explore the route", view: "thread-detail", id: "demo-route", tab: "evidence" },
    { label: zh ? "比较与记录" : "Compare & note", view: "workbook", id: "demo-route" },
    { label: zh ? "学习关键方法" : "Learn the method", view: "learn", path: "demo-mathematics-path", step: "demo-mathematics-method" },
    { label: zh ? "找回笔记" : "Revisit notes", view: "memory" },
  ] as const;
  return <section className="pi-demo-journey" aria-label={zh ? "演示练习" : "Demo exercise"}>
    <div><strong>{zh ? "从 KLS 到随机局部化" : "From KLS to stochastic localization"}</strong><p>{zh ? "对照两篇文献的假设与工具，记录一个待核对的问题。可随时切换，不会标记学习完成。" : "Compare assumptions and tools, then note a question to verify. Browse freely without completing a stage."}</p></div>
    <nav aria-label={zh ? "体验流程" : "Demo journey"}>{steps.map((step, index) => <a key={step.view} aria-current={view === step.view ? "step" : undefined} href={workspaceHash({ ...step, space })}><span>{String(index + 1).padStart(2, "0")}</span>{step.label}</a>)}</nav>
    {view === "paper-detail" && <small>{zh ? "在“我的笔记”写下一个问题并保存，稍后可在研究记忆中找回。" : "Save a question in My notes, then find it in Research memory."}</small>}
    {view === "workbook" && <small>{zh ? "已有一份示例比较记录。可打开依据，补充核查笔记和待解决问题。" : "Continue the example comparison by inspecting evidence and adding open questions."}</small>}
    {view === "memory" && <small>{zh ? "这里有示例阅读笔记，也会显示本次保存的笔记；比较记录在比较页。刷新恢复初始示例。" : "Paper notes appear here; comparison notes stay in Compare. Demo saves reset on refresh."}</small>}
  </section>;
}
