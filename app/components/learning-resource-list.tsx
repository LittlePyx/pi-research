"use client";

import { learningResourceHref, learningResourcePaperId, type LearningResource } from "../../lib/learning-path";

type Locale = "zh" | "en";

export function LearningResourceList({ resources, locale, openingId, onOpen, signals, supplementary = false }: {
  resources: LearningResource[];
  locale: Locale;
  openingId: string | null;
  onOpen: (resource: LearningResource) => void;
  signals: (resource: LearningResource, locale: Locale) => string[];
  supplementary?: boolean;
}) {
  return <div className="v2-learning-resources v2-learning-reading-list">
    {!supplementary && <small>{locale === "zh" ? "现在读" : "READ NOW"}</small>}
    {resources.map((resource) => {
      const href = learningResourceHref(resource);
      const canOpen = Boolean(learningResourcePaperId(resource));
      const content = <span><strong>{resource.title}</strong><small>{[resource.authors, resource.venue, resource.publishedAt?.slice(0, 4)].filter(Boolean).join(" · ")}</small><em className="v2-learning-resource-signals">{signals(resource, locale).map((signal) => <i key={signal}>{signal}</i>)}</em></span>;
      return <article key={resource.id}>
        {canOpen ? <button type="button" disabled={openingId !== null} onClick={() => onOpen(resource)}>
          {content}<b>{openingId === resource.id ? "…" : locale === "zh" ? "阅读与笔记 →" : "Read & note →"}</b>
        </button> : <div>{content}</div>}
        {href && <a href={href} target="_blank" rel="noreferrer" aria-label={`${locale === "zh" ? "打开原文" : "Open original"}: ${resource.title}`}>{locale === "zh" ? "原文 ↗" : "Original ↗"}</a>}
      </article>;
    })}
  </div>;
}
