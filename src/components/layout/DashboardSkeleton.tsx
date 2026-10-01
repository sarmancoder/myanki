interface DashboardSkeletonProps {
  cards?: number;
}

export default function DashboardSkeleton({ cards = 4 }: DashboardSkeletonProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-lg border border-border bg-secondary/60"
          />
        ))}
      </div>

      <div className="h-48 animate-pulse rounded-lg border border-border bg-secondary/60" />

      <span className="sr-only">Cargando...</span>
    </div>
  );
}