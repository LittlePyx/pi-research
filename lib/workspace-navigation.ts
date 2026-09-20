export type WorkspaceView = "today" | "threads" | "thread-detail" | "learn" | "library" | "memory" | "paper-detail" | "workbook";
export type WorkspaceLocation = { view: WorkspaceView; id?: string; tab?: string; space?: string; from?: WorkspaceView; track?: string; graph?: string; step?: string; path?: string };
const views = new Set<WorkspaceView>(["today", "threads", "thread-detail", "learn", "library", "memory", "paper-detail", "workbook"]);
const tabs = new Set(["start", "evidence", "problem", "agenda"]);
const identifier = (value: string | null | undefined) => value && /^[a-zA-Z0-9_-]{1,120}$/.test(value) ? value : undefined;
export function readWorkspaceLocation(hash: string): WorkspaceLocation {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const [segment, rawId, rawTab] = path.split("/");
  const view = segment === "paper" ? "paper-detail" : segment === "thread" ? "thread-detail" : segment as WorkspaceView;
  const params = new URLSearchParams(query);
  const id = identifier(rawId);
  if (!views.has(view) || (["paper-detail", "thread-detail", "workbook"].includes(view) && !id)) return { view: "today" };
  const tab = rawTab || params.get("tab") || "start";
  const from = params.get("from") as WorkspaceView;
  return { view, id, tab: tabs.has(tab) ? tab : "start", space: identifier(params.get("space")), from: views.has(from) && from !== "paper-detail" ? from : undefined, track: identifier(params.get("track")), graph: identifier(params.get("graph")), step: identifier(params.get("step")), path: identifier(params.get("path")) };
}
export function workspaceHash(location: WorkspaceLocation): string {
  const segment = location.view === "paper-detail" ? "paper" : location.view === "thread-detail" ? "thread" : location.view;
  const path = segment + (location.id ? "/" + location.id : "") + (location.view === "thread-detail" ? "/" + (location.tab || "start") : "");
  const params = new URLSearchParams();
  for (const key of ["space", "from", "track", "graph", "step", "path"] as const) if (location[key]) params.set(key, location[key]);
  if (location.tab && location.view !== "thread-detail") params.set("tab", location.tab);
  return "#" + path + (params.size ? "?" + params : "");
}
