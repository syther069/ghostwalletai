import { Activity, Coins, Fingerprint, Flame, Layers3, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

import { AgentBreakdown } from "@/components/agent-breakdown";
import { ReputationScore } from "@/components/reputation-score";
import { ScoreCard } from "@/components/score-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAddress } from "@/lib/utils";
import type { ReputationResult } from "@/types/reputation";

const riskVariants = {
  Low: "success",
  Moderate: "warning",
  High: "danger",
  Critical: "danger"
} as const;

export function ResultsDashboard({ result }: { result: ReputationResult }) {
  return (
    <section className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="glass-panel scanline relative overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-white">Live Reputation</CardTitle>
              <Badge variant={result.aiMode === "openai" ? "default" : "secondary"}>
                {result.aiMode === "openai" ? "AI" : "Mock AI"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <ReputationScore score={result.trustScore} />
            <div className="text-center">
              <Badge variant={riskVariants[result.riskLevel]}>{result.riskLevel} risk</Badge>
              <p className="mt-3 break-all text-sm text-muted-foreground">{formatAddress(result.address)}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <ScoreCard title="Risk Score" value={result.riskScore} detail="100 means highest risk." tone="pink" />
            <ScoreCard
              title="SUI Balance"
              value={result.facts.suiBalance.toFixed(3)}
              detail="Fetched from Sui mainnet."
              tone="cyan"
            />
            <ScoreCard
              title="Activity"
              value={result.facts.transactionCount}
              detail={`${result.facts.activeDays} active day samples.`}
              tone="green"
            />
          </div>

          <Card className="glass-panel">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  {result.archetype}
                </CardTitle>
                <Badge variant="default">Consensus</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5">
              <p className="text-base leading-7 text-white/88">{result.summary}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {result.insights.map((insight) => (
                  <div key={insight} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-muted-foreground">
                    {insight}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-primary" />
              Agent Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgentBreakdown agents={result.agents} />
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Flame className="h-5 w-5 text-accent" />
                Roast
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold leading-7 text-white">{result.roast}</p>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-white">Chain Facts</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <Fact icon={Coins} label="Coin objects" value={result.facts.coinObjectCount} />
              <Fact icon={Layers3} label="Owned objects sampled" value={result.facts.objectCount} />
              <Fact icon={Activity} label="Counterparties" value={result.facts.distinctCounterparties} />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  value
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}
