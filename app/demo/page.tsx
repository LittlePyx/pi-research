/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from "next";
import Image from "next/image";
import { DEMO_LEARNING_STEPS, DEMO_PAPERS, DEMO_TODAY_IDS, type DemoPaperRole } from "../../lib/demo-research";
import styles from "./demo.module.css";

export const metadata: Metadata = {
  title: "Pi Research 演示空间",
  description: "KLS 猜想、随机局部化与信息论基础文献演示。",
};

const roleLabel: Record<DemoPaperRole, string> = {
  foundation: "基础",
  milestone: "里程碑",
  frontier: "前沿",
};

const todayPapers = DEMO_TODAY_IDS.map((id) => DEMO_PAPERS.find((paper) => paper.id === id)!).filter(Boolean);
const geometryPapers = DEMO_PAPERS.filter((paper) => paper.route === "geometry");
const informationPapers = DEMO_PAPERS.filter((paper) => paper.route === "information");

function PaperTitle({ paper, compact = false }: { paper: (typeof DEMO_PAPERS)[number]; compact?: boolean }) {
  const content = <>
    <span className={styles.paperMeta}>{paper.year} · {paper.venue}</span>
    <strong>{paper.title}</strong>
    {!compact && <small>{paper.authors}</small>}
  </>;
  return paper.href
    ? <a className={styles.paperTitle} href={paper.href} target="_blank" rel="noreferrer">{content}<b aria-hidden="true">↗</b></a>
    : <div className={styles.paperTitle}>{content}</div>;
}

export default function DemoPage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <a className={styles.brand} href="/" aria-label="Pi Research 首页">
        <Image src="/pi-research-mark.png" width={34} height={29} alt="" priority />
        <span><strong>Pi Research</strong><small>RESEARCH AGENT</small></span>
      </a>
      <nav aria-label="演示页导航">
        <a href="#today">今日</a><a href="#routes">研究路线</a><a href="#learn">学习路径</a><a href="#library">论文库</a>
      </nav>
      <a className={styles.workspaceLink} href="/">进入工作区 <span>→</span></a>
    </header>

    <main>
      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}><i /> 应用数学 · 高维凸几何</p>
          <h1>KLS 猜想与<br />随机局部化</h1>
          <p>14 篇基础与里程碑论文，覆盖等周不等式、谱隙、随机局部化及其与采样问题的联系。</p>
        </div>
        <dl>
          <div><dt>收录论文</dt><dd>{DEMO_PAPERS.length}<small>篇</small></dd></div>
          <div><dt>研究方向</dt><dd>2<small>条</small></dd></div>
          <div><dt>当前待读</dt><dd>{todayPapers.length}<small>篇</small></dd></div>
        </dl>
      </section>

      <section className={styles.today} id="today">
        <header className={styles.sectionHeader}>
          <div><p className={styles.eyebrow}>演示阅读队列</p><h2>KLS 路线的三个关键节点</h2></div>
          <span>示例数据 · 只读</span>
        </header>
        <div className={styles.todayGrid}>
          {todayPapers.map((paper, index) => <article className={index === 0 ? styles.primaryPick : styles.pick} key={paper.id}>
            <header><span>0{index + 1}</span><em>{roleLabel[paper.role]}</em></header>
            <PaperTitle paper={paper} />
            <p>{paper.note}</p>
            <footer><span>{index === 0 ? "优先精读 · 28 min" : index === 1 ? "方法阅读 · 22 min" : "基础回看 · 18 min"}</span><b>{index === 0 ? "必读" : "浏览"}</b></footer>
          </article>)}
        </div>
      </section>

      <section className={styles.routes} id="routes">
        <header className={styles.sectionHeader}>
          <div><p className={styles.eyebrow}>研究路线</p><h2>关键文献脉络</h2></div>
          <span>{geometryPapers.length} 篇 · 1 个证据缺口</span>
        </header>
        <div className={styles.routeRail}>
          {geometryPapers.map((paper, index) => <article key={paper.id}>
            <div className={styles.routeMarker}><span>{paper.year}</span><i /></div>
            <em>{roleLabel[paper.role]}</em>
            <PaperTitle paper={paper} compact />
            {index === geometryPapers.length - 1 && <p>下一步：核对 polylog 进展能否改变当前路线假设。</p>}
          </article>)}
        </div>
      </section>

      <div className={styles.lowerGrid}>
        <section className={styles.learning} id="learn">
          <header className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>学习路径</p><h2>阅读顺序</h2></div>
          </header>
          <ol>
            {DEMO_LEARNING_STEPS.map((step, index) => <li className={index === 0 ? styles.activeStep : ""} key={step.number}>
              <span>{step.number}</span><div><strong>{step.title}</strong>{index === 0 && <p>{step.detail}</p>}<small>{step.paperIds.length} 篇核心阅读</small></div>
            </li>)}
          </ol>
        </section>

        <section className={styles.library} id="library">
          <header className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>论文库</p><h2>基础文献</h2></div>
            <span>{DEMO_PAPERS.length} 篇</span>
          </header>
          <div className={styles.libraryGroup}>
            <h3>KLS 与随机局部化 <span>{geometryPapers.length}</span></h3>
            {geometryPapers.slice(0, 4).map((paper) => <PaperTitle paper={paper} compact key={paper.id} />)}
          </div>
          <div className={styles.libraryGroup}>
            <h3>信息论基础 <span>{informationPapers.length}</span></h3>
            {informationPapers.slice(0, 4).map((paper) => <PaperTitle paper={paper} compact key={paper.id} />)}
          </div>
          <p className={styles.libraryNote}>另有 {informationPapers.length - 4} 篇信息论论文。</p>
        </section>
      </div>
    </main>

    <footer className={styles.footer}>
      <div><Image src="/pi-research-mark.png" width={28} height={24} alt="" /><span><strong>Pi Research</strong><small>公开演示 · 只读</small></span></div>
      <a href="/">开始使用 <span>→</span></a>
    </footer>
  </div>;
}
