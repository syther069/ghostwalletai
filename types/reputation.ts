export type AgentName = "Risk Agent" | "Trading Agent" | "NFT Agent" | "Social Agent";

export type RiskLevel = "Low" | "Moderate" | "High" | "Critical";

export type AgentResult = {
  agent: AgentName;
  score: number;
  reasoning: string;
  personality: string;
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
  aiMode: "openai" | "mock";
  analyzedAt: string;
};

export type AnalyzeRequest = {
  address: string;
};
