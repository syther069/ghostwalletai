import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ScoreCardProps = {
  title: string;
  value: string | number;
  detail: string;
  tone?: "cyan" | "violet" | "pink" | "green";
};

const tones = {
  cyan: "from-cyan-300/20 text-cyan-200",
  violet: "from-violet-300/20 text-violet-200",
  pink: "from-pink-300/20 text-pink-200",
  green: "from-emerald-300/20 text-emerald-200"
};

export function ScoreCard({ title, value, detail, tone = "cyan" }: ScoreCardProps) {
  return (
    <Card className="glass-panel animate-float overflow-hidden">
      <div className={cn("h-1 bg-gradient-to-r to-transparent", tones[tone])} />
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-[0.2em] text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "break-words font-black text-white",
            typeof value === "string" && value.length > 12 ? "text-2xl leading-tight" : "text-3xl"
          )}
        >
          {value}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
