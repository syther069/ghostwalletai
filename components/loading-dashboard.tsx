import { Skeleton } from "@/components/ui/skeleton";

export function LoadingDashboard() {
  return (
    <section className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="glass-panel rounded-lg p-6">
        <Skeleton className="mx-auto h-44 w-44 rounded-full" />
        <Skeleton className="mt-6 h-5 w-full" />
        <Skeleton className="mt-3 h-4 w-2/3" />
      </div>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <Skeleton className="h-52" />
        <Skeleton className="h-64" />
      </div>
    </section>
  );
}
