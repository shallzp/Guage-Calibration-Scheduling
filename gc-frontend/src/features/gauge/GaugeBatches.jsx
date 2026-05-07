import { useEffect, useState } from 'react'
import { PanelRightOpen, X } from 'lucide-react'
import { apiFetch } from '../../utils/api'
import Pagination from '../../components/Pagination'
import TableSkeleton from '../../components/TableSkeleton'

// Skeleton — identical structure to real UI, shown while loading
export function GaugeBatchesSkeleton() {
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


      <TableSkeleton widths={['w-20', 'w-16', 'w-24', 'w-28', 'w-20', 'w-16', 'w-10']} rows={10} />
    </>
  )
}

// Helpers

function formatBatchDate(batch) {
  // Try the explicit date field first
  if (batch.date) {
    const d = new Date(batch.date)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    }
  }
  // Fallback: parse YYYYMMDD suffix from _id (e.g. "BATCH-20221101")
  const match = String(batch._id || '').match(/(\d{8})$/)
  if (match) {
    const s = match[1] // "20221101"
    const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    }
  }
  return '—'
}

function RiskScoreBadge({ score }) {
  const v = Number(score ?? 0)
  const [style, label] =
    v >= 0.7
      ? ['bg-rose-100 text-rose-700 border-rose-200', 'High']
      : v >= 0.4
        ? ['bg-amber-100 text-amber-700 border-amber-200', 'Medium']
        : ['bg-emerald-100 text-emerald-700 border-emerald-200', 'Low']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {label} <span className="opacity-60">({v.toFixed(2)})</span>
    </span>
  )
}

function RiskCountPills({ riskSummary = {} }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
        H: {riskSummary.high ?? 0}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
        M: {riskSummary.medium ?? 0}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        L: {riskSummary.low ?? 0}
      </span>
    </div>
  )
}

function BatchTypeBadge({ type }) {
  if (!type) return <span className="text-slate-400">—</span>
  return (
    <span className="inline-block rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-violet-700">
      {type}
    </span>
  )
}

// Side panel — matches reference image exactly
function BatchDetailPanel({ batch, onClose }) {
  const [gaugeDetails, setGaugeDetails] = useState([])
  const [loadingGauges, setLoadingGauges] = useState(false)

  useEffect(() => {
    if (!batch) return
    let active = true
    setLoadingGauges(true)
    setGaugeDetails([])
      ; (async () => {
        try {
          const res = await apiFetch('/api/gauges')
          if (!res.ok) return
          const data = await res.json()
          if (!active) return
          const keySet = new Set(batch.gauge_keys || [])
          setGaugeDetails((data || []).filter((g) => keySet.has(g.gauge_key)))
        } finally {
          if (active) setLoadingGauges(false)
        }
      })()
    return () => { active = false }
  }, [batch?._id])

  if (!batch) return null

  const total = batch.gauge_count ?? 0
  const high = batch.risk_summary?.high ?? 0
  const low = batch.risk_summary?.low ?? 0

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* drawer */}
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              Batch: {formatBatchDate(batch)}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>
                Size: <strong className="text-slate-800">{total}</strong>
              </span>
              <span>
                High Risk:{' '}
                <strong className="text-rose-600">{high}</strong>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* gauge list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {loadingGauges && (
            <div className="space-y-2.5 pt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-40 rounded-full bg-slate-200 animate-pulse" />
                      <div className="h-3 w-24 rounded-full bg-slate-200/70 animate-pulse" />
                    </div>
                    <div className="h-7 w-32 rounded-full bg-slate-200 animate-pulse" />
                  </div>
                  <div className="mt-3 h-7 w-full rounded-lg bg-slate-100 animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {!loadingGauges && gaugeDetails.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-400">No gauge details available.</p>
            </div>
          )}

          {!loadingGauges &&
            gaugeDetails.map((gauge) => {
              const riskLevel = String(gauge.latest_prediction?.risk_level || '').toLowerCase()
              const riskBadge =
                riskLevel === 'high'
                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                  : riskLevel === 'medium'
                    ? 'bg-amber-50 text-amber-600 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              const riskLabel = riskLevel ? `Risk: ${riskLevel.toUpperCase()}` : 'Risk: —'

              // Parse gauge_key → department + code e.g. "M/C SHOP::MF/MS/934"
              const parts = String(gauge.gauge_key || '').split('::')
              const gaugeCode = parts.length > 1 ? parts[parts.length - 1] : gauge.gauge_key

              return (
                <div
                  key={gauge.gauge_key}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase tracking-wide text-slate-900 leading-snug">
                        {gauge.gauge_name || gaugeCode}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">{gaugeCode}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-teal-400 hover:text-teal-700 whitespace-nowrap"
                    >
                      Increase Frequency
                    </button>
                  </div>

                  <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${riskBadge}`}>
                    {riskLabel}
                  </div>
                </div>
              )
            })}
        </div>
      </aside>
    </>
  )
}

// Main component
function GaugeBatches() {
  const [batches, setBatches] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  useEffect(() => {
    let isActive = true
      ; (async () => {
        setIsLoading(true)
        setFetchError('')
        try {
          const response = await apiFetch('/api/batches/current')
          if (!response.ok) {
            const text = await response.text()
            throw new Error(text || `Failed to fetch batches (${response.status})`)
          }
          const data = await response.json()
          if (!isActive) return
          setBatches(Array.isArray(data) ? data : [])
        } catch (error) {
          if (!isActive) return
          setFetchError(error?.message || 'Failed to fetch batches')
        } finally {
          if (!isActive) return
          setIsLoading(false)
        }
      })()
    return () => { isActive = false }
  }, [])

  if (isLoading) return <GaugeBatchesSkeleton />

  if (fetchError) {
    return (
      <section className="fade-in-up">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Failed to load batch data</p>
          <p className="mt-1 text-xs text-rose-600">{fetchError}</p>
        </div>
      </section>
    )
  }

  const totalPages = Math.max(1, Math.ceil(batches.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const paginatedBatches = batches.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE)

  return (
    <>
      <div className='my-5'>
        <section className="rounded-3xl border border-white/60 bg-[color:var(--card)] p-5 shadow-sm backdrop-blur">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total Batches</p>
              <p className="mt-4 text-3xl font-bold text-slate-900">{batches.length}</p>
              <p className="mt-1 text-xs text-slate-500">Current open batches</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Problematic Batches</p>
              <p className="mt-4 text-3xl font-bold text-rose-700">0</p>
              <p className="mt-1 text-xs text-rose-600">Need intervention and monitoring</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Healthy Batches</p>
              <p className="mt-4 text-3xl font-bold text-emerald-700">0</p>
              <p className="mt-1 text-xs text-emerald-600">No current action required</p>
            </div>
          </div>
        </section>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm">
        {batches.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No active batches found.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Batch Date</th>
                <th className="px-4 py-3">Batch Size</th>
                <th className="px-4 py-3">Risk Counts</th>
                <th className="px-4 py-3">Batch Risk</th>
                <th className="px-4 py-3">Batch Type</th>
                <th className="px-4 py-3 text-center">Details</th>
              </tr>
            </thead>
            <tbody>
              {paginatedBatches.map((batch) => (
                <tr key={batch._id} className="border-t border-slate-200/80 text-slate-700 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{formatBatchDate(batch)}</td>
                  <td className="px-4 py-3">{batch.gauge_count ?? 0}</td>
                  <td className="px-4 py-3"><RiskCountPills riskSummary={batch.risk_summary} /></td>
                  <td className="px-4 py-3"><RiskScoreBadge score={batch.batch_risk} /></td>
                  <td className="px-4 py-3"><BatchTypeBadge type={batch.batch_type} /></td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedBatch(batch)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                      aria-label={`View details for ${batch._id}`}
                      title="View details"
                    >
                      <PanelRightOpen className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        filteredCount={batches.length}
        onPageChange={(page) => setCurrentPage(page)}
      />

      <BatchDetailPanel batch={selectedBatch} onClose={() => setSelectedBatch(null)} />
    </>
  )
}

export default GaugeBatches
