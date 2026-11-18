"use client";

import { useCallback, useRef, useState } from "react";
import { readWorkspaceLocation, workspaceHash, type WorkspaceLocation } from "../../lib/workspace-navigation";
import { rememberComparison } from '../../lib/workbook-continuation';
import {workbookInspectorReturn,type WorkbookHistoryMode} from '../../lib/workbook-history';

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

  const updateWorkspaceHash = useCallback((patch: Partial<WorkspaceLocation>, history: WorkbookHistoryMode = "push") => {
    if(history==='close-evidence'&&workbookInspectorReturn(window.history.state,window.location.hash)){
      window.history.back();return true;
    }
    const current = readWorkspaceLocation(window.location.hash);
    const hash = workspaceHash({
      ...current,
      tab: current.view === "paper-detail" || current.view === "thread-detail" ? current.tab : undefined,
      ...patch,
    });
    if (hash === window.location.hash) return;
    if (history === "replace"||history==='close-evidence') window.history.replaceState(window.history.state, "", hash);
    else window.history.pushState({ piView: current.view,...(history==='open-evidence'?{piWorkbookInspectorFrom:window.location.hash}:{}) }, "", hash);
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
