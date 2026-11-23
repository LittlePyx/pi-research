/** A suspended tab can ask for a hashed asset removed by a later deployment. */
export function reloadForMissingChunk(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (!/ChunkLoadError|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i.test(message)) return;
  try {
    const key = `pi:chunk-recovery:${window.location.pathname}:${message.slice(0, 220)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // Without a per-tab guard, keep recovery under the user's control.
    return;
  }
  window.location.reload();
}
