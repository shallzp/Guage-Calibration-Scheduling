import { useEffect, useMemo, useState } from 'react'

import { STATUS } from '../../utils/gaugeData'
import { apiFetch } from '../../utils/api'

function GaugeOverviewSkeleton() {
  return (
    <section className="fade-in-up space-y-5">
      <div className="rounded-3xl border border-white/60 bg-[color:var(--card)] p-5 shadow-[0_20px_55px_rgba(18,38,63,0.14)] backdrop-blur md:p-8">
        <div className="mb-6 h-6 w-40 rounded-full bg-slate-200/80 animate-pulse" />

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
          <div className="h-4 w-56 rounded-full bg-slate-200/80 animate-pulse" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
              <div className="h-3 w-20 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-6 h-8 w-16 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-3 h-3 w-24 rounded-full bg-slate-200/70 animate-pulse" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
              <div className="h-3 w-16 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-6 h-8 w-16 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-3 h-3 w-28 rounded-full bg-slate-200/70 animate-pulse" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
              <div className="h-3 w-20 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-6 h-8 w-12 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-3 h-3 w-28 rounded-full bg-slate-200/70 animate-pulse" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
              <div className="h-3 w-16 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-6 h-8 w-16 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-3 h-3 w-28 rounded-full bg-slate-200/70 animate-pulse" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="h-3 w-24 rounded-full bg-slate-200/70 animate-pulse" />
            </div>
            <div className="mt-2 h-3 w-64 rounded-full bg-slate-200/60 animate-pulse" />

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="h-3 w-24 rounded-full bg-slate-200/70 animate-pulse" />
                <div className="mt-4 h-6 w-12 rounded-full bg-slate-200/80 animate-pulse" />
                <div className="mt-2 h-3 w-20 rounded-full bg-slate-200/60 animate-pulse" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="h-3 w-24 rounded-full bg-slate-200/70 animate-pulse" />
                <div className="mt-4 h-6 w-12 rounded-full bg-slate-200/80 animate-pulse" />
                <div className="mt-2 h-3 w-20 rounded-full bg-slate-200/60 animate-pulse" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="h-3 w-24 rounded-full bg-slate-200/70 animate-pulse" />
                <div className="mt-4 h-6 w-12 rounded-full bg-slate-200/80 animate-pulse" />
                <div className="mt-2 h-3 w-20 rounded-full bg-slate-200/60 animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-5">
          <div className="h-4 w-36 rounded-full bg-slate-200/80 animate-pulse" />
          <div className="mt-2 h-3 w-52 rounded-full bg-slate-200/60 animate-pulse" />

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="h-3 w-16 rounded-full bg-slate-200/80 animate-pulse" />
                <div className="h-3 w-20 rounded-full bg-slate-200/70 animate-pulse" />
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 w-[40%] rounded-full bg-slate-200/80 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <div className="h-3 w-20 rounded-full bg-slate-200/80 animate-pulse" />
                <div className="h-3 w-20 rounded-full bg-slate-200/70 animate-pulse" />
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 w-[10%] rounded-full bg-slate-200/80 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <div className="h-3 w-12 rounded-full bg-slate-200/80 animate-pulse" />
                <div className="h-3 w-20 rounded-full bg-slate-200/70 animate-pulse" />
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 w-[55%] rounded-full bg-slate-200/80 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function GaugeOverview({ gauges = [] }) {
  const [summary, setSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    let isActive = true
    ;(async () => {
      setIsLoading(true)
      setFetchError('')
      try {
        const response = await apiFetch('/api/gauges/risk/summary')
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || `Failed to fetch risk summary (${response.status})`)
        }
        const payload = await response.json()
        if (!isActive) return
        setSummary(payload)
      } catch (error) {
        if (!isActive) return
        setSummary(null)
        setFetchError(error?.message || 'Failed to fetch risk summary')
      } finally {
        if (!isActive) return
        setIsLoading(false)
      }
    })()

    return () => {
      isActive = false
    }
  }, [])

  const derived = useMemo(() => {
    if (!summary) return null

    const total = Number(summary.total || 0)
    const high = Number(summary.high || 0)
    const medium = Number(summary.medium || 0)
    const low = Number(summary.low || 0)
    const highPct = Number(summary.high_percentage ?? 0)
    const mediumPct = Number(summary.medium_percentage ?? 0)
    const lowPct = Number(summary.low_percentage ?? 0)

    const overdue = gauges.filter((gauge) =>
      (gauge.schedule || []).some((row) => String(row.status || '').toLowerCase() === STATUS.OVERDUE.toLowerCase()),
    ).length

    return {
      total,
      high,
      medium,
      low,
      highPct,
      mediumPct,
      lowPct,
      overdue,
      actionable: high + medium,
      stable: low,
    }
  }, [gauges, summary])

  if (isLoading) return <GaugeOverviewSkeleton />

  if (fetchError || !derived) {
    return (
      <section className="fade-in-up">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Failed to load risk summary</p>
          <p className="mt-1 text-xs text-rose-600">{fetchError || 'No data returned from API.'}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="fade-in-up space-y-5">
      <div className="rounded-3xl border border-white/60 bg-[color:var(--card)] p-5 shadow-[0_20px_55px_rgba(18,38,63,0.14)] backdrop-blur md:p-8">
        <h2 className="text-2xl font-bold text-slate-900">Gauge Overview</h2>

        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          <span className="font-semibold">{derived.overdue} gauges overdue</span> - past due date
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
              <p className="text-xs font-semibold tracking-[0.24em] text-slate-500">TOTAL GAUGES</p>
              <p className="mt-6 text-5xl font-bold text-slate-900">{derived.total}</p>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold tracking-[0.24em] text-rose-700">HIGH RISK</p>
                <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-xs font-semibold text-rose-700">
                  {formatPercent(derived.highPct)}
                </span>
              </div>
              <p className="mt-6 text-5xl font-bold text-rose-700">{derived.high}</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold tracking-[0.24em] text-amber-700">MEDIUM RISK</p>
                <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {formatPercent(derived.mediumPct)}
                </span>
              </div>
              <p className="mt-6 text-5xl font-bold text-amber-700">{derived.medium}</p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold tracking-[0.24em] text-emerald-700">LOW RISK</p>
                <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {formatPercent(derived.lowPct)}
                </span>
              </div>
              <p className="mt-6 text-5xl font-bold text-emerald-700">{derived.low}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
            <h3 className="text-3xl font-bold text-slate-900">Batch Summary</h3>
            <p className="mt-1 text-sm text-slate-500">Compact view of actionable scheduling changes.</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold tracking-[0.2em] text-slate-500">ACTIONABLE</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{derived.actionable}</p>
                <p className="mt-1 text-xs text-slate-500">high + medium risk</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold tracking-[0.2em] text-slate-500">STABLE</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{derived.stable}</p>
                <p className="mt-1 text-xs text-slate-500">low risk gauges</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold tracking-[0.2em] text-slate-500">OVERDUE</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{derived.overdue}</p>
                <p className="mt-1 text-xs text-slate-500">past due schedule</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-5">
          <h3 className="text-3xl font-bold text-slate-900">Risk Distribution</h3>
          <p className="mt-1 text-sm text-slate-500">Horizontal risk split across the current gauge population.</p>

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-rose-700">HIGH</p>
                <p className="text-sm font-semibold text-slate-500">
                  {derived.high} gauges | {formatPercent(derived.highPct)}
                </p>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.max(0, Math.min(100, derived.highPct))}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-amber-700">MEDIUM</p>
                <p className="text-sm font-semibold text-slate-500">
                  {derived.medium} gauges | {formatPercent(derived.mediumPct)}
                </p>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.max(0, Math.min(100, derived.mediumPct))}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-emerald-700">LOW</p>
                <p className="text-sm font-semibold text-slate-500">
                  {derived.low} gauges | {formatPercent(derived.lowPct)}
                </p>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, derived.lowPct))}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export { GaugeOverviewSkeleton }
export default GaugeOverview
