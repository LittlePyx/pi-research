"use client";

import { useState } from "react";

export default function ShareActions({ title, locale }: { title: string; locale: "zh" | "en" }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt(locale === "zh" ? "复制这个快照链接" : "Copy this snapshot link", url);
    }
  };

  return <button className="share-forward" type="button" onClick={share}>{copied ? (locale === "zh" ? "链接已复制" : "Link copied") : (locale === "zh" ? "转发这份快照" : "Share this snapshot")} ↗</button>;
}
