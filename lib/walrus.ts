const PUBLISHER =
  process.env.WALRUS_PUBLISHER_URL ||
  "https://publisher.walrus-testnet.walrus.space";

const AGGREGATOR =
  process.env.WALRUS_AGGREGATOR_URL ||
  "https://aggregator.walrus-testnet.walrus.space";

// ─── Store Data On Walrus ─────────────────────────────────────────────────────

export async function storeOnWalrus(data: object): Promise<string> {
  try {
    const response = await fetch(`${PUBLISHER}/v1/blobs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(
        `Walrus store failed: ${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();

    const blobId =
      result?.newlyCreated?.blobObject?.blobId ||
      result?.alreadyCertified?.blobId ||
      result?.blobId;

    if (!blobId) {
      throw new Error("No blobId returned from Walrus");
    }

    return blobId;
  } catch (error) {
    console.error("Walrus storage error:", error);
    throw error;
  }
}

// ─── Fetch Data From Walrus ───────────────────────────────────────────────────

export async function fetchFromWalrus(
  blobId: string
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(
      `${AGGREGATOR}/v1/blobs/${blobId}`
    );

    if (!response.ok) {
      throw new Error(
        `Walrus fetch failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Walrus fetch error:", error);
    throw error;
  }
}

// ─── Generate Walrus Explorer URL ────────────────────────────────────────────

export function walrusViewUrl(blobId: string): string {
  return `${AGGREGATOR}/v1/blobs/${blobId}`;
}