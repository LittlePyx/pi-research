import { renderToString } from "katex";

export type MathTextPart = { source: string; html?: string; display?: boolean };
const escaped = (text: string, at: number) => {
  let slashes = 0;
  while (at > 0 && text[--at] === "\\") slashes++;
  return slashes % 2 === 1;
};

/** Presentation only: preserve source, isolate macros, and never enable trusted HTML/URLs. */
export function renderMathText(text: string): MathTextPart[] {
  if (text.length > 100_000) return [{ source: text }];
  const parts: MathTextPart[] = [];
  const openings = /\$\$|\$|\\\(|\\\[|`+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = openings.exec(text)) && count < 64) {
    const start = match.index;
    const open = match[0];
    if (escaped(text, start)) continue;
    if (open.startsWith("`")) {
      const end = text.indexOf(open, start + open.length);
      openings.lastIndex = end < 0 ? text.length : end + open.length;
      continue;
    }
    const close = open === "\\(" ? "\\)" : open === "\\[" ? "\\]" : open;
    let end = text.indexOf(close, start + open.length);
    while (end >= 0 && escaped(text, end)) end = text.indexOf(close, end + close.length);
    if (end < 0) continue;
    const value = text.slice(start + open.length, end);
    // Avoid interpreting ordinary currency prose as inline math.
    if (!value.trim() || (open === "$" && (/^\s|\s$/.test(value) || value.includes("\n")))) continue;
    const source = text.slice(start, end + close.length);
    parts.push({ source: text.slice(cursor, start) });
    const display = open === "$$" || open === "\\[";
    try {
      if (value.length > 4096) throw new Error("formula_too_large");
      parts.push({ source, display, html: renderToString(value, {
        displayMode: display, throwOnError: true, trust: false, strict: "error",
        output: "htmlAndMathml", maxExpand: 200, maxSize: 10, macros: {},
      }) });
    } catch { parts.push({ source }); }
    cursor = end + close.length;
    openings.lastIndex = cursor;
    count++;
  }
  parts.push({ source: text.slice(cursor) });
  return parts;
}
