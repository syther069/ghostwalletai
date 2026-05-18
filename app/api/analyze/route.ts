import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import type {
  AgentResult,
  AgentSuite,
  ReputationResult,
  WalletData,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SUI_RPC = process.env.SUI_RPC_URL ?? getFullnodeUrl("mainnet");
const WALRUS_PUBLISHER =
  process.env.WALRUS_PUBLISHER_URL ??
  "https://publisher.walrus-testnet.walrus.space";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ─────────────────────────────────────────────────────────────────────────────
// Singleton clients
// ─────────────────────────────────────────────────────────────────────────────

const suiClient = new SuiClient({ url: SUI_RPC });

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ─────────────────────────────────────────────────────────────────────────────
// Agent system prompts
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<keyof AgentSuite, string> = {
  trading: `You are the Trading Agent inside GhostWallet Reputation — an onchain reputation protocol
on the Sui blockchain. Your sole responsibility is to evaluate this wallet's DEX and
trading behaviour from the raw activity data provided.

Evaluate:
- Swap frequency and regularity
- Trade size consistency (uniform = bot signal)
- DEX diversity (single DEX = lower score)
- Wash-trading indicators (self-round-trip patterns)
- Sophistication vs noise ratio

Scoring guide:
80–100  Sophisticated, diverse, consistent trader. No red flags.
60–79   Regular activity, some gaps or concentration.
40–59   Thin or erratic trading history.
0–39    Bot-like patterns, wash trading, or near-zero activity.

YOU MUST respond with a single raw JSON object and NOTHING ELSE.
No markdown. No code fences. No explanation outside the JSON.
Schema: {"score": <integer 0-100>, "confidence": <float 0.0-1.0>, "label": "<5 words max>", "reasoning": "<1-2 sentences>"}`,

  defi: `You are the DeFi Agent inside GhostWallet Reputation — an onchain reputation protocol
on the Sui blockchain. Your sole responsibility is to evaluate DeFi protocol engagement.

Evaluate:
- Liquidity pool positions and duration (long holds = loyal LP)
- Lending / borrowing history
- Yield farming and staking presence
- Protocol diversity (1 protocol = lower score, 5+ = higher)
- Mercenary farming (deposit → immediate withdraw = penalty)

Scoring guide:
80–100  Deep, diverse, long-term DeFi engagement.
60–79   Moderate DeFi usage with some protocol diversity.
40–59   Surface-level DeFi, minimal diversity.
0–39    No meaningful DeFi activity detected.

YOU MUST respond with a single raw JSON object and NOTHING ELSE.
No markdown. No code fences. No explanation outside the JSON.
Schema: {"score": <integer 0-100>, "confidence": <float 0.0-1.0>, "label": "<5 words max>", "reasoning": "<1-2 sentences>"}`,

  risk: `You are the Risk Agent inside GhostWallet Reputation — an onchain reputation protocol
on the Sui blockchain. Your sole responsibility is to detect risky or suspicious behaviour.

IMPORTANT: A HIGH score means LOW risk (safer wallet). Score 100 = perfectly clean.

Evaluate (each lowers the score):
- Bot-like millisecond-precision transaction timing
- Sybil indicators: many wallets funded from one source
- Thin wallet history (< 10 txs = high risk)
- Sudden large transfers in/out with no prior history
- Mixer or privacy-protocol interactions
- Coordinated activity bursts

Scoring guide:
80–100  Clean wallet. Organic behaviour. No red flags.
60–79   Minor concerns — thin history or timing irregularities.
40–59   Multiple risk signals present.
0–39    Strong Sybil, bot, or wash-trade indicators.

YOU MUST respond with a single raw JSON object and NOTHING ELSE.
No markdown. No code fences. No explanation outside the JSON.
Schema: {"score": <integer 0-100>, "confidence": <float 0.0-1.0>, "label": "<5 words max>", "reasoning": "<1-2 sentences>"}`,

  activity: `You are the Activity Agent inside GhostWallet Reputation — an onchain reputation protocol
on the Sui blockchain. Your sole responsibility is to evaluate overall onchain engagement quality.

Evaluate:
- Total transaction count (raw volume signal)
- Active day spread (concentrated bursts vs consistent use)
- Wallet age vs recency of activity (old + active = higher score)
- Protocol breadth (how many distinct dApps touched)
- Dormancy periods (gaps > 90 days = penalty)

Scoring guide:
80–100  Consistent, long-running engagement across multiple protocols.
60–79   Regular user with some dormancy or protocol concentration.
40–59   Sporadic activity or very new wallet.
0–39    Near-dormant or single-purpose wallet.

YOU MUST respond with a single raw JSON object and NOTHING ELSE.
No markdown. No code fences. No explanation outside the JSON.
Schema: {"score": <integer 0-100>, "confidence": <float 0.0-1.0>, "label": "<5 words max>", "reasoning": "<1-2 sentences>"}`,

  portfolio: `You are the Portfolio Agent inside GhostWallet Reputation — an onchain reputation protocol
on the Sui blockchain. Your sole responsibility is to evaluate portfolio composition and financial health.

Evaluate:
- Token diversity (number of distinct assets held)
- SUI balance level (signal of skin-in-the-game)
- Stablecoin ratio (high = risk-aware, very high = disengaged)
- NFT holdings (signal of ecosystem participation)
- Diamond-hands vs panic-sell behaviour
- Asset quality (blue-chip vs unknown tokens)

Scoring guide:
80–100  Diversified, balanced portfolio with meaningful SUI commitment.
60–79   Reasonable holdings with some concentration.
40–59   Narrow portfolio or very low balances.
0–39    Empty or single-asset wallet.

YOU MUST respond with a single raw JSON object and NOTHING ELSE.
No markdown. No code fences. No explanation outside the JSON.
Schema: {"score": <integer 0-100>, "confidence": <float 0.0-1.0>, "label": "<5 words max>", "reasoning": "<1-2 sentences>"}`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock fallbacks (used when OpenAI is unavailable or times out)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_AGENTS: AgentSuite = {
  trading: {
    score: 68,
    confidence: 0.6,
    label: "Moderate DEX User",
    reasoning:
      "Mock data: regular swap activity detected across two DEX protocols. No wash-trading signals.",
  },
  defi: {
    score: 61,
    confidence: 0.6,
    label: "DeFi Explorer",
    reasoning:
      "Mock data: LP positions found with moderate hold durations. Some protocol diversity observed.",
  },
  risk: {
    score: 78,
    confidence: 0.7,
    label: "Low Risk",
    reasoning:
      "Mock data: transaction timing appears organic. No Sybil indicators or mixer interactions found.",
  },
  activity: {
    score: 65,
    confidence: 0.65,
    label: "Active User",
    reasoning:
      "Mock data: consistent activity over several months with no major dormancy gaps.",
  },
  portfolio: {
    score: 55,
    confidence: 0.6,
    label: "Modest Portfolio",
    reasoning:
      "Mock data: moderate SUI balance with limited token diversity and a few NFT objects.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sui RPC — fetch wallet data
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWalletData(address: string): Promise<WalletData> {
  const [balanceResult, txResult, objectsResult] = await Promise.allSettled([
    suiClient.getBalance({ owner: address }),
    suiClient.queryTransactionBlocks({
      filter: { FromAddress: address },
      options: { showInput: true, showEffects: false },
      limit: 50,
      order: "descending",
    }),
    suiClient.getOwnedObjects({
      owner: address,
      options: { showType: true },
      limit: 50,
    }),
  ]);

  // Balance
  const suiBalance =
    balanceResult.status === "fulfilled"
      ? Number(balanceResult.value.totalBalance) / 1_000_000_000
      : 0;

  // Transactions
  const txs =
    txResult.status === "fulfilled" ? txResult.value.data : [];
  const txCount = txs.length;

  // Derive oldest tx age in days
  let oldestTxAge: number | null = null;
  if (txs.length > 0) {
    const timestamps = txs
      .map((tx) => Number(tx.timestampMs ?? 0))
      .filter((t) => t > 0);
    if (timestamps.length > 0) {
      const oldest = Math.min(...timestamps);
      oldestTxAge = (Date.now() - oldest) / 86_400_000;
    }
  }

  // Recent tx count (last 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const recentTxCount = txs.filter(
    (tx) => Number(tx.timestampMs ?? 0) > thirtyDaysAgo
  ).length;

  // Owned objects
  const ownedObjectCount =
    objectsResult.status === "fulfilled"
      ? objectsResult.value.data.length
      : 0;

  // Build a human-readable summary for the agents
  const rawSummary = [
    `Wallet address: ${address}`,
    `SUI balance: ${suiBalance.toFixed(4)} SUI`,
    `Total transactions (last 50 fetched): ${txCount}`,
    `Recent transactions (last 30 days): ${recentTxCount}`,
    `Wallet age (days since oldest tx): ${oldestTxAge !== null ? Math.round(oldestTxAge) : "unknown"}`,
    `Owned objects on Sui: ${ownedObjectCount}`,
    `Data source: Sui Mainnet RPC (${SUI_RPC})`,
  ].join("\n");

  return {
    address,
    suiBalance,
    txCount,
    ownedObjectCount,
    oldestTxAge,
    recentTxCount,
    rawSummary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single agent call
// ─────────────────────────────────────────────────────────────────────────────

async function callAgent(
  agentKey: keyof AgentSuite,
  walletSummary: string
): Promise<AgentResult> {
  // Hard fallback if OpenAI not configured
  if (!openai) return MOCK_AGENTS[agentKey];

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPTS[agentKey] },
        {
          role: "user",
          content: `Analyze this Sui wallet and return your JSON verdict:\n\n${walletSummary}`,
        },
      ],
      max_tokens: 220,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as AgentResult;

    // Validate shape
    if (
      typeof parsed.score !== "number" ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.label !== "string" ||
      typeof parsed.reasoning !== "string"
    ) {
      throw new Error("Agent response failed shape validation");
    }

    // Clamp values to valid ranges
    parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

    return parsed;
  } catch {
    // Per-agent fallback — never throw, never crash the pipeline
    return MOCK_AGENTS[agentKey];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Consensus engine
// ─────────────────────────────────────────────────────────────────────────────

function computeTrustScore(agents: AgentSuite): number {
  // Weighted average — Risk acts as a safety gate (high risk = penalty)
  const raw =
    agents.trading.score  * 0.25 +
    agents.defi.score     * 0.25 +
    agents.activity.score * 0.20 +
    agents.portfolio.score* 0.15 +
    agents.risk.score     * 0.15;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

function computeRiskScore(agents: AgentSuite): number {
  // Invert risk agent: risk agent 80 (low risk) → risk score 20
  return Math.max(0, Math.min(100, Math.round(100 - agents.risk.score)));
}

function deriveArchetype(agents: AgentSuite, trustScore: number): string {
  if (agents.risk.score < 35)  return "Bot Suspect";
  if (trustScore < 20)         return "Dormant Wallet";
  if (trustScore >= 88)        return "Power User";

  const candidates: { key: keyof AgentSuite; label: string }[] = [
    { key: "trading",   label: "Power Trader"    },
    { key: "defi",      label: "DeFi Native"     },
    { key: "activity",  label: "Rising Star"     },
    { key: "portfolio", label: "Diversified User"},
  ];

  const top = candidates.reduce((best, c) =>
    agents[c.key].score > agents[best.key].score ? c : best
  );

  // Ties or close scores → Diversified User
  const topScore = agents[top.key].score;
  const closeCount = candidates.filter(
    (c) => topScore - agents[c.key].score < 10
  ).length;
  if (closeCount >= 3) return "Diversified User";

  return top.label;
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative generator
// ─────────────────────────────────────────────────────────────────────────────

async function generateNarrative(
  wallet: string,
  archetype: string,
  trustScore: number,
  riskScore: number,
  agents: AgentSuite
): Promise<string> {
  const fallback =
    `${wallet.slice(0, 10)}... is classified as a ${archetype} on the Sui ecosystem ` +
    `with a consensus trust score of ${trustScore}/100 and a risk score of ${riskScore}/100. ` +
    `Analysis spans trading behaviour, DeFi engagement, onchain activity, portfolio health, and risk patterns.`;

  if (!openai) return fallback;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You write concise, analytical 2-sentence onchain reputation narratives for Sui wallets. " +
            "Be specific, insightful, and professional. No markdown. No fluff.",
        },
        {
          role: "user",
          content: [
            `Wallet: ${wallet.slice(0, 10)}...`,
            `Archetype: ${archetype}`,
            `Trust Score: ${trustScore}/100`,
            `Risk Score: ${riskScore}/100`,
            `Trading Agent: ${agents.trading.label} (${agents.trading.score}/100) — ${agents.trading.reasoning}`,
            `DeFi Agent: ${agents.defi.label} (${agents.defi.score}/100) — ${agents.defi.reasoning}`,
            `Risk Agent: ${agents.risk.label} (${agents.risk.score}/100) — ${agents.risk.reasoning}`,
            `Activity Agent: ${agents.activity.label} (${agents.activity.score}/100) — ${agents.activity.reasoning}`,
            `Portfolio Agent: ${agents.portfolio.label} (${agents.portfolio.score}/100) — ${agents.portfolio.reasoning}`,
          ].join("\n"),
        },
      ],
      max_tokens: 160,
      temperature: 0.4,
    });

    return (
      completion.choices[0]?.message?.content?.trim() ?? fallback
    );
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Roast engine
// ─────────────────────────────────────────────────────────────────────────────

function generateRoast(archetype: string, trustScore: number): string {
  const roasts: Record<string, string> = {
    "Bot Suspect":
      `Trust score ${trustScore}. The machines are learning. Unfortunately, so are we — and we see you.`,
    "Dormant Wallet":
      `Trust score ${trustScore}. Your wallet has the energy of a screensaver from 2003. Are you okay?`,
    "Power User":
      `Trust score ${trustScore}. Impressive. Either you're genuinely elite, or you've gamed every metric perfectly. We're watching.`,
    "Power Trader":
      `Trust score ${trustScore}. You swap more than you breathe. Your DEX router has separation anxiety.`,
    "DeFi Native":
      `Trust score ${trustScore}. You've been in every pool on Sui. Your impermanent loss is probably permanent at this point.`,
    "Rising Star":
      `Trust score ${trustScore}. Baby steps. One day you'll be a real degen. Keep grinding.`,
    "Diversified User":
      `Trust score ${trustScore}. Jack of all protocols, master of none. Bold strategy — let's see if it pays off.`,
  };

  return (
    roasts[archetype] ??
    `Trust score ${trustScore}. Intriguing. In a completely mediocre sort of way.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Walrus storage
// ─────────────────────────────────────────────────────────────────────────────

async function storeOnWalrus(data: ReputationResult): Promise<string | null> {
  try {
    const response = await fetch(`${WALRUS_PUBLISHER}/v1/blobs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8_000), // 8s hard timeout
    });

    if (!response.ok) {
      console.warn(`[GhostWallet] Walrus PUT failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const result = (await response.json()) as Record<string, unknown>;

    // Walrus response can come in two shapes
    const blobId =
      (result?.newlyCreated as Record<string, unknown> | undefined)
        ?.blobObject !== undefined
        ? (
            (result.newlyCreated as Record<string, Record<string, string>>)
              .blobObject.blobId
          )
        : (result?.alreadyCertified as Record<string, string> | undefined)
            ?.blobId ??
          (result?.blobId as string | undefined) ??
          null;

    if (!blobId) {
      console.warn("[GhostWallet] Walrus response contained no blobId:", result);
    }

    return blobId ?? null;
  } catch (err) {
    console.warn("[GhostWallet] Walrus storage failed (non-fatal):", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

function isValidSuiAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(address);
}
// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Parse & validate ──────────────────────────────────────────────────────
  let wallet: string;
  try {
    const body = (await req.json()) as { wallet?: unknown };
    if (!body.wallet || typeof body.wallet !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid wallet address" },
        { status: 400 }
      );
    }
    wallet = body.wallet.trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidSuiAddress(wallet)) {
    return NextResponse.json(
      { error: "Invalid Sui address format. Expected 0x followed by 64 hex characters." },
      { status: 400 }
    );
  }

  try {
    // ── Phase 1: Fetch real Sui mainnet data ────────────────────────────────
    const walletData = await fetchWalletData(wallet);

    // ── Phase 2: Run 5 agents in parallel ──────────────────────────────────
    const [trading, defi, risk, activity, portfolio] = await Promise.all([
      callAgent("trading",   walletData.rawSummary),
      callAgent("defi",      walletData.rawSummary),
      callAgent("risk",      walletData.rawSummary),
      callAgent("activity",  walletData.rawSummary),
      callAgent("portfolio", walletData.rawSummary),
    ]);

    const agents: AgentSuite = { trading, defi, risk, activity, portfolio };

    // ── Phase 3: Consensus scoring ──────────────────────────────────────────
    const trustScore = computeTrustScore(agents);
    const riskScore  = computeRiskScore(agents);
    const archetype  = deriveArchetype(agents, trustScore);

    // ── Phase 4: Narrative & roast (parallel) ───────────────────────────────
    const [narrative, roast] = await Promise.all([
      generateNarrative(wallet, archetype, trustScore, riskScore, agents),
      Promise.resolve(generateRoast(archetype, trustScore)),
    ]);

    // ── Phase 5: Build result object ────────────────────────────────────────
    const result: ReputationResult = {
      wallet,
      analyzedAt: new Date().toISOString(),
      trustScore,
      riskScore,
      archetype,
      agents,
      narrative,
      roast,
      walrusBlobId: null, // filled in next step
    };

    // ── Phase 6: Store on Walrus (non-fatal) ────────────────────────────────
    result.walrusBlobId = await storeOnWalrus(result);

    // ── Respond ─────────────────────────────────────────────────────────────
    return NextResponse.json(result, { status: 200 });

  } catch (err) {
    console.error("[GhostWallet] Unhandled error in /api/analyze:", err);
    return NextResponse.json(
      { error: "Internal server error. Analysis failed." },
      { status: 500 }
    );
  }
}