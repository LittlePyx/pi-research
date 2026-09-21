// New authored questions. Shared v1 corpus, not an independent held-out dataset.
const signal=(id,reasonCode,labelEn,sourcePaperId,layer='explicit')=>({id,reasonCode,kind:reasonCode==='duplicate_known'?'mastery':'method',labelEn,sourcePaperId,layer,confidence:layer==='explicit'?100:60,active:true,evidence:'Authored research persona, not real user behavior.'});
export const V2_SCENARIOS=[
 {id:'convex-gaussian',domain:'mathematics',goal:'Investigate when high-dimensional convex geometry exhibits approximately Gaussian behavior. Find useful next reading connecting central limit phenomena, thin-shell estimates and localization, separating assumptions from quantitative conclusions.',goalZh:'从凸体中心极限定理继续研究：薄壳与局部化如何连接近高斯行为？',knownIds:['arxiv:math/0611577'],signals:[
  signal('g1','duplicate_known','Already read the power-law central limit theorem for convex sets (arxiv:math/0611577).','arxiv:math/0611577'),
  signal('g2','method_fit','Compare the assumptions and geometric quantities connecting thin-shell estimates to Gaussian approximation.'),
  signal('g3','weak_evidence','Do not treat Gaussian marginals, isoperimetry and sampling as equivalent conclusions.'),
  signal('g4','method_fit','Possible interest in stochastic localization as a bridge to algorithmic constructions.',undefined,'inferred')]},
 {id:'coding-side-information',domain:'information',goal:'Extend a finite-blocklength joint source-channel coding study toward side-information and communication constraints. Find next readings that clarify which terminal knows what and how the probability criterion changes.',goalZh:'从有限码长联合编码继续研究：边信息位置与通信约束如何改变问题？',knownIds:['arxiv:1209.1317'],signals:[
  signal('j1','duplicate_known','Already read the finite-blocklength lossy joint source-channel coding paper (arxiv:1209.1317).','arxiv:1209.1317'),
  signal('j2','method_fit','Prioritize side-information and interactive communication models, with terminal assumptions stated clearly.'),
  signal('j3','weak_evidence','Separate excess distortion, average distortion and coordination objectives rather than conflating them.'),
  signal('j4','method_fit','Possible interest in information bottleneck formulations as a secondary conceptual connection.',undefined,'inferred')]},
];
