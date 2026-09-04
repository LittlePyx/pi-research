import type { ReactNode } from "react";

// Functional marks share one grid and stroke; visible labels carry the meaning.
const shapes = {
  today: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16m-11 4h2m-2 3h6" /></>,
  route: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /><path d="M6 7v6a3 3 0 0 0 3 3h6a3 3 0 0 0 0-6h-3m6 7v-2" /></>,
  reading: <><path d="M12 6v15M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a5 5 0 0 0-4 2 5 5 0 0 0-4-2H3z" /></>,
  library: <><rect x="4" y="4" width="4" height="16" rx="1" /><path d="M11 4v16m4-15 4-1 4 15-4 1zM4 8h4" /></>,
  notes: <><path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M7 8h4m-4 5h2m-2 4h9m-3-6 1-4 5-5 3 3-5 5z" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  synthesis: <><rect x="3" y="4" width="7" height="5" rx="1" /><rect x="14" y="4" width="7" height="5" rx="1" /><path d="M6.5 9v3h11V9M12 12v3" /><rect x="8" y="15" width="8" height="5" rx="1" /></>,
  question: <><path d="M9 8a3 3 0 1 1 5 2.3c-1.4.8-2 1.2-2 2.7m0 3h.01M5 3h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H9l-5 2v-3a2 2 0 0 1-1-1.7V5a2 2 0 0 1 2-2Z" /></>,
  workspace: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>,
  demo: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m10 8 6 4-6 4z" /></>,
  upload: <><path d="M12 16V3m-4 4 4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  shield: <><path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
  document: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zm0 0v6h6M8 13h8m-8 4h5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  add: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6m-5 7a8 8 0 0 0 14 2l3-3m0 6v-6h-6" /></>,
  warning: <><path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01" /></>,
  loading: <path d="M21 12a9 9 0 1 1-9-9" />,
} satisfies Record<string, ReactNode>;

export type InterfaceIconName = keyof typeof shapes;

export function InterfaceIcon({ name, className = "" }: { name: InterfaceIconName; className?: string }) {
  return <svg
    className={`pi-icon${name === "loading" ? " pi-icon-loading" : ""}${className ? ` ${className}` : ""}`}
    data-icon={name}
    width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false"
  >{shapes[name]}</svg>;
}
