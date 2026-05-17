import { cn } from "@/lib/utils";

type ReputationScoreProps = {
  score: number;
  label?: string;
  className?: string;
};

export function ReputationScore({ score, label = "Reputation", className }: ReputationScoreProps) {
  const background = `conic-gradient(from 180deg, hsl(var(--primary)) ${score * 3.6}deg, rgba(255,255,255,0.1) 0deg)`;

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        className="relative grid h-44 w-44 place-items-center rounded-full p-2 shadow-[0_0_60px_rgba(0,245,212,0.22)] transition-all duration-700"
        style={{ background }}
      >
        <div className="grid h-full w-full place-items-center rounded-full border border-white/10 bg-black/80">
          <div className="text-center">
            <div className="text-5xl font-black tracking-tight text-white">{score}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.24em] text-primary">{label}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
