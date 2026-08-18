"use client";

import { useEffect, useMemo, useState } from "react";

type View = "today" | "threads" | "thread-detail" | "learn" | "learning-path" | "library" | "paper-detail" | "settings";
type Paper = {
  id: string;
  title: string;
  authors: string;
  venue: string;
  date: string;
  thread: string;
  level: "Must Read" | "Worth Reading";
  readTime: string;
  why: string;
  novelty: string;
  noveltyType: string;
  core: string[];
};
type Feedback = Record<string, { saved?: boolean; relevant?: boolean; dismissed?: boolean }>;

const papers: Paper[] = [
  {
    id: "gaussian-distortion",
    title: "Gaussian Extremality Beyond Quadratic Distortion",
    authors: "M. Courtade, J. Liu & T. Weissman",
    venue: "arXiv:2608.04192",
    date: "Today",
    thread: "Gaussian Extremality",
    level: "Must Read",
    readTime: "12 min",
    why: "This relaxes a key convexity assumption used in two papers already saved in your thread.",
    novelty: "A new extremality theorem covers a broader class of non-quadratic distortion measures.",
    noveltyType: "NEW THEOREM",
    core: [
      "Proves Gaussian optimality for a family of separable, non-quadratic distortion measures.",
      "Replaces the standard convexity condition with a weaker displacement condition.",
      "Gives a converse template that may transfer to your non-Euclidean setting.",
    ],
  },
  {
    id: "transport-converse",
    title: "Transport Proofs for Strong Data Processing Inequalities",
    authors: "A. Gozlan & Y. Polyanskiy",
    venue: "IEEE Transactions on Information Theory",
    date: "Yesterday",
    thread: "OT × Information Theory",
    level: "Must Read",
    readTime: "18 min",
    why: "It supplies the missing transport argument behind a conjecture noted in one of your seed papers.",
    novelty: "The authors derive a sharp SDPI constant using a coupling construction rather than functional inequalities.",
    noveltyType: "NEW PROOF",
    core: [
      "Introduces a coupling-based proof of a sharp SDPI for log-concave channels.",
      "Identifies the exact transport cost controlling contraction.",
      "Connects the bound to Gaussian stability through an equality case.",
    ],
  },
  {
    id: "rd-existence",
    title: "Existence and Stability in Abstract Rate–Distortion Problems",
    authors: "E. C. Posner & L. Tam",
    venue: "Information and Inference",
    date: "Aug 17",
    thread: "Rate-Distortion Existence",
    level: "Worth Reading",
    readTime: "9 min",
    why: "The compactness argument is directly reusable in the existence section of your current draft.",
    novelty: "A stability result for optimal test channels under weak convergence of sources.",
    noveltyType: "NEW BOUND",
    core: [
      "Establishes existence under a tightness condition weaker than compact alphabets.",
      "Quantifies continuity of the optimal value under source perturbations.",
      "Includes a worked Polish-space example.",
    ],
  },
  {
    id: "schrodinger-survey",
    title: "A Short Course on Schrödinger Bridges and Entropic Transport",
    authors: "G. Conforti & C. Léonard",
    venue: "Foundations and Trends in ML",
    date: "Aug 16",
    thread: "Schrödinger Bridge",
    level: "Worth Reading",
    readTime: "24 min",
    why: "This is the clearest bridge from your optimal transport background to modern Schrödinger problems.",
    novelty: "A unified tutorial treatment with a new map between probabilistic and optimization notation.",
    noveltyType: "SURVEY",
    core: [
      "Builds the subject from static entropic OT to the dynamic bridge problem.",
      "Aligns notation used across probability, control, and machine learning.",
      "Ends with a concise frontier map and open questions.",
    ],
  },
  {
    id: "logconcave-stability",
    title: "Stability of Gaussian Inequalities Under Log-Concave Perturbations",
    authors: "N. Eldan, R. Eldan & J. Lehec",
    venue: "Annals of Probability",
    date: "Aug 15",
    thread: "Gaussian Extremality",
    level: "Worth Reading",
    readTime: "14 min",
    why: "The stability estimate could quantify the approximate Gaussian regime in your main thread.",
    novelty: "A dimension-aware remainder term derived through stochastic localization.",
    noveltyType: "NEW METHOD",
    core: [
      "Provides a quantitative stability form of a classical Gaussian inequality.",
      "Uses stochastic localization to isolate the equality regime.",
      "Tracks dimensional dependence explicitly.",
    ],
  },
];

const researchThreads = [
  { id: "gaussian", title: "Gaussian Extremality", subtitle: "for Rate-Distortion Problems", status: "Active", update: "3 important updates this week", priority: "High priority" },
  { id: "existence", title: "Rate-Distortion Existence", subtitle: "on general source spaces", status: "Active", update: "No major updates", priority: "Medium priority" },
  { id: "ot-info", title: "OT × Information Theory", subtitle: "transport methods for converses", status: "Active", update: "2 papers worth reading", priority: "High priority" },
  { id: "bridge", title: "Schrödinger Bridge", subtitle: "theory and current frontier", status: "Learning", update: "Learning path · 35%", priority: "Medium priority" },
  { id: "compression", title: "Generative Compression", subtitle: "theory-led developments", status: "Watching", update: "Weekly monitoring", priority: "Low priority" },
  { id: "coding", title: "Channel Coding", subtitle: "finite-blocklength converses", status: "Paused", update: "Monitoring paused", priority: "Low priority" },
];

const pathNodes = [
  { stage: "0", title: "Prerequisites", paper: "Probability on Polish Spaces — selected notes", why: "Fill the only material gap before the modern formulation.", read: "Tightness, weak convergence, Ch. 2" },
  { stage: "1", title: "First Read", paper: "Schrödinger’s Problem and Entropic Transport", why: "A short conceptual entry point that matches your optimal transport background.", read: "Sections 1–3" },
  { stage: "2", title: "Foundations", paper: "The Schrödinger Problem Revisited", why: "Establishes the probabilistic formulation used by most later work.", read: "Sections 2, 4 and Theorem 3.1" },
  { stage: "3", title: "Modern Formulation", paper: "Entropic Interpolations and Displacement Convexity", why: "Connects bridge dynamics to the geometry you already know.", read: "Introduction, Sections 3–4" },
  { stage: "4", title: "Computational Methods", paper: "Iterative Proportional Fitting on Path Space", why: "One computational reference is enough to understand current algorithmic papers.", read: "Algorithm 1 and Section 5" },
  { stage: "5", title: "Current Frontier", paper: "Mean-Field Schrödinger Problems: A Survey", why: "Maps the open questions and active research clusters as of 2026.", read: "Sections 1, 6–7" },
];

function Logo() {
  return <div className="brand"><span className="brand-mark">π</span><span>Pi Research</span></div>;
}

function LevelBadge({ level }: { level: Paper["level"] }) {
  return <span className={"level-badge " + (level === "Must Read" ? "must" : "worth")}><i />{level}</span>;
}

function PaperActions({ paper, feedback, onFeedback }: { paper: Paper; feedback: Feedback; onFeedback: (paper: Paper, kind: "save" | "relevant" | "dismiss") => void }) {
  const state = feedback[paper.id] || {};
  return (
    <div className="paper-actions">
      <button className={state.saved ? "selected" : ""} type="button" onClick={() => onFeedback(paper, "save")}><span>{state.saved ? "★" : "☆"}</span> {state.saved ? "Saved" : "Save"}</button>
      <button className={state.relevant ? "selected" : ""} type="button" onClick={() => onFeedback(paper, "relevant")}><span>✓</span> Relevant</button>
      <button className={state.dismissed ? "selected negative" : ""} type="button" onClick={() => onFeedback(paper, "dismiss")}><span>×</span> Not relevant</button>
    </div>
  );
}

function PaperFeature({ paper, feedback, onFeedback, onOpen }: { paper: Paper; feedback: Feedback; onFeedback: (paper: Paper, kind: "save" | "relevant" | "dismiss") => void; onOpen: (paper: Paper) => void }) {
  return (
    <article className="paper-feature">
      <div className="paper-main">
        <div className="paper-kicker"><LevelBadge level={paper.level} /><span>{paper.readTime} read</span></div>
        <button className="paper-title-button" type="button" onClick={() => onOpen(paper)}><h3>{paper.title}</h3></button>
        <p className="meta">{paper.authors} <span>·</span> {paper.venue} <span>·</span> {paper.date}</p>
        <p className="relevant-to">Relevant to <strong>{paper.thread}</strong></p>
        <div className="analysis-grid">
          <div><h4>Why you should care</h4><p>{paper.why}</p></div>
          <div><h4>What&apos;s actually new</h4><p>{paper.novelty}</p></div>
        </div>
        <div className="action-row">
          <PaperActions paper={paper} feedback={feedback} onFeedback={onFeedback} />
          <button className="text-link" type="button" onClick={() => onOpen(paper)}>View analysis <span>→</span></button>
        </div>
      </div>
      <aside className="thread-context">
        <p className="eyebrow">THREAD CONTEXT</p>
        <div className="context-step faded">Your saved paper<br/><strong>Gaussian converse, 2025</strong></div>
        <div className="connector">↓</div>
        <div className="context-step current">This paper<br/><strong>removes a core constraint</strong></div>
        <div className="connector">↓</div>
        <div className="context-step faded">Your open question<br/><strong>non-Euclidean distortion</strong></div>
      </aside>
    </article>
  );
}

function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("Gaussian extremality in rate-distortion theory");
  const [familiarity, setFamiliarity] = useState("Working actively on it");
  if (!open) return null;
  return (
    <div className="onboarding">
      <div className="onboarding-bar"><Logo /><button type="button" onClick={onClose}>View demo workspace →</button></div>
      <div className="onboarding-body">
        <div className="progress-dots" aria-label={"Step " + step + " of 5"}>
          {[1,2,3,4,5].map((item) => <span key={item} className={item <= step ? "filled" : ""} />)}
        </div>
        {step === 1 && (
          <section className="onboarding-card">
            <p className="eyebrow blue">YOUR FIRST RESEARCH THREAD</p>
            <h1>What are you working on?</h1>
            <p>Describe a specific research question. Pi will learn the context—not just subscribe to keywords.</p>
            <label className="large-input"><span>Research question</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} autoFocus /></label>
            <div className="example-note"><span>Good research threads are specific.</span> Try “optimal transport methods for Gaussian extremality problems” instead of “optimal transport.”</div>
            <button className="primary-button wide" type="button" disabled={!topic.trim()} onClick={() => setStep(2)}>Create Research Thread <span>→</span></button>
          </section>
        )}
        {step === 2 && (
          <section className="onboarding-card understanding">
            <p className="eyebrow blue">PI&apos;S UNDERSTANDING</p>
            <h1>I understand this research thread as:</h1>
            <div className="understood-topic"><span>RESEARCH THREAD</span><h2>Gaussian Extremality<br/><em>for Rate-Distortion Problems</em></h2></div>
            <div className="topic-list"><span>Information Theory</span><span>Rate-Distortion Theory</span><span>Gaussian Inequalities</span><span>Optimal Transport</span></div>
            <p className="accuracy">Is this accurate?</p>
            <div className="button-pair"><button className="secondary-button" type="button" onClick={() => setStep(1)}>Edit</button><button className="primary-button" type="button" onClick={() => setStep(3)}>Looks good <span>→</span></button></div>
          </section>
        )}
        {step === 3 && (
          <section className="onboarding-card">
            <p className="eyebrow blue">CALIBRATE THE AGENT</p>
            <h1>Add a few representative papers.</h1>
            <p>Seed papers help Pi understand the methods, assumptions, and research lineage you care about. Three to five works best.</p>
            <label className="large-input"><span>arXiv URL, DOI, or paper title</span><input placeholder="Paste a paper and press Enter" /></label>
            <div className="seed-paper"><span className="paper-icon">□</span><span><strong>Gaussian Optimality in Rate-Distortion Theory</strong><small>Courtade & Jiao · 2024</small></span><button type="button" aria-label="Remove paper">×</button></div>
            <div className="button-pair"><button className="secondary-button" type="button" onClick={() => setStep(4)}>Skip for now</button><button className="primary-button" type="button" onClick={() => setStep(4)}>Continue <span>→</span></button></div>
          </section>
        )}
        {step === 4 && (
          <section className="onboarding-card">
            <p className="eyebrow blue">KNOWLEDGE STATE</p>
            <h1>How familiar are you with this topic?</h1>
            <p>This helps Pi decide whether to surface foundations or focus only on frontier work.</p>
            <div className="option-list">
              {["New to this area", "Familiar", "Working actively on it", "Expert"].map((option) => (
                <button className={familiarity === option ? "chosen" : ""} type="button" key={option} onClick={() => setFamiliarity(option)}><span className="radio" /><span><strong>{option}</strong><small>{option === "Working actively on it" ? "Prioritize direct developments and technical novelty." : option === "New to this area" ? "Include foundations, tutorials, and prerequisites." : option === "Expert" ? "Show only significant frontier developments." : "Balance foundations with recent work."}</small></span></button>
              ))}
            </div>
            <button className="primary-button wide" type="button" onClick={() => setStep(5)}>Build my Research Agent <span>→</span></button>
          </section>
        )}
        {step === 5 && (
          <section className="onboarding-card ready">
            <div className="ready-mark">π</div>
            <p className="eyebrow blue">RESEARCH PROFILE CREATED</p>
            <h1>Your Research Agent is ready.</h1>
            <p>Pi has built an initial model of what you know, what you care about, and what is worth interrupting you for.</p>
            <div className="finding-grid"><div><strong>2</strong><span>papers you may have missed</span></div><div><strong>5</strong><span>papers worth checking</span></div></div>
            <button className="primary-button wide" type="button" onClick={onClose}>Open today&apos;s brief <span>→</span></button>
            <small className="quiet-promise">Pi will stay quiet when there is nothing significant to report.</small>
          </section>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [selectedPaper, setSelectedPaper] = useState<Paper>(papers[0]);
  const [selectedThread, setSelectedThread] = useState(researchThreads[0]);
  const [feedback, setFeedback] = useState<Feedback>({});
  const [onboarding, setOnboarding] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [learnTopic, setLearnTopic] = useState("Schrödinger Bridge");
  const [learnPrep, setLearnPrep] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState("Saved");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const savedCount = useMemo(() => Object.values(feedback).filter((item) => item.saved).length + 4, [feedback]);

  const navigate = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openPaper = (paper: Paper) => {
    setSelectedPaper(paper);
    navigate("paper-detail");
  };

  const openThread = (thread: typeof researchThreads[number]) => {
    setSelectedThread(thread);
    navigate("thread-detail");
  };

  const handleFeedback = (paper: Paper, kind: "save" | "relevant" | "dismiss") => {
    setFeedback((current) => {
      const previous = current[paper.id] || {};
      if (kind === "save") return { ...current, [paper.id]: { ...previous, saved: !previous.saved } };
      if (kind === "relevant") return { ...current, [paper.id]: { ...previous, relevant: !previous.relevant, dismissed: false } };
      return { ...current, [paper.id]: { ...previous, dismissed: !previous.dismissed, relevant: false } };
    });
    setToast(kind === "save" ? "Saved to your research memory" : kind === "relevant" ? "Pi will use this signal to improve recommendations" : "Removed from your brief · Pi learned from your feedback");
  };

  const navItems: { label: string; view: View; glyph: string }[] = [
    { label: "Today", view: "today", glyph: "◉" },
    { label: "Threads", view: "threads", glyph: "⌁" },
    { label: "Learn", view: "learn", glyph: "↗" },
    { label: "Library", view: "library", glyph: "▤" },
  ];
  const activeBase = view === "paper-detail" ? "today" : view === "thread-detail" ? "threads" : view === "learning-path" ? "learn" : view;

  return (
    <>
      <Onboarding open={onboarding} onClose={() => setOnboarding(false)} />
      <div className="app-shell">
        <aside className="sidebar">
          <Logo />
          <nav aria-label="Primary navigation">
            {navItems.map((item) => (
              <button key={item.view} className={"nav-item " + (activeBase === item.view ? "active" : "")} type="button" onClick={() => navigate(item.view)}>
                <span className="nav-glyph" aria-hidden="true">{item.glyph}</span><span>{item.label}</span>
                {item.view === "library" && <small>{savedCount}</small>}
              </button>
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <button className="nav-item" type="button" onClick={() => setSearchOpen(true)}><span className="nav-glyph">⌕</span><span>Search / Ask</span></button>
          <button className="nav-item" type="button" onClick={() => navigate("settings")}><span className="nav-glyph">⚙</span><span>Settings</span></button>
          <button className="profile" type="button" onClick={() => navigate("settings")}><span className="avatar">YL</span><span><strong>Yilin</strong><small>Research profile</small></span><span className="more">•••</span></button>
        </aside>

        <main>
          <header className="topbar">
            <button className="global-search" type="button" onClick={() => setSearchOpen(true)}><span className="search-symbol">⌕</span><span>Search papers or ask a research question</span><kbd>⌘ K</kbd></button>
            <div className="agent-status"><i /> Agent active</div>
          </header>

          {view === "today" && (
            <div className="page-wrap today-page">
              <section className="today-intro">
                <div>
                  <p className="eyebrow">TUESDAY, AUGUST 18</p>
                  <h1>Good morning, Yilin.</h1>
                  <p className="agent-summary">Your agent reviewed <strong>1,248 new papers</strong>. Eighteen matched your research.<br/><span>3 deserve your attention.</span></p>
                </div>
                <div className="brief-meta"><span>Daily brief</span><strong>6 min</strong><small>to review</small></div>
              </section>

              <section className="section-block">
                <div className="section-heading"><div><p className="eyebrow warm">PRIORITY</p><h2>Must Read</h2><p>Highly relevant developments that may affect your research.</p></div><span className="count">2 papers</span></div>
                <PaperFeature paper={papers[0]} feedback={feedback} onFeedback={handleFeedback} onOpen={openPaper} />
                <article className="paper-row emphasized">
                  <div><LevelBadge level={papers[1].level} /><button type="button" onClick={() => openPaper(papers[1])}><h3>{papers[1].title}</h3></button><p>{papers[1].authors} · {papers[1].venue}</p></div>
                  <div className="row-reason"><span>Why you</span><p>{papers[1].why}</p></div>
                  <button className="round-arrow" type="button" aria-label={"Open " + papers[1].title} onClick={() => openPaper(papers[1])}>→</button>
                </article>
              </section>

              <section className="section-block worth-section">
                <div className="section-heading"><div><h2>Worth Reading</h2><p>Useful work, selected for your active questions.</p></div><span className="count">3 papers</span></div>
                <div className="paper-list">
                  {papers.slice(2).map((paper) => (
                    <article className="paper-row" key={paper.id}>
                      <div><span className="novelty-tag">{paper.noveltyType}</span><button type="button" onClick={() => openPaper(paper)}><h3>{paper.title}</h3></button><p>{paper.authors} · {paper.venue}</p></div>
                      <div className="row-thread"><span>Relevant to</span><strong>{paper.thread}</strong></div>
                      <button className="round-arrow" type="button" aria-label={"Open " + paper.title} onClick={() => openPaper(paper)}>→</button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="section-block update-section">
                <div className="section-heading"><div><p className="eyebrow blue">RESEARCH UPDATE</p><h2>What changed in your research?</h2></div><span className="count">Last 24 hours</span></div>
                <article className="research-update">
                  <div className="update-thread"><span className="thread-monogram">GE</span><div><strong>Gaussian Extremality</strong><small>Active · High priority</small></div></div>
                  <p>A new preprint extends an extremality argument previously established only under Gaussian noise assumptions. <strong>This directly narrows one of the open questions in your Rate-Distortion thread.</strong></p>
                  <button type="button" onClick={() => openThread(researchThreads[0])}>Open thread <span>→</span></button>
                </article>
              </section>

              <section className="section-block quiet-section">
                <div className="section-heading"><div><p className="eyebrow">QUIET THREADS</p><h2>No significant updates</h2><p>Pi stays quiet when there is nothing important to report.</p></div></div>
                <div className="quiet-grid">
                  <div><strong>Rate-Distortion Existence</strong><span>No significant developments today.</span></div>
                  <div><strong>OT × Information Theory</strong><span>No additional developments today.</span></div>
                </div>
              </section>
            </div>
          )}

          {view === "threads" && (
            <div className="page-wrap">
              <div className="page-title-row"><div><p className="eyebrow blue">RESEARCH MEMORY</p><h1>Your Research Threads</h1><p>Pi monitors each question with a different level of attention.</p></div><button className="primary-button compact" type="button" onClick={() => setOnboarding(true)}>+ New thread</button></div>
              {["Active", "Learning", "Watching", "Paused"].map((status) => (
                <section className="thread-group" key={status}>
                  <div className="group-label"><span>{status}</span><small>{researchThreads.filter((thread) => thread.status === status).length}</small></div>
                  {researchThreads.filter((thread) => thread.status === status).map((thread) => (
                    <button className="thread-row" type="button" key={thread.id} onClick={() => openThread(thread)}>
                      <span className={"status-line " + status.toLowerCase()} />
                      <span className="thread-name"><strong>{thread.title}</strong><small>{thread.subtitle}</small></span>
                      <span className="thread-update">{thread.update}</span>
                      <span className="thread-priority">{thread.priority}</span>
                      <span className="thread-arrow">→</span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          )}

          {view === "thread-detail" && (
            <div className="page-wrap detail-page">
              <button className="back-button" type="button" onClick={() => navigate("threads")}>← All threads</button>
              <section className="detail-hero">
                <div><span className={"status-pill " + selectedThread.status.toLowerCase()}>{selectedThread.status}</span><span className="priority-pill">{selectedThread.priority}</span><h1>{selectedThread.title}<br/><em>{selectedThread.subtitle}</em></h1></div>
                <button className="secondary-button" type="button" onClick={() => setToast("Thread controls opened")}>••• Controls</button>
              </section>
              <div className="detail-columns">
                <div className="detail-main">
                  <section className="content-section"><div className="content-heading"><h2>Research Question</h2><button type="button">Edit</button></div><p className="lead-copy">Under what structural conditions are Gaussian sources or test channels extremal for rate-distortion functionals beyond classical quadratic distortion?</p></section>
                  <section className="content-section"><div className="content-heading"><div><p className="eyebrow blue">AGENT MODEL</p><h2>What Pi understands</h2></div><button type="button" onClick={() => setToast("Thread understanding is ready to edit")}>Edit</button></div>
                    <div className="understanding-columns"><div><h3>You are mainly interested in</h3><ul><li>theoretical extremality results</li><li>converse methods</li><li>information-theoretic inequalities</li><li>optimal transport arguments</li></ul></div><div className="less"><h3>You are less interested in</h3><ul><li>neural compression systems</li><li>benchmark-only papers</li><li>engineering implementations</li></ul></div></div>
                  </section>
                  <section className="content-section"><div className="content-heading"><h2>Recent Developments</h2><span>Past 30 days</span></div>{papers.slice(0,2).map((paper) => <button className="mini-paper" type="button" key={paper.id} onClick={() => openPaper(paper)}><span className="novelty-tag">{paper.noveltyType}</span><span><strong>{paper.title}</strong><small>{paper.authors} · {paper.date}</small></span><span>→</span></button>)}</section>
                  <section className="content-section"><div className="content-heading"><h2>Related Directions</h2><span>Suggested by Pi</span></div><div className="direction-grid"><button type="button" onClick={() => {setLearnTopic("Stochastic Localization"); navigate("learn");}}>Stochastic Localization <span>↗</span></button><button type="button" onClick={() => {setLearnTopic("Functional Inequalities"); navigate("learn");}}>Functional Inequalities <span>↗</span></button></div></section>
                </div>
                <aside className="detail-aside">
                  <div className="aside-block"><h3>Monitoring</h3><dl><div><dt>Status</dt><dd>{selectedThread.status}</dd></div><div><dt>Priority</dt><dd>{selectedThread.priority.replace(" priority","")}</dd></div><div><dt>Cadence</dt><dd>Daily</dd></div><div><dt>Created</dt><dd>Mar 12, 2026</dd></div></dl></div>
                  <div className="aside-block"><h3>Seed Papers</h3><button type="button">Gaussian Optimality in Rate-Distortion <small>Courtade & Jiao · 2024</small></button><button className="add-seed" type="button" onClick={() => setToast("Paste an arXiv URL, DOI, or title")}>+ Add seed paper</button></div>
                  <div className="aside-block controls"><h3>Controls</h3><button type="button" onClick={() => setToast("Monitoring paused for this demo")}>Pause monitoring</button><button type="button" onClick={() => setToast("Priority controls opened")}>Change priority</button><button type="button" onClick={() => navigate("learn")}>Build learning path</button></div>
                </aside>
              </div>
            </div>
          )}

          {view === "learn" && (
            <div className="page-wrap learn-page">
              {!learnPrep ? (
                <>
                  <section className="learn-hero"><p className="eyebrow blue">RAMP UP</p><h1>What do you want to learn?</h1><p>Pi builds the shortest effective path from what you already know to the current research frontier.</p>
                    <div className="learn-input"><input value={learnTopic} onChange={(event) => setLearnTopic(event.target.value)} aria-label="Topic to learn" /><button type="button" onClick={() => setLearnPrep(true)}>Build Learning Path <span>→</span></button></div>
                  </section>
                  <section className="suggested-topics"><div className="section-heading"><div><h2>Suggested from your research</h2><p>Adjacent areas that could unlock your current questions.</p></div></div>
                    {["Schrödinger Bridge", "Functional Inequalities", "Stochastic Localization"].map((topic, index) => <button type="button" key={topic} onClick={() => { setLearnTopic(topic); setLearnPrep(true); }}><span>0{index+1}</span><strong>{topic}</strong><small>{index === 0 ? "Connects entropic transport to your OT thread" : index === 1 ? "Strengthens the inequality toolkit across two active threads" : "A likely prerequisite for recent Gaussian stability work"}</small><b>→</b></button>)}
                  </section>
                </>
              ) : (
                <section className="knowledge-check">
                  <button className="back-button" type="button" onClick={() => setLearnPrep(false)}>← Change topic</button>
                  <p className="eyebrow blue">BEFORE WE BEGIN</p><h1>Pi has mapped your starting point.</h1><p className="knowledge-intro">For <strong>{learnTopic}</strong>, your Research Memory suggests the following baseline. Adjust anything that looks wrong.</p>
                  <div className="knowledge-card">
                    <div><h2>I assume you already know</h2>{["Probability", "Information Theory", "Optimal Transport"].map((item) => <button className="knowledge-item known" type="button" key={item}><span>✓</span>{item}<small>Known</small></button>)}</div>
                    <div><h2>Possible gaps</h2>{["Stochastic Differential Equations", "Girsanov Theorem"].map((item) => <button className="knowledge-item gap" type="button" key={item}><span>○</span>{item}<small>Review</small></button>)}</div>
                  </div>
                  <div className="knowledge-actions"><button className="secondary-button" type="button" onClick={() => setToast("Click an item above to adjust your knowledge state")}>Adjust knowledge</button><button className="primary-button" type="button" onClick={() => navigate("learning-path")}>Generate path <span>→</span></button></div>
                </section>
              )}
            </div>
          )}

          {view === "learning-path" && (
            <div className="page-wrap path-page">
              <button className="back-button" type="button" onClick={() => navigate("learn")}>← Learn</button>
              <section className="path-hero"><div><p className="eyebrow blue">PERSONAL LEARNING PATH</p><h1>{learnTopic}</h1><p>Goal: Understand the modern theory and reach the current research frontier.</p></div><div className="path-progress"><strong>0%</strong><span><i /></span><small>6 stages · about 11 hours</small></div></section>
              <div className="path-layout">
                <div className="path-nodes">
                  {pathNodes.map((node, index) => (
                    <article className="path-node" key={node.stage}>
                      <div className="stage-marker"><span>{node.stage}</span>{index < pathNodes.length - 1 && <i />}</div>
                      <div className="node-content"><p className="eyebrow">STAGE {node.stage}</p><h2>{node.title}</h2><div className="node-paper"><span className="paper-icon">□</span><div><strong>{node.paper}</strong><small><b>Why read it?</b> {node.why}</small><span>Read: {node.read}</span></div><button type="button" onClick={() => setToast("Marked as complete · your knowledge state was updated")}>Mark read</button></div></div>
                    </article>
                  ))}
                </div>
                <aside className="path-aside"><p className="eyebrow">YOUR ADVANTAGE</p><h3>Built around what you know</h3><p>Pi skipped two introductory texts because your Optimal Transport thread already demonstrates the required background.</p><div><span>Skipped</span><strong>≈ 4.5 hours</strong></div></aside>
              </div>
              <section className="track-area"><span className="ready-mark">π</span><div><h2>Stay current after you finish.</h2><p>Turn this learning path into a monitored Research Thread.</p></div><button className="primary-button" type="button" onClick={() => setToast("Research Thread created · status: Learning")}>Track this research area <span>→</span></button></section>
            </div>
          )}

          {view === "library" && (
            <div className="page-wrap">
              <div className="page-title-row library-title"><div><p className="eyebrow blue">SHARED RESEARCH MEMORY</p><h1>Library</h1><p>Important papers remembered by you and Pi—not a citation manager.</p></div><button className="secondary-button" type="button" onClick={() => setToast("Paste an arXiv URL, DOI, or paper title")}>+ Add paper</button></div>
              <div className="library-tabs">{["Saved", "Must Read", "Reading", "Finished"].map((filter) => <button className={libraryFilter === filter ? "active" : ""} type="button" key={filter} onClick={() => setLibraryFilter(filter)}>{filter}<span>{filter === "Saved" ? savedCount : filter === "Must Read" ? 2 : filter === "Reading" ? 1 : 7}</span></button>)}</div>
              <div className="library-tools"><button type="button">All research threads⌄</button><span>{libraryFilter === "Saved" ? savedCount : libraryFilter === "Must Read" ? 2 : libraryFilter === "Reading" ? 1 : 7} papers</span></div>
              <div className="library-list">
                {papers.slice(0, libraryFilter === "Must Read" ? 2 : libraryFilter === "Reading" ? 1 : 5).map((paper, index) => (
                  <article className="library-row" key={paper.id}>
                    <span className="paper-icon">□</span><div className="library-paper"><button type="button" onClick={() => openPaper(paper)}>{paper.title}</button><span>{paper.authors} · {paper.venue}</span></div>
                    <div className="library-thread"><span>THREAD</span><strong>{paper.thread}</strong></div>
                    <div className="library-date"><span>SAVED</span><strong>{index === 0 ? "Today" : "Aug " + (17-index)}</strong></div>
                    <LevelBadge level={paper.level} />
                    <button className="row-menu" type="button" onClick={() => setToast("Paper actions: Open · Move to Thread · Remove")}>•••</button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {view === "paper-detail" && (
            <div className="page-wrap paper-detail">
              <button className="back-button" type="button" onClick={() => navigate("today")}>← Today&apos;s brief</button>
              <section className="paper-detail-hero">
                <div className="paper-kicker"><LevelBadge level={selectedPaper.level} /><span>{selectedPaper.readTime} read</span><span>{selectedPaper.noveltyType}</span></div>
                <h1>{selectedPaper.title}</h1><p className="paper-authors">{selectedPaper.authors}</p><p className="paper-source">{selectedPaper.venue} · August 18, 2026 · <button type="button">Open original ↗</button></p>
                <div className="detail-action-row"><PaperActions paper={selectedPaper} feedback={feedback} onFeedback={handleFeedback} /><button className="secondary-button" type="button" onClick={() => setToast("Ask panel opened below")}>Ask about this paper</button></div>
              </section>
              <div className="paper-detail-grid">
                <div>
                  <section className="content-section recommendation-box"><p className="eyebrow warm">RECOMMENDATION</p><div><h2>{selectedPaper.level}</h2><p><span>Relevant Thread</span><strong>{selectedPaper.thread}</strong></p><p><span>Reason</span><strong>Direct theoretical connection to two papers in your library.</strong></p></div></section>
                  <section className="content-section"><h2>Why it matters to you</h2><p className="lead-copy">{selectedPaper.why} It sits directly between a result you have saved and an open question recorded in this thread.</p></section>
                  <section className="content-section"><h2>Core contribution</h2><ol className="core-list">{selectedPaper.core.map((item, index) => <li key={item}><span>0{index+1}</span><p>{item}</p></li>)}</ol></section>
                  <section className="content-section novelty-section"><div><p className="eyebrow blue">{selectedPaper.noveltyType}</p><h2>What&apos;s actually new</h2></div><p>{selectedPaper.novelty}</p></section>
                  <section className="content-section"><p className="eyebrow blue">CONTEXT</p><h2>Relation to your research</h2><div className="relation-chain"><div><span>Your Research Thread</span><strong>{selectedPaper.thread}</strong></div><i>↓</i><div><span>Smith et al. · 2025</span><strong>Gaussian-only result</strong></div><i>↓</i><div className="current"><span>This paper</span><strong>extends to log-concave noise</strong></div><i>↓</i><div><span>Possible relevance</span><strong>your non-Euclidean distortion problem</strong></div></div></section>
                  <section className="content-section ask-section"><p className="eyebrow">ASK PI</p><h2>Ask about this paper</h2><div><input placeholder="How does Theorem 2 relate to my seed paper?" /><button type="button" onClick={() => setToast("Pi is comparing this paper with your Research Memory")}>Ask <span>→</span></button></div><small>Answers are grounded in the paper and your research context.</small></section>
                </div>
                <aside className="reading-aside">
                  <div className="reading-plan"><p className="eyebrow blue">IF YOU ONLY HAVE 20 MINUTES</p><h3>Suggested reading</h3><ol><li><span>01</span><div><strong>Introduction</strong><small>4 min · problem and scope</small></div></li><li><span>02</span><div><strong>Theorem 2</strong><small>7 min · main result</small></div></li><li><span>03</span><div><strong>Section 4</strong><small>9 min · proof idea</small></div></li></ol></div>
                  <div className="related-box"><h3>Related papers</h3>{papers.filter((paper) => paper.id !== selectedPaper.id).slice(0,2).map((paper) => <button type="button" key={paper.id} onClick={() => openPaper(paper)}><strong>{paper.title}</strong><small>{paper.date} · {paper.thread}</small></button>)}</div>
                </aside>
              </div>
            </div>
          )}

          {view === "settings" && (
            <div className="page-wrap settings-page">
              <div className="page-title-row"><div><p className="eyebrow blue">RESEARCH PROFILE</p><h1>What Pi remembers about you</h1><p>Your memory steers every recommendation, explanation, and learning path.</p></div><span className="memory-updated">Updated 4 min ago</span></div>
              <div className="settings-grid">
                <section><h2>Interest Memory</h2><p>The research questions, methods, authors, and venues you care about.</p><div className="memory-tags"><span>Gaussian extremality</span><span>Rate-distortion theory</span><span>Optimal transport</span><span>Information inequalities</span></div><button type="button" onClick={() => setToast("Interest Memory is ready to edit")}>Edit interests</button></section>
                <section><h2>Knowledge Memory</h2><p>What Pi assumes you already understand when explaining new work.</p><div className="memory-meter"><span>Information Theory <i><b style={{width:"92%"}} /></i></span><span>Optimal Transport <i><b style={{width:"78%"}} /></i></span><span>Stochastic Analysis <i><b style={{width:"38%"}} /></i></span></div><button type="button" onClick={() => setToast("Knowledge Memory is ready to edit")}>Adjust knowledge</button></section>
                <section><h2>Preference Memory</h2><p>Signals Pi has learned from your feedback.</p><div className="preference-lines"><span><strong>Theory</strong><i>over</i>application</span><span><strong>New theorem</strong><i>over</i>benchmark</span><span><strong>Fundamental result</strong><i>over</i>engineering optimization</span></div><button type="button" onClick={() => setToast("Preference Memory is ready to edit")}>Edit preferences</button></section>
                <section><h2>Agent cadence</h2><p>Pi prioritizes precision and will not manufacture a daily feed.</p><div className="cadence-row"><span><strong>Daily Digest</strong><small>Weekdays · 8:00 AM</small></span><button type="button">On</button></div><div className="cadence-row"><span><strong>Weekly Review</strong><small>Friday · 4:00 PM</small></span><button type="button">On</button></div></section>
              </div>
            </div>
          )}
        </main>
      </div>

      {searchOpen && (
        <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search papers or ask Pi">
          <button className="overlay-backdrop" type="button" aria-label="Close search" onClick={() => setSearchOpen(false)} />
          <div className="search-panel">
            <div className="search-input-row"><span>⌕</span><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search papers or ask a research question" /><kbd>ESC</kbd></div>
            {!searchQuery ? (
              <div className="search-empty"><p className="eyebrow">TRY ASKING</p>{["What changed recently in rate-distortion theory?", "Find papers connecting optimal transport and SDPI.", "Recent work on Gaussian extremality"].map((query) => <button type="button" key={query} onClick={() => setSearchQuery(query)}><span>↗</span>{query}</button>)}<div className="memory-note"><span>π</span><p><strong>Personalized by Research Memory</strong>Results are ranked against your threads, papers, and preferences.</p></div></div>
            ) : (
              <div className="search-results"><div className="answer-preview"><p className="eyebrow blue">PI&apos;S RESEARCH ANSWER</p><p>Recent work has shifted from Gaussian-only extremality arguments toward stability and log-concave extensions. <strong>Two results are directly connected to your active thread.</strong></p></div><p className="eyebrow">MATCHING YOUR RESEARCH</p>{papers.slice(0,3).map((paper) => <button type="button" key={paper.id} onClick={() => { setSearchOpen(false); openPaper(paper); }}><span className="paper-icon">□</span><span><strong>{paper.title}</strong><small>{paper.thread} · {paper.level}</small></span><b>→</b></button>)}</div>
            )}
          </div>
        </div>
      )}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </>
  );
}
