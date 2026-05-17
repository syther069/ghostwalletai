import OpenAI from "openai";
import { z } from "zod";

import { clampScore } from "@/lib/utils";
import type { AgentResult, ReputationResult, RiskLevel, WalletFacts } from "@/types/reputation";

const AgentResponseSchema = z.object({
  agents: z.array(
    z.object({
      agent: z.enum(["Risk Agent", "Trading Agent", "NFT Agent", "Social Agent"]),
      score: z.number().min(0).max(100),
      reasoning: z.string(),
      personality: z.string()
    })
  ),
  trustScore: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  archetype: z.string(),
  summary: z.string(),
  roast: z.string(),
  insights: z.array(z.string()).min(3).max(8)
});

type AgentPayload = z.infer<typeof AgentResponseSchema>;

export async function analyzeWallet(facts: WalletFacts): Promise<ReputationResult> {
  const aiPayload = process.env.OPENAI_API_KEY
    ? await runOpenAiAgents(facts).catch(() => buildMockAnalysis(facts))
    : buildMockAnalysis(facts);

  const trustScore = clampScore(aiPayload.trustScore);
  const riskScore = clampScore(aiPayload.riskScore);

  return {
    address: facts.address,
    facts,
    trustScore,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    archetype: aiPayload.archetype,
    summary: aiPayload.summary,
    roast: aiPayload.roast,
    insights: aiPayload.insights,
    agents: aiPayload.agents.map((agent) => ({ ...agent, score: clampScore(agent.score) })),
    aiMode: process.env.OPENAI_API_KEY ? "openai" : "mock",
    analyzedAt: new Date().toISOString()
  };
}

async function runOpenAiAgents(facts: WalletFacts): Promise<AgentPayload> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.75,
    messages: [
      {
        role: "system",
        content:
          "You are GhostWallet, a Sui mainnet wallet reputation analyst. Use only the supplied facts. Return concise JSON with four agents: Risk Agent, Trading Agent, NFT Agent, Social Agent. Scores use 0 bad to 100 excellent except riskScore where 100 means highest risk. Keep the roast funny but not hateful or abusive."
      },
      {
        role: "user",
        content: JSON.stringify({ facts }, null, 2)
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  return AgentResponseSchema.parse(JSON.parse(content));
}

function buildMockAnalysis(facts: WalletFacts): AgentPayload {
  const activityScore = clampScore(Math.min(100, facts.transactionCount * 1.8 + facts.activeDays * 5));
  const balanceScore = clampScore(Math.min(100, Math.log10(facts.suiBalance + 1) * 32));
  const diversityScore = clampScore(Math.min(100, facts.tokenTypes.length * 10 + facts.distinctCounterparties * 2));
  const nftScore = clampScore(Math.min(100, facts.nftLikeObjectCount * 3 + facts.objectCount * 0.5));
  const dormantPenalty = facts.transactionCount === 0 ? 28 : facts.activeDays <= 1 ? 12 : 0;
  const concentrationRisk = facts.tokenTypes.length <= 1 ? 14 : 0;
  const riskScore = clampScore(44 + dormantPenalty + concentrationRisk - activityScore * 0.22 - diversityScore * 0.12);
  const trustScore = clampScore(100 - riskScore * 0.58 + activityScore * 0.22 + balanceScore * 0.14 + nftScore * 0.06);
  const archetype = getArchetype(facts, trustScore, riskScore);

  const agents: AgentResult[] = [
    {
      agent: "Risk Agent",
      score: clampScore(100 - riskScore),
      reasoning: `Observed ${facts.transactionCount} recent transaction references, ${facts.distinctCounterparties} counterparties, and ${facts.suiBalance.toFixed(3)} SUI.`,
      personality: riskScore > 60 ? "Moves like a wallet wearing sunglasses indoors." : "Leaves enough on-chain footprints to look accountable."
    },
    {
      agent: "Trading Agent",
      score: clampScore((activityScore + diversityScore + balanceScore) / 3),
      reasoning: `Token spread includes ${facts.tokenTypes.length} coin type${facts.tokenTypes.length === 1 ? "" : "s"} across ${facts.coinObjectCount} coin objects.`,
      personality: facts.tokenTypes.length > 4 ? "Portfolio has range, and possibly too many tabs open." : "Keeps the trading desk refreshingly simple."
    },
    {
      agent: "NFT Agent",
      score: nftScore,
      reasoning: `Detected ${facts.nftLikeObjectCount} NFT-like or non-coin owned objects in the latest owned object sample.`,
      personality: nftScore > 50 ? "Has collector energy with a side quest problem." : "Not currently screaming JPEG maximalist."
    },
    {
      agent: "Social Agent",
      score: clampScore(Math.min(100, facts.distinctCounterparties * 5 + facts.incomingTransactions * 1.5)),
      reasoning: `Recent activity shows ${facts.incomingTransactions} inbound and ${facts.outgoingTransactions} outbound transaction references.`,
      personality: facts.distinctCounterparties > 8 ? "Knows people, contracts, and probably a few bridges by name." : "Social graph is still in stealth mode."
    }
  ];

  return {
    agents,
    trustScore,
    riskScore,
    archetype,
    summary: `${facts.address} looks like ${articleFor(archetype)} ${archetype.toLowerCase()} with ${facts.transactionCount} recent Sui mainnet transaction references, ${facts.objectCount} sampled owned objects, and a ${getRiskLevel(riskScore).toLowerCase()} risk profile.`,
    roast: facts.transactionCount === 0
      ? "This wallet is so quiet the blockchain had to check if its microphone was on."
      : `This wallet has ${facts.objectCount} objects and still manages to act like it is traveling light.`,
    insights: [
      `${facts.suiBalance.toFixed(4)} SUI available in the main SUI balance.`,
      `${facts.tokenTypes.length} coin type${facts.tokenTypes.length === 1 ? "" : "s"} detected in the sampled coin inventory.`,
      `${facts.distinctCounterparties} distinct counterparties inferred from recent transaction metadata.`,
      facts.lastSeen ? `Latest sampled activity was ${new Date(facts.lastSeen).toLocaleDateString("en-US")}.` : "No timestamped recent activity was found in the sample."
    ]
  };
}

function getRiskLevel(riskScore: number): RiskLevel {
  if (riskScore >= 76) return "Critical";
  if (riskScore >= 56) return "High";
  if (riskScore >= 32) return "Moderate";
  return "Low";
}

function getArchetype(facts: WalletFacts, trustScore: number, riskScore: number) {
  if (facts.transactionCount === 0) return "Dormant Phantom";
  if (riskScore > 70) return "Volatile Shadow Trader";
  if (facts.nftLikeObjectCount > 20) return "NFT Vault Keeper";
  if (facts.tokenTypes.length > 5 && facts.distinctCounterparties > 10) return "DeFi Power User";
  if (trustScore > 82) return "Blue-Chip Operator";
  return "Curious On-Chain Wanderer";
}

function articleFor(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
