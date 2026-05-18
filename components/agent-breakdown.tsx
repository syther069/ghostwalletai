import { Activity, Bot, Landmark, ShieldAlert, TrendingUp, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentResult, AgentSuite } from "@/types/reputation";

const icons = {
  trading: TrendingUp,
  defi: Landmark,
  risk: ShieldAlert,
  activity: Activity,
  portfolio: Wallet
};

export function AgentBreakdown({ agents }: { agents: AgentSuite }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Object.entries(agents).map(([key, agent]) => {
        const Icon = icons[key as keyof typeof icons] ?? Bot;

        return (
          <Card key={key} className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>

                <div>
                  <CardTitle className="text-base text-white">
                    {agent.agentName}
                  </CardTitle>

                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {key} agent
                  </p>
                </div>
              </div>

              <div className="text-2xl font-black text-primary">
                {agent.score}
              </div>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Confidence</span>

                  <span>
                    {Math.round(agent.confidence * 100)}%
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent transition-all duration-700"
                    style={{
                      width: `${Math.round(agent.confidence * 100)}%`
                    }}
                  />
                </div>
              </div>

              <p className="text-muted-foreground">
                {agent.reasoning}
              </p>

              <p className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-white/86">
                {agent.personalityObservation}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}