/** Browser-only transport boundary. Demo requests never fall through to the network. */
export async function workspaceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === "/demo") {
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { demoResponse } = await import("./demo-workspace.mjs");
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return demoResponse(input, init);
  }
  return globalThis.fetch(input, init);
}
