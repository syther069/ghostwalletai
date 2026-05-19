import { NextRequest, NextResponse } from "next/server";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import type { AgentResult, AgentSuite, ReputationResult, WalletData } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SUI_RPC          = process.env.SUI_RPC_URL ?? getFullnodeUrl("mainnet");
const WALRUS_PUBLISHER = process.env.WALRUS_PUBLISHER_URL ?? "https://publisher.walrus-testnet.walrus.space";
const MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

const suiClient = new SuiClient({ url: SUI_RPC });
import Groq from "groq-sdk";
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY ?? "",
});
// ─────────────────────────────────────────────────────────────────────────────
// Extended wallet features
// ─────────────────────────────────────────────────────────────────────────────

interface WalletFeatures {
  walletAge: number;
  txCount: number;
  recentTxCount: number;
  suiBalance: number;
  ownedObjectCount: number;
  activeDays: number;
  dormancyDays: number;
  avgTxPerActiveDay: number;
  uniquePackages: number;
  uniqueAssets: number;
  nftCount: number;
  stablecoinCount: number;
  swapCount: number;
  transferCount: number;
  largeTransferCount: number;
  defiInteractionCount: number;
  stakingActivity: boolean;
  tokenDiversityScore: number;
  protocolDiversityScore: number;
  activityConsistencyScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic signals
// ─────────────────────────────────────────────────────────────────────────────

const DEFI_KEYWORDS = [
  "swap", "exchange", "trade", "pool", "lend", "borrow",
  "stake", "vault", "liquidity", "farm", "yield",
];

const STABLECOIN_TYPES = ["USDC", "USDT", "BUSD", "DAI", "SUSD"];

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — Rich feature extraction
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWalletData(
  address: string
): Promise<WalletData & { features: WalletFeatures }> {

  const [balanceResult, txResult, objectsResult, allCoinsResult] =
    await Promise.allSettled([
      suiClient.getBalance({ owner: address }),
      suiClient.queryTransactionBlocks({
        filter: { FromAddress: address },
        options: { showInput: true, showEffects: true, showObjectChanges: true },
        limit: 50,
        order: "descending",
      }),
      suiClient.getOwnedObjects({
        owner: address,
        options: { showType: true, showContent: false },
        limit: 50,
      }),
      suiClient.getAllBalances({ owner: address }),
    ]);

  // ── Balance ───────────────────────────────────────────────────────────────
  const suiBalance =
    balanceResult.status === "fulfilled"
      ? Number(balanceResult.value.totalBalance) / 1_000_000_000
      : 0;

  // ── Transactions ──────────────────────────────────────────────────────────
  const txs =
    txResult.status === "fulfilled" ? txResult.value.data : [];
  const txCount = txs.length;

  const timestamps = txs
    .map((tx) => Number(tx.timestampMs ?? 0))
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  const now = Date.now();
  const oldestTs = timestamps.length > 0 ? timestamps[0] : now;
  const walletAge = (now - oldestTs) / 86_400_000;

  const recentTxCount = timestamps.filter(
    (t) => t > now - 30 * 86_400_000
  ).length;

  const activeDaySet = new Set(
    timestamps.map((t) => new Date(t).toISOString().slice(0, 10))
  );
  const activeDays = activeDaySet.size;

  let dormancyDays = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = (timestamps[i] - timestamps[i - 1]) / 86_400_000;
    if (gap > dormancyDays) dormancyDays = gap;
  }

  const avgTxPerActiveDay =
    activeDays > 0
      ? Math.round((txCount / activeDays) * 10) / 10
      : 0;

  // ── Package & behaviour analysis ─────────────────────────────────────────
  const packageSet = new Set<string>();
  let swapCount = 0;
  let transferCount = 0;
  let largeTransferCount = 0;
  let defiInteractionCount = 0;

  for (const tx of txs) {
    const input = tx.transaction?.data?.transaction;
    if (input && "transactions" in input) {
      for (const cmd of (input as { transactions: unknown[] }).transactions) {
        const move = cmd as Record<string, unknown>;

        if (move.MoveCall) {
          const call = move.MoveCall as Record<string, string>;
          const pkg = call.package ?? "";
          if (pkg) packageSet.add(pkg);

          const target =
            `${pkg}::${call.module ?? ""}::${call.function ?? ""}`.toLowerCase();

          if (DEFI_KEYWORDS.some((k) => target.includes(k))) {
            defiInteractionCount++;
            if (
              target.includes("swap") ||
              target.includes("exchange") ||
              target.includes("trade")
            ) {
              swapCount++;
            }
          }
        }

        if ((cmd as Record<string, unknown>).TransferObjects) {
          transferCount++;
        }

        if ((cmd as Record<string, unknown>).SplitCoins) {
          largeTransferCount++;
        }
      }
    }
  }

  const uniquePackages = packageSet.size;

  // ── Owned objects ─────────────────────────────────────────────────────────
  const objects =
    objectsResult.status === "fulfilled" ? objectsResult.value.data : [];
  const ownedObjectCount = objects.length;

  let nftCount = 0;
  let stablecoinCount = 0;
  let stakingActivity = false;
  const stakingKeywords = ["staking", "validator", "stake", "delegation"];

  for (const obj of objects) {
    const type = obj.data?.type ?? "";
    if (!type) continue;
    const typeLower = type.toLowerCase();

    if (
      !typeLower.includes("::coin::") &&
      !typeLower.includes("0x2::") &&
      !typeLower.includes("0x3::") &&
      type.includes("::")
    ) {
      nftCount++;
    }

    if (STABLECOIN_TYPES.some((s) => typeLower.includes(s.toLowerCase()))) {
      stablecoinCount++;
    }

    if (stakingKeywords.some((k) => typeLower.includes(k))) {
      stakingActivity = true;
    }
  }

  // ── Asset diversity ───────────────────────────────────────────────────────
  const allCoins =
    allCoinsResult.status === "fulfilled" ? allCoinsResult.value : [];
  const uniqueAssets = allCoins.length;

  // ── Computed diversity scores ─────────────────────────────────────────────
  const tokenDiversityScore = Math.min(
    100,
    Math.round(
      uniqueAssets === 0
        ? 0
        : uniqueAssets === 1
        ? 10
        : uniqueAssets < 5
        ? 10 + (uniqueAssets - 1) * 7
        : uniqueAssets < 15
        ? 38 + (uniqueAssets - 5) * 4
        : Math.min(100, 78 + (uniqueAssets - 15) * 2)
    )
  );

  const protocolDiversityScore = Math.min(
    100,
    Math.round(
      uniquePackages === 0
        ? 0
        : uniquePackages < 3
        ? uniquePackages * 5
        : uniquePackages < 10
        ? 10 + (uniquePackages - 3) * 7
        : Math.min(95, 59 + (uniquePackages - 10) * 3)
    )
  );

  const expectedDays = Math.min(walletAge, 365);
  const activityConsistencyScore =
    expectedDays > 0
      ? Math.min(100, Math.round((activeDays / expectedDays) * 150))
      : 0;

  const features: WalletFeatures = {
    walletAge:               Math.round(walletAge),
    txCount,
    recentTxCount,
    suiBalance,
    ownedObjectCount,
    activeDays,
    dormancyDays:            Math.round(dormancyDays),
    avgTxPerActiveDay,
    uniquePackages,
    uniqueAssets,
    nftCount,
    stablecoinCount,
    swapCount,
    transferCount,
    largeTransferCount,
    defiInteractionCount,
    stakingActivity,
    tokenDiversityScore,
    protocolDiversityScore,
    activityConsistencyScore,
  };

  const rawSummary = [
    `Wallet: ${address}`,
    `Age: ${features.walletAge}d | Balance: ${suiBalance.toFixed(2)} SUI`,
    `Txs: ${txCount} total, ${recentTxCount} last 30d`,
    `Active days: ${activeDays} | Avg tx/day: ${avgTxPerActiveDay} | Max dormancy: ${features.dormancyDays}d`,
    `Unique packages: ${uniquePackages} | Unique assets: ${uniqueAssets}`,
    `NFTs: ${nftCount} | Stablecoins: ${stablecoinCount} | Staking: ${stakingActivity}`,
    `Swaps: ${swapCount} | DeFi interactions: ${defiInteractionCount}`,
    `Token diversity: ${tokenDiversityScore}/100 | Protocol diversity: ${protocolDiversityScore}/100`,
    `Activity consistency: ${activityConsistencyScore}/100`,
  ].join("\n");

  return {
    address,
    suiBalance,
    txCount,
    ownedObjectCount,
    oldestTxAge: Math.round(walletAge),
    recentTxCount,
    rawSummary,
    features,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — Deterministic scoring functions
// These replace AI as the source of numerical scores.
// Designed to spread: dormant=5–25, new=25–50, normal=50–70, power=70–90, elite=90–100
// ─────────────────────────────────────────────────────────────────────────────

function computeActivityBaseScore(f: WalletFeatures): number {
  let s = 0;

  // Transaction volume (0–30)
  s += f.txCount === 0       ? 0
     : f.txCount < 5        ? 5
     : f.txCount < 20       ? 12
     : f.txCount < 100      ? 20
     : f.txCount < 500      ? 27
     :                        30;

  // Wallet age (0–20)
  s += f.walletAge < 7       ? 0
     : f.walletAge < 30      ? 5
     : f.walletAge < 90      ? 10
     : f.walletAge < 180     ? 15
     :                         20;

  // Recency / freshness (0–20)
  s += f.recentTxCount === 0  ? 0
     : f.recentTxCount < 3   ? 5
     : f.recentTxCount < 10  ? 12
     : f.recentTxCount < 30  ? 17
     :                         20;

  // Consistency (0–20)
  s += Math.round(f.activityConsistencyScore * 0.20);

  // Protocol breadth bonus (0–10)
  s += Math.min(10, Math.round(f.protocolDiversityScore * 0.10));

  // Dormancy penalty
  if (f.dormancyDays > 180)      s -= 10;
  else if (f.dormancyDays > 90)  s -= 5;
  else if (f.dormancyDays > 60)  s -= 2;

  return Math.max(5, Math.min(100, s));
}

function computePortfolioBaseScore(f: WalletFeatures): number {
  let s = 0;

  // SUI balance (0–25)
  s += f.suiBalance === 0         ? 0
     : f.suiBalance < 1           ? 3
     : f.suiBalance < 10          ? 8
     : f.suiBalance < 100         ? 15
     : f.suiBalance < 1000        ? 21
     :                              25;

  // Token diversity (0–30)
  s += Math.round(f.tokenDiversityScore * 0.30);

  // NFT holdings (0–15)
  s += f.nftCount === 0      ? 0
     : f.nftCount < 5        ? 5
     : f.nftCount < 20       ? 10
     :                         15;

  // Stablecoin presence (0–10)
  if (f.stablecoinCount > 0) s += 10;

  // Staking (0–10)
  if (f.stakingActivity) s += 10;

  // Object count (0–10)
  s += f.ownedObjectCount > 50 ? 10
     : f.ownedObjectCount > 20 ? 7
     : f.ownedObjectCount > 5  ? 4
     :                            0;

  return Math.max(5, Math.min(100, s));
}

function computeTradingBaseScore(f: WalletFeatures): number {
  let s = 0;

  // Swap count (0–40)
  s += f.swapCount === 0       ? 0
     : f.swapCount < 5         ? 10
     : f.swapCount < 20        ? 20
     : f.swapCount < 50        ? 30
     : f.swapCount < 200       ? 37
     :                           40;

  // Protocol diversity as DEX diversity proxy (0–30)
  s += Math.round(f.protocolDiversityScore * 0.30);

  // Wallet age as sophistication signal (0–15)
  s += f.walletAge > 365      ? 15
     : f.walletAge > 180      ? 10
     : f.walletAge > 90       ? 5
     :                          0;

  // Large transfer penalty (potential wash trading)
  if (f.largeTransferCount > 10)     s -= 10;
  else if (f.largeTransferCount > 5) s -= 5;

  // Hard cap for genuinely inactive traders
  if (f.swapCount === 0 && f.txCount < 5) s = Math.min(s, 15);

  return Math.max(5, Math.min(100, s));
}

function computeRiskBaseScore(f: WalletFeatures): number {
  // HIGH score = LOW risk
  let s = 70;

  // Thin history (biggest risk signal)
  if (f.txCount === 0)      s -= 40;
  else if (f.txCount < 5)  s -= 25;
  else if (f.txCount < 10) s -= 15;

  // Very new wallet
  if (f.walletAge < 7)       s -= 20;
  else if (f.walletAge < 30) s -= 10;

  // Bot heuristic: high tx count + zero diversity
  if (f.txCount > 50 && f.uniquePackages < 3) s -= 20;

  // Suspicious large transfers + no diversity
  if (f.largeTransferCount > 5 && f.uniquePackages < 2) s -= 15;

  // Trust signals (add back)
  if (f.walletAge > 180)      s += 10;
  if (f.stakingActivity)      s += 8;
  if (f.uniquePackages > 5)   s += 7;
  if (f.activeDays > 30)      s += 5;
  if (f.stablecoinCount > 0)  s += 5;

  // Abandoned after activity
  if (f.dormancyDays > 180 && f.txCount > 20) s -= 10;

  return Math.max(5, Math.min(100, s));
}

function computeDefiBaseScore(f: WalletFeatures): number {
  let s = 0;

  // DeFi interactions (0–35)
  s += f.defiInteractionCount === 0    ? 0
     : f.defiInteractionCount < 5      ? 10
     : f.defiInteractionCount < 20     ? 20
     : f.defiInteractionCount < 50     ? 28
     :                                   35;

  // Protocol diversity (0–30)
  s += Math.round(f.protocolDiversityScore * 0.30);

  // Staking (0–15)
  if (f.stakingActivity) s += 15;

  // Stablecoins (0–10)
  s += f.stablecoinCount > 3      ? 10
     : f.stablecoinCount > 0      ? 5
     :                              0;

  // Swaps (0–10)
  s += f.swapCount > 20     ? 10
     : f.swapCount > 5      ? 6
     : f.swapCount > 0      ? 3
     :                        0;

  // Hard floor for zero DeFi activity
  if (
    f.defiInteractionCount === 0 &&
    f.swapCount === 0 &&
    !f.stakingActivity
  ) {
    s = Math.min(s, 15);
  }

  return Math.max(5, Math.min(100, s));
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — AI as explanation engine only
// AI receives the deterministic score + features and explains WHY.
// It NEVER generates or changes the score.
// ─────────────────────────────────────────────────────────────────────────────

const EXPLANATION_SYSTEM =
  "You explain wallet reputation scores using only the exact metrics provided. " +
  "You never change, question, or override the score. " +
  "Return only raw JSON with no markdown or code fences.";

function buildExplanationPrompt(
  key: keyof AgentSuite,
  score: number,
  f: WalletFeatures
): string {
  const context: Record<keyof AgentSuite, string> = {
    trading:
      `Trading score: ${score}/100\n` +
      `Swaps: ${f.swapCount} | Packages: ${f.uniquePackages} | Age: ${f.walletAge}d | Large transfers: ${f.largeTransferCount}\n` +
      `Protocol diversity: ${f.protocolDiversityScore}/100`,

    defi:
      `DeFi score: ${score}/100\n` +
      `DeFi interactions: ${f.defiInteractionCount} | Protocols: ${f.uniquePackages} | Staking: ${f.stakingActivity}\n` +
      `Stablecoins: ${f.stablecoinCount} | Swaps: ${f.swapCount} | Protocol diversity: ${f.protocolDiversityScore}/100`,

    risk:
      `Risk safety score: ${score}/100 (100 = safest)\n` +
      `Txs: ${f.txCount} | Age: ${f.walletAge}d | Packages: ${f.uniquePackages}\n` +
      `Large transfers: ${f.largeTransferCount} | Active days: ${f.activeDays} | Dormancy: ${f.dormancyDays}d`,

    activity:
      `Activity score: ${score}/100\n` +
      `Txs: ${f.txCount} total, ${f.recentTxCount} last 30d | Active days: ${f.activeDays}\n` +
      `Avg tx/day: ${f.avgTxPerActiveDay} | Max dormancy: ${f.dormancyDays}d | Consistency: ${f.activityConsistencyScore}/100`,

    portfolio:
      `Portfolio score: ${score}/100\n` +
      `Balance: ${f.suiBalance.toFixed(2)} SUI | Assets: ${f.uniqueAssets} | NFTs: ${f.nftCount}\n` +
      `Stablecoins: ${f.stablecoinCount} | Staking: ${f.stakingActivity} | Token diversity: ${f.tokenDiversityScore}/100`,
  };

  return (
    `You are the ${key.charAt(0).toUpperCase() + key.slice(1)} Agent for GhostWallet Reputation on Sui.\n` +
    `${context[key]}\n\n` +
    `In 1-2 sentences, explain why this wallet received this exact score using the actual numbers above.\n` +
    `Schema: {"label":"<5 words max>","reasoning":"<1-2 sentences>","confidence":<0.70-0.95>}`
  );
}

function mockExplanation(
  key: keyof AgentSuite,
  score: number,
  f: WalletFeatures
): Omit<AgentResult, "score"> {
  const map: Record<keyof AgentSuite, Omit<AgentResult, "score">> = {
    trading: {
      confidence: 0.82,
      label: score > 60 ? "Active DEX Trader" : "Minimal Trading",
      reasoning: `${f.swapCount} swaps across ${f.uniquePackages} packages in ${f.walletAge} days.`,
    },
    defi: {
      confidence: 0.80,
      label: score > 60 ? "DeFi Engaged" : "Limited DeFi",
      reasoning: `${f.defiInteractionCount} DeFi interactions. Staking: ${f.stakingActivity}. ${f.stablecoinCount} stablecoins.`,
    },
    risk: {
      confidence: 0.85,
      label: score > 60 ? "Low Risk" : "Elevated Risk",
      reasoning: `${f.txCount} txs over ${f.walletAge} days. ${f.uniquePackages} unique packages interacted.`,
    },
    activity: {
      confidence: 0.83,
      label: score > 60 ? "Consistent User" : "Sporadic Activity",
      reasoning: `${f.activeDays} active days from ${f.txCount} transactions. Longest gap: ${f.dormancyDays} days.`,
    },
    portfolio: {
      confidence: 0.79,
      label: score > 60 ? "Diversified Portfolio" : "Sparse Holdings",
      reasoning: `${f.uniqueAssets} asset types, ${f.nftCount} NFTs, ${f.suiBalance.toFixed(1)} SUI.`,
    },
  };
  return map[key];
}

async function callExplanationAgent(
  key: keyof AgentSuite,
  deterministicScore: number,
  features: WalletFeatures
): Promise<AgentResult> {
  if (!Groq) {
    return { score: deterministicScore, ...mockExplanation(key, deterministicScore, features) };
  }

  try {
    const res = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: EXPLANATION_SYSTEM },
        { role: "user",   content: buildExplanationPrompt(key, deterministicScore, features) },
      ],
      max_tokens: 180,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as {
      label?: string;
      reasoning?: string;
      confidence?: number;
    };

    return {
      score:      deterministicScore, // ALWAYS use deterministic — never AI score
      confidence: Math.max(0.7, Math.min(0.99, parsed.confidence ?? 0.82)),
      label:      parsed.label      ?? "Analysis complete",
      reasoning:  parsed.reasoning  ?? `Score ${deterministicScore}/100 based on on-chain metrics.`,
    };
  } catch {
    return { score: deterministicScore, ...mockExplanation(key, deterministicScore, features) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 — Consensus trust score with risk gate
// ─────────────────────────────────────────────────────────────────────────────

function computeConsensus(d: Record<keyof AgentSuite, number>): number {
  const raw =
    d.trading   * 0.20 +
    d.defi      * 0.20 +
    d.activity  * 0.25 +
    d.portfolio * 0.15 +
    d.risk      * 0.20;

  // Risk gate: very risky wallets are capped
  const riskFactor =
    d.risk < 30 ? 0.6
    : d.risk < 50 ? 0.85
    : 1.0;

  return Math.max(5, Math.min(100, Math.round(raw * riskFactor)));
}

function computeRiskScore(riskAgentScore: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - riskAgentScore)));
}

function deriveArchetype(
  d: Record<keyof AgentSuite, number>,
  f: WalletFeatures,
  trust: number
): string {
  if (d.risk < 35)                                                return "Bot Suspect";
  if (trust < 20 || (f.txCount < 3 && f.suiBalance < 1))         return "Dormant Wallet";
  if (trust >= 88 && f.uniquePackages > 10)                       return "Power User";
  if (f.nftCount > 30 && d.portfolio > 70)                        return "NFT Collector";
  if (f.defiInteractionCount > 30 && d.defi > 70)                 return "DeFi Native";
  if (f.swapCount > 50 && d.trading > 70)                         return "Power Trader";
  if (f.stakingActivity && f.walletAge > 180)                     return "Governance Whale";
  if (trust < 45)                                                  return "Rising Star";

  const ranked = (
    [
      { key: "trading"   as const, label: "Power Trader"     },
      { key: "defi"      as const, label: "DeFi Native"      },
      { key: "activity"  as const, label: "Rising Star"      },
      { key: "portfolio" as const, label: "Diversified User" },
    ]
  ).sort((a, b) => d[b.key] - d[a.key]);

  return d[ranked[0].key] - d[ranked[1].key] < 8
    ? "Diversified User"
    : ranked[0].label;
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative
// ─────────────────────────────────────────────────────────────────────────────

async function generateNarrative(
  wallet: string,
  archetype: string,
  trust: number,
  risk: number,
  f: WalletFeatures
): Promise<string> {
  const fallback =
    `${wallet.slice(0, 10)}... is a ${archetype} with trust ${trust}/100. ` +
    `${f.txCount} txs over ${f.walletAge} days across ${f.uniquePackages} protocols.`;

  if (!Groq) return fallback;

  try {
    const res = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content:
            `Write a 2-sentence reputation narrative for a Sui wallet.\n` +
            `Archetype: ${archetype} | Trust: ${trust}/100 | Risk: ${risk}/100\n` +
            `Metrics: ${f.txCount} txs, ${f.walletAge}d age, ${f.uniquePackages} protocols, ` +
            `${f.swapCount} swaps, ${f.defiInteractionCount} DeFi interactions, ${f.nftCount} NFTs\n` +
            `Be specific. Use the actual numbers. No markdown.`,
        },
      ],
      max_tokens: 140,
      temperature: 0.4,
    });
    return res.choices[0]?.message?.content?.trim() ?? fallback;
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Roast engine (now uses actual feature data)
// ─────────────────────────────────────────────────────────────────────────────

function generateRoast(
  archetype: string,
  trust: number,
  f: WalletFeatures
): string {
  const map: Record<string, string> = {
    "Bot Suspect":
      `Trust ${trust}. ${f.uniquePackages} packages, ${f.txCount} txs, zero diversity. We see you.`,
    "Dormant Wallet":
      `Trust ${trust}. ${f.txCount} transactions in ${f.walletAge} days. Your wallet is in hibernation mode.`,
    "Power User":
      `Trust ${trust}. ${f.txCount} txs, ${f.uniquePackages} protocols. Suspiciously competent.`,
    "Power Trader":
      `Trust ${trust}. ${f.swapCount} swaps. Your DEX router files quarterly taxes.`,
    "DeFi Native":
      `Trust ${trust}. ${f.defiInteractionCount} DeFi interactions. Every Sui protocol knows your address.`,
    "NFT Collector":
      `Trust ${trust}. ${f.nftCount} NFTs. Either you love art or storage fees.`,
    "Governance Whale":
      `Trust ${trust}. Staking + ${f.walletAge} days old. The DAOs know your name.`,
    "Rising Star":
      `Trust ${trust}. ${f.txCount} txs and counting. Everyone starts somewhere.`,
    "Diversified User":
      `Trust ${trust}. ${f.uniqueAssets} assets, ${f.uniquePackages} protocols. Spread thin, covered wide.`,
  };
  return (
    map[archetype] ??
    `Trust ${trust}. ${f.txCount} transactions. Intriguing, in a mediocre sort of way.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Walrus
// ─────────────────────────────────────────────────────────────────────────────

async function storeOnWalrus(data: object): Promise<string | null> {
  try {
    const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    return (
      (
        json?.newlyCreated as
          | Record<string, Record<string, string>>
          | undefined
      )?.blobObject?.blobId ??
      (json?.alreadyCertified as Record<string, string> | undefined)?.blobId ??
      (json?.blobId as string | undefined) ??
      null
    );
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function isValidSuiAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(address);
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let wallet: string;
  try {
    const body = (await req.json()) as { wallet?: unknown };
    if (!body.wallet || typeof body.wallet !== "string") {
      return NextResponse.json(
        { error: "Missing wallet address" },
        { status: 400 }
      );
    }
    wallet = body.wallet.trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidSuiAddress(wallet)) {
    return NextResponse.json(
      {
        error:
          "Invalid Sui address. Expected 0x followed by 64 hex characters.",
      },
      { status: 400 }
    );
  }

  try {
    // ── Phase 1: Rich feature extraction ────────────────────────────────────
    const { features, ...walletData } = await fetchWalletData(wallet);

    // ── Phase 2: Deterministic scoring ──────────────────────────────────────
    const deterministicScores: Record<keyof AgentSuite, number> = {
      trading:   computeTradingBaseScore(features),
      defi:      computeDefiBaseScore(features),
      risk:      computeRiskBaseScore(features),
      activity:  computeActivityBaseScore(features),
      portfolio: computePortfolioBaseScore(features),
    };

    // ── Phase 3: AI explanation in parallel ─────────────────────────────────
    const [trading, defi, risk, activity, portfolio] = await Promise.all([
      callExplanationAgent("trading",   deterministicScores.trading,   features),
      callExplanationAgent("defi",      deterministicScores.defi,      features),
      callExplanationAgent("risk",      deterministicScores.risk,      features),
      callExplanationAgent("activity",  deterministicScores.activity,  features),
      callExplanationAgent("portfolio", deterministicScores.portfolio, features),
    ]);

    const agents: AgentSuite = { trading, defi, risk, activity, portfolio };

    // ── Phase 4: Consensus ───────────────────────────────────────────────────
    const trustScore = computeConsensus(deterministicScores);
    const riskScore  = computeRiskScore(deterministicScores.risk);
    const archetype  = deriveArchetype(deterministicScores, features, trustScore);

    // ── Narrative + roast ────────────────────────────────────────────────────
    const [narrative, roast] = await Promise.all([
      generateNarrative(wallet, archetype, trustScore, riskScore, features),
      Promise.resolve(generateRoast(archetype, trustScore, features)),
    ]);

    // ── Phase 5: Build result + diagnostics ─────────────────────────────────
    const result: ReputationResult = {
      wallet,
      analyzedAt: new Date().toISOString(),
      trustScore,
      riskScore,
      archetype,
      agents,
      narrative,
      roast,
      walrusBlobId: null,
    };

    // Diagnostics attached to response (not in ReputationResult type but safe to attach)
    const diagnostics = {
      scoreBreakdown:    deterministicScores,
      extractedFeatures: features,
    };

    // ── Walrus (non-fatal) ────────────────────────────────────────────────────
    result.walrusBlobId = await storeOnWalrus({ ...result, diagnostics });

    return NextResponse.json({ ...result, diagnostics }, { status: 200 });

  } catch (err) {
    console.error("[GhostWallet] /api/analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}