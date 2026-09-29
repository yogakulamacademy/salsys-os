import {
  BarChart3,
} from 'lucide-react';

type Variant =
  | 'default'
  | 'table'
  | 'analytics';

export function CrmPageSkeleton({
  variant = 'default',
}: {
  variant?: Variant;
}) {
  return (
    <div
      className="animate-pulse"
      aria-busy="true"
      aria-label="Loading page"
    >
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-8 w-56 max-w-[70vw]" />
          <Skeleton className="mt-3 h-4 w-[34rem] max-w-full" />
        </div>

        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-24 rounded-xl" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({
          length: 4,
        }).map(
          (
            _,
            index
          ) => (
            <div
              key={index}
              className="card-pad"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-9 rounded-xl" />
              </div>

              <Skeleton className="mt-4 h-8 w-24" />
              <Skeleton className="mt-3 h-3 w-36" />
            </div>
          )
        )}
      </div>

      {variant ===
      'table' ? (
        <TableSkeleton />
      ) : variant ===
        'analytics' ? (
        <AnalyticsSkeleton />
      ) : (
        <DefaultSkeleton />
      )}
    </div>
  );
}


function DefaultSkeleton() {
  return (
    <>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="card-pad">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-44" />
            </div>

            <BarChart3
              size={18}
              className="text-slate-200"
            />
          </div>

          <Skeleton className="mt-6 h-[260px] w-full rounded-2xl" />
        </div>

        <div className="card-pad">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-40" />

          <div className="mt-6 space-y-3">
            {Array.from({
              length: 5,
            }).map(
              (
                _,
                index
              ) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-100 p-4"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />

                    <div className="flex-1">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="mt-2 h-3 w-3/4" />
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      <div className="card-pad mt-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-6 w-40" />
        <Skeleton className="mt-6 h-56 w-full rounded-2xl" />
      </div>
    </>
  );
}


function TableSkeleton() {
  return (
    <div className="card mt-4 overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {Array.from({
          length: 8,
        }).map(
          (
            _,
            index
          ) => (
            <div
              key={index}
              className="grid gap-4 p-4 md:grid-cols-[1.4fr_1fr_1fr_.8fr]"
            >
              <div>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>

              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          )
        )}
      </div>
    </div>
  );
}


function AnalyticsSkeleton() {
  return (
    <>
      <div className="card-pad mt-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-6 w-52" />
          </div>

          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>

        <Skeleton className="mt-6 h-[320px] w-full rounded-2xl" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="card-pad">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-44" />
          <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
        </div>

        <div className="card-pad">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-44" />
          <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
        </div>
      </div>
    </>
  );
}


function Skeleton({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg bg-slate-200/75 ${className}`}
    />
  );
}
