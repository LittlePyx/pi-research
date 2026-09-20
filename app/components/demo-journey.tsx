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
    <div><strong>{zh ? "让阅读逐步指引发现" : "Let reading guide discovery"}</strong><p>{zh ? "从一条笔记到研究偏向，再看相关材料。关联为预设示例，反馈可在本次体验中记录与撤回。" : "Follow a note into research interests and related reading. Connections are preset examples; feedback is saved only for this session."}</p></div>
    <nav aria-label={zh ? "体验流程" : "Demo journey"}>{steps.map((step, index) => <a key={index} href={workspaceHash({ ...step, space })}><span>{String(index + 1).padStart(2, "0")}</span>{step.label}</a>)}</nav>

  </section>;
}
