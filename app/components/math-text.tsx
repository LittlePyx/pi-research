import { renderMathText } from "../../lib/math-text";

/** Only KaTeX-generated markup enters innerHTML; ordinary text remains React-escaped. */
export function MathText({ children }: { children: string }) {
  return <>{renderMathText(children).map((part, index) => part.html
    ? <span key={index} className={part.display ? "pi-math pi-math-display" : "pi-math"} dangerouslySetInnerHTML={{ __html: part.html }} />
    : part.source)}</>;
}
