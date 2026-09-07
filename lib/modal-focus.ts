/** Scope keyboard focus to the open modal and restore a usable entry on close. */
export function activateModalFocus(dialog: HTMLElement, onClose: () => void, fallback: HTMLElement | null) {
  const doc = dialog.ownerDocument;
  const previous = doc.activeElement as HTMLElement | null;
  const overflow = doc.body.style.overflow;
  doc.body.style.overflow = "hidden";
  const siblings = Array.from(dialog.parentElement?.children || []).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== dialog);
  const inertBefore = siblings.map((node) => node.inert);
  siblings.forEach((node) => { node.inert = true; });
  const candidates = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'))
    .filter((node) => !node.classList.contains("v2-modal-backdrop") && !node.hidden && node.getClientRects().length > 0);
  const first = () => candidates()[0] || dialog;
  first().focus();
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const nodes = candidates();
    const index = nodes.indexOf(doc.activeElement as HTMLElement);
    if (index < 0 || (event.shiftKey ? index === 0 : index === nodes.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? nodes.at(-1) || dialog : first()).focus();
    }
  };
  doc.addEventListener("keydown", keydown, true);
  return () => {
    doc.removeEventListener("keydown", keydown, true);
    doc.body.style.overflow = overflow;
    siblings.forEach((node, index) => { node.inert = inertBefore[index]; });
    const mobileEntry = fallback && fallback.getClientRects().length > 0 ? fallback : null;
    // A translated mobile sidebar still has a client rect. Restore its menu instead.
    const target = previous?.closest(".v2-sidebar") && mobileEntry ? mobileEntry : previous;
    if (target?.isConnected && !target.closest("[inert]") && target.getClientRects().length) target.focus();
  };
}
