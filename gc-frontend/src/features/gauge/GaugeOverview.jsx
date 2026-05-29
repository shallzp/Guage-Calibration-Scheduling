import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip as ReTooltip, Legend as ReLegend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

import { getRiskActionLabel } from '../../utils/gauge/gaugeDataUtils'
import { apiFetch } from '../../utils/api'

import StatCard, { SkeletonCard } from '../../components/StatCard';

function GaugeOverviewSkeleton() {
  return (
    <section className="fade-in-up space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-5 md:p-8">
        {/* Row 1 - Schedule Status */}
        <div>
          <div className="mb-4">
            <div className="animate-pulse rounded-full bg-slate-200/80 h-4 w-32" />
            <div className="animate-pulse rounded-full bg-slate-200/80 h-3 w-52" />
          </div>
          <div className="grid gap-4 grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>

        {/* Row 2 - Risk Distribution & Calibration Frequency */}
        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-4">
              <div className="animate-pulse rounded-full bg-slate-200/80 h-4 w-36" />
              <div className="animate-pulse rounded-full bg-slate-200/80 h-3 w-56" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
              <div className="h-[220px]" />
            </div>
          </div>

          <div>
            <div className="mb-4">
              <div className="animate-pulse rounded-full bg-slate-200/80 h-4 w-44" />
              <div className="animate-pulse rounded-full bg-slate-200/80 h-3 w-64" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
              <div className="h-[220px]" />
            </div>
          </div>
        </div>

        {/* Row 3 - Recommendations | Batch Summary */}
        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          {/* Recommendations */}
          <div>
            <div className="mb-4">
              <div className="animate-pulse rounded-full bg-slate-200/80 h-4 w-36" />
              <div className="animate-pulse rounded-full bg-slate-200/80 mt-1.5 h-3 w-60" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
              <div className="mt-4 h-10 w-full animate-pulse rounded-xl border border-violet-100 bg-violet-50/70" />
            </div>
          </div>

          {/* Batch Summary */}
          <div>
            <div className="mb-4">
              <div className="animate-pulse rounded-full bg-slate-200/80 h-4 w-32" />
              <div className="animate-pulse rounded-full bg-slate-200/80 h-3 w-56" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(count, total) {
  if (!total) return 0
  return Math.round((count / total) * 100)
}

function fmtPct(count, total) {
  return `${pct(count, total)}%`
}


// ── Recharts: Risk Donut ────────────────────────────────────────────────────────────
const RISK_COLORS = {
  'High Risk': 'rgba(244, 63, 94, 1)', // rose-500
  'Medium Risk': 'rgba(245, 158, 11, 1)', // amber-500
  'Low Risk': 'rgba(16, 185, 129, 1)', // emerald-500
  'Unscored': 'rgba(100, 116, 139, 1)', // slate-500
}

function RiskDonutChart({ data, totalLabel }) {
  const CustomLabel = ({ viewBox }) => {
    if (!viewBox) return null
    const { cx, cy } = viewBox
    return (
      <>
        <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
          className="fill-slate-900" style={{ fontSize: 22, fontWeight: 700 }}>
          {totalLabel}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          total
        </text>
      </>
    )
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const { name, value } = payload[0]
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-sm">
        <p className="font-semibold text-slate-800">{name}</p>
        <p className="text-slate-500">{value} gauges</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="50%"
          innerRadius={60} outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          labelLine={false}
          label={<CustomLabel />}
          isAnimationActive
          animationDuration={700}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={RISK_COLORS[entry.name] ?? '#cbd5e1'} />
          ))}
        </Pie>
        <ReTooltip content={<CustomTooltip />} />
        <ReLegend
          iconType="circle"
          iconSize={10}
          formatter={(value) => <span style={{ fontSize: 12, color: '#64748b' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ── Recharts: Schedule Status Stacked Bar ───────────────────────────────────────
const STATUS_COLORS = {
  Overdue: '#f97316', // orange-500
  'In Progress': '#3b82f6', // blue-500
  'Not Started': '#94a3b8', // slate-400
  Completed: '#14b8a6', // teal-500
}

function StatusBarChart({ data }) {
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-sm space-y-1">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.fill }} />
            <span className="text-slate-600">{p.dataKey}:</span>
            <span className="font-semibold text-slate-800">{p.value}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barSize={28}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" hide />
        <CartesianGrid horizontal={false} vertical={false} />
        <ReTooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
        {Object.keys(STATUS_COLORS).map((key) => (
          <Bar key={key} dataKey={key} stackId="a" fill={STATUS_COLORS[key]} radius={0} isAnimationActive animationDuration={700} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Recharts: Frequency Histogram ───────────────────────────────────────────────
function FreqHistogramChart({ data }) {
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-sm">
        <p className="font-semibold text-slate-800">{label} Calibration</p>
        <p className="text-slate-500">{payload[0].value} gauges</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <ReTooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  )
}


function GaugeOverview({ gauges = [] }) {
  const [summary, setSummary] = useState(null)
  const [batches, setBatches] = useState({ current: [], previous: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    let isActive = true
      ; (async () => {
        setIsLoading(true)
        setFetchError('')
        try {
          const [riskRes, currentRes, previousRes] = await Promise.all([
            apiFetch('/api/gauges/risk/summary'),
            apiFetch('/api/batches/current'),
            apiFetch('/api/batches/previous'),
          ])
          if (!riskRes.ok) {
            const text = await riskRes.text()
            throw new Error(text || `Failed to fetch risk summary (${riskRes.status})`)
          }
          const [riskPayload, currentPayload, previousPayload] = await Promise.all([
            riskRes.json(),
            currentRes.ok ? currentRes.json() : [],
            previousRes.ok ? previousRes.json() : [],
          ])
          if (!isActive) return
          setSummary(riskPayload)
          setBatches({
            current: Array.isArray(currentPayload) ? currentPayload : [],
            previous: Array.isArray(previousPayload) ? previousPayload : [],
          })
        } catch (error) {
          if (!isActive) return
          setSummary(null)
          setFetchError(error?.message || 'Failed to fetch risk summary')
        } finally {
          if (!isActive) return
          setIsLoading(false)
        }
      })()
    return () => { isActive = false }
  }, [])

  // ── Derived stats from gauges prop ─────────────────────────────────────────
  const stats = useMemo(() => {
    const total = gauges.length

    // ── Schedule status counts (gauge-level) ──────────────────────────────
    const byStatus = { completed: 0, inProgress: 0, notStarted: 0, overdue: 0 }
    gauges.forEach((g) => {
      const s = String(g.currentStatus || '').toLowerCase()
      if (s === 'completed') byStatus.completed++
      else if (s === 'in progress' || s === 'in-progress') byStatus.inProgress++
      else if (s === 'overdue') byStatus.overdue++
      else byStatus.notStarted++
    })

    // ── Schedule-row-level overdue count ──────────────────────────────────
    const overdueRows = gauges.reduce((sum, g) =>
      sum + (g.schedule || []).filter((r) => String(r.status || '').toLowerCase() === 'overdue').length, 0)

    const completedRows = gauges.reduce((sum, g) =>
      sum + (g.schedule || []).filter((r) => String(r.status || '').toLowerCase() === 'completed').length, 0)

    const totalRows = gauges.reduce((sum, g) => sum + (g.schedule || []).length, 0)

    // ── Completion rate ───────────────────────────────────────────────────
    const completionRate = pct(byStatus.completed, total)

    // ── Risk levels ───────────────────────────────────────────────────────
    const risk = { high: 0, medium: 0, low: 0, unscored: 0 }
    gauges.forEach((g) => {
      const lvl = String(g.riskLevel || '').toLowerCase()
      if (lvl === 'high') risk.high++
      else if (lvl === 'medium') risk.medium++
      else if (lvl === 'low') risk.low++
      else risk.unscored++
    })

    // ── Recommendations ───────────────────────────────────────────────────
    const rec = { increase: 0, reschedule: 0, noChange: 0 }
    gauges.forEach((g) => {
      const label = getRiskActionLabel(g.riskAction)
      if (label === 'Increase Frequency') rec.increase++
      else if (label === 'Reschedule') rec.reschedule++
      else rec.noChange++
    })
    const totalActionable = rec.increase + rec.reschedule

    // ── Frequency distribution ────────────────────────────────────────────
    const freqMap = {}
    gauges.forEach((g) => {
      const f = g.frequency ? `${g.frequency}m` : 'Unknown'
      freqMap[f] = (freqMap[f] || 0) + 1
    })
    const freqEntries = Object.entries(freqMap)
      .sort((a, b) => {
        const na = parseInt(a[0]) || 9999
        const nb = parseInt(b[0]) || 9999
        return na - nb
      })

    return {
      total,
      byStatus,
      overdueRows,
      completedRows,
      totalRows,
      completionRate,
      risk,
      rec,
      totalActionable,
      freqEntries,
    }
  }, [gauges])

  // -- Risk summary from API -------------------------------------------------
  const riskSummary = useMemo(() => {
    if (!summary) return null
    return {
      total: Number(summary.total || 0),
      highPct: Number(summary.high_percentage ?? 0),
      mediumPct: Number(summary.medium_percentage ?? 0),
      lowPct: Number(summary.low_percentage ?? 0),
    }
  }, [summary])

  // -- Batch stats from fetched batch data ----------------------------------
  const batchStats = useMemo(() => {
    const allBatches = [...batches.current, ...batches.previous]
    const currentCount = batches.current.length
    const previousCount = batches.previous.length
    const totalBatches = allBatches.length

    const highCount = batches.current.filter((b) => (b.batch_risk ?? 0) >= 0.7).length
    const mediumCount = batches.current.filter((b) => (b.batch_risk ?? 0) >= 0.4 && (b.batch_risk ?? 0) < 0.7).length
    const lowCount = batches.current.filter((b) => (b.batch_risk ?? 0) < 0.4).length

    const gaugesInCurrent = batches.current.reduce((sum, b) => sum + (b.gauge_count ?? 0), 0)

    return { currentCount, previousCount, totalBatches, highCount, mediumCount, lowCount, gaugesInCurrent }
  }, [batches])

  if (isLoading) return <GaugeOverviewSkeleton />

  if (fetchError && !stats.total) {
    return (
      <section className="fade-in-up">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Failed to load risk summary</p>
          <p className="mt-1 text-xs text-rose-600">{fetchError}</p>
        </div>
      </section>
    )
  }

  const { total, byStatus, risk, rec, totalActionable, freqEntries } = stats
  const { currentCount, highCount, mediumCount, lowCount, gaugesInCurrent } = batchStats
  const hp = riskSummary?.highPct ?? pct(risk.high, total)
  const mp = riskSummary?.mediumPct ?? pct(risk.medium, total)
  const lp = riskSummary?.lowPct ?? pct(risk.low, total)

  //overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm

  return (
    <section className="fade-in-up space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-5 md:p-8">
        {/* ── Row 1: Gauge-level status breakdown ── */}
        <div>
          <div className="mb-4">
            <h3 className="display-font text-base font-semibold text-slate-900">Schedule Status</h3>
            <p className="mt-0.5 text-xs text-slate-400">Current calibration state per gauge</p>
          </div>
          <div className="grid gap-4 grid-cols-5">
            <StatCard label="Total Gauges" value={total} color="slate" />
            <StatCard label="Overdue" value={byStatus.overdue} color="orange" accent={fmtPct(byStatus.overdue, total)} sub="past threshold (15 d)" />
            <StatCard label="In Progress" value={byStatus.inProgress} color="blue" accent={fmtPct(byStatus.inProgress, total)} sub="active calibrations" />
            <StatCard label="Not Started" value={byStatus.notStarted} color="slate" accent={fmtPct(byStatus.notStarted, total)} sub="pending start" />
            <StatCard label="Completed" value={byStatus.completed} color="teal" accent={fmtPct(byStatus.completed, total)} sub="completed gauges" />
          </div>
        </div>

        {/* ── Row 2: Risk Distribution & Calibration Frequency ── */}
        <div className="mt-7 grid gap-6 lg:grid-cols-2">

          {/* Risk Distribution ─ recharts donut */}
          <div>
            <div className="mb-4">
              <h3 className="display-font text-base font-semibold text-slate-900">Risk Distribution</h3>
              <p className="mt-0.5 text-xs text-slate-400">AI-assessed risk across all gauges</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
              <RiskDonutChart
                totalLabel={total}
                data={[
                  { name: 'High Risk', value: risk.high },
                  { name: 'Medium Risk', value: risk.medium },
                  { name: 'Low Risk', value: risk.low },
                  { name: 'Unscored', value: risk.unscored },
                ]}
              />
            </div>
          </div>

          {/* Calibration Frequency ─ recharts vertical bar chart */}
          <div>
            <div className="mb-4">
              <h3 className="display-font text-base font-semibold text-slate-900">Calibration Frequency</h3>
              <p className="mt-0.5 text-xs text-slate-400">How often each gauge group is calibrated</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
              {freqEntries.length === 0 ? (
                <div className="flex h-[220px] items-center justify-center">
                  <p className="text-sm text-slate-400">No frequency data available.</p>
                </div>
              ) : (
                <FreqHistogramChart data={freqEntries.map(([freq, count]) => ({ name: freq, count }))} />
              )}
            </div>
          </div>

        </div>

        {/* ── Row 3: Recommendations + Completion health ── */}
        {/* Row 3 - Recommendations | Batch Summary */}
        <div className="mt-7 grid gap-6 lg:grid-cols-2">

          {/* Recommendations */}
          <div>
            <div className="mb-4">
              <h3 className="display-font text-base font-semibold text-slate-900">Recommendations</h3>
              <p className="mt-0.5 text-xs text-slate-400">AI-generated action items pending review</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Increase Freq" value={rec.increase} color="violet" sub="frequency bump" />
                <StatCard label="Reschedule" value={rec.reschedule} color="sky" sub="date shift" />
                <StatCard label="No Change" value={rec.noChange} color="slate" sub="already optimal" />
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-4 py-2.5">
                <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
                <span className="text-sm text-violet-700">
                  <strong>{totalActionable}</strong> actionable recommendation{totalActionable !== 1 ? 's' : ''} pending
                </span>
              </div>
            </div>
          </div>

          {/* Batch Summary - mirrors GaugeBatches counts exactly */}
          <div>
            <div className="mb-4">
              <h3 className="display-font text-base font-semibold text-slate-900">Batch Summary</h3>
              <p className="mt-0.5 text-xs text-slate-400">Active and archived calibration batches</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="Total Batches" value={currentCount} color="slate" sub="open / active" />
                <StatCard label="Gauges in Batches" value={gaugesInCurrent} color="sky" sub="across current batches" />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <StatCard label="High Risk" value={highCount} color="rose" sub="risk score" />
                <StatCard label="Medium Risk" value={mediumCount} color="amber" sub="risk score" />
                <StatCard label="Low Risk" value={lowCount} color="emerald" sub="risk score" />
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
