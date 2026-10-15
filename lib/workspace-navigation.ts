export type WorkspaceView = "today" | "threads" | "thread-detail" | "learn" | "library" | "memory" | "paper-detail" | "workbook";
export type TodayPanel = "home"|"reading"|"discovery"|"records"|"settings";
export type PaperPanel='reading'|'notes'|'record';
export type LibraryScope='related'|'all';
export type GraphMode='similarity'|'citations'|'path';
export type GraphScope='all'|'one-hop'|'multi-seed';
export type WorkbookPanel='evidence'|'relations'|'task';
export type WorkspaceLocation = { workbookId?:string; returnTo?:string; readingFocus?:string; focus?: 'recovery'; graphFrom?: 'library'; paperPanel?:PaperPanel; panel?:TodayPanel; view: WorkspaceView; id?: string; tab?: string; space?: string; from?: WorkspaceView; track?: string; graph?: string; step?: string; path?: string; libraryQuery?:string; libraryScope?:LibraryScope; libraryPage?:number; libraryFocus?:string; libraryFilter?:'inbox'|'accepted'|'all'|'dismissed'; libraryStage?:'all'|'evaluated'; libraryInbox?:'all'|'unseen'|'seen'|'snoozed'; librarySort?:'priority'|'newest'|'quality'; libraryTag?:'all'|'saved'|'notes'; graphSurface?:'library'|'routes'; graphMode?:GraphMode; graphScope?:GraphScope; graphTrack?:string; graphFocus?:string; workbookPanel?:WorkbookPanel; workbookFocus?:string };
const views = new Set<WorkspaceView>(["today", "threads", "thread-detail", "learn", "library", "memory", "paper-detail", "workbook"]);
const tabs = new Set(["start", "evidence", "problem", "agenda"]);
const identifier = (value: string | null | undefined) => value && /^[a-zA-Z0-9_-]{1,120}$/.test(value) ? value : undefined;
const text = (value:string|null,max:number) => value && value.length<=max && !Array.from(value).some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127) ? value : undefined;
const positiveInteger = (value:string|null) => { const parsed=Number(value); return Number.isInteger(parsed)&&parsed>=1&&parsed<=10000?parsed:undefined; };
export function readWorkspaceLocation(hash: string): WorkspaceLocation {
  return parseWorkspaceLocation(hash, 0);
}
function parseWorkspaceLocation(hash: string, depth: number): WorkspaceLocation {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const [segment, rawId, rawTab] = path.split("/");
  const view = segment === "paper" ? "paper-detail" : segment === "thread" ? "thread-detail" : segment as WorkspaceView;
  const params = new URLSearchParams(query);
  const id = identifier(rawId);
  if (!views.has(view) || (["paper-detail", "thread-detail", "workbook"].includes(view) && !id)) return { view: "today" };
  const tab = rawTab || params.get("tab") || "start";
  const from = params.get("from") as WorkspaceView;
  const paperPanel=params.get('paperPanel');
  const libraryRoute=view==='library'||view==='thread-detail'||view==='threads'&&Boolean(identifier(params.get('graph')));
  const graphRoute=view==='threads'&&Boolean(identifier(params.get('graph')));
  const workbookRoute=view==='workbook';
  const location: WorkspaceLocation = { view, id,
    ...(view === 'today' && params.get('panel') === 'discovery' && params.get('focus') === 'recovery' ? {focus: 'recovery' as const} : {}),
    ...((view === 'threads' || view === 'paper-detail' && from === 'threads') && identifier(params.get('graph')) && params.get('graphFrom') === 'library' ? {graphFrom: 'library' as const} : {}),
    ...(view==='paper-detail'&&['reading','notes','record'].includes(paperPanel||'')?{paperPanel:paperPanel as PaperPanel}:{}), ...(["home","reading","discovery","records","settings"].includes(params.get("panel")||"") ? {panel:params.get("panel") as TodayPanel} : {}), tab: tabs.has(tab) ? tab : "start", space: identifier(params.get("space")), from: views.has(from) && from !== "paper-detail" ? from : undefined, track: identifier(params.get("track")), graph: identifier(params.get("graph")), step: identifier(params.get("step")), path: identifier(params.get("path")),
    ...(view==='paper-detail'&&from==='workbook'&&text(params.get('readingFocus'),600)?{readingFocus:text(params.get('readingFocus'),600)}:{}),
    ...(libraryRoute&&text(params.get('q'),300)?{libraryQuery:text(params.get('q'),300)}:{}),
    ...(libraryRoute&&params.get('scope')==='all'?{libraryScope:'all' as const}:{}),
    ...(libraryRoute&&positiveInteger(params.get('page'))?{libraryPage:positiveInteger(params.get('page'))}:{}),
    ...(libraryRoute&&identifier(params.get('libraryFocus'))?{libraryFocus:identifier(params.get('libraryFocus'))}:{}),
    ...(view==='library'&&['inbox','accepted','all','dismissed'].includes(params.get('filter')||'')?{libraryFilter:params.get('filter') as WorkspaceLocation['libraryFilter']}:{}),
    ...(view==='library'&&params.get('stage')==='evaluated'?{libraryStage:'evaluated' as const}:{}),
    ...(view==='library'&&['all','unseen','seen','snoozed'].includes(params.get('inbox')||'')?{libraryInbox:params.get('inbox') as WorkspaceLocation['libraryInbox']}:{}),
    ...(view==='library'&&['priority','newest','quality'].includes(params.get('sort')||'')?{librarySort:params.get('sort') as WorkspaceLocation['librarySort']}:{}),
    ...(view==='library'&&['all','saved','notes'].includes(params.get('tag')||'')?{libraryTag:params.get('tag') as WorkspaceLocation['libraryTag']}:{}),
    ...(graphRoute&&params.get('graphSurface')==='routes'?{graphSurface:'routes' as const}:{}),
    ...(graphRoute&&['similarity','citations','path'].includes(params.get('graphMode')||'')?{graphMode:params.get('graphMode') as GraphMode}:{}),
    ...(graphRoute&&['all','one-hop','multi-seed'].includes(params.get('graphScope')||'')?{graphScope:params.get('graphScope') as GraphScope}:{}),
    ...(graphRoute&&identifier(params.get('graphTrack'))?{graphTrack:identifier(params.get('graphTrack'))}:{}),
    ...(graphRoute&&identifier(params.get('graphFocus'))?{graphFocus:identifier(params.get('graphFocus'))}:{}),
    ...(workbookRoute&&text(params.get('workbookId'),240)?{workbookId:text(params.get('workbookId'),240)}:{}),
    ...(workbookRoute&&['evidence','relations','task'].includes(params.get('workbookPanel')||'')?{workbookPanel:params.get('workbookPanel') as WorkbookPanel}:{}),
    ...(workbookRoute&&text(params.get('workbookFocus'),260)?{workbookFocus:text(params.get('workbookFocus'),260)}:{}) };
  const returnTo = validatedReturnHash({ ...location, returnTo: params.get('returnTo') || undefined }, depth);
  return returnTo ? { ...location, returnTo } : location;
}

/** A bounded, same-workspace return chain preserves a reading task across refresh. */
function validatedReturnHash(location: WorkspaceLocation, depth = 0): string | undefined {
  const hash = location.returnTo;
  if (!hash || !['paper-detail', 'workbook'].includes(location.view) || !location.space || depth >= 3 || !hash.startsWith('#') || hash.length > 8000) return;
  try { if (!text(decodeURIComponent(hash), 8000)) return; } catch { return; }
  const segment = hash.slice(1).split(/[/?]/)[0];
  const view = segment === 'thread' ? 'thread-detail' : segment;
  if (!views.has(view as WorkspaceView) || view === 'paper-detail' || segment === 'paper' || view !== location.from) return;
  const origin = parseWorkspaceLocation(hash, depth + 1);
  if (origin.view !== view || origin.space !== location.space) return;
  if (new URLSearchParams(hash.split('?')[1] || '').has('returnTo') && !origin.returnTo) return;
  return hash;
}
export function workspaceHash(location: WorkspaceLocation): string {
  const segment = location.view === "paper-detail" ? "paper" : location.view === "thread-detail" ? "thread" : location.view;
  const path = segment + (location.id ? "/" + location.id : "") + (location.view === "thread-detail" ? "/" + (location.tab || "start") : "");
  const params = new URLSearchParams();
  for (const key of ["space", "from", "track", "graph", "step", "path", "panel"] as const) if (location[key]) params.set(key, location[key]);
  if (location.tab && location.view !== "thread-detail") params.set("tab", location.tab);
  if(location.view==='paper-detail'&&location.paperPanel)params.set('paperPanel',location.paperPanel);
  if(location.view==='paper-detail'&&location.from==='workbook'&&text(location.readingFocus||null,600))params.set('readingFocus',location.readingFocus!);
  if(location.view==='today'&&location.panel==='discovery'&&location.focus==='recovery')params.set('focus','recovery');
  if(location.graph&&(location.view==='threads'||location.view==='paper-detail'&&location.from==='threads')&&location.graphFrom==='library')params.set('graphFrom','library');
  if(location.view==='library'||location.view==='thread-detail'||location.view==='threads'&&Boolean(location.graph)){
    if(location.libraryQuery)params.set('q',location.libraryQuery);
    if(location.libraryScope==='all')params.set('scope','all');
    if(location.libraryPage&&location.libraryPage>1)params.set('page',String(location.libraryPage));
    if(location.libraryFocus)params.set('libraryFocus',location.libraryFocus);
  }
  if(location.view==='library'){
    if(location.libraryFilter&&location.libraryFilter!=='all')params.set('filter',location.libraryFilter);
    if(location.libraryStage==='evaluated')params.set('stage','evaluated');
    if(location.libraryInbox&&location.libraryInbox!=='all')params.set('inbox',location.libraryInbox);
    if(location.librarySort&&location.librarySort!=='priority')params.set('sort',location.librarySort);
    if(location.libraryTag&&location.libraryTag!=='all')params.set('tag',location.libraryTag);
  }
  if(location.view==='threads'&&location.graph){
    if(location.graphSurface==='routes')params.set('graphSurface','routes');
    if(location.graphMode)params.set('graphMode',location.graphMode);
    if(location.graphScope&&location.graphScope!=='all')params.set('graphScope',location.graphScope);
    if(location.graphTrack&&location.graphTrack!=='all')params.set('graphTrack',location.graphTrack);
    if(location.graphFocus)params.set('graphFocus',location.graphFocus);
  }
  if(location.view==='workbook'){
    if(text(location.workbookId||null,240))params.set('workbookId',location.workbookId!);
    if(location.workbookPanel&&location.workbookPanel!=='evidence')params.set('workbookPanel',location.workbookPanel);
    if(location.workbookFocus)params.set('workbookFocus',location.workbookFocus);
  }
  const returnTo = validatedReturnHash(location);
  if (returnTo) params.set('returnTo', returnTo);
  return "#" + path + (params.size ? "?" + params : "");
}
