/** Normalize common model formatting slips outside code; the saved answer stays unchanged. */
export function prepareAnswerMarkdown(source: string) {
  return source.split(/(```[^]*?```|~~~[^]*?~~~|`+[^`\n]*`+)/g).map((part,index) => index % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_, math) => `$${math.trim()}$`)
    .replace(/\*\*([^*\n]+?)\*\*/g, (_, text) => `**${text.trim()}**`)
  ).join('');
}
