/**
 * Internal discovery benchmark for the two research spaces that have exposed
 * the most retrieval failures in production. This file is deliberately not
 * imported by the UI. It is shared by the runtime calibration layer and the
 * repeatable benchmark scripts.
 */
export const DISCOVERY_BENCHMARK_VERSION = "2026-08-23.v1";

export const DISCOVERY_BENCHMARK_GATES = Object.freeze({
  recallAtK: 0.8,
  precisionAt10: 0.7,
  wrongTypeRate: 0.05,
  facetCoverage: 0.75,
});

export const DISCOVERY_GOLD_SETS = Object.freeze({
  information_theory: {
    label: "Information theory & communications",
    facets: [
      {
        id: "rate_distortion",
        label: "rate-distortion and lossy source coding",
        terms: ["rate distortion", "rate-distortion", "lossy source coding", "distortion function"],
      },
      {
        id: "semantic_task",
        label: "semantic and task-oriented compression",
        terms: ["semantic compression", "semantic communication", "task oriented compression", "task-oriented compression", "side information"],
      },
      {
        id: "coding_limits",
        label: "coding limits and finite blocklength",
        terms: ["finite blocklength", "channel coding", "source coding", "error exponent", "coding theorem"],
      },
      {
        id: "information_measures",
        label: "information measures and data processing",
        terms: ["mutual information", "information bottleneck", "data processing inequality", "sufficiency", "entropy"],
      },
    ],
    baselineQueries: {
      days: [
        "rate-distortion semantic compression side information",
        "finite blocklength channel coding error exponent",
        "information bottleneck data processing inequality",
      ],
      months: [
        "rate-distortion-perception Gaussian sources",
        "task-oriented compression semantic communication",
        "joint source channel coding finite blocklength",
      ],
      years: [
        "rate-distortion theory source coding foundations",
        "mutual information sufficiency data processing inequality",
        "information bottleneck coding theorem",
      ],
    },
    positives: [
      {
        title: "Rate-Distortion-Perception Tradeoff for Gaussian Vector Sources",
        facet: "rate_distortion",
        liveCheck: true,
      },
      {
        title: "On the Computation of the Gaussian Rate-Distortion-Perception Function",
        aliases: ["On the Computation of the Gaussian Rate–Distortion–Perception Function"],
        facet: "rate_distortion",
        liveCheck: true,
      },
      {
        title: "Semantic Compression with Side Information: A Rate-Distortion Perspective",
        facet: "semantic_task",
        liveCheck: true,
      },
      {
        title: "On Information and Sufficiency",
        facet: "information_measures",
        liveCheck: true,
      },
      {
        title: "Rate-Distortion Limits for Task-Oriented Compression with Side Information",
        facet: "semantic_task",
        liveCheck: false,
      },
      {
        title: "The Information Bottleneck Method",
        facet: "information_measures",
        liveCheck: false,
      },
      {
        title: "Channel Coding Rate in the Finite Blocklength Regime",
        facet: "coding_limits",
        liveCheck: false,
      },
      {
        title: "Finite-Blocklength Information Theory",
        facet: "coding_limits",
        liveCheck: false,
      },
      {
        title: "Strong Data Processing Inequalities and Phi-Sobolev Inequalities for Discrete Channels",
        aliases: ["Strong Data Processing Inequalities and Φ-Sobolev Inequalities for Discrete Channels"],
        facet: "information_measures",
        liveCheck: false,
      },
      {
        title: "The CEO Problem",
        facet: "rate_distortion",
        liveCheck: false,
      },
    ],
    hardNegatives: [
      { title: "Gradient-based learning applied to document recognition", reason: "computer vision, not the configured information-theory problem" },
      { title: "Feature Squeezing: Detecting Adversarial Examples in Deep Neural Networks", reason: "adversarial machine learning" },
      { title: "Deep learning for object detection and scene perception in self-driving cars: Survey, challenges, and open issues", reason: "computer-vision survey" },
      { title: "Consensus on circulatory shock and hemodynamic monitoring", reason: "clinical guideline" },
      { title: "Highly accurate protein structure prediction with AlphaFold", reason: "protein structure prediction" },
    ],
    exclusionSignals: [
      "clinical guideline", "patient", "intensive care", "object detection", "self-driving car", "adversarial example", "document recognition",
      "veterinary", "case report", "tapir", "gas chamber", "hydrogen delivery", "protein structure", "alphafold",
    ],
  },
  applied_mathematics: {
    label: "Applied mathematics & analysis",
    facets: [
      {
        id: "optimal_transport",
        label: "optimal transport and Wasserstein geometry",
        terms: ["optimal transport", "optimal transportation", "wasserstein", "monge ampere", "monge-ampere"],
      },
      {
        id: "functional_inequalities",
        label: "functional inequalities and concentration",
        terms: ["functional inequality", "log sobolev", "log-sobolev", "poincare inequality", "concentration inequality", "isoperimetry"],
      },
      {
        id: "stochastic_localization",
        label: "stochastic localization and high-dimensional geometry",
        terms: ["stochastic localization", "kls conjecture", "kannan lovasz simonovits", "logconcave", "log-concave"],
      },
      {
        id: "pde_diffusion",
        label: "PDE, diffusion, and variational methods",
        terms: ["partial differential equation", "elliptic equation", "parabolic equation", "fokker planck", "fokker-planck", "langevin diffusion", "gradient flow"],
      },
    ],
    baselineQueries: {
      days: [
        "stochastic localization KLS isoperimetry concentration",
        "Wasserstein gradient flow Fokker-Planck log-Sobolev",
        "optimal transport stability elliptic parabolic inverse problems",
      ],
      months: [
        "functional inequalities stochastic localization log-concave",
        "optimal transport Wasserstein stability partial differential equations",
        "Langevin diffusion sampling log-Sobolev inequality",
      ],
      years: [
        "Eldan stochastic localization KLS conjecture",
        "optimal transportation controlled stochastic dynamics",
        "free boundaries optimal transport Monge-Ampere",
      ],
    },
    positives: [
      {
        title: "Eldan's Stochastic Localization and the KLS Conjecture: Isoperimetry, Concentration and Mixing",
        aliases: ["Eldan’s Stochastic Localization and the KLS Conjecture: Isoperimetry, Concentration and Mixing"],
        facet: "stochastic_localization",
        liveCheck: true,
      },
      {
        title: "An Almost Constant Lower Bound of the Isoperimetric Coefficient in the KLS Conjecture",
        facet: "stochastic_localization",
        liveCheck: true,
      },
      {
        title: "Optimal transportation under controlled stochastic dynamics",
        facet: "optimal_transport",
        liveCheck: true,
      },
      {
        title: "Free boundaries in optimal transport and Monge-Ampere obstacle problems",
        aliases: ["Free boundaries in optimal transport and Monge–Ampère obstacle problems"],
        facet: "optimal_transport",
        liveCheck: true,
      },
      {
        title: "A note on Talagrand's transportation inequality and logarithmic Sobolev inequality",
        aliases: ["A note on Talagrand’s transportation inequality and logarithmic Sobolev inequality"],
        facet: "functional_inequalities",
        liveCheck: true,
      },
      {
        title: "The Brunn-Minkowski inequality",
        facet: "functional_inequalities",
        liveCheck: false,
      },
      {
        title: "A User's Guide to Optimal Transport",
        aliases: ["A User’s Guide to Optimal Transport"],
        facet: "optimal_transport",
        liveCheck: false,
      },
      {
        title: "Euclidean, metric, and Wasserstein gradient flows: an overview",
        aliases: ["{Euclidean, metric, and Wasserstein} gradient flows: an overview"],
        facet: "pde_diffusion",
        liveCheck: false,
      },
      {
        title: "Gaussian Cooling and Dikin Walks: The Interior-Point Method for Logconcave Sampling",
        facet: "stochastic_localization",
        liveCheck: false,
      },
      {
        title: "Reducing Isotropy and Volume to KLS: Faster Rounding and Volume Algorithms",
        facet: "stochastic_localization",
        liveCheck: false,
      },
    ],
    hardNegatives: [
      { title: "Stochastic resonance", reason: "broad physics match without the configured mathematical route" },
      { title: "Artificial Brownian motors: Controlling transport on the nanoscale", reason: "nanophysics transport" },
      { title: "Optimal Signal Processing in Small Stochastic Biochemical Networks", reason: "biochemical network application" },
      { title: "Transport phenomena in nanofluidics", reason: "nanofluidics review" },
      { title: "Optical tomography in medical imaging", reason: "medical imaging" },
      { title: "Planning and acting in partially observable stochastic domains", reason: "AI planning rather than the configured analysis routes" },
      { title: "Stochastic Model Predictive Control: An Overview and Perspectives for Future Research", reason: "control survey rather than the configured analysis routes" },
    ],
    exclusionSignals: [
      "medical imaging", "patient", "clinical", "biochemical network", "nanofluidic", "brownian motor", "optical gas chamber",
      "veterinary", "case report", "tapir", "hydrogen delivery", "fuel supply chain", "partially observable", "model predictive control",
    ],
  },
});

export function discoveryGoldSet(profileKey) {
  return DISCOVERY_GOLD_SETS[profileKey] || null;
}
