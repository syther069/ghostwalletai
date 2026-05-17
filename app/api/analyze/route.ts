import { NextResponse } from "next/server";

import { analyzeWallet } from "@/lib/agents";
import { fetchWalletFacts, validateSuiAddress } from "@/lib/sui";
import { storeAnalysisOnWalrus } from "@/lib/walrus";
import type { AnalyzeRequest } from "@/types/reputation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AnalyzeRequest>;
    const address = body.address?.trim();

    if (!address || !validateSuiAddress(address)) {
      return NextResponse.json(
        { error: "Enter a valid Sui wallet address starting with 0x." },
        { status: 400 }
      );
    }

    const facts = await fetchWalletFacts(address);
    const analysis = await analyzeWallet(facts);

    try {
      const stored = await storeAnalysisOnWalrus(analysis);

      return NextResponse.json({
        ...analysis,
        walrusBlobId: stored.blobId,
        walrusUrl: stored.url,
        walrusStatus: "stored"
      });
    } catch {
      return NextResponse.json({
        ...analysis,
        walrusStatus: "failed"
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analysis failure.";
    return NextResponse.json(
      { error: `GhostWallet could not analyze this address. ${message}` },
      { status: 500 }
    );
  }
}
