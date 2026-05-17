import { Bot, Brain, Gem, ShieldAlert, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentResult } from "@/types/reputation";

const icons = {
  "Risk Agent": ShieldAlert,
  "Trading Agent": Brain,
  "NFT Agent": Gem,
  "Social Agent": Users
};

export function AgentBreakdown({ agents }: { agents: AgentResult[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {agents.map((agent) => {
        const Icon = icons[agent.agent] ?? Bot;

        return (
          <Card key={agent.agent} className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base text-white">{agent.agent}</CardTitle>
              </div>
              <div className="text-2xl font-black text-primary">{agent.score}</div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{agent.reasoning}</p>
              <p className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-white/86">
                {agent.personality}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
