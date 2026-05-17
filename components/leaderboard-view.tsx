"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Crown, ExternalLink, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAddress } from "@/lib/utils";
import type { ReputationResult } from "@/types/reputation";

export function LeaderboardView() {
  const [entries, setEntries] = useState<ReputationResult[]>([]);

  useEffect(() => {
    const saved = JSON.parse(window.localStorage.getItem("ghostwallet:leaderboard") ?? "[]") as ReputationResult[];
    setEntries(saved.sort((a, b) => b.trustScore - a.trustScore));
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="cyber-grid absolute inset-0 opacity-50" />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-primary">Reputation index</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Leaderboard
            </h1>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Analyze wallet</Link>
          </Button>
        </header>

        {entries.length === 0 ? (
          <Card className="glass-panel">
            <CardContent className="p-8 text-center">
              <p className="text-xl font-bold text-white">No analyzed wallets yet.</p>
              <p className="mt-2 text-muted-foreground">
                Analyze a Sui wallet first, then this page ranks your real analysis results locally.
              </p>
            </CardContent>
          </Card>
        ) : (
          <section className="grid gap-4">
            {entries.map((wallet, index) => (
              <Card key={wallet.address} className="glass-panel overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                      {index === 0 ? <Crown className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                    </div>
                    <div>
                      <CardTitle className="text-lg text-white">{wallet.archetype}</CardTitle>
                      <p className="mt-1 max-w-[68ch] break-all text-sm text-muted-foreground">
                        {formatAddress(wallet.address)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={wallet.trustScore > 90 ? "success" : "secondary"}>{wallet.trustScore}</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">{wallet.summary}</p>
                  <a
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-white"
                    href={`https://suivision.xyz/account/${wallet.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on explorer <ExternalLink className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
