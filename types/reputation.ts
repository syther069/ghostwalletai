export type AgentKey = "trading" | "defi" | "risk" | "activity" | "portfolio";

export type AgentName =
  | "Trading Agent"
  | "DeFi Agent"
  | "Risk Agent"
  | "Activity Agent"
  | "Portfolio Agent";

export type RiskLevel = "Low" | "Moderate" | "High" | "Critical";

export type AgentResult = {
  key: AgentKey;
  agent: AgentName;
  score: number;
  confidence: number;
  label: string;
  reasoning: string;
  weight: number;
};

export type MoveCallFact = {
  packageId: string;
  module: string;
  function: string;
};

export type WalletFacts = {
  address: string;
  suiBalance: number;
  objectCount: number;
  coinObjectCount: number;
  nftLikeObjectCount: number;
  transactionCount: number;
  incomingTransactions: number;
  outgoingTransactions: number;
  activeDays: number;
  firstSeen: string | null;
  lastSeen: string | null;
  distinctCounterparties: number;
  tokenTypes: string[];
  recentDigestSample: string[];
  moveCalls: MoveCallFact[];
  protocolCount: number;
  swapCount: number;
  defiInteractionCount: number;
  stakingObjectCount: number;
  liquidityObjectCount: number;
  largeTransferCount: number;
  averageBalanceChangeSui: number;
  largestBalanceChangeSui: number;
  stablecoinRatio: number;
};

export type ReputationResult = {
  address: string;
  facts: WalletFacts;
  trustScore: number;
  riskScore: number;
  riskLevel: RiskLevel;
  archetype: string;
  summary: string;
  roast: string;
  insights: string[];
  agents: AgentResult[];
  aiMode: "openai" | "mock" | "hybrid";
  analyzedAt: string;
  narrative: string;
  walrusBlobId: string | null;
  walrusUrl: string | null;
  walrusStatus: "stored" | "retrieved" | "failed" | "skipped";
};

export type AnalyzeRequest = {
  address: string;
};

export type LeaderboardEntry = {
  address: string;
  blobId: string;
  trustScore: number;
  riskScore: number;
  archetype: string;
  analyzedAt: string;
  aiMode: ReputationResult["aiMode"];
};

export type WalrusAgentRecord = {
  score: number;
  confidence: number;
  label: string;
  reasoning: string;
};

export type WalrusReputationBlob = {
  wallet: string;
  analyzedAt: string;
  trustScore: number;
  riskScore: number;
  archetype: string;
  agents: Record<AgentKey, WalrusAgentRecord>;
  narrative: string;
  roast: string;
  facts: WalletFacts;
  insights: string[];
  riskLevel: RiskLevel;
  aiMode: ReputationResult["aiMode"];
};
