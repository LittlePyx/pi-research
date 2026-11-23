"use client";

import { Component, type ReactNode } from "react";
import { reloadForMissingChunk } from "../../lib/client-chunk-recovery";

export class WorkspacePanelBoundary extends Component<{ locale: "zh" | "en"; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    reloadForMissingChunk(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const zh = this.props.locale === "zh";
    return <section className="pi-content-loading" role="alert">
      <strong>{zh ? "这部分暂未载入" : "This panel could not load"}</strong>
      <button type="button" onClick={() => window.location.reload()}>{zh ? "重新加载页面" : "Reload page"}</button>
    </section>;
  }
}
