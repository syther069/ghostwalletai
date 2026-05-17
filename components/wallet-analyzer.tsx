"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, BarChart3, Loader2, Radar, Shield, Terminal } from "lucide-react";

import { LoadingDashboard } from "@/components/loading-dashboard";
import { ResultsDashboard } from "@/components/results-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LeaderboardEntry, ReputationResult } from "@/types/reputation";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{1,64}$/;

export function WalletAnalyzer() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<ReputationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isProbablyAddress = useMemo(() => ADDRESS_PATTERN.test(address.trim()), [address]);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isProbablyAddress) {
      setError("Paste a valid Sui address. It should start with 0x and contain hexadecimal characters.");
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Analysis failed.");
      }

      const nextResult = payload as ReputationResult;
      setResult(nextResult);
      saveLeaderboardResult(nextResult);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The analyzer hit an unknown error.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <div className="cyber-grid absolute inset-0 opacity-60" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8">
        <nav className="flex items-center justify-between gap-4 py-2">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.24em] text-white">
            <Terminal className="h-5 w-5 text-primary" />
            GhostWallet
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/leaderboard">
              <BarChart3 className="h-4 w-4" />
              Leaderboard
            </Link>
          </Button>
        </nav>

        <section className="grid min-h-[calc(100vh-7rem)] content-center gap-8 pb-8 pt-4">
          <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div className="max-w-3xl">
              <Badge variant="default" className="mb-5">Sui mainnet intelligence</Badge>
              <h1 className="text-balance text-5xl font-black tracking-tight text-white sm:text-7xl lg:text-8xl">
                GhostWallet Reputation
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                AI-powered wallet intelligence for the Sui ecosystem.
              </p>

              <form onSubmit={analyze} className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="0x..."
                  aria-label="Sui wallet address"
                  spellCheck={false}
                  className="font-mono"
                />
                <Button type="submit" size="lg" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radar className="h-5 w-5" />}
                  Analyze
                  {!isLoading && <ArrowRight className="h-5 w-5" />}
                </Button>
              </form>

              {error && (
                <div className="mt-4 rounded-md border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">Real Sui RPC</span>
                <span className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">OpenAI ready</span>
                <span className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">Mock fallback</span>
              </div>
            </div>

            <Card className="glass-panel relative overflow-hidden">
              <CardContent className="grid gap-6 p-6 sm:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.22em] text-primary">Signal preview</p>
                    <h2 className="mt-2 text-2xl font-bold text-white">Wallet telemetry</h2>
                  </div>
                  <Shield className="h-8 w-8 text-primary" />
                </div>

                <div className="grid gap-3">
                  {[
                    ["Trust score", "behavior + activity + balance"],
                    ["Risk score", "thin history + concentration + volatility"],
                    ["Archetype", "wallet personality classification"],
                    ["Roast engine", "respectfully unserious commentary"]
                  ].map(([title, detail]) => (
                    <div key={title} className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-semibold text-white">{title}</p>
                        <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_18px_hsl(var(--primary))]" />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {isLoading && <LoadingDashboard />}
          {result && <ResultsDashboard result={result} />}
        </section>
      </div>
    </main>
  );
}

function saveLeaderboardResult(result: ReputationResult) {
  const key = "ghostwallet:leaderboard";
  const current = JSON.parse(window.localStorage.getItem(key) ?? "[]") as LeaderboardEntry[];
  const entry: LeaderboardEntry = {
    address: result.address,
    trustScore: result.trustScore,
    riskScore: result.riskScore,
    archetype: result.archetype,
    analyzedAt: result.analyzedAt,
    aiMode: result.aiMode
  };
  const withoutDuplicate = current.filter((entry) => entry.address !== result.address);
  const nextEntries = [entry, ...withoutDuplicate]
    .sort((a, b) => b.trustScore - a.trustScore)
    .slice(0, 12);

  window.localStorage.setItem(key, JSON.stringify(nextEntries));
}
