import { MathText } from './math-text';

type Paper = { id: string; title: string; readingNote: string };
export function TodayEntry({ locale, resume, empty, hasLibrary, discovering, onRead, onGoal, onContext, onLibrary, onDiscovery }: {
  locale: 'zh' | 'en'; resume: Paper | null; empty: boolean; hasLibrary: boolean; discovering: boolean;
  onRead: (id: string) => void; onGoal: () => void; onContext: () => void; onLibrary: () => void; onDiscovery: () => void;
}) {
  const zh = locale === 'zh';
  if (resume) return <section className="pi-today-entry" aria-label={zh ? '继续阅读' : 'Continue reading'}>
    <div><p className="pi-entry-eyebrow">{zh ? '正在读' : 'IN PROGRESS'}</p><h2><MathText inline>{resume.title}</MathText></h2>
    {resume.readingNote && <p className="pi-resume-note">{resume.readingNote}</p>}</div>
    <button type="button" className="pi-entry-primary" onClick={() => onRead(resume.id)}>{zh ? '继续阅读与笔记' : 'Continue reading & notes'} →</button>
  </section>;
  if (!empty) return null;
  return <section className="pi-today-entry pi-first-reading" aria-label={zh ? '阅读起点' : 'Reading starting point'}>
    <div><p className="pi-entry-eyebrow">{zh ? '下一步' : 'NEXT STEP'}</p>
      <h2>{discovering ? (zh ? '正在寻找值得读的材料' : 'Finding worthwhile reading') : hasLibrary ? (zh ? '今天还没有新的推荐' : 'No new recommendations yet') : (zh ? '从一个具体问题开始' : 'Start with a specific question')}</h2>
      <p>{discovering ? (zh ? '筛选完成后，合适的论文会出现在这里。你可以先明确阅读目标。' : 'Suitable papers appear here after review. You can define your reading goal meanwhile.') : hasLibrary ? (zh ? '已有论文和笔记都在论文库。也可以查看当前发现进度。' : 'Your papers and notes are in the library. You can also check discovery progress.') : (zh ? '写下想弄清的问题，预览分阶段阅读计划。材料不足的阶段会标明待补。' : 'Define what you want to understand and preview a staged reading plan. Missing materials remain clearly marked.')}</p>
    </div>
    <div className="pi-entry-actions"><button type="button" className="pi-entry-primary" onClick={hasLibrary ? onLibrary : onGoal}>{hasLibrary ? (zh ? '回到论文库' : 'Open library') : (zh ? '设定阅读目标' : 'Set a reading goal')} →</button>
      <button type="button" onClick={hasLibrary || discovering ? onDiscovery : onContext}>{hasLibrary || discovering ? (zh ? '查看发现进度' : 'View discovery progress') : (zh ? '补充已有研究资料' : 'Add research context')}</button>
    </div>
  </section>;
}
