export type BenchmarkHorizon = "days" | "months" | "years";
export type BenchmarkRecord = {
  title: string;
  abstract?: string;
  abstractText?: string;
  venue?: string;
  expected?: "relevant" | "wrong_type" | "adjacent";
  sourceScore?: number;
};

export type DiscoveryCalibration = {
  benchmarkVersion: string;
  facetIds: string[];
  facetScore: number;
  exclusionSignals: string[];
  likelyWrongType: boolean;
  goldLabel: "relevant" | "wrong_type" | "unknown";
  priorityBoost: number;
};

export declare function normalizeBenchmarkText(value: unknown): string;
export declare function benchmarkTitleSimilarity(left: unknown, right: unknown): number;
export declare function discoveryCalibrationSignals(profileKey: string, record: BenchmarkRecord): DiscoveryCalibration;
export declare function benchmarkQueryForHorizon(profileKey: string, horizon: BenchmarkHorizon, selector?: string): string;
export declare function mergeBenchmarkQueryCoverage(profileKey: string, queries: Partial<Record<BenchmarkHorizon, string[]>>, selector?: string, limit?: number): Record<BenchmarkHorizon, string[]>;
export declare function benchmarkCalibrationPrompt(profileKey: string): string;
export declare function buildBenchmarkReplayRecords(profileKey: string): BenchmarkRecord[];
export declare function rankBenchmarkRecords(profileKey: string, records: BenchmarkRecord[]): Array<BenchmarkRecord & { benchmarkSignals: DiscoveryCalibration; benchmarkScore: number }>;
export declare function evaluateDiscoveryRanking(profileKey: string, records: BenchmarkRecord[], options?: { k?: number }): {
  profileKey: string;
  benchmarkVersion: string;
  k: number;
  metrics: { recallAtK: number; precisionAt10: number; wrongTypeRate: number; facetCoverage: number };
  gates: Record<string, boolean>;
  passed: boolean;
  ranked: Array<BenchmarkRecord & { benchmarkSignals: DiscoveryCalibration; benchmarkScore: number }>;
};

export declare const DISCOVERY_BENCHMARK_GATES: Readonly<{ recallAtK: number; precisionAt10: number; wrongTypeRate: number; facetCoverage: number }>;
export declare const DISCOVERY_BENCHMARK_VERSION: string;
export declare const DISCOVERY_GOLD_SETS: Record<string, unknown>;
