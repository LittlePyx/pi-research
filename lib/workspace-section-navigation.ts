/** Reveal nested disclosures and move focus without altering the app's hash route. */
export function focusWorkspaceSection(target: string) {
  const section = document.querySelector<HTMLElement>(target);
  if (!section) return false;
  let parent: HTMLElement | null = section;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
  section.tabIndex = -1;
  section.focus({ preventScroll: true });
  section.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return true;
}
