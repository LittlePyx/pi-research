"use client";

import { useCallback, useState } from "react";
import type { GraphMode, GraphScope, RouteMaterialLocation, WorkspaceLocation } from "../../lib/workspace-navigation";

type UpdateWorkspaceHash = (patch: Partial<WorkspaceLocation>, history?: "push" | "replace") => void;

export function usePaperNetworkNavigation(updateWorkspaceHash: UpdateWorkspaceHash) {
  const [surface, setSurfaceState] = useState<"library" | "routes">("library");
  const [mode, setModeState] = useState<GraphMode>("similarity");
  const [scope, setScopeState] = useState<GraphScope>("all");
  const [trackId, setTrackIdState] = useState("all");
  const [focusId, setFocusIdState] = useState<string | null>(null);
  const [compareTrack, setCompareTrack] = useState('');
  const [materials,setMaterials]=useState<RouteMaterialLocation>({});

  const changeMaterials=useCallback((patch:RouteMaterialLocation,history:"push"|"replace")=>{
    setMaterials(current=>({...current,...patch}));
    updateWorkspaceHash(patch,history);
  },[updateWorkspaceHash]);

  const changeCompareTrack = useCallback((next: string) => {
    setCompareTrack(next);
    updateWorkspaceHash({ graphCompareTrack: next || undefined }, 'push');
  }, [updateWorkspaceHash]);

  const changeSurface = useCallback((next: "library" | "routes") => {
    setSurfaceState(next);
    const mode=next==="routes"?"materials":"citations";
    setModeState(mode);
    updateWorkspaceHash({graphSurface:next==="library"?undefined:next,graphMode:mode,...(next==="routes"?materials:{})},"push");
  }, [materials,updateWorkspaceHash]);

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
    setMaterials({});
    updateWorkspaceHash({
      graphTrack: next === "all" ? undefined : next,
      graphFocus: undefined,
      graphScope: undefined,
      libraryNeighbor: undefined,
      materialQuery:undefined,materialPage:undefined,materialPaper:undefined,materialGroup:undefined,
    }, "push");
  }, [updateWorkspaceHash]);

  const restore = useCallback((location: WorkspaceLocation) => {
    setSurfaceState(location.graphSurface || "library");
    setModeState(location.graphMode || (location.graphSurface==="routes"?"materials":"citations"));
    setScopeState(location.graphScope || "all");
    setTrackIdState(location.graphTrack || "all");
    setFocusIdState(location.graphFocus || null);
    setCompareTrack(location.graphCompareTrack || '');
    setMaterials({materialQuery:location.materialQuery,materialPage:location.materialPage,materialPaper:location.materialPaper,materialGroup:location.materialGroup});
  }, []);

  return {
    surface,
    mode,
    scope,
    trackId,
    focusId,
    compareTrack,
    materials,
    changeMaterials,
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
