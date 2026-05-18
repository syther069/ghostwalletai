// =============================================================================
// GhostWallet Reputation — Shared Type Definitions
// =============================================================================
// Single source of truth for all types shared across the API route,
// frontend components, Walrus storage layer, and leaderboard.
// Import from: @/types
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Agent layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Output shape returned by every individual AI agent.
 * Agents: trading | defi | risk | activity | portfolio
 */
export interface AgentResult {
  /** Behavioural score 0–100. For the Risk agent, higher = safer. */
  score: number;
  /** Model confidence in this verdict, 0.0–1.0. */
  confidence: number;
  /** Short behavioural label, 5 words max. e.g. "Sophisticated Trader" */
  label: string;
  /** 1–2 sentence plain-English explanation of the score. */
  reasoning: string;
}

/**
 * The full set of five agent results produced in parallel
 * by the multi-agent consensus pipeline.
 */
export interface AgentSuite {
  trading: AgentResult;
  defi: AgentResult;
  /** Risk agent: score is inverted — 100 = perfectly safe, 0 = highly suspicious. */
  risk: AgentResult;
  activity: AgentResult;
  portfolio: AgentResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal pipeline type (backend only — not serialised to client)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intermediate wallet data assembled from Sui mainnet RPC calls.
 * Used internally by the analysis pipeline; never sent to the client.
 */
export interface WalletData {
  /** Canonical Sui wallet address (0x + 64 hex chars). */
  address: string;
  /** SUI token balance in SUI units (not MIST). */
  suiBalance: number;
  /** Total transactions fetched (capped by RPC limit). */
  txCount: number;
  /** Number of objects currently owned by this wallet. */
  ownedObjectCount: number;
  /** Days elapsed since the oldest transaction, or null if unavailable. */
  oldestTxAge: number | null;
  /** Number of transactions in the last 30 days. */
  recentTxCount: number;
  /** Pre-formatted multi-line string fed verbatim to every agent prompt. */
  rawSummary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API response — the canonical reputation result shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete reputation result returned by POST /api/analyze.
 * This is the single source of truth consumed by:
 *   - frontend result components
 *   - leaderboard storage
 *   - Walrus blob payload
 *   - SoulScore mint transaction arguments
 */
export interface ReputationResult {
  /** Canonical Sui wallet address that was analyzed. */
  wallet: string;
  /** ISO 8601 timestamp of when the analysis was run. */
  analyzedAt: string;
  /** Weighted consensus trust score 0–100. */
  trustScore: number;
  /**
   * Displayed risk score 0–100.
   * Derived by inverting the Risk agent: riskScore = 100 - risk.agent.score
   * Higher = riskier wallet.
   */
  riskScore: number;
  /**
   * Wallet personality archetype derived from agent consensus.
   * Possible values: "Power User" | "Power Trader" | "DeFi Native" |
   * "Rising Star" | "Diversified User" | "Bot Suspect" | "Dormant Wallet"
   */
  archetype: string;
  /** Individual verdicts from all five AI agents. */
  agents: AgentSuite;
  /** 2-sentence AI-generated reputation narrative. */
  narrative: string;
  /** Lighthearted roast commentary based on archetype + trust score. */
  roast: string;
  /**
   * Walrus decentralized storage blob ID for the full analysis payload.
   * null if Walrus storage was unavailable at analysis time.
   */
  walrusBlobId: string | null;
  /**
   * Sui object ID of the on-chain SoulScore after minting.
   * undefined until the user mints their SoulScore.
   */
  soulScoreObjectId?: string;
  /**
   * Whether this wallet passed zkLogin humanity verification.
   * undefined until the user completes verification.
   */
  zkVerified?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight entry stored in the leaderboard index (localStorage).
 * Subset of ReputationResult — only what the leaderboard UI needs.
 */
export interface LeaderboardEntry {
  wallet: string;
  analyzedAt: string;
  trustScore: number;
  riskScore: number;
  archetype: string;
  /** Walrus blob ID to link to full analysis. Optional if Walrus failed. */
  walrusBlobId?: string;
  /** Sui SoulScore object ID if minted. */
  soulScoreObjectId?: string;
}