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
      if (v.quoteId !== '' || v.quote !== undefined) throw new Error('unlocated_workbook_evidence');
      return { paperId: source.paperId, status: 'missing', textZh: '', textEn: '', quote: '' };
    }
    const quote = source.quotes.find(q => q.id === v.quoteId);
    if (!quote || v.quote !== undefined) throw new Error('unlocated_workbook_evidence');
    return { paperId: source.paperId, status: v.status, textZh: v.textZh, textEn: v.textEn, quote: quote.text };
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

export function anchoredWorkbookPrompt(question: string, sources: WorkbookSource[]) {
  const base = JSON.parse(workbookDraftPrompt(question, sources));
  base.sources = workbookEvidenceCatalog(sources).map(({ paperId: _id, ...s }) => s);
  base.evidenceProtocol = 'anchors-v1';
  base.contract.dimensions[0].cells = [{ paperId: 'p1 (source key)', status: 'supported|missing', textZh: 'one concise observation entailed by the selected quote', textEn: 'same qualifications', quoteId: 'p1.q1 (exact catalog ID), or empty for missing' }];
  base.contract.comparison.evidenceIds = ['dimension-id:p1'];
  base.contract.task.steps[0].evidenceIds = ['dimension-id:p1'];
  base.rules.push('Cite only supplied quoteId values; NEVER copy or generate quote text. paperId uses source key p1/p2/p3. Each evidenceIds entry uses dimension.id + colon + source key and MUST point to a supported cell in your table. A quote must support the entire bilingual observation; include no fact outside that quote. Use missing only when the whole abstract lacks the dimension. Prefer exactly 3 dimensions and 2 task steps. Aim for under 350 characters per prose field. Do not restate the route background as a finding or introduce objects not present in these abstracts.');
  return JSON.stringify(base);
}

/** Expand a compact wire contract, then run the unchanged canonical evidence validators. */
export function resolveAnchoredWorkbook(raw: unknown, sources: WorkbookSource[]): WorkbookContent {
  const v = object(raw), r = resolver(sources), task = object(v.task), comparison = object(v.comparison);
  const dimensions = Array.isArray(v.dimensions) ? v.dimensions.map(item => {
    const d = object(item);
    return { ...d, cells: Array.isArray(d.cells) ? d.cells.map(c => r.cell(c)) : [] };
  }) : [];
  return validateWorkbook({ ...v, dimensions, comparison: { ...comparison, evidenceIds: r.refs(comparison.evidenceIds) },
    task: { ...task, steps: Array.isArray(task.steps) ? task.steps.map(item => { const s = object(item); return { ...s, evidenceIds: r.refs(s.evidenceIds) }; }) : [] } }, sources);
}

function target(content: WorkbookContent, id: string) {
  if (id === 'question') return { parent: content as unknown as Value, keys: ['questionZh', 'questionEn'] };
  if (id === 'comparison') return { parent: content.comparison as unknown as Value, keys: ['status', 'textZh', 'textEn', 'evidenceIds'] };
  const dimension = content.dimensions.find(d => id === `dimension:${d.id}`);
  if (dimension) return { parent: dimension as unknown as Value, keys: ['labelZh', 'labelEn', 'purposeZh', 'purposeEn'] };
  for (const d of content.dimensions) for (const c of d.cells) if (id === `cell:${d.id}:${c.paperId}`) return { parent: c as unknown as Value, keys: ['status', 'textZh', 'textEn', 'quoteId'], paperId: c.paperId };
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
    valueKeys: target(content, issue.id).keys, ...(target(content, issue.id).paperId ? { sourceKey: keys.get(target(content, issue.id).paperId!) } : {}) }));
  delete base.contract;
  return JSON.stringify({ ...base, task: 'Correct only the failed fields listed in correction.targets. Return patches, not a complete workbook.', previousWorkbook: context,
    correction: { issues, targets: patches, instruction: 'Each target must appear exactly once. Use ONLY its valueKeys. All other fields, dimension identities, paper identities and step order are immutable. Cell patches use quoteId from that paper’s catalog (empty for missing). evidenceIds use short source keys. Preserve supported content exactly. Correct both languages without adding claims. All fields will be independently reviewed again.' },
    output: { patches: [{ id: 'f1', value: 'object containing exactly this target’s valueKeys' }] } });
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
  return validateWorkbook(next, sources);
}
