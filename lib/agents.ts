import OpenAI from "openai";
import { z } from "zod";

import { clampScore } from "@/lib/utils";
import type { AgentKey, AgentName, AgentResult, ReputationResult, RiskLevel, WalletFacts } from "@/types/reputation";

type AgentSource = "openai" | "mock";

type AgentConfig = {
  key: AgentKey;
  agent: AgentName;
  weight: number;
  systemPrompt: string;
  input: (facts: WalletFacts) => Record<string, unknown>;
  mock: (facts: WalletFacts) => Omit<AgentResult, "key" | "agent" | "weight">;
};

const SingleAgentResponseSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  label: z.string().min(1),
  reasoning: z.string().min(1)
});

const AGENT_CONFIGS: AgentConfig[] = [
  {
    key: "trading",
    agent: "Trading Agent",
    weight: 0.25,
    systemPrompt:
      "You are GhostWallet Trading Agent for Sui mainnet. Analyze only DEX swap behavior, swap frequency, approximate trade sizing from balance changes, and observable slippage-quality hints. Detect wash trading, repetitive self-dealing, trade consistency, sophistication, and caution. Return JSON only: {\"score\":0-100,\"confidence\":0-1,\"label\":\"short label\",\"reasoning\":\"2-4 concise sentences\"}. Score 100 means excellent trading reputation.",
    input: tradingInput,
    mock: mockTradingAgent
  },
  {
    key: "defi",
    agent: "DeFi Agent",
    weight: 0.25,
    systemPrompt:
      "You are GhostWallet DeFi Agent for Sui mainnet. Analyze liquidity pool positions, lending or borrowing hints, staking records, and protocol diversity. Evaluate DeFi maturity, protocol diversity, durable LP behavior, and whether the wallet looks like mercenary farming. Return JSON only: {\"score\":0-100,\"confidence\":0-1,\"label\":\"short label\",\"reasoning\":\"2-4 concise sentences\"}. Score 100 means mature, diversified DeFi behavior.",
    input: defiInput,
    mock: mockDefiAgent
  },
  {
    key: "risk",
    agent: "Risk Agent",
    weight: 0.15,
    systemPrompt:
      "You are GhostWallet Risk Agent for Sui mainnet. Analyze transaction timing patterns, large sudden transfers, thin history, wallet age, concentration, bot-like behavior, Sybil signals, wash-trading hints, and mixer-like opacity. Return JSON only: {\"score\":0-100,\"confidence\":0-1,\"label\":\"short label\",\"reasoning\":\"2-4 concise sentences\"}. Score 100 means maximum risk and score 0 means minimal risk.",
    input: riskInput,
    mock: mockRiskAgent
  },
  {
    key: "activity",
    agent: "Activity Agent",
    weight: 0.2,
    systemPrompt:
      "You are GhostWallet Activity Agent for Sui mainnet. Analyze transaction count, active days, protocol diversity, recency, and longevity. Reward consistent, real onchain engagement over a single burst of activity. Return JSON only: {\"score\":0-100,\"confidence\":0-1,\"label\":\"short label\",\"reasoning\":\"2-4 concise sentences\"}. Score 100 means strong, consistent, long-lived activity.",
    input: activityInput,
    mock: mockActivityAgent
  },
  {
    key: "portfolio",
    agent: "Portfolio Agent",
    weight: 0.15,
    systemPrompt:
      "You are GhostWallet Portfolio Agent for Sui mainnet. Analyze token holdings, NFT count, asset diversity, SUI balance, and stablecoin ratio. Assess portfolio health, diversification, conviction, and panic-behavior risk using only supplied facts. Return JSON only: {\"score\":0-100,\"confidence\":0-1,\"label\":\"short label\",\"reasoning\":\"2-4 concise sentences\"}. Score 100 means healthy diversified portfolio behavior.",
    input: portfolioInput,
    mock: mockPortfolioAgent
  }
];

export async function analyzeWallet(facts: WalletFacts): Promise<ReputationResult> {
  const agentRuns = await runSpecializedAgents(facts);
  const agents = agentRuns.map((run) => run.result);
  const trustScore = calculateTrustScore(agents);
  const riskScore = agentByKey(agents, "risk").score;
  const archetype = deriveArchetype(facts, agents, trustScore, riskScore);
  const narrative = buildConsensusSummary(facts, agents, trustScore, riskScore, archetype);

  return {
    address: facts.address,
    facts,
    trustScore,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    archetype,
    summary: narrative,
    narrative,
    roast: buildRoast(facts, trustScore, riskScore),
    insights: buildInsights(facts, agents),
    agents,
    aiMode: getAiMode(agentRuns.map((run) => run.source)),
    analyzedAt: new Date().toISOString(),
    walrusBlobId: null,
    walrusUrl: null,
    walrusStatus: "skipped"
  };
}

async function runSpecializedAgents(facts: WalletFacts) {
  const apiKey = process.env.OPENAI_API_KEY;
  const client = apiKey ? new OpenAI({ apiKey }) : null;

  return Promise.all(
    AGENT_CONFIGS.map(async (config) => {
      if (!client) {
        return { result: normalizeAgentResult(config, config.mock(facts)), source: "mock" as AgentSource };
      }

      try {
        const result = await runOpenAiAgent(client, config, facts);
        return { result, source: "openai" as AgentSource };
      } catch {
        return { result: normalizeAgentResult(config, config.mock(facts)), source: "mock" as AgentSource };
      }
    })
  );
}

async function runOpenAiAgent(client: OpenAI, config: AgentConfig, facts: WalletFacts): Promise<AgentResult> {
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.45,
    messages: [
      {
        role: "system",
        content: config.systemPrompt
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            wallet: facts.address,
            agent: config.agent,
            dataSlice: config.input(facts),
            scoringNote:
              config.key === "risk"
                ? "Risk score is direct risk: 100 is most risky."
                : "Score is positive reputation quality: 100 is best."
          },
          null,
          2
        )
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error(`${config.agent} returned an empty response.`);
  }

  return normalizeAgentResult(config, SingleAgentResponseSchema.parse(JSON.parse(content)));
}

function normalizeAgentResult(
  config: AgentConfig,
  result: Omit<AgentResult, "key" | "agent" | "weight">
): AgentResult {
  return {
    key: config.key,
    agent: config.agent,
    weight: config.weight,
    score: clampScore(result.score),
    confidence: clampConfidence(result.confidence),
    label: result.label.slice(0, 48),
    reasoning: result.reasoning
  };
}

function calculateTrustScore(agents: AgentResult[]) {
  const trading = agentByKey(agents, "trading").score;
  const defi = agentByKey(agents, "defi").score;
  const activity = agentByKey(agents, "activity").score;
  const portfolio = agentByKey(agents, "portfolio").score;
  const riskPenaltyInverse = 100 - agentByKey(agents, "risk").score;

  return clampScore(trading * 0.25 + defi * 0.25 + activity * 0.2 + portfolio * 0.15 + riskPenaltyInverse * 0.15);
}

function tradingInput(facts: WalletFacts) {
  return {
    dexSwapCount: facts.swapCount,
    swapFrequencyPerActiveDay: facts.activeDays > 0 ? facts.swapCount / facts.activeDays : 0,
    averageTradeSizeProxySui: facts.averageBalanceChangeSui,
    largestTradeSizeProxySui: facts.largestBalanceChangeSui,
    slippagePatterns:
      "Generic Sui RPC transaction blocks do not expose exact slippage. Infer quality only from swap cadence, protocol diversity, and balance-change shape.",
    swapRelatedMoveCalls: facts.moveCalls.filter((call) => /swap|deepbook|cetus|turbos|kriya|flowx|aftermath/i.test(
      `${call.packageId} ${call.module} ${call.function}`
    )),
    recentDigestSample: facts.recentDigestSample
  };
}

function defiInput(facts: WalletFacts) {
  return {
    liquidityPoolObjectCount: facts.liquidityObjectCount,
    stakingObjectCount: facts.stakingObjectCount,
    defiMoveCallCount: facts.defiInteractionCount,
    protocolCount: facts.protocolCount,
    protocolMoveCalls: facts.moveCalls.filter((call) => /lend|borrow|stake|pool|liquidity|vault|deepbook|scallop|navi/i.test(
      `${call.packageId} ${call.module} ${call.function}`
    )),
    activeDays: facts.activeDays,
    transactionCount: facts.transactionCount
  };
}

function riskInput(facts: WalletFacts) {
  return {
    transactionCount: facts.transactionCount,
    activeDays: facts.activeDays,
    firstSeen: facts.firstSeen,
    lastSeen: facts.lastSeen,
    largeTransferCount: facts.largeTransferCount,
    largestBalanceChangeSui: facts.largestBalanceChangeSui,
    tokenTypeCount: facts.tokenTypes.length,
    distinctCounterparties: facts.distinctCounterparties,
    concentrationSignals: {
      suiBalance: facts.suiBalance,
      stablecoinRatio: facts.stablecoinRatio,
      objectCount: facts.objectCount
    },
    swapCount: facts.swapCount
  };
}

function activityInput(facts: WalletFacts) {
  return {
    transactionCount: facts.transactionCount,
    activeDays: facts.activeDays,
    firstSeen: facts.firstSeen,
    lastSeen: facts.lastSeen,
    protocolDiversity: facts.protocolCount,
    incomingTransactions: facts.incomingTransactions,
    outgoingTransactions: facts.outgoingTransactions,
    distinctCounterparties: facts.distinctCounterparties
  };
}

function portfolioInput(facts: WalletFacts) {
  return {
    suiBalance: facts.suiBalance,
    tokenHoldings: facts.tokenTypes,
    tokenTypeCount: facts.tokenTypes.length,
    nftLikeObjectCount: facts.nftLikeObjectCount,
    coinObjectCount: facts.coinObjectCount,
    assetDiversity: facts.tokenTypes.length + facts.nftLikeObjectCount,
    stablecoinRatio: facts.stablecoinRatio,
    largestBalanceChangeSui: facts.largestBalanceChangeSui
  };
}

function mockTradingAgent(facts: WalletFacts) {
  const swapSignal = Math.min(100, facts.swapCount * 12);
  const cadence = facts.activeDays > 0 ? Math.min(35, (facts.swapCount / facts.activeDays) * 18) : 0;
  const diversity = Math.min(25, facts.protocolCount * 5);

  return {
    score: clampScore(20 + swapSignal * 0.45 + cadence + diversity),
    confidence: confidenceFrom(facts.transactionCount + facts.swapCount, 70),
    label: facts.swapCount > 8 ? "Active Sui Trader" : facts.swapCount > 0 ? "Light Swap Footprint" : "No Swap Signal",
    reasoning:
      facts.swapCount > 0
        ? `Detected ${facts.swapCount} swap-like Move calls across ${facts.protocolCount} protocol surfaces. Average balance-change proxy is ${facts.averageBalanceChangeSui.toFixed(3)} SUI, so trade quality is inferred from cadence rather than exact slippage.`
        : "No swap-like Move calls were found in the sampled transaction blocks. The trading score stays conservative because DEX behavior is not visible in the current sample."
  };
}

function mockDefiAgent(facts: WalletFacts) {
  const score = facts.defiInteractionCount * 10 + facts.protocolCount * 8 + facts.liquidityObjectCount * 6 + facts.stakingObjectCount * 5;

  return {
    score: clampScore(score),
    confidence: confidenceFrom(facts.defiInteractionCount + facts.liquidityObjectCount + facts.stakingObjectCount, 45),
    label: score > 70 ? "DeFi Native" : score > 30 ? "Developing DeFi User" : "Thin DeFi Footprint",
    reasoning: `Found ${facts.defiInteractionCount} DeFi-like Move calls, ${facts.liquidityObjectCount} liquidity-like objects, and ${facts.stakingObjectCount} staking-like objects. Protocol diversity currently reads as ${facts.protocolCount}.`
  };
}

function mockRiskAgent(facts: WalletFacts) {
  const thinHistoryRisk = facts.transactionCount < 5 ? 26 : facts.transactionCount < 20 ? 12 : 0;
  const concentrationRisk = facts.tokenTypes.length <= 1 ? 12 : 0;
  const burstRisk = facts.transactionCount > 12 && facts.activeDays <= 1 ? 18 : 0;
  const largeTransferRisk = Math.min(24, facts.largeTransferCount * 8);
  const diversityCredit = Math.min(18, facts.distinctCounterparties * 1.5 + facts.protocolCount * 2);

  return {
    score: clampScore(35 + thinHistoryRisk + concentrationRisk + burstRisk + largeTransferRisk - diversityCredit),
    confidence: confidenceFrom(facts.transactionCount + facts.distinctCounterparties, 90),
    label: thinHistoryRisk > 0 ? "Thin History Risk" : burstRisk > 0 ? "Burst Activity Risk" : "Moderate Risk",
    reasoning: `Risk model saw ${facts.transactionCount} transactions over ${facts.activeDays} active days, ${facts.largeTransferCount} large transfer signals, and ${facts.distinctCounterparties} counterparties. Higher counterparty and protocol diversity reduces the risk penalty.`
  };
}

function mockActivityAgent(facts: WalletFacts) {
  const score = facts.transactionCount * 1.4 + facts.activeDays * 8 + facts.protocolCount * 5 + facts.distinctCounterparties * 2;

  return {
    score: clampScore(score),
    confidence: confidenceFrom(facts.transactionCount + facts.activeDays, 80),
    label: score > 75 ? "Consistent Operator" : score > 35 ? "Active Explorer" : "Quiet Wallet",
    reasoning: `Activity includes ${facts.transactionCount} sampled transactions, ${facts.activeDays} active days, and ${facts.protocolCount} protocol surfaces. Last sampled activity is ${facts.lastSeen ?? "not timestamped"}.`
  };
}

function mockPortfolioAgent(facts: WalletFacts) {
  const balanceScore = Math.min(35, Math.log10(facts.suiBalance + 1) * 18);
  const diversityScore = Math.min(45, facts.tokenTypes.length * 6 + facts.nftLikeObjectCount * 1.5);
  const stablecoinBalance = Math.min(12, facts.stablecoinRatio * 24);

  return {
    score: clampScore(12 + balanceScore + diversityScore + stablecoinBalance),
    confidence: confidenceFrom(facts.coinObjectCount + facts.objectCount, 80),
    label: facts.nftLikeObjectCount > 15 ? "Collector Portfolio" : facts.tokenTypes.length > 4 ? "Diversified Holdings" : "Concentrated Holdings",
    reasoning: `Portfolio sample shows ${facts.suiBalance.toFixed(3)} SUI, ${facts.tokenTypes.length} token types, ${facts.nftLikeObjectCount} NFT-like objects, and a ${(facts.stablecoinRatio * 100).toFixed(0)}% stablecoin-type ratio.`
  };
}

function buildConsensusSummary(
  facts: WalletFacts,
  agents: AgentResult[],
  trustScore: number,
  riskScore: number,
  archetype: string
) {
  const strongest = agents
    .filter((agent) => agent.key !== "risk")
    .sort((a, b) => b.score - a.score)[0];
  const risk = agentByKey(agents, "risk");

  return `${facts.address} resolves to ${articleFor(archetype)} ${archetype} with a consensus trust score of ${trustScore}. The strongest signal is ${strongest.agent.toLowerCase()} (${strongest.score}/100, ${strongest.label}), while risk lands at ${riskScore}/100 (${risk.label}). The final trust score uses Trading 25%, DeFi 25%, Activity 20%, Portfolio 15%, and a 15% inverse-risk penalty.`;
}

function buildInsights(facts: WalletFacts, agents: AgentResult[]) {
  return [
    `${facts.suiBalance.toFixed(4)} SUI available in the main SUI balance.`,
    `${facts.swapCount} swap-like and ${facts.defiInteractionCount} DeFi-like Move calls detected in the sampled transaction blocks.`,
    `${facts.distinctCounterparties} distinct counterparties and ${facts.protocolCount} protocol surfaces inferred from recent metadata.`,
    ...agents.slice(0, 3).map((agent) => `${agent.agent}: ${agent.label} with ${(agent.confidence * 100).toFixed(0)}% confidence.`)
  ];
}

function buildRoast(facts: WalletFacts, trustScore: number, riskScore: number) {
  if (facts.transactionCount === 0) {
    return "This wallet is so quiet the blockchain had to check if its microphone was on.";
  }

  if (riskScore > 70) {
    return "This wallet moves with the subtlety of a trading bot wearing a fake mustache.";
  }

  if (trustScore > 80) {
    return "Annoyingly respectable. Even the risk engine had to sit down and behave.";
  }

  return `This wallet has ${facts.objectCount} sampled objects and still gives off "I know a shortcut" energy.`;
}

function deriveArchetype(facts: WalletFacts, agents: AgentResult[], trustScore: number, riskScore: number) {
  if (riskScore >= 75) return "Bot Suspect";
  if (facts.transactionCount <= 1 || agentByKey(agents, "activity").score < 18) return "Dormant Wallet";
  if (facts.suiBalance >= 10_000 && facts.protocolCount >= 3) return "Governance Whale";
  if (facts.nftLikeObjectCount >= 15) return "NFT Collector";

  const strongest = agents
    .filter((agent) => agent.key !== "risk")
    .sort((a, b) => b.score - a.score)[0];

  if (strongest.key === "defi" && strongest.score >= 55) return "DeFi Native";
  if (strongest.key === "trading" && strongest.score >= 55) return "Power Trader";
  if (trustScore >= 75 && agentByKey(agents, "activity").score >= 65) return "Rising Star";
  return "Diversified User";
}

function getAiMode(sources: AgentSource[]): ReputationResult["aiMode"] {
  const openAiCount = sources.filter((source) => source === "openai").length;
  if (openAiCount === sources.length) return "openai";
  if (openAiCount === 0) return "mock";
  return "hybrid";
}

function getRiskLevel(riskScore: number): RiskLevel {
  if (riskScore >= 76) return "Critical";
  if (riskScore >= 56) return "High";
  if (riskScore >= 32) return "Moderate";
  return "Low";
}

function agentByKey(agents: AgentResult[], key: AgentKey) {
  const agent = agents.find((candidate) => candidate.key === key);
  if (!agent) {
    throw new Error(`Missing ${key} agent result.`);
  }

  return agent;
}

function confidenceFrom(signalCount: number, fullConfidenceAt: number) {
  return clampConfidence(0.35 + Math.min(0.6, signalCount / fullConfidenceAt));
}

function clampConfidence(confidence: number) {
  return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
}

function articleFor(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
