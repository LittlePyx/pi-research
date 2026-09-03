import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DEMO_LEARNING_STEPS, DEMO_PAPERS, DEMO_TODAY_IDS, type DemoPaperRole } from "../../lib/demo-research";
import styles from "./demo.module.css";

export const metadata: Metadata = {
  title: "Pi Research 演示空间",
  description: "打开一个已经积累基础论文、研究路线与学习路径的只读 Pi Research 工作区。",
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
      <Link className={styles.brand} href="/" aria-label="Pi Research 首页">
        <Image src="/pi-research-mark.png" width={34} height={29} alt="" priority />
        <span><strong>Pi Research</strong><small>RESEARCH AGENT</small></span>
      </Link>
      <nav aria-label="演示页导航">
        <a href="#today">今日</a><a href="#routes">研究路线</a><a href="#learn">学习路径</a><a href="#library">论文库</a>
      </nav>
      <Link className={styles.workspaceLink} href="/">开始自己的研究 <span>→</span></Link>
    </header>

    <main>
      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}><i /> 只读演示空间</p>
          <h1>不是从零开始，<br />先看一条研究路线如何长出来。</h1>
          <p>这个演示空间已经整理了高维凸几何、KLS 猜想与信息论的基础论文。你可以直接查看 Pi 如何把论文变成今日判断、路线和学习次序。</p>
        </div>
        <dl>
          <div><dt>已找到</dt><dd>{DEMO_PAPERS.length}<small>篇基础论文</small></dd></div>
          <div><dt>研究路线</dt><dd>2<small>条持续方向</small></dd></div>
          <div><dt>今日入选</dt><dd>{todayPapers.length}<small>篇优先阅读</small></dd></div>
        </dl>
      </section>

      <section className={styles.today} id="today">
        <header className={styles.sectionHeader}>
          <div><p className={styles.eyebrow}>今日研究判断</p><h2>先补齐 KLS 路线的三个关键节点</h2></div>
          <span>演示快照 · 已通过质量筛选</span>
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
          <div><p className={styles.eyebrow}>研究路线</p><h2>从问题定义到当前证据边界</h2></div>
          <span>{geometryPapers.length} 篇路线论文 · 1 个待验证缺口</span>
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
            <div><p className={styles.eyebrow}>学习路径</p><h2>按研究依赖，而不是按年份堆论文</h2></div>
          </header>
          <ol>
            {DEMO_LEARNING_STEPS.map((step, index) => <li className={index === 0 ? styles.activeStep : ""} key={step.number}>
              <span>{step.number}</span><div><strong>{step.title}</strong><p>{step.detail}</p><small>{step.paperIds.length} 篇核心阅读</small></div>
            </li>)}
          </ol>
        </section>

        <section className={styles.library} id="library">
          <header className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>论文库</p><h2>基础论文不会因重扫消失</h2></div>
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
          <p className={styles.libraryNote}>演示只展示代表作。真实工作区会保留发现、推荐、稍后处理、接受、忽略和阅读记录。</p>
        </section>
      </div>
    </main>

    <footer className={styles.footer}>
      <div><Image src="/pi-research-mark.png" width={28} height={24} alt="" /><span><strong>这是只读演示</strong><small>不会修改你的研究空间，也不会消耗模型额度。</small></span></div>
      <Link href="/">创建独立研究空间 <span>→</span></Link>
    </footer>
  </div>;
}
