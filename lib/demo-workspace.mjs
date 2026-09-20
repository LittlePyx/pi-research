import { DEMO_NOTE_INSIGHTS } from "./demo-note-insights.mjs";
import { DEMO_NOTES, DEMO_EXCERPTS, demoArtifact } from "./demo-history.mjs";
import { DEMO_READING_SUMMARIES } from "./demo-reading-summaries.ts";
import { DEMO_PAPERS } from "./demo-research.ts";
import { emptyResearchMapState } from "./research-map.ts";
export const spaces = [
  { id: 'demo-information', name: '信息论 · 演示', memberName: 'Demo', description: '信息不等式、率失真与编码', accent: 'blue' },
  { id: 'demo-mathematics', name: '应用数学 · 演示', memberName: 'Demo', description: 'KLS 猜想、函数不等式与随机局部化', accent: 'sage' },
];

function demoPreferenceSignals(spaceId) {
  const math = spaceId === 'demo-mathematics';
  return [{ id: `${spaceId}-scope`, layer:'explicit', kind:'topic', labelZh: math ? 'KLS 猜想、函数不等式与随机局部化' : '信息不等式、率失真与编码', labelEn: math ? 'KLS, functional inequalities and localization' : 'Information inequalities, rate-distortion and coding', evidence:'示例依据：当前演示空间的研究范围。', sourceType:'research_space' },
    { id:`${spaceId}-method-interest`, layer:'inferred', kind:'method', labelZh:math ? '关注随机局部化的证明工具与适用条件' : '关注有限码长下的概率约束与二阶项', labelEn:math ? 'Proof tools and assumptions of stochastic localization' : 'Probability constraints and second-order terms at finite blocklength', evidence:math ? '示例依据：KLS 与 Eldan 的预设笔记分别记录了等周系数定义、归一化条件和协方差控制问题；由这些记录归纳出方法兴趣。' : '示例依据：信道编码与有损压缩的预设笔记分别记录了错误概率、超额失真约束及色散问题；由这些记录归纳出方法兴趣。', sourceType:'reading_note' },
    { id:`${spaceId}-question-interest`, layer:'inferred', kind:'question', labelZh:math ? '比较常数界之前，先核对定义与测度条件' : '比较源编码与信道编码之前，先区分失败事件', labelEn:math ? 'Check definitions and measure assumptions before comparing bounds' : 'Distinguish failure events before comparing source and channel coding', evidence:math ? '示例依据：Chen 与 KLS 的预设笔记都提出了常数定义能否对齐的问题。' : '示例依据：Shannon 与有损压缩的预设笔记都要求区分平均失真与超额失真概率。', sourceType:'reading_note' }
  ].map(signal => ({...signal,confidence:70,effectiveConfidence:60,observedAt:'2026-09-19T08:00:00Z',expiresAt:null}));
}

export function learningFixture(spaceId = spaces[0].id) {
  const space = spaces.find((item) => item.id === spaceId);
  if (!space) return null;
  const leadIds = spaceId === 'demo-mathematics' ? ['kls-localization','eldan-thin-shell'] : ['finite-blocklength','lossy-finite'];
  const samples = DEMO_PAPERS.filter(p => p.route === (spaceId === spaces[0].id ? 'information' : 'geometry')).sort((a, b) => (leadIds.includes(a.id) ? leadIds.indexOf(a.id) - 2 : 0) - (leadIds.includes(b.id) ? leadIds.indexOf(b.id) - 2 : 0));
  const papers = samples.map((sample) => ({
    canonicalId: sample.id, demo: true,
    id: sample.id, title: sample.title, doi: null, authors: sample.authors,
    venue: sample.venue, url: sample.href || '', publishedAt: sample.year + '-01-01',
    horizon: 'years', citationCount: 0, relevanceScore: 0, qualityScore: 0, discoveredAt: '2026-09-01T00:00:00Z',
    summaryZh: sample.note, summaryEn: 'Public bibliography sample, not a quality assessment.',
    whyReadZh: sample.note, whyReadEn: 'Use the original source to check assumptions and scope.', priorityVenue: false,
    analysisSource: 'demo', screeningReason: '', userState: 'seen', showCount: 0, saved: false, feedback: null,
    firstShownAt: null, lastShownAt: null, openedAt: null, snoozedUntil: null, readingStatus: DEMO_NOTES[sample.id]?.status || 'queued', readingNote: DEMO_NOTES[sample.id]?.note || '',
    proposedRecommendationTier: 'browse', recommendationTier: 'browse', readMinutes: 30, readDepth: 'focused',
    problemZh: '', problemEn: '', methodZh: '', methodEn: '', contributionZh: '', contributionEn: '',
    limitationsZh: '', limitationsEn: '', readingFocusZh: '', readingFocusEn: '', researchQuestionsZh: [], researchQuestionsEn: [],
    researchProblemId: '', problemFitScore: 0, uncertaintyReductionScore: 0, actionabilityScore: 0,
    researchProblemImpactZh: '', researchProblemImpactEn: '', researchDecisionZh: '', researchDecisionEn: '',
    verificationStatus: 'not_required', verificationCoverageScore: 0, qualityStage: leadIds.includes(sample.id) ? 'recommended' : 'queued',
  }));
  const kinds = ['foundation', 'method', 'milestone', 'frontier', 'project'];
  const labels = ['基础文献', '核心方法', '里程碑', '研究前沿', '研究实践'];
  const stageIds = spaceId === 'demo-mathematics' ? [['kls-localization'], ['eldan-thin-shell'], ['lee-vempala-localization', 'chen-kls'], ['kls-logarithmic','parallel-thin-shell'], ['kls-localization', 'eldan-thin-shell']] : [['shannon-fidelity'], ['finite-blocklength','lossy-finite'], ['joint-finite','conditional-dispersion'], ['gaussian-memory'], ['finite-blocklength','lossy-finite']];
  const steps = kinds.map((kind, index) => ({
    id: `${spaceId}-${kind}`, kind, titleZh: labels[index], titleEn: kind,
    goalZh: ['建立问题定义与基本语言', '理解关键证明工具', '比较代表性结果', '识别尚需核对的条件', '整理一个可验证的问题'][index], goalEn: ['Establish the definitions', 'Understand the proof tools', 'Compare key results', 'Identify conditions to check', 'Write a verifiable question'][index],
    whyZh: '对照文献导读与原文，区分已知结果和待核对的问题。', whyEn: 'Compare reading guidance with the original source.', readFocusZh: index === 1 && spaceId === 'demo-mathematics' ? '对照 KLS 原始框架，记录随机局部化需要控制的量和使用条件。' : '先记录模型假设，再比较结论。', readFocusEn: 'Record assumptions before comparing conclusions.',
    checkpointZh: '能否说清这篇材料的适用范围？', checkpointEn: 'Can you state the scope of this material?',
    estimatedMinutes: 30, status: index === 0 ? 'completed' : index === 1 ? 'active' : 'pending', position: index,
    resources: papers.filter(p => stageIds[index].includes(p.id)).map(p => ({ ...p, id: `monitor:${p.id}`, canonicalId:p.id, trackId:'demo-route', source:'research-map', qualification:'quality_approved', suggestedMinutes:30 })),
    guidanceStatus: 'grounded',
    evidenceStatus: 'ready', evidenceQuery: '', completedAt: index === 0 ? '2026-09-12T08:00:00Z' : null,
    discovery: index < 5 ? null : { id: `${spaceId}-gap-${index}`, status: 'retryable', attemptCount: 1,
      queuedCount: 1, reviewPendingCount: 1, reviewedCount: 0, nextRetryAt: '2099-01-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
  }));
  return {
    learning: { suggestedTarget: space.description, availablePaperCount: papers.length, waitingQualityCount: 0, model: 'fixture',
      path: { id: `${spaceId}-path`, target: spaceId === 'demo-mathematics' ? '比较 KLS 原始框架与随机局部化的假设、工具和适用范围' : space.description, targetTrackId: "demo-route", titleZh: `${space.name} 学习路径`, titleEn: `${space.name} learning path`,
        rationaleZh: '', rationaleEn: '', status: 'active', model: 'fixture', parentPathId: null, revision: 1, sourceRevision: 'fixture',
        estimatedMinutes: 150, completedSteps: 1, createdAt: '2026-09-01', updatedAt: '2026-09-01', steps } },
    monitor: { preferenceSignals: demoPreferenceSignals(spaceId), preferences:{profileKey:'demo',profileNameZh:space.description,profileNameEn:'Demo sources',priorityVenues:[...new Set(samples.map(p=>p.venue))],explorationMode:'balanced',trackedAuthors:[],userModified:false}, status: 'ready', lastRunAt: null, nextRunAt: null, newCount: 0, scannedCount: 0, knownCount: papers.length, historyCounts: {all:papers.length,inbox:papers.length,accepted:0,dismissed:0}, error: null,
      cadenceHours: 24, source: '演示样例', horizons: ['years'], papers: papers.slice(0, 2), historyPapers: papers, throttled: true, dailyBrief: { date: '2026-09-20', isCurrent: false, status: 'ready', headlineZh: spaceId === 'demo-mathematics' ? '从 KLS 到随机局部化：先核对假设，再比较工具' : '从信道编码到有损压缩：比较两种有限码长约束', headlineEn: 'From foundations to methods', overviewZh: '固定的演示简报，展示阅读流程；不是实时推荐或正式评审。', overviewEn: 'Fixed demo brief, not a live recommendation.', signalsZh: [], signalsEn: [], readingPlanZh: [], readingPlanEn: [], watchlistZh: [], watchlistEn: [], paperIds: papers.slice(0, 2).map(p => p.id), metrics: {}, model: 'demo', error: null, updatedAt: '2026-09-20' } },
  };
}


function demoMap(data) {
  const map = emptyResearchMapState(); map.generated = true;
  map.tracks = [
    ["kls", "KLS 猜想与等周常数", "KLS conjecture and isoperimetric constants", "比较不同测度条件下的常数界，区分结论、证明工具和仍缺少的条件。", "Compare bounds under different measure assumptions, separating results, proof tools, and missing conditions."],
    ["transport", "Monge–Ampère 与输运熵不等式", "Monge–Ampère and transport-entropy inequalities", "核对输运方法的适用假设及其与函数不等式的联系。", "Check the assumptions of transport methods and their connection to functional inequalities."],
    ["localization", "随机局部化方法", "Stochastic localization", "识别局部化步骤在证明中的作用与需要控制的量。", "Identify the role of localization and the quantities that need control."],
  ].map(([id, titleZh, titleEn, summaryZh, summaryEn], index) => ({ id, titleZh, titleEn, summaryZh, summaryEn,
    expansionCount: 0, userRole: index < 2 ? "core" : "support", monitoringStatus: "active", depthScore: 0, supportScore: 0, interactionScore: 0,
    heatScore: 0, heatLevel: "quiet", recentPaperCount: 0, confirmedEvidenceCount: 0, pendingEvidenceCount: 0, queuedForReviewCount: 0,
    reviewingForReviewCount: 0, recommendedCandidateCount: 0, lastQueuedAt: null, latestChange: null, gapDiscovery: null, routeRevisions: [],
    buildStatus: "empty", buildAttemptCount: 1, buildSourceStatuses: [], buildError: null, buildRetryAt: null, intelligence: null,
    intelligenceStatus: "ready", intelligenceRetryAt: null, intelligenceRefreshRequestedAt: null, updatedAt: "2026-09-10", papers: [],
    discoveryEffect: { attemptCount: 0, discoveredCount: 0, deepReviewedCount: 0, recommendedCount: 0, acceptedCount: 0,
      deepReviewRate: 0, recommendationRate: 0, acceptanceRate: 0, lastScannedAt: null, staleDays: null,
      tasks: Object.fromEntries(["frontier", "foundation", "gap", "network"].map(key => [key, { status: "idle", scannedCount: 0, queuedCount: 0, recommendedCount: 0 }])) },
  }));
  const papers = data.monitor.historyPapers;
  map.tracks = map.tracks.slice(0, 1);
  const track = map.tracks[0];
  track.id = 'demo-route';
  track.titleZh = papers.some(p => p.id === 'kls-localization') ? 'KLS 与随机局部化' : '信息不等式与编码';
  track.titleEn = 'Demo research route';
  track.summaryZh = data.learning.path.target;
  track.papers = papers.map((paper, position) => ({...paper, role: DEMO_PAPERS.find(p => p.id === paper.id)?.role || 'foundation', summaryZh:paper.summaryZh, summaryEn:paper.summaryEn, rationaleZh:paper.whyReadZh, rationaleEn:'Public bibliography sample', position, provenance:'system_curated', curationStatus:'active', curationEvidence:[]}));
  track.buildStatus = 'ready';
  track.confirmedEvidenceCount = 0;
  map.generated = true;
  return map;
}

const states = new Map();
const response = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json'}});
const blocked = () => response({error:'演示模式不执行此操作。请返回正式工作区使用。 / This action is unavailable in the demo.'}, 403);
/** Closed response catalogue: unknown endpoints and writes are rejected locally. */
export async function demoResponse(input, init = {}) {
  const url = new URL(input instanceof Request ? input.url : String(input), 'https://demo.invalid');
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let body = {};
  try { body = typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch { return blocked(); }
  const id = url.searchParams.get('spaceId') || body.spaceId || spaces[0].id;
  if (url.pathname === '/api/spaces' && method === 'GET') return response({spaces:[spaces[1],spaces[0]], modelConfigured:false});
  if (url.pathname === '/api/model-settings' && method === 'GET') return response({configured:false,source:null,model:null});
  if (!spaces.some(space => space.id === id)) return blocked();
  if (!states.has(id)) states.set(id, learningFixture(id));
  const data = states.get(id);
  const papers = data.monitor.historyPapers;
  const paperId = url.searchParams.get('paperId') || body.paperId;
  const paper = papers.find(p => p.id === paperId);
  const path = url.pathname;
  if (path === '/api/monitor' && (method === 'GET' || (method === 'POST' && body.trigger === 'visit'))) return response(paperId ? {paper,monitor:data.monitor} : {monitor:data.monitor});
  if (path === '/api/preference-signals' && method === 'PATCH') {
    const signal = demoPreferenceSignals(id).find(item => item.id === body.signalId);
    if (!signal) return response({error:'Preference signal not found'},404);
    if (typeof body.active !== 'boolean') return response({error:'active must be boolean'},400);
    if (signal.layer === 'explicit' && !body.active) return response({error:'Change explicit evidence at its source'},409);
    data.monitor.preferenceSignals = data.monitor.preferenceSignals.filter(item => item.id !== signal.id);
    if (body.active) data.monitor.preferenceSignals.push(signal);
    return response({ok:true});
  }
  if (path === '/api/monitor' && method === 'PATCH') {
    if (body.rescan) return blocked();
    if (body.reset) data.monitor.preferences = learningFixture(id).monitor.preferences;
    else if (Array.isArray(body.priorityVenues) && Array.isArray(body.trackedAuthors) && ['focused','balanced','open'].includes(body.explorationMode)) data.monitor.preferences = {...data.monitor.preferences,priorityVenues:body.priorityVenues,trackedAuthors:body.trackedAuthors,explorationMode:body.explorationMode,userModified:true};
    else return blocked();
    return response({monitor:data.monitor});
  }
  if (path === '/api/research-map' && method === 'POST' && body.action === 'read') return response(demoMap(data));
  if (path === '/api/learning-path' && method === 'GET') return response(data.learning);
  if (path === '/api/learning-path' && method === 'PATCH') {
    const step = data.learning.path.steps.find(s => s.id === body.stepId);
    if (body.pathId !== data.learning.path.id || !step || typeof body.completed !== 'boolean') return blocked();
    const current = data.learning.path.steps.find(s => s.status !== 'completed');
    if (body.completed && current?.id !== step.id) return blocked();
    step.status = body.completed ? 'completed' : 'pending';
    step.completedAt = body.completed ? new Date().toISOString() : null;
    let active = false;
    for (const item of data.learning.path.steps) if (item.status !== 'completed') { item.status = active ? 'pending' : 'active'; active = true; }
    data.learning.path.completedSteps = data.learning.path.steps.filter(s => s.status === 'completed').length;
    return response(data.learning);
  }
  if (path === '/api/research-imports' && method === 'GET') return response({imports:[]});
  if (path === '/api/research-synthesis' && method === 'GET') return response({synthesis:{status:'empty',stale:false,statements:[],availablePaperCount:0,availableClaimCount:0,canGenerate:false,preparation:[]}});
  if (path === '/api/research-problem' && method === 'GET') return response({problemState:{problem:null,hypotheses:[],actions:[],assessment:null,evidence:{canDraft:false,canAssess:false}}});
  if (path === '/api/research-memory' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const items = papers.filter(p => p.readingNote).map(p => {
      const example = DEMO_NOTE_INSIGHTS[p.id];
      const matches = Boolean(example && p.readingNote.trim() === DEMO_NOTES[p.id]?.note.trim());
      return {paperId:p.id,title:p.title,venue:p.venue,note:p.readingNote,updatedAt:DEMO_NOTES[p.id]?.date || '2026-09-20',
        status:matches ? 'ready' : example ? 'stale' : 'pending',demoExample:matches,
        takeawayZh:'',takeawayEn:'',methodsZh:[],methodsEn:[],questionsZh:[],questionsEn:[],...(matches ? example : {})};
    }).filter(item => [item.title,item.note,item.takeawayZh,item.takeawayEn,...item.methodsZh,...item.methodsEn,...item.questionsZh,...item.questionsEn].join(' ').toLowerCase().includes(q.toLowerCase()));
    items.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    return response({items,total:items.length,nextOffset:null});
  }
  if (path === '/api/library' && method === 'PATCH' && paper) {
    if (body.analyze) return blocked();
    if (typeof body.note === 'string') paper.readingNote = body.note;
    if (['unread','queued','reading','read','mastered','cited'].includes(body.status)) paper.readingStatus = body.status;
    return response({paper});
  }
  if (path === '/api/feedback' && method === 'POST' && ['seen','opened','open','impression'].includes(body.kind)) return response({effect:{zh:'仅记录本次演示操作',en:'Demo session only'}});
  if (path === '/api/paper-reading' && method === 'GET') {
    if (!paper) return response({error:'Paper not found'}, 404);
    return response({paper:{abstractText:'', readingSummary:DEMO_READING_SUMMARIES[paper.id]}});
  }
  if (path === '/api/reading-calendar' && method === 'GET') return response({counts:[],papers:[],hasMore:false});
  if (path === '/api/research-start' && method === 'GET') return response({suggestions:[]});
  if (path === '/api/research-maintenance' && method === 'GET') return response({state:null,monitor:{pausedAt:'2026-09-20',active:0},graph:{total:0,complete:0,partial:0,pending:0,blocked:0},routes:{total:1,checked:0,related:0,insufficient:0}});
  if (path === '/api/research-sources' && method === 'GET') return response({plan:{directionZh:data.learning.path.target,directionEn:'Demo research sources',suggestions:data.monitor.preferences.priorityVenues.map(title=>({title,role:'core',reasonZh:'样例文献所在来源，用于体验关注来源设置。',reasonEn:'A venue from the demo bibliography.',authority:'',scopeUrl:null})),reviewedOn:'2026-09-20'},activity:[]});
  if (path === '/api/email-subscription' && method === 'GET') return response({configured:false,subscription:null,deliveries:[]});
  if (path === '/api/library-graph' && method === 'GET') return response({status:'pending',checkedAt:null,retryAt:0,busy:false,items:[],offsets:{references:0,citations:0},errors:[],limited:false});
  if (path === '/api/library-catalog' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const items = papers.filter(p => `${p.title} ${p.authors}`.toLowerCase().includes(q)).map(p => ({...p,abstractText:'',recommended:0,verified:0,inRoute:1,membership:null,category:null,graphStatus:null,checkedAt:null,matchTerms:[]}));
    return response({items,total:items.length,nextOffset:null,coverage:{total:items.length,checked:0,noLinks:0,blocked:0},terms:[]});
  }
  if (path === '/api/research-workbook' && (method === 'GET' || (method === 'POST' && body.action === 'save-artifact'))) {
    const candidates=papers.map(p => ({...p,abstractText:DEMO_EXCERPTS[p.id] || '',routeMember:true,role:DEMO_PAPERS.find(s=>s.id===p.id)?.role || 'foundation'}));
    if (!data.workbook) data.workbook = demoWorkbook(candidates);
    if (method === 'POST') {
      if (body.workbookId !== data.workbook.id || body.sourceRevision !== 'demo' || !body.value || typeof body.value.decision !== 'string') return blocked();
      data.workbook.artifact = {revision:(data.workbook.artifact?.revision || 0)+1,value:body.value};
    }
    return response({workbook:data.workbook,versions:[]});
  }
  return blocked();
}

function demoWorkbook(candidates) {
  const sources = candidates.slice(0,2);
  const math = sources[0].id === 'kls-localization';
  const dimensions = [['assumptions','对象与工具','Objects and tools'],['conclusion','结论适用范围','Scope of conclusions']].map(([id,labelZh,labelEn]) => ({id,labelZh,labelEn,purposeZh:'先从原文核对条件，再记录判断。',purposeEn:'Check source conditions before drawing a conclusion.',cells:sources.map(p=>({paperId:p.id,status:'missing',quote:'',textZh:'',textEn:''}))}));
  dimensions[0].cells = sources.map(p => ({paperId:p.id,status:'supported',quote:DEMO_EXCERPTS[p.id],textZh:p.id === 'kls-localization' ? '以局部化引理作为主要工具' : p.id === 'eldan-thin-shell' ? '高维各向同性凸体的等周问题' : p.id === 'finite-blocklength' ? '固定码长与错误概率下的信道编码' : '超额失真概率约束下的有损源编码',textEn:'Check the stated object and constraint in the cited abstract excerpt.'}));
  return {id:'demo-comparison',status:'ready',stale:false,revision:'demo',retryAt:null,candidates,sources,artifact:{revision:1,value:demoArtifact(sources)},content:{questionZh:sources.some(p => p.id === 'kls-localization') ? 'KLS 与随机局部化：哪些假设和工具需要核对？' : '信道编码与有损压缩：有限码长下的约束如何区别？',questionEn:'Demo exercise: which conditions need checking?',dimensions,comparison:{status:'conditional',textZh:math ? '两篇都涉及等周问题，但研究对象和方法的表述不同。已记录摘要中的对象描述；归一化、常数定义与定理适用范围仍需对照正文。' : '两篇都研究有限码长，但一篇约束译码错误，另一篇约束超额失真概率。不能把两种色散或性能界直接等同。',textEn:'The objects and constraints differ. Check definitions in the full papers before comparing bounds.',evidenceIds:sources.map(p=>'assumptions:'+p.id)},task:{titleZh:'核对假设与结论范围',titleEn:'Check assumptions and scope',steps:[{textZh:math ? '核对两篇论文的归一化条件，记录定义所在页码。' : '分别写出错误概率与超额失真概率的定义。',textEn:'Record the definitions and their page numbers.',evidenceIds:sources.map(p=>'assumptions:'+p.id)},{textZh:math ? '补读 KLS 综述中的薄壳与谱隙关系，标出所用版本。' : '补读联合信源信道编码，核对分离设计比较的前提。',textEn:'Read the related background and record the version used.',evidenceIds:[]},{textZh:'在下方记录一个能够继续核查的问题，不提前判断结果强弱。',textEn:'Save one unresolved question to investigate next.',evidenceIds:[]}],criterionZh:'每项判断注明出处或明确待查。',criterionEn:'Cite each judgment or leave it unresolved.'},learning:{goalZh:'区分文献导读与研究证据',goalEn:'Distinguish reading guidance from evidence',prerequisiteZh:'理解研究对象与基本定义。',prerequisiteEn:'Understand the objects and definitions.',exerciseZh:'记录一项需要进一步核对的条件。',exerciseEn:'Record a condition to check.',checkpointZh:'没有出处的判断保持待查。',checkpointEn:'Leave unsupported judgments unresolved.'}}};
}
