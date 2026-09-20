"use client";
import { workspaceHash, type WorkspaceView } from "../../lib/workspace-navigation";

export function DemoJourney({ view, locale }: { view: WorkspaceView; locale: "zh" | "en" }) {
  const zh = locale === "zh";
  if (view !== "today") return null;
  const space = "demo-mathematics";
  const steps = [
    { label: zh ? "读一篇论文" : "Read a paper", view: "paper-detail", id: "kls-localization", from: "today" },
    { label: zh ? "查看路线" : "Explore the route", view: "thread-detail", id: "demo-route", tab: "evidence" },
    { label: zh ? "比较与记录" : "Compare & note", view: "workbook", id: "demo-route" },
    { label: zh ? "学习关键方法" : "Learn the method", view: "learn", path: "demo-mathematics-path", step: "demo-mathematics-method" },
    { label: zh ? "了解研究偏向" : "Explore research interests", view: "memory" },
  ] as const;
  return <section className="pi-demo-journey" aria-label={zh ? "演示练习" : "Demo exercise"}>
    <div><strong>{zh ? "从 KLS 到随机局部化" : "From KLS to stochastic localization"}</strong><p>{zh ? "对照两篇文献的假设与工具，记录一个待核对的问题。可随时切换，不会标记学习完成。" : "Compare assumptions and tools, then note a question to verify. Browse freely without completing a stage."}</p></div>
    <nav aria-label={zh ? "体验流程" : "Demo journey"}>{steps.map((step, index) => <a key={step.view} aria-current={view === step.view ? "step" : undefined} href={workspaceHash({ ...step, space })}><span>{String(index + 1).padStart(2, "0")}</span>{step.label}</a>)}</nav>

  </section>;
}
