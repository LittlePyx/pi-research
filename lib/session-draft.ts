export type SessionDraft = { base: string; value: string };
export const sessionDraftKey = (user: string, space: string, object: string) => `pi-draft-v1:${JSON.stringify([user, space, object])}`;
export function readSessionDraft(key: string): SessionDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    return value && typeof value.base === "string" && typeof value.value === "string" ? value : null;
  } catch { return null; }
}
export function writeSessionDraft(key: string, base: string, value: string): boolean {
  try { sessionStorage.setItem(key, JSON.stringify({ base, value })); return true; } catch { return false; }
}
export function clearSessionDraft(key: string, savedValue: string) {
  try { if (readSessionDraft(key)?.value === savedValue) sessionStorage.removeItem(key); } catch { /* Keep the current input usable when storage is unavailable. */ }
}
