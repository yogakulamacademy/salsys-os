import { BarChart3 } from 'lucide-react';

type Variant =
  | 'default'
  | 'table'
  | 'analytics'
  | 'inbox'
  | 'lead'
  | 'tasks';

export function CrmPageSkeleton({
  variant = 'default',
}: {
  variant?: Variant;
}) {
  if (variant === 'inbox') return <InboxSkeleton />;
  if (variant === 'lead') return <LeadSkeleton />;

  return (
    <div
      className="animate-pulse"
      aria-busy="true"
      aria-label="Loading page"
    >
      <PageHeaderSkeleton />

      {variant === 'tasks' ? (
        <TaskSkeleton />
      ) : (
        <>
          <MetricGrid />
          {variant === 'table' ? (
            <TableSkeleton />
          ) : variant === 'analytics' ? (
            <AnalyticsSkeleton />
          ) : (
            <DefaultSkeleton />
          )}
        </>
      )}
    </div>
  );
}

function PageHeaderSkeleton() {
  return (
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
  );
}

function MetricGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card-pad">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
          <Skeleton className="mt-4 h-8 w-24" />
          <Skeleton className="mt-3 h-3 w-36" />
        </div>
      ))}
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
            <BarChart3 size={18} className="text-slate-200" />
          </div>
          <Skeleton className="mt-6 h-[260px] w-full rounded-2xl" />
        </div>

        <div className="card-pad">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-40" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="mt-2 h-3 w-3/4" />
                  </div>
                </div>
              </div>
            ))}
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
      <div className="border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="flex flex-col gap-3 lg:flex-row">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="grid gap-4 p-4 md:grid-cols-[1.4fr_1fr_1fr_.8fr]">
            <div>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        ))}
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
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="card-pad">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-6 w-44" />
            <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
          </div>
        ))}
      </div>
    </>
  );
}

function TaskSkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="card-pad">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-8 w-20" />
            <Skeleton className="mt-3 h-3 w-40 max-w-full" />
          </div>
        ))}
      </div>
      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 p-5 dark:border-slate-800">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-40" />
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Skeleton className="h-4 w-48 max-w-[65%]" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="mt-2 h-3 w-72 max-w-[85%]" />
                  <div className="mt-4 flex gap-2">
                    <Skeleton className="h-8 w-32 rounded-lg" />
                    <Skeleton className="h-8 w-24 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function InboxSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading conversations">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="grid min-h-[680px] lg:grid-cols-[300px_minmax(0,1fr)_320px]">
          <aside className="border-b border-slate-200 p-4 dark:border-slate-800 lg:border-b-0 lg:border-r">
            <Skeleton className="h-9 w-full rounded-xl" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="flex gap-3 py-2">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-2 h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="border-b border-slate-200 dark:border-slate-800 lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="mt-2 h-3 w-52" />
                </div>
              </div>
            </div>
            <div className="space-y-5 p-5">
              <Skeleton className="h-16 w-[72%] rounded-2xl" />
              <Skeleton className="ml-auto h-20 w-[68%] rounded-2xl" />
              <Skeleton className="h-14 w-[58%] rounded-2xl" />
              <Skeleton className="ml-auto h-24 w-[74%] rounded-2xl" />
            </div>
            <div className="mt-10 border-t border-slate-200 p-4 dark:border-slate-800">
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          </main>

          <aside className="p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-20 w-full rounded-xl" />
            <Skeleton className="mt-4 h-36 w-full rounded-xl" />
            <Skeleton className="mt-4 h-28 w-full rounded-xl" />
          </aside>
        </div>
      </div>
    </div>
  );
}

function LeadSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading lead workspace">
      <Skeleton className="mb-4 h-4 w-28" />
      <PageHeaderSkeleton />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="card-pad">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-6 w-36" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index}>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2 h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-lg bg-slate-200/75 dark:bg-slate-800/80 ${className}`} />;
}
