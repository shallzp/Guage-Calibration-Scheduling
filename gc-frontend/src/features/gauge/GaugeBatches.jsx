import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PanelRightOpen } from 'lucide-react'
import { apiFetch } from '../../utils/api'
import { formatDate } from '../../utils/dateUtils'
import Pagination from '../../components/Pagination'
import TableSkeleton from '../../components/TableSkeleton'
import SortableHeader from '../../components/SortableHeader'
import Drawer from '../../components/Drawer'

// Skeleton — identical structure to real UI, shown while loading
export function GaugeBatchesSkeleton() {
  return (
    <>
      <div className='my-5'>
        <section className="rounded-3xl border border-white/60 bg-[color:var(--card)] p-5 shadow-sm backdrop-blur">
          <div className="grid gap-3 sm:grid-cols-4">
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
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="h-3 w-28 rounded-full bg-slate-200/70 animate-pulse" />
              <div className="mt-4 h-6 w-10 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="mt-2 h-3 w-36 rounded-full bg-slate-200/60 animate-pulse" />
            </div>
          </div>
        </section>
      </div>


      <TableSkeleton widths={['w-20', 'w-16', 'w-24', 'w-28', 'w-16', 'w-10']} rows={10} />
    </>
  )
}

// Helpers
function formatBatchDate(batch) {
  // Try the explicit date field first
  if (batch.date) {
    const d = new Date(batch.date)
    if (!isNaN(d.getTime())) {
      return formatDate(d)
    }
  }
  // Fallback: parse YYYYMMDD suffix from _id (e.g. "BATCH-20221101")
  const match = String(batch._id || '').match(/(\d{8})$/)
  if (match) {
    const s = match[1] // "20221101"
    const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
    if (!isNaN(d.getTime())) {
      return formatDate(d)
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
      {label} <span className="opacity-60">({Math.round(v * 100)}%)</span>
    </span>
  )
}

function RiskCountPills({ riskSummary = {} }) {
  const high = riskSummary.high ?? 0
  const medium = riskSummary.medium ?? 0
  const low = riskSummary.low ?? 0
  if (high === 0 && medium === 0 && low === 0) return <span className="text-xs text-slate-400">—</span>

  return (
    <div className="flex flex-col items-start gap-1.5">
      {high > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
          High: {high}
        </span>
      )}
      {medium > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
          Medium: {medium}
        </span>
      )}
      {low > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          Low: {low}
        </span>
      )}
    </div>
  )
}



// Side panel — matches reference image exactly
function BatchDetailPanel({ batch, onClose, onOpenRecommendation, onOpenSchedule }) {
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
  const medium = batch.risk_summary?.medium ?? 0
  const low = batch.risk_summary?.low ?? 0

  const riskParts = []
  if (high > 0) riskParts.push(`High: ${high}`)
  if (medium > 0) riskParts.push(`Medium: ${medium}`)
  if (low > 0) riskParts.push(`Low: ${low}`)
  const riskSummaryText = riskParts.length > 0 ? riskParts.join(' · ') : 'No risk counts'

  return (
    <Drawer
      isOpen={Boolean(batch)}
      title={`Batch: ${formatBatchDate(batch)}`}
      subtitle={`Size: ${total} · ${riskSummaryText}`}
      onClose={onClose}
    >
      <div className="space-y-2.5">
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
          [...gaugeDetails]
            .sort((a, b) => (Number(b.latest_prediction?.risk_score) || 0) - (Number(a.latest_prediction?.risk_score) || 0))
            .map((gauge) => {
            const riskLevel = String(gauge.latest_prediction?.risk_level || '').toLowerCase()
            const riskCardStyle =
              riskLevel === 'high'
                ? 'border-rose-200 bg-rose-50/40 hover:border-rose-300 hover:bg-rose-50/60'
                : riskLevel === 'medium'
                  ? 'border-amber-200 bg-amber-50/40 hover:border-amber-300 hover:bg-amber-50/60'
                  : 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-300 hover:bg-emerald-50/60'
            const riskBadgeStyle =
              riskLevel === 'high'
                ? 'bg-rose-100 text-rose-700 border-rose-200'
                : riskLevel === 'medium'
                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-200'
            const riskLabel = riskLevel ? riskLevel.toUpperCase() : 'UNKNOWN'
            const rawAction = String(gauge.latest_prediction?.action || '').trim()
            const normalizedAction = rawAction.toLowerCase()
            const showAction = normalizedAction && normalizedAction !== 'no_change' && normalizedAction !== 'no_chnage'
            const formatActionLabel = (value) =>
              value
                .replace(/_/g, ' ')
                .toLowerCase()
                .replace(/\b\w/g, (char) => char.toUpperCase())

            const actionLabel = rawAction ? formatActionLabel(rawAction) : 'Recommended Action'

            const parts = String(gauge.gauge_key || '').split('::')
            const gaugeCode = parts.length > 1 ? parts[parts.length - 1] : gauge.gauge_key

            const showRecommendation = riskLevel === 'high' || riskLevel === 'medium'

            return (
              <div
                key={gauge.gauge_key}
                className={`relative w-full rounded-xl border p-4 text-left shadow-sm transition ${riskCardStyle}`}
              >
                <span
                  className={`absolute right-3 top-3 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${riskBadgeStyle}`}
                >
                  {riskLabel}
                </span>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold uppercase tracking-wide text-slate-900 leading-snug">
                      {gauge.gauge_name || gaugeCode}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{gaugeCode}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenSchedule?.(gauge)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
                  >
                    Schedule
                  </button>
                  {showRecommendation && (
                    <button
                      type="button"
                      onClick={() => onOpenRecommendation?.(gauge)}
                      className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 whitespace-nowrap"
                    >
                      Recommendations
                    </button>
                  )}
                </div>
                {showAction && (
                  <span className="absolute bottom-3 right-3 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">
                    {actionLabel}
                  </span>
                )}
              </div>
            )
          })}
      </div>
    </Drawer>
  )
}

// Main component
function GaugeBatches() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [batches, setBatches] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [selectedBatch, setSelectedBatch] = useState(null)
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam

  const setCurrentPage = (page) => {
    const next = new URLSearchParams(searchParams)
    if (page === 1) {
      next.delete('page')
    } else {
      next.set('page', page.toString())
    }
    setSearchParams(next, { replace: true })
  }
  const [filterRisk, setFilterRisk] = useState('all')
  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const PAGE_SIZE = 10

  useEffect(() => {
    const nextFilter = searchParams.get('risk') || 'all'
    setFilterRisk((prev) => (prev === nextFilter ? prev : nextFilter))

    const nextSortField = searchParams.get('sort') || null
    const nextSortDir = searchParams.get('dir') === 'desc' ? 'desc' : 'asc'
    setSortField((prev) => (prev === nextSortField ? prev : nextSortField))
    setSortDirection((prev) => (prev === nextSortDir ? prev : nextSortDir))
  }, [searchParams])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (filterRisk && filterRisk !== 'all') next.set('risk', filterRisk)
    else next.delete('risk')

    if (sortField) {
      next.set('sort', sortField)
      next.set('dir', sortDirection)
    } else {
      next.delete('sort')
      next.delete('dir')
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [filterRisk, sortDirection, sortField, searchParams, setSearchParams])

  useEffect(() => {
    let isActive = true; 
    (async () => {
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
      }) ()
    return () => { isActive = false }
  }, [])

  const filteredBatches = batches.filter(b => {
    if (filterRisk === 'high') return (b.batch_risk ?? 0) >= 0.7
    if (filterRisk === 'medium') return (b.batch_risk ?? 0) >= 0.4 && (b.batch_risk ?? 0) < 0.7
    if (filterRisk === 'low') return (b.batch_risk ?? 0) < 0.4
    return true
  })

  const sortedBatches = useMemo(() => {
    if (!sortField) return filteredBatches
    return [...filteredBatches].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (sortField === 'batchDate') {
        const parseD = (batch) => {
          if (batch.date) {
            const d = new Date(batch.date)
            if (!isNaN(d.getTime())) return d.getTime()
          }
          const match = String(batch._id || '').match(/(\d{8})$/)
          if (match) {
            const s = match[1]
            const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
            if (!isNaN(d.getTime())) return d.getTime()
          }
          return 0
        }
        aVal = parseD(a)
        bVal = parseD(b)
      } else if (sortField === 'batch_risk') {
        aVal = a.batch_risk ?? 0
        bVal = b.batch_risk ?? 0
      } else if (sortField === 'gauge_count') {
        aVal = a.gauge_count ?? 0
        bVal = b.gauge_count ?? 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredBatches, sortField, sortDirection])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

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



  const totalPages = Math.max(1, Math.ceil(sortedBatches.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const paginatedBatches = sortedBatches.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE)

  const highRiskCount = batches.filter(b => (b.batch_risk ?? 0) >= 0.7).length
  const mediumRiskCount = batches.filter(b => (b.batch_risk ?? 0) >= 0.4 && (b.batch_risk ?? 0) < 0.7).length
  const lowRiskCount = batches.filter(b => (b.batch_risk ?? 0) < 0.4).length

  const handleOpenRecommendation = (gauge) => {
    const gaugeKey = gauge?.gauge_key || gauge?.key
    if (!gaugeKey) return
    setSelectedBatch(null)
    navigate(`/gauge-calibration/recommendations?gaugeKey=${encodeURIComponent(gaugeKey)}`)
  }

  const handleOpenSchedule = (gauge) => {
    const gaugeKey = gauge?.gauge_key || gauge?.key
    if (!gaugeKey) return
    setSelectedBatch(null)
    navigate(`/gauge-calibration/schedule/${encodeURIComponent(gaugeKey)}`)
  }

  return (
    <>
      <div className='my-5'>
        <section className="rounded-3xl border border-white/60 bg-[color:var(--card)] p-5 shadow-sm backdrop-blur">
          <div className="grid gap-3 sm:grid-cols-4">
            <button 
              onClick={() => { setFilterRisk('all'); setCurrentPage(1); }}
              className={`text-left rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-all hover:shadow-md ${filterRisk === 'all' ? 'ring-2 ring-slate-400 shadow-md' : 'opacity-80 hover:opacity-100'}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total Batches</p>
              <p className="mt-4 text-3xl font-bold text-slate-900">{batches.length}</p>
              <p className="mt-1 text-xs text-slate-500">Current open batches</p>
            </button>
            <button 
              onClick={() => { setFilterRisk('high'); setCurrentPage(1); }}
              className={`text-left rounded-2xl border border-rose-200 bg-rose-50/70 p-4 transition-all hover:shadow-md ${filterRisk === 'high' ? 'ring-2 ring-rose-400 shadow-md' : 'opacity-80 hover:opacity-100'}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">High Risk Batches</p>
              <p className="mt-4 text-3xl font-bold text-rose-700">{highRiskCount}</p>
              <p className="mt-1 text-xs text-rose-600">Risk score ≥ 70%</p>
            </button>
            <button 
              onClick={() => { setFilterRisk('medium'); setCurrentPage(1); }}
              className={`text-left rounded-2xl border border-amber-200 bg-amber-50/70 p-4 transition-all hover:shadow-md ${filterRisk === 'medium' ? 'ring-2 ring-amber-400 shadow-md' : 'opacity-80 hover:opacity-100'}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Medium Risk Batches</p>
              <p className="mt-4 text-3xl font-bold text-amber-700">{mediumRiskCount}</p>
              <p className="mt-1 text-xs text-amber-600">Risk score 40% - 69%</p>
            </button>
            <button 
              onClick={() => { setFilterRisk('low'); setCurrentPage(1); }}
              className={`text-left rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 transition-all hover:shadow-md ${filterRisk === 'low' ? 'ring-2 ring-emerald-400 shadow-md' : 'opacity-80 hover:opacity-100'}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Low Risk Batches</p>
              <p className="mt-4 text-3xl font-bold text-emerald-700">{lowRiskCount}</p>
              <p className="mt-1 text-xs text-emerald-600">Risk score &lt; 40%</p>
            </button>
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
                <SortableHeader label="Batch Date" field="batchDate" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Batch Size" field="gauge_count" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <th className="px-4 py-3">Risk Counts</th>
                <SortableHeader label="Batch Risk" field="batch_risk" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />

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
        filteredCount={filteredBatches.length}
        onPageChange={(page) => setCurrentPage(page)}
      />

      <BatchDetailPanel
        batch={selectedBatch}
        onClose={() => setSelectedBatch(null)}
        onOpenRecommendation={handleOpenRecommendation}
        onOpenSchedule={handleOpenSchedule}
      />
    </>
  )
}

export default GaugeBatches
