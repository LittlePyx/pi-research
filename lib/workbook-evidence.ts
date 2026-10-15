import { validateWorkbook, workbookDraftPrompt, type WorkbookContent, type WorkbookSource, type WorkbookReviewIssue } from './research-workbook.ts';

type Value = Record<string, unknown>;
const object = (v: unknown): Value => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('invalid_workbook_patch');
  return v as Value;
};
const exactKeys = (v: Value, keys: string[]) => {
  if (Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => !(k in v))) throw new Error('invalid_workbook_patch');
};

/** Offsets always address the original abstract, including whitespace and mathematical escapes. */
export function workbookEvidenceCatalog(sources: WorkbookSource[]) {
  return [...sources].sort((a, b) => a.id.localeCompare(b.id)).map((source, i) => {
    const key = `p${i + 1}`;
    const text = source.abstractText;
    const quotes: Array<{ id: string; start: number; end: number; text: string }> = [];
    const ends = [...text.matchAll(/[.!?]["”’')\]]*\s+(?=[A-Z\u3400-\u9fff\\$])/g)].map(m => m.index! + m[0].trimEnd().length);
    ends.push(text.length);
    let start = 0;
    const add = (end: number) => {
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      if (end - start >= 20) quotes.push({ id: `${key}.q${quotes.length + 1}`, start, end, text: text.slice(start, end) });
      start = end;
    };
    for (const end of ends) {
      if (end - start < 20) continue;
      while (end - start > 1200) {
        let cut = text.lastIndexOf(' ', start + 1200);
        if (cut < start + 20) cut = start + 1200;
        add(cut);
      }
      add(end);
    }
    // Offer contiguous context, not stitched quotations: a claim may require qualifiers in adjacent sentences.
    const singles = [...quotes]; let window = 0;
    for (let first = 0; first < singles.length; first++) for (let count = 2; count <= 3; count++) {
      const last = singles[first + count - 1];
      if (!last || last.end - singles[first].start > 1200) continue;
      const start = singles[first].start, end = last.end;
      quotes.push({ id: `${key}.w${++window}`, start, end, text: text.slice(start, end) });
    }
    if (singles.length) {
      const start = singles[0].start, end = singles.at(-1)!.end;
      if (end - start <= 1200 && !quotes.some(q => q.start === start && q.end === end)) quotes.push({ id: `${key}.w${++window}`, start, end, text: text.slice(start, end) });
    }
    return { key, paperId: source.id, title: source.title, abstractText: text, quotes };
  });
}

function resolver(sources: WorkbookSource[]) {
  const catalog = workbookEvidenceCatalog(sources);
  const sourceFor = (key: unknown) => {
    const found = catalog.find(s => s.key === key);
    if (!found) throw new Error('unknown_workbook_source');
    return found;
  };
  const cell = (raw: unknown, expectedPaper?: string) => {
    const v = object(raw);
    const source = expectedPaper ? catalog.find(s => s.paperId === expectedPaper)! : sourceFor(v.paperId);
    if (!source) throw new Error('unknown_workbook_source');
    if (v.status === 'missing') {
      if (!Array.isArray(v.quoteIds) || v.quoteIds.length || v.quote !== undefined || v.quoteId !== undefined) throw new Error('unlocated_workbook_evidence');
      return { paperId: source.paperId, status: 'missing', textZh: '', textEn: '', quote: '' };
    }
    if (!Array.isArray(v.quoteIds) || !v.quoteIds.length || v.quoteIds.length > 4 || new Set(v.quoteIds).size !== v.quoteIds.length || v.quote !== undefined || v.quoteId !== undefined) throw new Error('unlocated_workbook_evidence');
    const quotes = v.quoteIds.map(id => source.quotes.find(q => q.id === id)?.text);
    if (quotes.some(q=>!q)) throw new Error('unlocated_workbook_evidence');
    return { paperId: source.paperId, status: v.status, textZh: v.textZh, textEn: v.textEn, quote: quotes[0], quotes };
  };
  const refs = (v: unknown) => {
    if (!Array.isArray(v)) throw new Error('untraceable_workbook_instruction');
    return v.map(id => {
      if (typeof id !== 'string' || !/^[a-z][a-z0-9_-]{0,39}:p[1-3]$/.test(id)) throw new Error('untraceable_workbook_instruction');
      const [dimension, key] = id.split(':');
      return `${dimension}:${sourceFor(key).paperId}`;
    });
  };
  return { catalog, cell, refs };
}

/** The displayed workbook has dimension rows and paper columns; generated instructions must agree. */
export function validateWorkbookLayout(content: WorkbookContent) {
  const instructions = [content.task.titleZh,content.task.titleEn,content.task.criterionZh,content.task.criterionEn,
    ...content.task.steps.flatMap(s=>[s.textZh,s.textEn]),content.learning.exerciseZh,content.learning.exerciseEn].join('\n');
  if (/papers?\s+(?:as|are|in)\s+(?:the\s+)?rows?|(?:one|a)\s+row\s+(?:per|for each)\s+paper|one\s+column\s+per\s+dimension|论文各占一行|每篇(?:论文)?(?:占|为)?一行|每个维度(?:建|设|占|为)一列/iu.test(instructions)) throw new Error('inconsistent_workbook_layout');
  const prose = [instructions, content.learning.goalZh, content.learning.goalEn, content.learning.prerequisiteZh,
    content.learning.prerequisiteEn, content.learning.checkpointZh, content.learning.checkpointEn].join('\n');
  // Source keys belong to the wire contract; the reader sees passages, not their catalog IDs.
  if (/\b(?:quoteIds?|evidenceIds?|p[1-3]\.[qw]\d+)\b|\b(?:source[- ]passage|evidence|quote|excerpt)[- ](?:ids?|identifiers?)\b|(?:原文|引文|证据)(?:片段)?\s*(?:ID|标识符)/iu.test(prose)) throw new Error('internal_workbook_instruction');
  const counts: Record<string, [string, string]> = { two: ['2','二两'], three: ['3','三'], four: ['4','四'], five: ['5','五'], six: ['6','六'], seven: ['7','七'], eight: ['8','八'], nine: ['9','九'], ten: ['10','十'] };
  for (const dimension of content.dimensions) for (const cell of dimension.cells) {
    const evidence = (cell.quotes || [cell.quote]).join(' ');
    const uses = /\b(two|three|four|five|six|seven|eight|nine|ten|[2-9]|10) uses of the qubit erasure channel\b/iu.exec(evidence);
    if (!uses) continue;
    const entry = counts[uses[1].toLowerCase()] || Object.values(counts).find(v=>v[0]===uses[1])!;
    const word = Object.keys(counts).find(k=>counts[k]===entry)!;
    const qubits = new RegExp(`(?:${word}|${entry[0]})[- ]qubits?`, 'iu');
    const mistranslation = new RegExp(`(?:[${entry[1]}]|${entry[0]})\\s*(?:个)?(?:量子)?比特`, 'u');
    if (!qubits.test(evidence) && (qubits.test(cell.textEn) || mistranslation.test(cell.textZh))) throw new Error('workbook_channel_uses_translation');
  }
  return content;
}

export function anchoredWorkbookPrompt(question: string, sources: WorkbookSource[]) {
  const base = JSON.parse(workbookDraftPrompt(question, sources));
  base.sources = workbookEvidenceCatalog(sources).map(({ paperId: _id, ...s }) => s);
  base.evidenceProtocol = 'anchors-v2';
  base.contract.dimensions[0].cells = [{ paperId: 'p1 (source key)', status: 'supported|missing', textZh: 'one concise observation collectively entailed by the selected passages', textEn: 'same qualifications', quoteIds: ['p1.q1 (1-4 exact catalog IDs from this paper; [] for missing)'] }];
  base.contract.comparison.evidenceIds = ['dimension-id:p1'];
  base.contract.task.steps[0].evidenceIds = ['dimension-id:p1'];
  base.rules.push('Use quoteIds to select 1-4 supplied catalog IDs from the SAME paper; NEVER copy or generate quote text. Use [] for missing. paperId uses source key p1/p2/p3. Each evidenceIds entry uses dimension.id + colon + source key and MUST point to a supported cell. The selected passages must collectively support the ENTIRE bilingual observation. Use missing only when the whole abstract lacks the dimension. Prefer exactly 3 dimensions and 2 task steps. Aim for under 350 characters per prose field. The research question is motivation, not evidence.');
  base.rules.push('Every number, model name, auxiliary method and qualification in a supported cell must be entailed by its SELECTED passages. ADD another catalog ID when a clause needs another sentence, or narrow the observation. Unselected abstract sentences do not validate a citation. Use contiguous windows (.w) only when useful; do not stitch or paraphrase quotes. In reader-facing prose use P1/P2/P3 or distinctive short titles. Never mention quoteId, quoteIds, evidenceIds, supported cells or raw dimension IDs; ask readers to cite the displayed source passages.');
  base.tableLayout = { rows: 'comparison dimensions', columns: 'selected papers' };
  base.rules.push('All tasks and exercises use the EXISTING displayed comparison table: dimensions are ROWS and papers are COLUMNS. Never transpose it. Prefer saying "the displayed comparison table" rather than re-specifying row/column counts. Task steps, title, criterion and exercise must agree.');
  base.rules.push('Reader tasks, criteria and ALL learning fields must work with visible prose alone: quote a short displayed passage and name P1/P2. Never request source-passage IDs, passage identifiers, quote IDs or evidence IDs: catalog identifiers are not displayed. A citation is the paper label plus verbatim words, not a machine identifier.');
  base.rules.push('Preserve the unit of every count in BOTH languages. Channel uses are repetitions, not numbers of qubits: "four uses of the qubit erasure channel" means "量子比特擦除信道使用四次", never "四比特擦除信道" or "four-qubit erasure channel". Do not change model dimension, messages, repetitions or feedback qualifications during translation or correction.');
  base.rules.push('Each task step must reference supported cells covering EVERY table row it asks the reader to fill or check. A step covering the whole table must reference all supported cells, including conclusion and comparability rows when present. Prefer short steps that name the displayed table instead of listing extra unreferenced facts or rows.');
  return JSON.stringify(base);
}

/** Expand a compact wire contract, then run the unchanged canonical evidence validators. */
export function resolveAnchoredWorkbook(raw: unknown, sources: WorkbookSource[]): WorkbookContent {
  const v = object(raw), r = resolver(sources), task = object(v.task), comparison = object(v.comparison);
  const dimensions = Array.isArray(v.dimensions) ? v.dimensions.map(item => {
    const d = object(item);
    return { ...d, cells: Array.isArray(d.cells) ? d.cells.map(c => r.cell(c)) : [] };
  }) : [];
  return validateWorkbookLayout(validateWorkbook({ ...v, dimensions, comparison: { ...comparison, evidenceIds: r.refs(comparison.evidenceIds) },
    task: { ...task, steps: Array.isArray(task.steps) ? task.steps.map(item => { const s = object(item); return { ...s, evidenceIds: r.refs(s.evidenceIds) }; }) : [] } }, sources));
}

function target(content: WorkbookContent, id: string) {
  if (id === 'question') return { parent: content as unknown as Value, keys: ['questionZh', 'questionEn'] };
  if (id === 'comparison') return { parent: content.comparison as unknown as Value, keys: ['status', 'textZh', 'textEn', 'evidenceIds'] };
  const dimension = content.dimensions.find(d => id === `dimension:${d.id}`);
  if (dimension) return { parent: dimension as unknown as Value, keys: ['labelZh', 'labelEn', 'purposeZh', 'purposeEn'] };
  for (const d of content.dimensions) for (const c of d.cells) if (id === `cell:${d.id}:${c.paperId}`) return { parent: c as unknown as Value, keys: ['status', 'textZh', 'textEn', 'quoteIds'], paperId: c.paperId };
  const step = /^task:step:(\d+)$/.exec(id);
  if (step && content.task.steps[Number(step[1])]) return { parent: content.task.steps[Number(step[1])] as unknown as Value, keys: ['textZh', 'textEn', 'evidenceIds'] };
  const field = /^(task|learning):(title|criterion|goal|prerequisite|exercise|checkpoint)$/.exec(id);
  if (field && `${field[2]}Zh` in content[field[1] as 'task' | 'learning']) return { parent: content[field[1] as 'task' | 'learning'] as unknown as Value, keys: [`${field[2]}Zh`, `${field[2]}En`] };
  throw new Error('invalid_workbook_patch');
}

export function workbookPatchPrompt(question: string, sources: WorkbookSource[], content: WorkbookContent, issues: WorkbookReviewIssue[]) {
  const base = JSON.parse(anchoredWorkbookPrompt(question, sources));
  // Read-only context uses the same aliases as patch values, including originally missing cells.
  const context = structuredClone(content), catalog = workbookEvidenceCatalog(sources);
  const keys = new Map(catalog.map(s => [s.paperId, s.key]));
  const refs = (ids: string[]) => ids.map(id => {
    for (const d of content.dimensions) for (const c of d.cells) if (id === `${d.id}:${c.paperId}`) return `${d.id}:${keys.get(c.paperId)}`;
    throw new Error('untraceable_workbook_instruction');
  });
  for (const d of context.dimensions) for (const c of d.cells) c.paperId = keys.get(c.paperId)!;
  context.comparison.evidenceIds = refs(context.comparison.evidenceIds);
  for (const step of context.task.steps) step.evidenceIds = refs(step.evidenceIds);
  const patches = issues.map((issue, i) => ({ id: `f${i + 1}`, field: issue.id, reason: issue.reason,
    valueKeys: target(content, issue.id).keys, ...(target(content, issue.id).paperId ? { sourceKey: keys.get(target(content, issue.id).paperId!),
      currentQuoteIds: ((target(content,issue.id).parent.quotes || [target(content,issue.id).parent.quote]) as string[]).flatMap(text=>{
        const quote=catalog.find(s=>s.paperId===target(content,issue.id).paperId)!.quotes.find(q=>q.text===text);return quote?[quote.id]:[];
      }) } : {}) }));
  const output = { patches: issues.map((issue, i) => {
    const t = target(content, issue.id);
    const value = Object.fromEntries(t.keys.map(key => [key, key === 'evidenceIds' ? refs(t.parent[key] as string[])
      : key === 'quoteIds' ? patches[i].currentQuoteIds?.length ? patches[i].currentQuoteIds : [catalog.find(s => s.paperId === t.paperId)!.quotes[0]?.id].filter(Boolean)
        : key === 'status' ? t.parent.status : key.endsWith('Zh') ? '修订后的简洁中文，只依据材料' : 'Equivalent corrected English, using only the supplied material']));
    return { id: `f${i + 1}`, value };
  }) };
  delete base.contract;
  return JSON.stringify({ ...base, task: 'Correct only the failed fields listed in correction.targets. Return patches, not a complete workbook.', previousWorkbook: context,
    correction: { issues, targets: patches, instruction: 'Each target must appear exactly once. Use ONLY its valueKeys. All other fields, dimension identities, paper identities and step order are immutable. For a failed cell, retain useful source passages and ADD IDs covering the omitted clauses, or narrow the bilingual observation; use quoteIds with 1-4 IDs from that paper, [] for missing. Do not replace one incomplete quotation with another incomplete one. evidenceIds use short source keys. Preserve approved fields exactly. All fields will be reviewed again.' },
    output, outputRule: 'Return ONLY this patches envelope, with value as an OBJECT containing the exact illustrated keys. Values illustrate shape, not approved claims or mandatory evidence choices. Choose actual status, quoteIds and evidenceIds; missing cells require []. Do not add explanations, reasons or a full workbook.' });
}

/** Apply only failed review fields to a clone. A model cannot overwrite any approved field. */
export function applyWorkbookPatches(raw: unknown, content: WorkbookContent, sources: WorkbookSource[], issues: WorkbookReviewIssue[]): WorkbookContent {
  const v = object(raw); exactKeys(v, ['patches']);
  if (!issues.length || new Set(issues.map(i => i.id)).size !== issues.length || !issues.every(i => i.issueType === 'repairable') || !Array.isArray(v.patches) || v.patches.length !== issues.length) throw new Error('invalid_workbook_patch');
  const next = structuredClone(content), seen = new Set<string>(), r = resolver(sources);
  for (const item of v.patches) {
    const patch = object(item); exactKeys(patch, ['id', 'value']);
    const index = issues.findIndex((_, i) => patch.id === `f${i + 1}`);
    if (index < 0 || seen.has(String(patch.id))) throw new Error('invalid_workbook_patch');
    seen.add(String(patch.id));
    const t = target(next, issues[index].id), value = object(patch.value); exactKeys(value, t.keys);
    if (t.paperId) Object.assign(t.parent, r.cell(value, t.paperId));
    else for (const key of t.keys) t.parent[key] = key === 'evidenceIds' ? r.refs(value[key]) : value[key];
  }
  return validateWorkbookLayout(validateWorkbook(next, sources));
}
