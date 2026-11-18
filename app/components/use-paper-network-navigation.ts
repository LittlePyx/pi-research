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
  const [compareTrack, setCompareTrack] = useState('');

  const changeCompareTrack = useCallback((next: string) => {
    setCompareTrack(next);
    updateWorkspaceHash({ graphCompareTrack: next || undefined }, 'push');
  }, [updateWorkspaceHash]);

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
      libraryNeighbor: undefined,
    }, "push");
  }, [updateWorkspaceHash]);

  const restore = useCallback((location: WorkspaceLocation) => {
    setSurfaceState(location.graphSurface || "library");
    setModeState(location.graphMode || "similarity");
    setScopeState(location.graphScope || "all");
    setTrackIdState(location.graphTrack || "all");
    setFocusIdState(location.graphFocus || null);
    setCompareTrack(location.graphCompareTrack || '');
  }, []);

  return {
    surface,
    mode,
    scope,
    trackId,
    focusId,
    compareTrack,
    setCompareTrack,
    changeCompareTrack,
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
