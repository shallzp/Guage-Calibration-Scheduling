import TableSkeleton from '../../components/TableSkeleton'

export function GaugeRecommendationsSkeleton() {
  return (
    <>
      <div className='my-5'>
        <section className="rounded-3xl border border-white/60 bg-[color:var(--card)] p-5 shadow-sm backdrop-blur">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="h-3 w-24 rounded-full bg-slate-200/70 animate-pulse" />
              <div className="mt-4 h-6 w-10 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-2 h-3 w-36 rounded-full bg-slate-200/60 animate-pulse" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="h-3 w-32 rounded-full bg-slate-200/70 animate-pulse" />
              <div className="mt-4 h-6 w-10 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-2 h-3 w-40 rounded-full bg-slate-200/60 animate-pulse" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="h-3 w-28 rounded-full bg-slate-200/70 animate-pulse" />
              <div className="mt-4 h-6 w-10 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-2 h-3 w-36 rounded-full bg-slate-200/60 animate-pulse" />
            </div>
          </div>
        </section>
      </div>

      <TableSkeleton widths={['w-16', 'w-24', 'w-20', 'w-16', 'w-10']} rows={10} />
    </>
  )
}

function GaugeRecommendations() {
  return <GaugeRecommendationsSkeleton />
}

export default GaugeRecommendations
