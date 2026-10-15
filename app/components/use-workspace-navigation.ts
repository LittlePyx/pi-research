"use client";

import { useCallback, useRef, useState } from "react";
import { readWorkspaceLocation, workspaceHash, type WorkspaceLocation } from "../../lib/workspace-navigation";

export function useWorkspaceNavigation(activeSpaceId: string) {
  const workbookScrollRef = useRef(0);
  const navigationScroll = useRef(new Map<string, number>());
  const restoredLocation = useRef("");
  const [navigationRevision, setNavigationRevision] = useState(0);

  const requestLocationRestore = useCallback(() => {
    restoredLocation.current = "";
    setNavigationRevision((revision) => revision + 1);
  }, []);

  const updateWorkspaceHash = useCallback((patch: Partial<WorkspaceLocation>, history: "push" | "replace" = "push") => {
    const current = readWorkspaceLocation(window.location.hash);
    const hash = workspaceHash({
      ...current,
      tab: current.view === "paper-detail" || current.view === "thread-detail" ? current.tab : undefined,
      ...patch,
    });
    if (hash === window.location.hash) return;
    if (history === "replace") window.history.replaceState(window.history.state, "", hash);
    else window.history.pushState({ piView: current.view }, "", hash);
    restoredLocation.current = activeSpaceId + hash;
  }, [activeSpaceId]);

  return {
    workbookScrollRef,
    navigationScroll,
    restoredLocation,
    navigationRevision,
    requestLocationRestore,
    updateWorkspaceHash,
  };
}
