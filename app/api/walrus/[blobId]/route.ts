import { NextResponse } from "next/server";

import { fetchAnalysisFromWalrus } from "@/lib/walrus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { blobId: string } }) {
  try {
    const blobId = decodeURIComponent(params.blobId);

    if (!blobId) {
      return NextResponse.json({ error: "Missing Walrus blob ID." }, { status: 400 });
    }

    const analysis = await fetchAnalysisFromWalrus(blobId);
    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Walrus retrieval failure.";

    return NextResponse.json(
      { error: `GhostWallet could not retrieve this Walrus analysis. ${message}` },
      { status: 502 }
    );
  }
}
