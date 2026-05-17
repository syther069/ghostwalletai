import type {
  AgentKey,
  AgentName,
  AgentResult,
  ReputationResult,
  WalrusReputationBlob
} from "@/types/reputation";

const WALRUS_PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space/v1/store";
const WALRUS_BLOBS_PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=5";
const WALRUS_AGGREGATOR_BASE_URL = "https://aggregator.walrus-testnet.walrus.space/v1";
const WALRUS_BLOBS_AGGREGATOR_BASE_URL = "https://aggregator.walrus-testnet.walrus.space/v1/blobs";

const AGENT_NAMES: Record<AgentKey, AgentName> = {
  trading: "Trading Agent",
  defi: "DeFi Agent",
  risk: "Risk Agent",
  activity: "Activity Agent",
  portfolio: "Portfolio Agent"
};

const AGENT_WEIGHTS: Record<AgentKey, number> = {
  trading: 0.25,
  defi: 0.25,
  risk: 0.15,
  activity: 0.2,
  portfolio: 0.15
};

export function getWalrusUrl(blobId: string) {
  return `${WALRUS_AGGREGATOR_BASE_URL}/${encodeURIComponent(blobId)}`;
}

export async function storeAnalysisOnWalrus(result: ReputationResult) {
  const blob = toWalrusBlob(result);
  const body = JSON.stringify(blob);
  const attempts = [
    {
      url: WALRUS_PUBLISHER_URL,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body
      }
    },
    {
      url: WALRUS_BLOBS_PUBLISHER_URL,
      init: {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body
      }
    }
  ];
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        ...attempt.init,
        cache: "no-store"
      });

      if (!response.ok) {
        errors.push(`${attempt.url} returned ${response.status}`);
        continue;
      }

      const payload = parseJson(await response.text());
      const blobId = extractBlobId(payload);

      if (!blobId) {
        errors.push(`${attempt.url} did not include a blobId`);
        continue;
      }

      return {
        blobId,
        url: getWalrusUrl(blobId),
        blob
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown Walrus publish error");
    }
  }

  throw new Error(errors.join("; "));
}

export async function fetchAnalysisFromWalrus(blobId: string): Promise<ReputationResult> {
  const urls = [getWalrusUrl(blobId), `${WALRUS_BLOBS_AGGREGATOR_BASE_URL}/${encodeURIComponent(blobId)}`];
  const errors: string[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        errors.push(`${url} returned ${response.status}`);
        continue;
      }

      const blob = parseJson(await response.text()) as WalrusReputationBlob;
      return fromWalrusBlob(blob, blobId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown Walrus retrieval error");
    }
  }

  throw new Error(errors.join("; "));
}

export function toWalrusBlob(result: ReputationResult): WalrusReputationBlob {
  return {
    wallet: result.address,
    analyzedAt: result.analyzedAt,
    trustScore: result.trustScore,
    riskScore: result.riskScore,
    archetype: result.archetype,
    agents: Object.fromEntries(
      result.agents.map((agent) => [
        agent.key,
        {
          score: agent.score,
          confidence: agent.confidence,
          label: agent.label,
          reasoning: agent.reasoning
        }
      ])
    ) as WalrusReputationBlob["agents"],
    narrative: result.narrative,
    roast: result.roast,
    facts: result.facts,
    insights: result.insights,
    riskLevel: result.riskLevel,
    aiMode: result.aiMode
  };
}

export function fromWalrusBlob(blob: WalrusReputationBlob, blobId: string): ReputationResult {
  const agents = (Object.entries(blob.agents) as Array<[AgentKey, WalrusReputationBlob["agents"][AgentKey]]>).map(
    ([key, agent]) => ({
      key,
      agent: AGENT_NAMES[key],
      weight: AGENT_WEIGHTS[key],
      score: agent.score,
      confidence: agent.confidence,
      label: agent.label,
      reasoning: agent.reasoning
    })
  );

  return {
    address: blob.wallet,
    facts: blob.facts,
    trustScore: blob.trustScore,
    riskScore: blob.riskScore,
    riskLevel: blob.riskLevel,
    archetype: blob.archetype,
    summary: blob.narrative,
    narrative: blob.narrative,
    roast: blob.roast,
    insights: blob.insights,
    agents: sortAgents(agents),
    aiMode: blob.aiMode,
    analyzedAt: blob.analyzedAt,
    walrusBlobId: blobId,
    walrusUrl: getWalrusUrl(blobId),
    walrusStatus: "retrieved"
  };
}

function sortAgents(agents: AgentResult[]) {
  const order: AgentKey[] = ["trading", "defi", "risk", "activity", "portfolio"];
  return [...agents].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

function extractBlobId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("blobId" in value && typeof value.blobId === "string") {
    return value.blobId;
  }

  for (const child of Object.values(value)) {
    const nested = extractBlobId(child);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Walrus response was not valid JSON.");
  }
}
