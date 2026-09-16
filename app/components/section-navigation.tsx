"use client";
import { focusWorkspaceSection } from "../../lib/workspace-section-navigation";

export function SectionNavigation({ label, items }: { label: string; items: Array<{ label: string; target: string }> }) {
  return <nav className="pi-section-navigation" aria-label={label}>
    <span>{label}</span>
    {items.map(item => <button type="button" key={item.target} onClick={() => focusWorkspaceSection(item.target)}>{item.label}</button>)}
  </nav>;
}
