"use client";

import { useCallback, useState } from "react";
import type { GraphMode, GraphScope, WorkspaceLocation } from "../../lib/workspace-navigation";

type UpdateWorkspaceHash = (patch: Partial<WorkspaceLocation>, history?: "push" | "replace") => void;

export function usePaperNetworkNavigation(updateWorkspaceHash: UpdateWorkspaceHash) {
  const [surface, setSurfaceState] = useState<"library" | "routes">("library");
  const [mode, setModeState] = useState<GraphMode>("similarity");
  const [scope, setScopeState] = useState<GraphScope>("all");
  const [trackId, setTrackIdState] = useState("all");
  const [focusId, setFocusIdState] = useState<string | null>(null);

  const changeSurface = useCallback((next: "library" | "routes") => {
    setSurfaceState(next);
    updateWorkspaceHash({ graphSurface: next === "library" ? undefined : next }, "push");
  }, [updateWorkspaceHash]);

  const changeMode = useCallback((next: GraphMode) => {
    setModeState(next);
    setScopeState("all");
    updateWorkspaceHash({ graphMode: next, graphScope: undefined }, "push");
  }, [updateWorkspaceHash]);

  const changeScope = useCallback((next: GraphScope) => {
    setScopeState(next);
    updateWorkspaceHash({ graphScope: next === "all" ? undefined : next }, "push");
  }, [updateWorkspaceHash]);

  const changeFocus = useCallback((next: string | null) => {
    setFocusIdState(next);
    updateWorkspaceHash({ graphFocus: next || undefined }, "push");
  }, [updateWorkspaceHash]);

  const changeTrack = useCallback((next: string) => {
    setTrackIdState(next);
    setFocusIdState(null);
    setScopeState("all");
    updateWorkspaceHash({
      graphTrack: next === "all" ? undefined : next,
      graphFocus: undefined,
      graphScope: undefined,
    }, "push");
  }, [updateWorkspaceHash]);

  const restore = useCallback((location: WorkspaceLocation, validTrackIds: Set<string>) => {
    setSurfaceState(location.graphSurface || "library");
    setModeState(location.graphMode || "similarity");
    setScopeState(location.graphScope || "all");
    setTrackIdState(location.graphTrack && validTrackIds.has(location.graphTrack) ? location.graphTrack : "all");
    setFocusIdState(location.graphFocus || null);
  }, []);

  return {
    surface,
    mode,
    scope,
    trackId,
    focusId,
    setSurface: setSurfaceState,
    setMode: setModeState,
    setScope: setScopeState,
    setTrackId: setTrackIdState,
    setFocus: setFocusIdState,
    changeSurface,
    changeMode,
    changeScope,
    changeFocus,
    changeTrack,
    restore,
  };
}
