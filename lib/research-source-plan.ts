import { inferDomainProfile } from "../app/api/monitor/domain-profiles.ts";

export type SourceSuggestion = { title: string; role: "core" | "support" | "broad"; reasonZh: string; reasonEn: string; authority: string; scopeUrl: string | null; issn?: string };
const source = (title: string, authority: string, scopeUrl: string, reasonZh: string, reasonEn: string, issn?: string): SourceSuggestion => ({ title, authority, scopeUrl, reasonZh, reasonEn, issn, role: "core" });
const catalog = {
  pra: source("Physical Review A", "American Physical Society", "https://journals.aps.org/pra/about", "量子科学与原子、分子、光学物理，可补充同步协议的物理基础。", "Quantum science and AMO physics can inform the physical basis of synchronization protocols.", "2469-9926"),
  qst: source("Quantum Science and Technology", "IOP Publishing", "https://publishingsupport.iopscience.iop.org/journals/quantum-science-technology/about-quantum-science-technology/", "期刊范围包含量子通信、计量与传感，适合关注量子同步协议及实现。", "Its scope includes quantum communication, metrology and sensing, relevant to synchronization protocols and implementations.", "2058-9565"),
  ol: source("Optics Letters", "Optica Publishing Group", "https://opg.optica.org/journal/ol/about.cfm", "覆盖光学测量、光纤和量子电子学，可发现光学时间传递的实验进展。", "Optical measurements, fibers and quantum electronics offer experimental leads for optical time transfer."),
  oe: source("Optics Express", "Optica Publishing Group", "https://opg.optica.org/content/journal/about/item/oe/", "关注光学与光子学的技术创新，可补充链路与实验装置方法。", "Optics and photonics innovations can inform link and experimental methods."),
  met: source("Metrologia", "IOP Publishing · BIPM", "https://publishingsupport.iopscience.iop.org/journals/metrologia/about-metrologia/", "覆盖测量基础、单位实现和不确定度，适合核对时间频率测量的精度口径。", "Measurement foundations, unit realization and uncertainty help assess time and frequency precision."),
  applied: source("Physical Review Applied", "American Physical Society", "https://journals.aps.org/prapplied/about", "量子信息技术与光子器件的应用研究，可作为实验实现的补充来源。", "Applied quantum information and photonic devices provide implementation context."),
  tit: source("IEEE Transactions on Information Theory", "IEEE Information Theory Society", "https://www.itsoc.org/it-trans", "研究信息的传输、处理和利用，是率失真、编码与信息不等式的核心检索来源。", "Information transmission, processing and utilization cover rate-distortion, coding and information inequalities.", "0018-9448"),
  cpam: source("Communications on Pure and Applied Mathematics", "Wiley · Courant Institute", "https://onlinelibrary.wiley.com/journal/10970312", "覆盖偏微分方程、概率和几何分析，可关注最优传输与泛函不等式的理论进展。", "PDE, probability and geometric analysis provide theoretical leads in optimal transport and functional inequalities.", "0010-3640"),
};

type FocusRule = { key: string; zh: string; en: string; terms: string[]; requires?: RegExp; sources: SourceSuggestion[] };
const support = (item: SourceSuggestion): SourceSuggestion => ({ ...item, role: "support" });
const rules: FocusRule[] = [
  { key: "quantum_timing", zh: "量子时钟同步与时间传递", en: "Quantum clock synchronization and time transfer",
    terms: ["量子时钟同步", "量子时间传递", "quantum clock synchronization", "quantum clock synchronisation", "quantum time transfer", "clock synchronization", "时钟同步"], requires: /quantum|量子/i,
    sources: [catalog.qst, catalog.ol, catalog.pra, catalog.met, support(catalog.oe), support(catalog.applied)] },
  { key: "quantum_metrology", zh: "量子计量与精密测量", en: "Quantum metrology and precision measurement",
    terms: ["量子计量", "量子传感", "quantum metrology", "quantum sensing"], sources: [catalog.qst, catalog.pra, catalog.met, support(catalog.applied)] },
  { key: "optical_timing", zh: "光学时间频率传递", en: "Optical time and frequency transfer",
    terms: ["optical clock", "frequency transfer", "time transfer", "光钟", "时间频率", "光纤传频"], sources: [catalog.met, catalog.ol, catalog.oe, support(catalog.pra)] },
  { key: "quantum_information", zh: "量子信息与通信", en: "Quantum information and communication",
    terms: ["quantum information", "quantum communication", "量子信息", "量子通信"], sources: [catalog.qst, catalog.pra, support(catalog.applied)] },
  { key: "rate_distortion", zh: "率失真与信息理论", en: "Rate-distortion and information theory",
    terms: ["rate-distortion", "rate distortion", "率失真", "高斯极值", "gaussian extremality"], sources: [catalog.tit] },
  { key: "transport_analysis", zh: "最优传输与泛函不等式", en: "Optimal transport and functional inequalities",
    terms: ["optimal transport", "functional inequality", "functional inequalities", "最优传输", "泛函不等式", "log-sobolev", "随机局部化"], sources: [catalog.cpam] },
];

export function normalizeSourceTitle(value: string) { return value.toLocaleLowerCase().replace(/&/g, "and").replace(/[^\p{L}\p{N}]/gu, ""); }
export function researchSourcePlan(name: string, description: string) {
  const text = `${name} ${description}`.toLocaleLowerCase();
  const profile = inferDomainProfile(name, description);
  // Specific phrases win over generic physics/information matches. Order breaks ties deliberately.
  const matches = rules.map((rule, index) => ({ rule, index, terms: rule.terms.filter(term => text.includes(term.toLocaleLowerCase())) }))
    .filter(item => item.terms.length && (!item.rule.requires || item.rule.requires.test(text)))
    .sort((a, b) => Number(b.terms.some(t => name.toLocaleLowerCase().includes(t))) - Number(a.terms.some(t => name.toLocaleLowerCase().includes(t)))
      || Math.max(...b.terms.map(t => t.length)) - Math.max(...a.terms.map(t => t.length)) || a.index - b.index);
  const match = matches[0];
  const fallback: SourceSuggestion[] = profile.venues.map(title => Object.values(catalog).find(item => item.title === title) || {
    title, role: "broad", authority: "", scopeUrl: null,
    reasonZh: `来自“${profile.nameZh}”的既有重点来源目录；还需要结合具体研究问题筛选。`,
    reasonEn: `From the existing ${profile.nameEn} source catalog; fit still needs assessment against your specific question.`,
  });
  const specialized = match?.rule.sources || [];
  const useFieldSupplements = match && ["rate_distortion", "transport_analysis"].includes(match.rule.key);
  const suggestions = specialized.length ? [...specialized, ...(useFieldSupplements ? fallback.filter(item => !specialized.some(s => s.title === item.title)).slice(0, 4).map(support) : [])] : fallback;
  return { profileKey: profile.key, directionKey: match?.rule.key || profile.key, directionZh: match?.rule.zh || profile.nameZh,
    directionEn: match?.rule.en || profile.nameEn, specificity: match ? "focused" as const : "broad" as const,
    matchedTerms: match?.terms || [], suggestions, defaultVenues: suggestions.map(item => item.title), reviewedOn: "2026-09-16" };
}
export type ResearchSourcePlan = ReturnType<typeof researchSourcePlan>;

export function sourcePlanIssn(title: string) { return Object.values(catalog).find(s => normalizeSourceTitle(s.title) === normalizeSourceTitle(title))?.issn; }

export const SOURCE_ACTIVITY_SQL = `SELECT p.venue, COUNT(*) AS discovered, SUM(CASE WHEN i.ever_recommended=1 THEN 1 ELSE 0 END) AS recommended,
 MAX(p.discovered_at) AS latestAt FROM monitored_papers p LEFT JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
 WHERE p.space_id=? AND datetime(p.discovered_at)>=datetime('now', '-30 days') GROUP BY p.venue`;
export const SOURCE_RECENT_PAPERS_SQL = `WITH recent AS (
 SELECT p.id, p.title, p.venue, p.discovered_at, COALESCE(i.ever_recommended,0) AS recommended,
 ROW_NUMBER() OVER (PARTITION BY lower(p.venue) ORDER BY p.discovered_at DESC, p.id) AS position
 FROM monitored_papers p LEFT JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
 WHERE p.space_id=? AND datetime(p.discovered_at)>=datetime('now', '-30 days'))
 SELECT id,title,venue,recommended FROM recent WHERE position<=2`;
