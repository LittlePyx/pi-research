"use client";

import { useCallback, useRef, useState } from "react";
import { readWorkspaceLocation, workspaceHash, type WorkspaceLocation } from "../../lib/workspace-navigation";
import { rememberComparison } from '../../lib/workbook-continuation';

export function useWorkspaceNavigation(activeSpaceId: string, userId: string) {
  const workbookScrollRef = useRef(0);
  const navigationScroll = useRef(new Map<string, number>());
  const restoredLocation = useRef("");
  const [navigationRevision, setNavigationRevision] = useState(0);
  const rememberCurrentLocation = useCallback((hash = window.location.hash) => {
    rememberComparison(userId, activeSpaceId, hash);
  }, [userId, activeSpaceId]);

  const requestLocationRestore = useCallback(() => {
    rememberCurrentLocation();
    restoredLocation.current = "";
    setNavigationRevision((revision) => revision + 1);
  }, [rememberCurrentLocation]);

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
    rememberCurrentLocation(hash);
  }, [activeSpaceId, rememberCurrentLocation]);

  return {
    workbookScrollRef,
    navigationScroll,
    restoredLocation,
    navigationRevision,
    requestLocationRestore,
    updateWorkspaceHash,
    rememberCurrentLocation,
  };
}
