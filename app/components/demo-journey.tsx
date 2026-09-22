"use client";
import { workspaceHash, type WorkspaceView } from "../../lib/workspace-navigation";

export function DemoJourney({ view, locale, space }: { view: WorkspaceView; locale: "zh" | "en"; space: string }) {
  const zh = locale === "zh";
  if (view !== "today") return null;
  const math = space === "demo-mathematics";
  const steps = [
    { label: zh ? "阅读与反馈" : "Read & respond", view: "paper-detail", id: math ? "kls-localization" : "shannon-fidelity", from: "today" },
    { label: zh ? "查看研究偏向" : "Explore interests", view: "memory" },
    { label: zh ? "查看后续阅读示例" : "See follow-up reading", view: "paper-detail", id: math ? "eldan-thin-shell" : "lossy-finite", from: "today" },
  ] as const;
  return <section className="pi-demo-journey" aria-label={zh ? "演示练习" : "Demo exercise"}>
    <div><strong>{zh ? "体验阅读如何影响研究偏向" : "Explore how reading informs your interests"}</strong><p>{zh ? "回看一条笔记，检查偏向，再看延伸阅读。关联为预设示例。" : "Revisit a note, inspect interests, then explore related reading. Connections are preset examples."}</p></div>
    <nav aria-label={zh ? "体验流程" : "Demo journey"}>{steps.map((step, index) => <a key={index} href={workspaceHash({ ...step, space })}><span>{String(index + 1).padStart(2, "0")}</span>{step.label}</a>)}</nav>
    <a className="pi-demo-process-link" href={"/demo/process?space="+space}>{zh ? "查看研究过程与实际运行" : "Explore the process and recorded runs"} →</a>
  </section>;
}
